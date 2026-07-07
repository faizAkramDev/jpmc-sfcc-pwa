/**
 * JPMC 3D Secure Controller
 * 
 * Server-side controller for 3DS authentication callback.
 * Handles the POST from JPMC after 3DS authentication completes.
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/ssr/controllers/threeds-controller
 */

import { OrderApiClient } from '../api/order-api'
import { getPaymentDetails } from '../../services/api/payment-api'
import { extract3DSValues, build3DSOrderPatchPayload } from '../../services/api/helpers/threeds-helpers'
import { THREE_DS } from '../../utils/constants.mjs'
import logger, { safeStringify } from '../../utils/logger.js'
import { getJPMCConfigAsync } from '../index.js'
import { fromMinorUnits } from '../../utils/currency.js'

/**
 * Cache to track processed callbacks and prevent duplicate processing.
 * JPMC's orchestration may submit the callback form multiple times.
 * 
 * Key: `${orderNo}:${paymentRequestId}`
 * Value: { status: 'processing' | 'completed', result: postMessageData, timestamp }
 */
const callbackCache = new Map()

const CALLBACK_CACHE_TTL_MS = 5 * 60 * 1000

export function clearCallbackCache() {
    callbackCache.clear()
}

/**
 * Controller context - stores configuration
 */
let controllerConfig = {
    jpmcConfig: null,
    debug: false
}

/**
 * Configure the 3DS controller
 * Called by registerJPMCEndpoints
 * 
 * @param {Object} config - Configuration object
 * @param {Object} config.jpmcConfig - JPMC API configuration
 * @param {boolean} config.debug - Enable debug logging
 */
export function configureThreeDSController(config) {
    controllerConfig = { ...controllerConfig, ...config }
}

/**
 * Parse and validate allowed origins from env var
 * 
 * Format: JPMC_STOREFRONT_ALLOWED_ORIGINS=https://storefront.example.com,https://shop.example.com
 * 
 * Security: Restricts postMessage to allowed origins to prevent hijacking attacks
 * 
 * @returns {Set<string>} Set of allowed origins
 */
function getAllowedOrigins() {
    const allowedOriginsEnv = process.env.JPMC_STOREFRONT_ALLOWED_ORIGINS || ''
    if (!allowedOriginsEnv.trim()) {
        return new Set()
    }
    
    const origins = allowedOriginsEnv
        .split(',')
        .map(o => o.trim())
        .filter(o => o.length > 0)
    
    return new Set(origins)
}

/**
 * Validate and get safe target origin for postMessage
 * 
 * Security: Validates origin against allowlist before using in postMessage.
 * Returns null if origin cannot be validated to enforce fail-closed behavior.
 * The caller MUST check for null and handle appropriately.
 * 
 * @param {string} potentialOrigin - Origin derived from request headers
 * @returns {string|null} Safe origin for postMessage, or null if validation fails
 */
function getSafeTargetOrigin(potentialOrigin) {
    const allowedOrigins = getAllowedOrigins()
    
    // If no allowlist is configured, return null (fail-closed)
    if (allowedOrigins.size === 0) {
        logger.error('[3DS Controller] JPMC_STOREFRONT_ALLOWED_ORIGINS not configured. 3DS callback postMessage is blocked.')
        return null
    }
    
    // Check if the potential origin is in the allowlist
    if (allowedOrigins.has(potentialOrigin)) {
        return potentialOrigin
    }
    
    // Log security event - origin not in allowlist
    logger.error('[3DS Controller] Origin not in allowlist, blocking postMessage:', {
        attemptedOrigin: potentialOrigin,
        allowedOrigins: Array.from(allowedOrigins)
    })
    
    // Return null (fail-closed) - do not send postMessage with wildcard
    return null
}

/**
 * Build HTML response that sends postMessage to parent window
 * This HTML is rendered in the iframe and communicates back to the modal
 * 
 * @param {Object} data - Data to send via postMessage
 * @param {string} targetOrigin - Validated target origin for postMessage
 * @param {string} nonce - CSP nonce for inline script/style tags
 * @returns {string} HTML string
 */
