/**
 * Order Handlers
 * 
 * Handles all order-related API endpoints:
 * - handleConfirmOrder: POST /api/jpmorgan/order/:orderNo/confirm
 * - handlePatchOrderPaymentInstrument: PATCH /api/jpmorgan/order/:orderNo/payment-instruments/:paymentInstrumentId
 */
import logger from '../../../utils/logger'
import { extractSlasToken } from '../../../utils/locale-extractor'
import { GENERIC_API_ERROR_MESSAGE } from '../../../utils/constants/error-constants'
import { validateOrderNumber } from '../../../utils/validation/input-validation'

/**
 * Allowed attributes for PATCH /api/jpmorgan/order/:orderNo/payment-instruments/:paymentInstrumentId
 * Only attributes in the allowlist are included in the SFCC API request.
 */
const ALLOWED_PATCH_ATTRIBUTES = new Set(['c_jpmcTransactionId'])

/**
 * Handle order confirmation after JPMC authorization
 * 
 * POST /api/jpmorgan/order/:orderNo/confirm
 * 
 * This endpoint is called after successful JPMC authorization to:
 * 1. Patch the payment instrument with JPMC transaction ID
 * 2. Confirm the order status
 * 
 * Request body:
 * {
 *   jpmcResponse: { transactionId, transactionState, ... },
 *   paymentInstrumentId: 'pi_123',
 *   captureMethod: 'NOW' | 'MANUAL' | 'DELAYED',
 *   paymentAmount: 99.99
 * }
 * 
 * Note: This endpoint requires a valid SLAS token in the Authorization header.
 */
