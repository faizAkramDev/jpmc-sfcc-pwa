/**
 * JPMC Order Controller
 * 
 * Server-side controllers for order management.
 * These are used by the registerJPMCEndpoints function.
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/ssr/controllers/order-controller
 */

import { OrderApiClient } from '../api/order-api'
import { mapJPMCResponseToAttributes, mapPaymentTransactionAttributes, mapFraudResponseToOrderAttributes } from '../api/attribute-mapping'
import logger, { safeStringify } from '../../utils/logger.js'
import { validateOrderNumber } from '../../utils/validation/input-validation'

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
 * NOTE: This only patches custom attributes. Status updates (paid, confirmed, etc.)
 * should be handled based on captureMethod:
 * - captureMethod: NOW → Payment already captured, status can be updated
 * - captureMethod: MANUAL → Auth only, capture happens later (BM module or webhook)
 * 
 * For now, we only store the transaction data. Status updates can be added
 * when capture logic is implemented.
 */
export async function handleConfirmOrder(req, res, next) {
    try {
        const { orderNo } = req.params
        const { jpmcResponse, paymentInstrumentId, captureMethod = 'MANUAL', paymentAmount, fraudResponse, kountSessionId } = req.body

        if (!validateOrderOrRespond(orderNo, res)) return

        const orderApi = new OrderApiClient({ ...controllerConfig.commerceConfig, debug: controllerConfig.debug })

        // Step 1: Update order status to 'new'
        await updateOrderStatusToNew(orderApi, orderNo)

        // Step 2: Patch order with fraud check attributes (if fraud check was performed)
        let orderFraudPatchResult = null
        if (fraudResponse) {
            try {
                const fraudAttributes = mapFraudResponseToOrderAttributes(fraudResponse, kountSessionId)
                await orderApi.patchOrder(orderNo, fraudAttributes)
                orderFraudPatchResult = { success: true }
            } catch (err) {
                logger.warn('[OrderController] Order fraud attribute patch failed:', err.message)
            }
        }

        // Step 3: Patch payment instrument and transaction
        let paymentInstrumentPatchResult = null
        let paymentTransactionPatchResult = null
        
        if (jpmcResponse && paymentInstrumentId) {
            paymentInstrumentPatchResult = await patchPaymentInstrument(orderApi, orderNo, paymentInstrumentId, jpmcResponse)
            
            if (paymentAmount) {
                paymentTransactionPatchResult = await patchPaymentTransaction(
                    orderApi, orderNo, paymentInstrumentId, jpmcResponse, paymentAmount, captureMethod
                )
            } else {
                logger.warn('[OrderController] Payment amount not provided - skipping payment transaction patch')
            }
        } else if (jpmcResponse && !paymentInstrumentId) {
            logger.warn('[OrderController] Cannot patch - paymentInstrumentId is required')
        }

        await callSuccessHandler(orderNo, jpmcResponse, req)

        res.locals.response = {
            success: true,
            orderNo,
            message: 'JPMC transaction data stored successfully',
            patchResults: {
                order: orderFraudPatchResult,
                paymentInstrument: paymentInstrumentPatchResult ? { success: true } : null,
                paymentTransaction: paymentTransactionPatchResult ? { success: true } : null
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
        const { jpmcResponse, reason, errorCode } = req.body

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
                await controllerConfig.onAuthorizationFailure(orderNo, jpmcResponse, reason, req)
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