function build3DSPostbackHtml(data, targetOrigin, nonce) {
    const escapedData = JSON.stringify(data)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
    const escapedOrigin = JSON.stringify(targetOrigin)
    const nonceAttr = nonce ? ` nonce="${nonce}"` : ''

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3D Secure Complete</title>
    <style${nonceAttr}>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
        }
        .message {
            text-align: center;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="message">
        <p>Completing verification...</p>
    </div>
    <script${nonceAttr}>
        (function() {
            var data = ${escapedData};
            data.type = '${THREE_DS.POSTMESSAGE_TYPE}';
            var targetOrigin = ${escapedOrigin};
            
            if (window.top && window.top !== window) {
                window.top.postMessage(data, targetOrigin);
            } else if (window.parent && window.parent !== window) {
                window.parent.postMessage(data, targetOrigin);
            }
        })();
    </script>
</body>
</html>`
}

// =============================================================================
// Helper functions to reduce cognitive complexity
// =============================================================================

/**
 * Validate callback request parameters
 * @returns {{ valid: boolean, error?: string, orderNo?: string, orderToken?: string, paymentRequestId?: string, responseStatus?: string }}
 */
function validateCallbackRequest(req) {
    const { orderNo, orderToken, merchantId: queryMerchantId, locale } = req.query
    const { paymentRequestId, responseStatus } = req.body

    if (!orderNo || !orderToken) {
        return { valid: false, error: 'Missing order information' }
    }
    if (!paymentRequestId) {
        return { valid: false, error: 'Missing payment information', orderNo, orderToken }
    }

    return { valid: true, orderNo, orderToken, paymentRequestId, responseStatus, queryMerchantId, locale }
}

/**
 * Check for duplicate callback and return cached result if available
 * @returns {{ isDuplicate: boolean, html?: string, shouldSkip?: boolean }}
 */
function checkDuplicateCallback(cacheKey, orderNo, orderToken, responseStatus, targetOrigin, nonce) {
    const cached = callbackCache.get(cacheKey)
    if (!cached) {
        return { isDuplicate: false }
    }

    if (Date.now() - cached.timestamp > CALLBACK_CACHE_TTL_MS) {
        callbackCache.delete(cacheKey)
        return { isDuplicate: false }
    }

    if (cached.status === 'completed' && cached.result) {
        logger.info('[3DS Controller] Duplicate callback - returning cached result for:', orderNo)
        return { isDuplicate: true, html: build3DSPostbackHtml(cached.result, targetOrigin, nonce) }
    }
    
    if (cached.status === 'processing') {
        logger.info('[3DS Controller] Callback already in progress for:', orderNo)
        return {
            isDuplicate: true,
            html: build3DSPostbackHtml({
                success: true,
                responseStatus: responseStatus || THREE_DS.RESPONSE_STATUS.SUCCESS,
                orderID: orderNo,
                orderToken,
                continueUrl: `/checkout/confirmation/${orderNo}`,
                duplicate: true
            }, targetOrigin, nonce)
        }
    }

    return { isDuplicate: false }
}

/**
 * Resolve JPMC config with merchantId override if needed
 */
async function resolveJPMCConfig(queryMerchantId, orderNo, locale) {
    let jpmcConfig = controllerConfig.jpmcConfig
    if (!jpmcConfig) {
        jpmcConfig = await getJPMCConfigAsync(locale)
    }
    
    if (!jpmcConfig) {
        throw new Error('Failed to load JPMC config')
    }

    // Check for merchantId override
    if (queryMerchantId && queryMerchantId !== jpmcConfig.merchantId) {
        return { ...jpmcConfig, merchantId: queryMerchantId }
    }

    // Try to get merchantId from order
    const orderApi = new OrderApiClient()
    try {
        const orderDetails = await orderApi.getOrder(orderNo)
        const storedMerchantId = orderDetails?.c_jpmcMerchantId
        if (storedMerchantId && storedMerchantId !== jpmcConfig.merchantId) {
            return { ...jpmcConfig, merchantId: storedMerchantId }
        }
    } catch (orderErr) {
        logger.warn('[3DS Controller] Could not fetch order for merchantId, using config default:', orderErr.message)
    }

    return jpmcConfig
}

/**
 * Fetch and extract 3DS values from payment details
 */
async function fetch3DSPaymentDetails(jpmcConfig, paymentRequestId) {
    try {
        const paymentDetails = await getPaymentDetails({
            config: jpmcConfig,
            transactionId: paymentRequestId
        })

        if (controllerConfig.debug) {
            logger.info('[3DS Controller] Payment details:', safeStringify(paymentDetails))
        }

        const threeDSValues = paymentDetails?.success
            ? extract3DSValues(paymentDetails)
            : buildEmptyThreeDSValues()

        return { paymentDetails, threeDSValues }
    } catch (err) {
        logger.error('[3DS Controller] Failed to get payment details:', err.message)
        return { paymentDetails: null, threeDSValues: buildEmptyThreeDSValues() }
    }
}

/**
 * Build empty 3DS values object
 */
function buildEmptyThreeDSValues() {
    return {
        authenticationId: null,
        authenticationValue: null,
        transactionId: null,
        transactionStatus: null,
        eci: null,
        statusReasonText: null
    }
}

/**
 * Update order and payment transaction after 3DS
 */
/**
 * Update order after 3DS authentication completes
 * @param {string} orderNo - Order number
 * @param {boolean} isSuccess - Whether 3DS authentication was successful
 * @param {Object} paymentDetails - Payment details from JPMC
 * @param {Object} threeDSValues - 3DS authentication values
 */
async function updateOrderAfter3DS(orderNo, isSuccess, paymentDetails, threeDSValues) {
    const orderApi = new OrderApiClient()
    const order = await orderApi.getOrder(orderNo)
    
    if (!isSuccess) {
        // FAILED 3DS: Only change status to 'failed', no patches allowed
        if (order.status !== 'failed') {
            await orderApi.updateOrderStatus(orderNo, 'failed')
            if (controllerConfig.debug) {
                logger.info('[3DS Controller] Updated order status to failed:', { orderNo, oldStatus: order.status })
            }
        }
        return // No patches for failed orders
    }
    
    // SUCCESS 3DS: Change status to 'new' and apply patches
    const newStatus = 'new'
    
    // STEP 1: Change order status to 'new' FIRST
    // This MUST happen BEFORE any patches, as the order must be in 'new' status to be patchable
    if (order.status !== newStatus) {
        await orderApi.updateOrderStatus(orderNo, newStatus)
        if (controllerConfig.debug) {
            logger.info('[3DS Controller] Updated order status:', { orderNo, oldStatus: order.status, newStatus })
        }
    }
    
    // STEP 2: Get payment instrument for patching
    const paymentInstrument = order.paymentInstruments?.[0]
    const paymentInstrumentId = paymentInstrument?.paymentInstrumentId
    
    if (!paymentInstrumentId) {
        throw new Error('No paymentInstrumentId found - cannot patch PaymentTransaction')
    }
    
    // STEP 3: Build payloads for order and payment transaction patches
    const { paymentTransactionPayload, orderPayload } = buildOrderPatchPayloads(
        paymentDetails, threeDSValues, isSuccess, order.currency
    )
    
    // STEP 4: Patch payment transaction if needed
    if (Object.keys(paymentTransactionPayload).length > 0) {
        if (controllerConfig.debug) {
            logger.info('[3DS Controller] Patching PaymentTransaction:', orderNo, paymentInstrumentId)
        }
        await orderApi.patchPaymentTransaction(orderNo, paymentInstrumentId, paymentTransactionPayload)
    }
    
    // STEP 5: Patch order if needed
    if (Object.keys(orderPayload).length > 0) {
        if (controllerConfig.debug) {
            logger.info('[3DS Controller] Patching Order:', orderNo)
        }
        await orderApi.patchOrder(orderNo, orderPayload)
    }
}

/**
 * Build payloads for order and payment transaction patches
 */
function buildOrderPatchPayloads(paymentDetails, threeDSValues, isSuccess, currency) {
    if (!paymentDetails?.success) {
        return {
            paymentTransactionPayload: {},
            orderPayload: {
                ...build3DSOrderPatchPayload(threeDSValues, isSuccess),
                c_pending3DSAuthentication: false
            }
        }
    }

    const paymentAmount = paymentDetails.amount ? fromMinorUnits(paymentDetails.amount, currency) : 0
    const captureMethod = paymentDetails.captureMethod || 'NOW'
    const authResult = paymentDetails.paymentAuthenticationResult || {}
    const threeDSCompletion = authResult.threeDomainSecureCompletion || {}

    const paymentTransactionPayload = {
        c_jpmcAuthorizationId: paymentDetails.transactionId,
        c_jpmcCaptureMethod: captureMethod,
        c_jpmcAuthTimestamp: paymentDetails.timestamp || new Date().toISOString(),
        c_jpmcPaymentStatus: captureMethod === 'NOW' ? 'AC' : 'A',
        c_jpmcCapturedAmount: captureMethod === 'NOW' ? paymentAmount : 0,
        c_jpmcRemainingAuthAmount: captureMethod === 'NOW' ? 0 : paymentAmount,
        c_jpmcRemainingRefundableAmount: captureMethod === 'NOW' ? paymentAmount : 0
    }

    const orderPayload = {
        c_pending3DSAuthentication: false,
        c_threeDSAuthenticationId: authResult.authenticationId || threeDSValues.authenticationId,
        c_threeDSAuthenticationValue: authResult.authenticationValue || threeDSValues.authenticationValue,
        c_threeDSTransactionStatus: threeDSCompletion.threeDSTransactionStatus || threeDSValues.transactionStatus || (isSuccess ? 'Y' : 'N'),
        c_threeDSEci: threeDSCompletion.electronicCommerceIndicator || threeDSValues.eci,
        c_threeDSTransactionId: threeDSCompletion.threeDSDirectoryServerTransactionId || threeDSValues.dsTransactionId || paymentDetails.transactionId
    }

    return { paymentTransactionPayload, orderPayload }
}

/**
 * Build postMessage response data
 */
function buildPostMessageData(isSuccess, responseStatus, threeDSValues, paymentRequestId, orderNo, orderToken) {
    return {
        success: isSuccess,
        responseStatus: responseStatus || THREE_DS.RESPONSE_STATUS.ERROR,
        authenticationStatus: threeDSValues.transactionStatus || THREE_DS.TRANSACTION_STATUS.UNAVAILABLE,
        eci: threeDSValues.eci || '',
        transactionId: paymentRequestId,
        orderID: orderNo,
        orderToken,
        ...(isSuccess && { continueUrl: `/checkout/confirmation/${orderNo}` })
    }
}

/**
 * Handle 3DS callback from JPMC
 * 
 * This endpoint receives the POST from JPMC after 3DS authentication.
 * It:
 * 1. Extracts orderNo and orderToken from query params
 * 2. Gets paymentRequestId and responseStatus from POST body
 * 3. Calls GET /payments/{id} for full 3DS details
 * 4. Patches order with 3DS values
 * 5. Updates order status (success) or fails order (denied/error)
 * 6. Returns HTML that sends postMessage to parent
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function handle3DSCallback(req, res) {
    // Derive storefront origin from request headers
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https'
    const host = req.headers['x-forwarded-host'] || req.headers.host
    const potentialOrigin = `${protocol}://${host}`
    
    const targetOrigin = getSafeTargetOrigin(potentialOrigin)
    
    // CSP nonce set by jpmorganCSPMiddleware — must be added to inline script/style tags
    const cspNonce = res.locals.cspNonce || null
    
    // Set CSP frame-ancestors based on allowlist configuration
    const allowedOrigins = getAllowedOrigins()
    if (allowedOrigins.size > 0) {
        const frameAncestorsDirective = Array.from(allowedOrigins).join(' ')
        // Append to existing CSP header if present, or create new one
        const existingCsp = res.getHeader('Content-Security-Policy') || ''
        const framAncestorsCSP = existingCsp 
            ? `${existingCsp}; frame-ancestors ${frameAncestorsDirective}`
            : `frame-ancestors ${frameAncestorsDirective}`
        res.setHeader('Content-Security-Policy', framAncestorsCSP)
    } else {
        // No allowlist configured: block embedding in any frame
        const existingCsp = res.getHeader('Content-Security-Policy') || ''
        const framAncestorsCSP = existingCsp 
            ? `${existingCsp}; frame-ancestors 'none'`
            : "frame-ancestors 'none'"
        res.setHeader('Content-Security-Policy', framAncestorsCSP)
    }

    try {
        // Step 0: Validate that targetOrigin was resolved (fail-closed if not)
        if (!targetOrigin) {
            logger.error('[3DS Controller] Cannot proceed: origin validation failed (allowlist not configured or origin not in allowlist)')
            // Return error HTML without postMessage to parent (unsafe origin)
            return res.status(403).send(build3DSPostbackHtml({
                success: false,
                responseStatus: THREE_DS.RESPONSE_STATUS.ERROR,
                error: 'Origin validation failed - cannot deliver payment result'
            }, 'about:blank', cspNonce))
        }

        // Step 1: Validate request
        const validation = validateCallbackRequest(req)
        if (!validation.valid) {
            logger.error('[3DS Controller]', validation.error)
            return res.status(400).send(build3DSPostbackHtml({
                success: false,
                responseStatus: THREE_DS.RESPONSE_STATUS.ERROR,
                orderID: validation.orderNo,
                orderToken: validation.orderToken,
                error: validation.error
            }, targetOrigin, cspNonce))
        }

        const { orderNo, orderToken, paymentRequestId, responseStatus, queryMerchantId, locale } = validation
        
        if (controllerConfig.debug) {
            logger.info('[3DS Controller] Query params:', { orderNo, orderToken, queryMerchantId, locale })
            logger.info('[3DS Controller] Body:', { paymentRequestId, responseStatus })
        }

        // Step 2: Check for duplicate callback
        const cacheKey = `${orderNo}:${paymentRequestId}`
        const duplicateCheck = checkDuplicateCallback(cacheKey, orderNo, orderToken, responseStatus, targetOrigin, cspNonce)
        if (duplicateCheck.isDuplicate) {
            res.setHeader('Content-Type', 'text/html')
            return res.send(duplicateCheck.html)
        }

        // Mark as processing
        callbackCache.set(cacheKey, { status: 'processing', timestamp: Date.now() })

        // Step 3: Resolve JPMC config and fetch payment details
        let paymentDetails = null
        let threeDSValues = buildEmptyThreeDSValues()
        
        try {
            const jpmcConfig = await resolveJPMCConfig(queryMerchantId, orderNo, locale)
            const result = await fetch3DSPaymentDetails(jpmcConfig, paymentRequestId)
            paymentDetails = result.paymentDetails
            threeDSValues = result.threeDSValues
        } catch (err) {
            logger.error('[3DS Controller] Config/payment details error:', err.message)
        }

        // Step 4: Determine success and update order
        const isSuccess = responseStatus === THREE_DS.RESPONSE_STATUS.SUCCESS
        
        if (controllerConfig.debug) {
            logger.info('[3DS Controller] Success determination:', { responseStatus, isSuccess })
        }

        try {
            await updateOrderAfter3DS(orderNo, isSuccess, paymentDetails, threeDSValues)
        } catch (err) {
            logger.error('[3DS Controller] Failed to update order:', err.message)
        }

        // Step 5: Build and send response
        const postMessageData = buildPostMessageData(
            isSuccess, responseStatus, threeDSValues, paymentRequestId, orderNo, orderToken
        )

        callbackCache.set(cacheKey, { status: 'completed', result: postMessageData, timestamp: Date.now() })

        res.setHeader('Content-Type', 'text/html')
        return res.send(build3DSPostbackHtml(postMessageData, targetOrigin, cspNonce))

    } catch (error) {
        logger.error('[3DS Controller] Unexpected error:', error.message)
        
        // Cleanup cache on error
        try {
            const { orderNo } = req.query
            const { paymentRequestId } = req.body
            if (orderNo && paymentRequestId) {
                callbackCache.delete(`${orderNo}:${paymentRequestId}`)
            }
        } catch (_e) { /* ignore */ }
        
        res.setHeader('Content-Type', 'text/html')
        // Use safe fallback origin in error case (targetOrigin validated in Step 0)
        const safeOrigin = targetOrigin || 'about:blank'
        return res.status(500).send(build3DSPostbackHtml({
            success: false,
            responseStatus: THREE_DS.RESPONSE_STATUS.ERROR,
            error: 'An unexpected error occurred'
        }, safeOrigin, cspNonce))
    }
}

