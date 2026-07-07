/**
 * JPMC Order Controller
 * 
 * Server-side controllers for order management.
 * These are used by the registerJPMCEndpoints function.
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/ssr/controllers/order-controller
 */

import { OrderApiClient } from '../api/order-api'
import { mapJPMCResponseToAttributes, mapPaymentTransactionAttributes } from '../api/attribute-mapping'
import logger, { safeStringify } from '../../utils/logger.js'
import { validateOrderNumber } from '../../utils/validation/input-validation'
import { extractSlasToken } from '../../utils/locale-extractor.js'

/**
 * Controller context - stores configuration
 */
let controllerConfig = {
    attributeMapping: {},
    onAuthorizationSuccess: null,
    onAuthorizationFailure: null,
    commerceConfig: null,
    debug: false
}

/**
 * Configure the order controller
 * Called by registerJPMCEndpoints
 */
/**
 * POST /api/jpmorgan/order/create
 * Creates an SFCC order from a basket using the shopper's SLAS token.
 * Returns only { orderNo } — full order response is not forwarded to the client.
 */
export async function handleCreateOrder(req, res, next) {
    try {
        const { basketId } = req.body
        if (!basketId) {
            return res.status(400).json({ success: false, error: 'basketId is required' })
        }

        const slasToken = extractSlasToken(req)
        if (!slasToken) {
            return res.status(401).json({ success: false, error: 'Authorization required' })
        }

        const shortCode = controllerConfig.commerceConfig?.shortCode || process.env.COMMERCE_API_SHORT_CODE
        const orgId = controllerConfig.commerceConfig?.orgId || process.env.COMMERCE_API_ORG_ID
        const siteId = controllerConfig.commerceConfig?.siteId || process.env.COMMERCE_API_SITE_ID

        const url = `https://${shortCode}.api.commercecloud.salesforce.com/checkout/shopper-orders/v1/organizations/${orgId}/orders?siteId=${siteId}`

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${slasToken}`
            },
            body: JSON.stringify({ basketId })
        })

        if (!response.ok) {
            const error = await response.text()
            logger.error('[OrderController] Create order failed:', response.status, error)
            throw new Error(`Create order failed: ${response.status}`)
        }

        const order = await response.json()

        logger.info('[OrderController] Order created', { orderNo: order.orderNo })

        res.locals.response = {
            orderNo: order.orderNo,
            orderTotal: order.orderTotal,
            paymentInstruments: order.paymentInstruments
        }
        return next()
    } catch (error) {
        logger.error('[OrderController] Create order error:', error)
        return next(error)
    }
}

export function configureOrderController(config) {
    controllerConfig = { ...controllerConfig, ...config }
}

// =============================================================================
// Helper Functions for Order Operations
// =============================================================================

/**
 * Validate order number and return error response if invalid
 */
const validateOrderOrRespond = (orderNo, res) => {
    const validation = validateOrderNumber(orderNo)
    if (!validation.valid) {
        logger.warn('[OrderController] Invalid order number:', validation)
        res.status(400).json({ 
            success: false, 
            errorCode: validation.code,
            error: validation.error 
        })
        return false
    }
    if (!orderNo) {
        res.status(400).json({ success: false, error: 'orderNo is required' })
        return false
    }
    return true
}

/**
 * Update order status to 'new' safely
 */
const updateOrderStatusToNew = async (orderApi, orderNo) => {
    try {
        await orderApi.updateOrderStatus(orderNo, 'new')
    } catch (err) {
        logger.warn('[OrderController] Failed to update order status:', err.message)
    }
}

/**
 * Patch payment instrument with JPMC data
 */
const patchPaymentInstrument = async (orderApi, orderNo, paymentInstrumentId, jpmcResponse) => {
    try {
        const attributes = mapJPMCResponseToAttributes(jpmcResponse, controllerConfig.attributeMapping)
        if (controllerConfig.debug) {
            logger.info('[OrderController] Patching payment instrument:', paymentInstrumentId)
            logger.info('[OrderController] Payment instrument data:', safeStringify(attributes))
        }
        const result = await orderApi.patchPaymentInstrument(orderNo, paymentInstrumentId, attributes)
        return result
    } catch (err) {
        logger.warn('[OrderController] Payment instrument patch failed:', err.message)
        return null
    }
}

/**
 * Patch payment transaction with JPMC data
 */
const patchPaymentTransaction = async (orderApi, orderNo, paymentInstrumentId, jpmcResponse, paymentAmount, captureMethod) => {
    try {
        const attributes = mapPaymentTransactionAttributes(jpmcResponse, paymentAmount, captureMethod, controllerConfig.attributeMapping)
        if (controllerConfig.debug) {
            logger.info('[OrderController] Patching payment transaction:', paymentInstrumentId)
            logger.info('[OrderController] Payment transaction data:', safeStringify(attributes))
        }
        const result = await orderApi.patchPaymentTransaction(orderNo, paymentInstrumentId, attributes)
        return result
    } catch (err) {
        logger.warn('[OrderController] Payment transaction patch failed:', err.message)
        return null
    }
}

/**
 * Call custom success handler safely
 */
const callSuccessHandler = async (orderNo, jpmcResponse, req) => {
    if (!controllerConfig.onAuthorizationSuccess) return
    try {
        await controllerConfig.onAuthorizationSuccess(orderNo, jpmcResponse, req)
    } catch (err) {
        logger.warn('[OrderController] Custom success handler failed:', err.message)
    }
}

/**
 * Handle order update after successful payment
 * 
 * POST /api/jpmorgan/order/:orderNo/confirm
 * 
 * This endpoint is called after successful payment authorization
 * to store JPMC transaction data on the payment instrument.
 * 
 * Flow:
 * 1. Update order status to 'new'
 * 2. Patch payment instrument and transaction with JPMC data
 * 3. Hold order (Drop-in only) until JPMC confirms payment server-to-server
 * 4. Call custom success handler
 * 
 * The payment and export hold mechanism:
 * - DROP-IN ONLY: Drop-in payment confirmation arrives asynchronously via server-to-server notification.
 *   The hold prevents warehouse fulfillment until JPMC confirms payment via the notifications job.
 * - PIE / Google Pay / Apple Pay: payment is confirmed synchronously in the same authorize request,
 *   so no hold is needed for those flows.
 * - jpmcCheckoutMode='DROP_IN' in jpmcResponse (set by useDropInPaymentSuccess) is the discriminator.
 */
export async function handleConfirmOrder(req, res, next) {
    try {
        const { orderNo } = req.params
        const { jpmcResponse, paymentInstrumentId, paymentAmount, captureMethod } = req.body

        if (!validateOrderOrRespond(orderNo, res)) return

        // Drop-in orders carry jpmcCheckoutMode='DROP_IN' in the jpmcResponse payload
        // (set by useDropInPaymentSuccess before calling confirmOrderServerSide).
        // PIE / Google Pay / Apple Pay flows do not set this field.
        const isDropIn = jpmcResponse?.jpmcCheckoutMode === 'DROP_IN'

        const orderApi = new OrderApiClient({ ...controllerConfig.commerceConfig, debug: controllerConfig.debug })
        // Step 1: Update order status to 'new'
        // This is critical for 3DS flows where transactionId may be 'PENDING_3DS' placeholder.
        // The order must be in 'new' status so that the 3DS callback can GET the order and patch it later.
        // SFCC Orders API returns 403 for GET operations on 'created' orders.
        // For 3DS deferred: transactionId = 'PENDING_3DS' (placeholder for notifications job)
        // For 3DS complete: transactionId = actual value from JPMC
        // For non-3DS: transactionId = actual authorization ID from JPMC
        await updateOrderStatusToNew(orderApi, orderNo)

        // Step 2: Patch payment instrument and transaction
        // Payment instrument may have transactionId = 'PENDING_3DS' placeholder for 3DS deferred cases.
        // The placeholder allows notification job to find order and update it when real transactionId arrives.
        // For non-3DS or complete 3DS auth, transactionId is the actual JPMC transaction ID.
        // NOTE: PENDING_3DS placeholder is DROP-IN SPECIFIC. Other payment methods (if added in future) 
        //       will have actual transaction IDs and will patch normally without this placeholder logic.
        //       This code is agnostic to the placeholder - it just patches whatever is in jpmcResponse.
        let paymentInstrumentPatchResult = null
        let paymentTransactionPatchResult = null
        
        if (jpmcResponse && paymentInstrumentId) {
            paymentInstrumentPatchResult = await patchPaymentInstrument(orderApi, orderNo, paymentInstrumentId, jpmcResponse)
            
            // Patch payment transaction with capture method and amount from request
            // Use defaults if not provided (paymentAmount defaults to null, captureMethod defaults to 'MANUAL')
            paymentTransactionPatchResult = await patchPaymentTransaction(
                orderApi, orderNo, paymentInstrumentId, jpmcResponse, paymentAmount, captureMethod || 'MANUAL'
            )
        } else if (jpmcResponse && !paymentInstrumentId) {
            logger.warn('[OrderController] Cannot patch - paymentInstrumentId is required')
        }

        // Step 3: Hold order (Drop-in only) until JPMC confirms payment server-to-server.
        // Drop-in confirmation arrives asynchronously via the notifications job, so we hold the order
        // to prevent warehouse fulfillment on an unconfirmed payment.
        // PIE / Google Pay / Apple Pay payments are confirmed synchronously — no hold needed.
        let paymentHoldResult = null
        let exportHoldResult = null
        if (isDropIn) {
            try {
                await orderApi.updateOrderPaymentStatus(orderNo, 'not_paid')
                paymentHoldResult = { success: true }
                logger.info('[OrderController] Order payment hold set for drop-in order:', orderNo)
            } catch (err) {
                logger.warn('[OrderController] Failed to set payment hold:', err.message)
            }

            try {
                await orderApi.updateOrderExportStatus(orderNo, 'not_exported')
                exportHoldResult = { success: true }
                logger.info('[OrderController] Order export hold set for drop-in order:', orderNo)
            } catch (err) {
                logger.warn('[OrderController] Failed to set export hold:', err.message)
            }
        }

        await callSuccessHandler(orderNo, jpmcResponse, req)

        res.locals.response = {
            success: true,
            orderNo,
            message: 'JPMC transaction data stored successfully',
            patchResults: {
                paymentInstrument: paymentInstrumentPatchResult ? { success: true } : null,
                paymentTransaction: paymentTransactionPatchResult ? { success: true } : null,
                paymentHold: paymentHoldResult,
                exportHold: exportHoldResult
            }
        }
        
        return next()
    } catch (error) {
        logger.error('[OrderController] Confirm order failed:', error)
        return next(error)
    }
}

/**
 * Handle order update after failed payment
 * 
 * POST /api/jpmorgan/order/:orderNo/fail
 * 
 * Updates order status to 'failed' in SFCC Business Manager.
 * This is called when payment authorization fails after order creation.
 */
export async function handleFailOrder(req, res, next) {
    try {
        const { orderNo } = req.params
        const { reason, errorCode } = req.body

        // Validate order number format to prevent path traversal
        const orderValidation = validateOrderNumber(orderNo)
        if (!orderValidation.valid) {
            logger.warn('[OrderController] Invalid order number:', orderValidation)
            return res.status(400).json({ 
                success: false, 
                errorCode: orderValidation.code,
                error: orderValidation.error 
            })
        }

        logger.warn('[OrderController] Payment authorization failed for order:', orderNo, 'Reason:', reason, 'Code:', errorCode)

        // Update order status to 'failed' in SFCC
        // This makes the failed order visible in BM with proper status
        let statusUpdated = false
        try {
            const orderApi = new OrderApiClient({ ...controllerConfig.commerceConfig, debug: controllerConfig.debug })
            await orderApi.updateOrderStatus(orderNo, 'failed')
            statusUpdated = true
        } catch (statusError) {
            // Log but don't fail the request - order may already be in a terminal state
            // or there may be permission issues
            logger.warn('[OrderController] Could not update order status to failed:', orderNo, statusError.message)
        }

        // Call custom failure handler if provided
        if (controllerConfig.onAuthorizationFailure) {
            try {
                await controllerConfig.onAuthorizationFailure(orderNo, reason, req)
            } catch (hookError) {
                logger.warn('[OrderController] Custom failure handler failed:', hookError.message)
            }
        }

        res.locals.response = {
            success: true,
            orderNo,
            statusUpdated,
            message: statusUpdated ? 'Order marked as failed' : 'Payment failure logged (status not updated)'
        }
        
        return next()
    } catch (error) {
        logger.error('[OrderController] Fail order failed:', error)
        return next(error)
    }
}

/**
 * Handle order status update
 * 
 * PUT /api/jpmorgan/order/:orderNo/status
 */
export async function handleUpdateOrderStatus(req, res, next) {
    try {
        const { orderNo } = req.params
        const { status, paymentStatus, confirmationStatus, exportStatus } = req.body

        // Validate order number format to prevent path traversal
        const orderValidation = validateOrderNumber(orderNo)
        if (!orderValidation.valid) {
            logger.warn('[OrderController] Invalid order number:', orderValidation)
            return res.status(400).json({ 
                success: false, 
                errorCode: orderValidation.code,
                error: orderValidation.error 
            })
        }

        const orderApi = new OrderApiClient({ ...controllerConfig.commerceConfig, debug: controllerConfig.debug })
        const updates = []

        if (status) {
            await orderApi.updateOrderStatus(orderNo, status)
            updates.push('status')
        }

        if (paymentStatus) {
            await orderApi.updateOrderPaymentStatus(orderNo, paymentStatus)
            updates.push('paymentStatus')
        }

        if (confirmationStatus) {
            await orderApi.updateOrderConfirmationStatus(orderNo, confirmationStatus)
            updates.push('confirmationStatus')
        }

        if (exportStatus) {
            await orderApi.updateOrderExportStatus(orderNo, exportStatus)
            updates.push('exportStatus')
        }

        res.locals.response = {
            success: true,
            orderNo,
            updated: updates
        }
        
        return next()
    } catch (error) {
        logger.error('[OrderController] Update status failed:', error)
        return next(error)
    }
}

/**
 * Handle payment instrument patch
 * 
 * PATCH /api/jpmorgan/order/:orderNo/payment-instruments/:paymentInstrumentId
 */
export async function handlePatchPaymentInstrument(req, res, next) {
    try {
        const { orderNo, paymentInstrumentId } = req.params
        const { jpmcResponse, customAttributes } = req.body

        // Validate order number format to prevent path traversal
        const orderValidation = validateOrderNumber(orderNo)
        if (!orderValidation.valid) {
            logger.warn('[OrderController] Invalid order number:', orderValidation)
            return res.status(400).json({ 
                success: false, 
                errorCode: orderValidation.code,
                error: orderValidation.error 
            })
        }

        if (!paymentInstrumentId) {
            return res.status(400).json({ 
                success: false, 
                error: 'orderNo and paymentInstrumentId are required' 
            })
        }

        const orderApi = new OrderApiClient({ ...controllerConfig.commerceConfig, debug: controllerConfig.debug })

        // Get order to retrieve payment method details
        const order = await orderApi.getOrder(orderNo)
        const paymentInstrument = order.paymentInstruments?.find(
            pi => pi.paymentInstrumentId === paymentInstrumentId
        )

        if (!paymentInstrument) {
            return res.status(404).json({ 
                success: false, 
                error: 'Payment instrument not found' 
            })
        }

        // Map JPMC response or use provided custom attributes
        const attributes = customAttributes || mapJPMCResponseToAttributes(
            jpmcResponse, 
            controllerConfig.attributeMapping
        )

        // Build patch request
        // Payment method IDs are configured in BM and can vary (e.g., 'CREDIT_CARD', 'DW_GOOGLEPAY', etc.)
        // We detect data presence rather than matching hardcoded strings
        const patchData = {
            paymentMethodId: paymentInstrument.paymentMethodId,
            ...attributes
        }

        // Include paymentCard if present on the payment instrument
        // This works regardless of what the payment method ID string is in BM
        if (paymentInstrument.paymentCard) {
            patchData.paymentCard = {
                cardType: paymentInstrument.paymentCard.cardType,
                maskedNumber: paymentInstrument.paymentCard.maskedNumber
            }
        }

        await orderApi.patchPaymentInstrument(
            orderNo, 
            paymentInstrumentId, 
            patchData
        )

        res.locals.response = {
            success: true,
            orderNo,
            paymentInstrumentId,
            patchedAttributes: Object.keys(attributes)
        }
        
        return next()
    } catch (error) {
        logger.error('[OrderController] Patch payment instrument failed:', error)
        return next(error)
    }
}

/**
 * Get order details
 * 
 * GET /api/jpmorgan/order/:orderNo
 */
export async function handleGetOrder(req, res, next) {
    try {
        const { orderNo } = req.params

        // Validate order number format to prevent path traversal
        const orderValidation = validateOrderNumber(orderNo)
        if (!orderValidation.valid) {
            logger.warn('[OrderController] Invalid order number:', orderValidation)
            return res.status(400).json({ 
                success: false, 
                errorCode: orderValidation.code,
                error: orderValidation.error 
            })
        }

        const orderApi = new OrderApiClient({ ...controllerConfig.commerceConfig, debug: controllerConfig.debug })
        const order = await orderApi.getOrder(orderNo)

        res.locals.response = {
            success: true,
            order: {
                orderNo: order.orderNo,
                status: order.status,
                paymentStatus: order.paymentStatus,
                confirmationStatus: order.confirmationStatus,
                exportStatus: order.exportStatus,
                paymentInstruments: order.paymentInstruments?.map(pi => ({
                    paymentInstrumentId: pi.paymentInstrumentId,
                    paymentMethodId: pi.paymentMethodId,
                    amount: pi.amount
                }))
            }
        }
        
        return next()
    } catch (error) {
        logger.error('[OrderController] Get order failed:', error)
        return next(error)
    }
}

export default {
    configureOrderController,
    handleConfirmOrder,
    handleFailOrder,
    handleUpdateOrderStatus,
    handlePatchPaymentInstrument,
    handleGetOrder
}