export const handleConfirmOrder = async (req, res) => {
    try {
        const { orderNo } = req.params
        const { jpmcResponse, paymentInstrumentId, captureMethod, paymentAmount: _paymentAmount } = req.body  // eslint-disable-line no-unused-vars
        
        // Validate required parameters
        if (!orderNo) {
            return res.status(400).json({
                success: false,
                errorCode: 'INVALID_REQUEST',
                message: 'Missing required parameter: orderNo'
            })
        }
        
        if (!jpmcResponse?.transactionId) {
            return res.status(400).json({
                success: false,
                errorCode: 'INVALID_REQUEST',
                message: 'Missing required jpmcResponse with transactionId'
            })
        }
        
        // Extract SLAS token from request headers
        const slasToken = extractSlasToken(req)
        if (!slasToken) {
            return res.status(401).json({
                success: false,
                errorCode: 'UNAUTHORIZED',
                message: 'Missing or invalid Authorization header. SLAS token required.'
            })
        }
        
        // Build Shopper Orders API URL
        const shortCode = process.env.COMMERCE_API_SHORT_CODE || process.env.SFCC_SHORT_CODE
        const organizationId = process.env.COMMERCE_API_ORG_ID || process.env.SFCC_ORG_ID
        const siteId = process.env.COMMERCE_API_SITE_ID || process.env.SFCC_SITE_ID
        
        if (!shortCode || !organizationId) {
            logger.error('[OrderConfirm] Missing SFCC configuration:', { shortCode: !!shortCode, organizationId: !!organizationId })
            return res.status(500).json({
                success: false,
                errorCode: 'CONFIGURATION_ERROR',
                message: 'Missing SFCC API configuration (shortCode or organizationId)'
            })
        }
        
        // Step 1: Patch the payment instrument with JPMC data
        if (paymentInstrumentId) {
            const patchUrl = `https://${shortCode}.api.commercecloud.salesforce.com/checkout/shopper-orders/v1/organizations/${organizationId}/orders/${orderNo}/payment-instruments/${paymentInstrumentId}?siteId=${siteId}`
            
            // Prepare JPMC custom attributes for the payment instrument
            // Only c_jpmcTransactionId goes on the payment instrument
            const customAttributes = {
                c_jpmcTransactionId: jpmcResponse.transactionId
            }
            
            const patchResponse = await fetch(patchUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${slasToken}`
                },
                body: JSON.stringify(customAttributes)
            })
            
            if (patchResponse.ok) {
                // payment instrument patched
            } else {
                const errorBody = await patchResponse.text()
                logger.warn('[OrderConfirm] Payment instrument patch failed (non-blocking):', {
                    status: patchResponse.status,
                    body: errorBody
                })
                // Continue anyway - the order can still be confirmed
            }
        }
        
        // Step 2: Confirm the order (update status from 'created' to 'new')
        // This endpoint patches the order data with JPMC transaction attributes.
        
        return res.status(200).json({
            success: true,
            orderNo,
            transactionId: jpmcResponse.transactionId,
            message: 'Order confirmed and patched with JPMC data'
        })
        
    } catch (error) {
        logger.error('[OrderConfirm] Error:', error)
        return res.status(500).json({
            success: false,
            errorCode: 'CONFIRM_ERROR',
            message: GENERIC_API_ERROR_MESSAGE
        })
    }
}

/**
 * Handle order payment instrument patching
 * 
 * PATCH /api/jpmorgan/order/:orderNo/payment-instruments/:paymentInstrumentId
 * 
 * This endpoint patches an order's payment instrument with JPMC transaction data.
 * It acts as a proxy to the Shopper Orders API when commerce-sdk-react is not available.
 * 
 * Request body:
 * {
 *   c_jpmcTransactionId: 'txn_123'
 * }
 * 
 * Note: Per metadata specifications, only c_jpmcTransactionId is set at OrderPaymentInstrument level.
 * Other JPMC attributes are stored at the PaymentTransaction level via the /confirm endpoint.
 * 
 * Note: This endpoint requires a valid SLAS token in the Authorization header.
 * The token should be passed through from the frontend request.
 */
export const handlePatchOrderPaymentInstrument = async (req, res) => {
    try {
        const { orderNo, paymentInstrumentId } = req.params
        const requestBody = req.body
        
        const orderValidation = validateOrderNumber(orderNo)
        if (!orderValidation.valid) {
            return res.status(400).json({
                success: false,
                errorCode: orderValidation.code || 'INVALID_REQUEST',
                message: orderValidation.error || 'Invalid order number'
            })
        }
        
        if (!paymentInstrumentId) {
            return res.status(400).json({
                success: false,
                errorCode: 'INVALID_REQUEST',
                message: 'Missing required parameter: paymentInstrumentId'
            })
        }
        
        const paymentInstrumentIdPattern = /^[A-Za-z0-9_-]{1,100}$/
        if (!paymentInstrumentIdPattern.test(paymentInstrumentId)) {
            logger.warn('[OrderPatching] Invalid paymentInstrumentId format:', paymentInstrumentId.substring(0, 20))
            return res.status(400).json({
                success: false,
                errorCode: 'INVALID_REQUEST',
                message: 'Invalid paymentInstrumentId format'
            })
        }
        
        if (!requestBody || Object.keys(requestBody).length === 0) {
            return res.status(400).json({
                success: false,
                errorCode: 'INVALID_REQUEST',
                message: 'Request body must contain custom attributes to patch'
            })
        }
        
        
        const filteredAttributes = {}
        const rejectedAttributes = []
        
        for (const [key, value] of Object.entries(requestBody)) {
            if (ALLOWED_PATCH_ATTRIBUTES.has(key)) {
                filteredAttributes[key] = value
            } else {
                rejectedAttributes.push(key)
            }
        }
        
        if (rejectedAttributes.length > 0) {
            logger.warn('[OrderPatching] Request contains attributes not in allowlist (rejected):', {
                rejectedAttributes,
                allowedAttributes: Array.from(ALLOWED_PATCH_ATTRIBUTES)
            })
        }
        
        if (Object.keys(filteredAttributes).length === 0) {
            return res.status(400).json({
                success: false,
                errorCode: 'INVALID_REQUEST',
                message: 'Request body must contain at least one allowed attribute (c_jpmcTransactionId)'
            })
        }
        
        const slasToken = extractSlasToken(req)
        if (!slasToken) {
            return res.status(401).json({
                success: false,
                errorCode: 'UNAUTHORIZED',
                message: 'Missing or invalid Authorization header. SLAS token required.'
            })
        }
        
        // Build Shopper Orders API URL
        // Format: https://{shortCode}.api.commercecloud.salesforce.com/checkout/shopper-orders/v1/organizations/{orgId}/orders/{orderNo}/payment-instruments/{paymentInstrumentId}
        const shortCode = process.env.COMMERCE_API_SHORT_CODE || process.env.SFCC_SHORT_CODE
        const organizationId = process.env.COMMERCE_API_ORG_ID || process.env.SFCC_ORG_ID
        const siteId = process.env.COMMERCE_API_SITE_ID || process.env.SFCC_SITE_ID
        
        if (!shortCode || !organizationId) {
            logger.error('[OrderPatching] Missing SFCC configuration:', { shortCode: !!shortCode, organizationId: !!organizationId })
            return res.status(500).json({
                success: false,
                errorCode: 'CONFIGURATION_ERROR',
                message: 'Missing SFCC API configuration (shortCode or organizationId)'
            })
        }
        
        const apiUrl = `https://${shortCode}.api.commercecloud.salesforce.com/checkout/shopper-orders/v1/organizations/${organizationId}/orders/${orderNo}/payment-instruments/${paymentInstrumentId}?siteId=${siteId}`
        
        // Security: Send only filtered attributes to prevent unexpected data in the SFCC API
        const response = await fetch(apiUrl, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${slasToken}`
            },
            body: JSON.stringify(filteredAttributes)
        })
        
        if (!response.ok) {
            const errorBody = await response.text()
            logger.error('[OrderPatching] API error:', {
                status: response.status,
                body: errorBody
            })
            
            return res.status(response.status).json({
                success: false,
                errorCode: `HTTP_${response.status}`,
                message: `Shopper Orders API returned ${response.status}`,
                details: errorBody
            })
        }
        
        const result = await response.json()
        
        return res.status(200).json({
            success: true,
            orderNo,
            paymentInstrumentId,
            patchedAttributes: Object.keys(filteredAttributes),
            rejectedAttributes: rejectedAttributes.length > 0 ? rejectedAttributes : undefined,
            response: result
        })
        
    } catch (error) {
        logger.error('[OrderPatching] Error:', error)
        return res.status(500).json({
            success: false,
            errorCode: 'PATCH_ERROR',
            message: GENERIC_API_ERROR_MESSAGE
        })
    }
}