/**
 * Attempt to reopen basket via SCAPI
 */
async function attemptReopenBasketViaSCAPI(orderNo, token, commerceConfig) {
    if (!token || !commerceConfig?.proxy || !commerceConfig?.organizationId || !commerceConfig?.siteId) {
        return { basketReopened: false, basketId: null }
    }

    try {
        const { proxy, organizationId, siteId } = commerceConfig
        const url = `${proxy}/checkout/shopper-orders/v1/organizations/${organizationId}/orders/${orderNo}/actions/fail?siteId=${siteId}&reopenBasket=true`

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ reasonCode: 'payment_auth_failure' })
        })

        if (!response.ok) {
            return { basketReopened: false, basketId: null }
        }

        const locationHeader = response.headers.get('Location')
        const basketMatch = locationHeader?.match(/\/baskets\/([^/?]+)/)
        const basketId = basketMatch?.[1]

        return { basketReopened: !!basketId, basketId }
    } catch (error) {
        return { basketReopened: false, basketId: null }
    }
}

/**
 * Handle Fail 3DS Order
 * 
 * Called when user cancels or times out during 3DS authentication.
 * 1. Marks the order as failed and stores the failure reason
 * 2. Attempts to reopen the customer's basket via SCAPI (if token and config provided)
 * 
 * @param {Object} req - Express request
 * @param {Object} req.body.orderNo - Order number
 * @param {Object} req.body.orderToken - Order token (for validation)
 * @param {Object} req.body.failureReason - Failure reason code
 * @param {Object} req.body.commerceConfig - Optional commerce-sdk-react config { proxy, organizationId, siteId }
 * @param {Object} req.headers.authorization - Bearer token for SCAPI calls
 * @param {Object} res - Express response
 */
export async function handleFail3DSOrder(req, res) {
    try {
        const { 
            orderNo, 
            orderToken, 
            failureReason: reasonInput,
            commerceConfig
        } = req.body

        if (!orderNo || !orderToken) {
            return res.status(400).json({
                success: false,
                error: 'Missing orderNo or orderToken'
            })
        }

        const allowedReasons = [
            THREE_DS.FAILURE_REASON.TIMEOUT,
            THREE_DS.FAILURE_REASON.USER_CANCELLED,
            THREE_DS.FAILURE_REASON.IFRAME_ERROR,
            THREE_DS.FAILURE_REASON.DENIED,
            THREE_DS.FAILURE_REASON.ERROR
        ]
        const failureReason = allowedReasons.includes(reasonInput) 
            ? reasonInput 
            : THREE_DS.FAILURE_REASON.TIMEOUT

        const orderApi = new OrderApiClient()

        const order = await orderApi.getOrder(orderNo)
        if (!order.c_pending3DSAuthentication) {
            logger.warn('[3DS Controller] Order not pending 3DS:', orderNo)
            return res.status(400).json({
                success: false,
                error: 'Order is not pending 3DS authentication'
            })
        }

        // Step 1: Mark order as failed in SFCC
        await orderApi.patchOrder(orderNo, {
            c_pending3DSAuthentication: false,
            c_threeDSTransactionStatus: THREE_DS.TRANSACTION_STATUS.UNAVAILABLE,
            c_threeDSFailureReason: failureReason
        })

        await orderApi.updateOrderStatus(orderNo, 'failed')

        // Step 2: Attempt to reopen basket via SCAPI (optional, best-effort)
        let basketReopenResult = { basketReopened: false, basketId: null }
        const authHeader = req.headers.authorization
        if (authHeader && commerceConfig) {
            const token = authHeader.replace('Bearer ', '')
            basketReopenResult = await attemptReopenBasketViaSCAPI(orderNo, token, commerceConfig)
        } else {
            logger.debug('[3DS Controller] Skipping basket reopen: missing auth header or commerceConfig', {
                hasAuth: !!authHeader,
                hasConfig: !!commerceConfig
            })
        }

        return res.json({
            success: true,
            basketReopened: basketReopenResult.basketReopened,
            basketId: basketReopenResult.basketId
        })

    } catch (error) {
        logger.error('[3DS Controller] Fail 3DS Order error:', error.message)
        return res.status(500).json({
            success: false,
            error: 'Failed to fail order'
        })
    }
}

export default {
    configureThreeDSController,
    handle3DSCallback,
    handleFail3DSOrder
}
