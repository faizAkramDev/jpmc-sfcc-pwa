/**
 * JPMC API Routes Registration
 * 
 * Auto-registers all JP Morgan payment API endpoints.
 * These routes handle server-side payment processing.
 * 
 * This module provides a single registration function:
 * - registerJPMCEndpoints - Adyen-style function with configurable overrides
 * 
 * Legacy registerJPMCRoutes has been consolidated into registerJPMCEndpoints.
 * Use registerJPMCEndpoints(app, runtime, config) for all new integrations.
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/ssr/routes
 */

import {
    handleAuthorize,
    handleGetConfig,
    handleGetGooglePayConfig,
    handleVerify,
    handleGetAvailablePaymentMethods,
    handleGetFraudConfig
} from '../services/api'

import logger from '../utils/logger.js'
import { GENERIC_API_ERROR_MESSAGE } from '../utils/constants/error-constants'

import {
    configureOrderController,
    handleConfirmOrder,
    handleCreateOrder,
    handleFailOrder,
    handleUpdateOrderStatus,
    handlePatchPaymentInstrument,
    handleGetOrder
} from './controllers/order-controller'

import {
    configureApplePayController,
    handleApplePaySession,
    handleApplePayAuthorize,
    handleApplePayConfig
} from './controllers/applepay-controller'

import {
    configureThreeDSController,
    handle3DSCallback,
    handleFail3DSOrder
} from './controllers/threeds-controller'

import { applyRateLimiting } from './middleware/rate-limit.js'
import bodyParser from 'body-parser'

// Body parser for form-urlencoded data (used by JPMC 3DS callback)
const urlencodedParser = bodyParser.urlencoded({ extended: true })

/**
 * Success handler - sends response from res.locals
 */
export function SuccessHandler(req, res) {
    if (res.locals.response) {
        return res.status(200).json(res.locals.response)
    }
    // Response already sent by controller
}

/**
 * Error handler for JPMC endpoints
 */
export function ErrorHandler(err, req, res, _next) {
    logger.error('[JPMC Error]', err.message, err.cause || '')
    return res.status(err.statusCode || 500).json({
        success: false,
        error: GENERIC_API_ERROR_MESSAGE
    })
}

/**
 * Register all JPMC API routes on the Express app
 * 
 * @param {object} app - Express app instance
 * @param {object} options - Route options
/**
 * Register JPMC endpoints with configurable handlers (Adyen-style)
 * 
 * This function provides a plug-and-play way to register all JPMC payment
 * endpoints with full customization support. Users can override any handler
 * or provide custom attribute mapping.
 * 
 * @param {object} app - Express app instance
 * @param {object} runtime - PWA Kit runtime (for rendering pages)
 * @param {object} config - Configuration options
 * @param {object} config.attributeMapping - Custom attribute mapping for JPMC response
 * @param {function} config.onAuthorizationSuccess - Custom handler after successful payment
 * @param {function} config.onAuthorizationFailure - Custom handler after failed payment
 * @param {object} config.overrides - Override default handlers
 * @param {boolean} config.debug - Enable debug logging
 */
export function registerJPMCEndpoints(app, runtime, config = {}) {
    const {
        basePath = '/api/jpmorgan',
        attributeMapping = {},
        onAuthorizationSuccess = null,
        onAuthorizationFailure = null,
        overrides = {},
        debug = process.env.JPMC_DEBUG === 'true',
        // Apple Pay configuration
        applePay = null,
        // Commerce API config (from PWA Kit's getConfig().app.commerceAPI.parameters)
        // Used by OrderApiClient to call SFCC Orders Data API without needing 5 extra env vars.
        // Only COMMERCE_API_CLIENT_ID_PRIVATE and COMMERCE_API_CLIENT_SECRET still need to be set manually.
        commerceConfig = null,
        // Rate limiting configuration
        enableRateLimit = true,
        rateLimitOptions = { windowMs: 60000, max: 5 }
    } = config
    
    // Apply rate limiting to payment endpoints (5 req/60s by default)
    if (enableRateLimit) {
        applyRateLimiting(app, basePath, rateLimitOptions)
        if (debug) {
            logger.info('[JPMC Endpoints] Rate limiting enabled:', rateLimitOptions)
        }
    }

    if (debug) {
        logger.info('[JPMC Endpoints] Registering endpoints at', basePath)
        logger.info('[JPMC Endpoints] Custom attribute mapping:', Object.keys(attributeMapping))
    }

    // Configure Apple Pay if provided
    if (applePay) {
        configureApplePayController({
            ...applePay,
            debug
        })
        if (debug) {
            logger.info('[JPMC Endpoints] Apple Pay configured with merchant:', applePay.merchantId)
        }
    }

    // Configure the order controller with custom settings
    configureOrderController({
        attributeMapping,
        onAuthorizationSuccess,
        onAuthorizationFailure,
        commerceConfig,
        debug
    })

    // Configure the 3DS controller
    // Note: jpmcConfig will be set from the first authorize request
    configureThreeDSController({
        debug
    })

    // ==========================================================================
    // Define default handlers
    // ==========================================================================
    
    const defaultHandlers = {
        config: [handleGetConfig],
        googlePayConfig: [handleGetGooglePayConfig],
        availablePaymentMethods: [handleGetAvailablePaymentMethods],
        fraudConfig: [handleGetFraudConfig],
        authorize: [handleAuthorize],
        verify: [handleVerify],
        confirmOrder: [handleConfirmOrder, SuccessHandler],
        createOrder: [handleCreateOrder, SuccessHandler],
        failOrder: [handleFailOrder, SuccessHandler],
        updateOrderStatus: [handleUpdateOrderStatus, SuccessHandler],
        patchPaymentInstrument: [handlePatchPaymentInstrument, SuccessHandler],
        getOrder: [handleGetOrder, SuccessHandler],
        // Apple Pay handlers
        applePayConfig: [handleApplePayConfig],
        applePaySession: [handleApplePaySession],
        applePayAuthorize: [handleApplePayAuthorize],
        // 3D Secure handlers
        // urlencodedParser is needed because JPMC POSTs form-urlencoded data to the callback
        threeDSCallback: [urlencodedParser, handle3DSCallback],
        fail3DSOrder: [handleFail3DSOrder, SuccessHandler]
    }

    // Merge with overrides
    const handlers = {}
    for (const [key, defaultHandler] of Object.entries(defaultHandlers)) {
        handlers[key] = overrides[key] || defaultHandler
    }

    // ==========================================================================
    // Configuration Endpoints
    // ==========================================================================
    
    app.get(`${basePath}/config`, ...handlers.config)
    app.post(`${basePath}/config`, ...handlers.config)
    app.get(`${basePath}/googlepay/config`, ...handlers.googlePayConfig)
    app.post(`${basePath}/googlepay/config`, ...handlers.googlePayConfig)
    app.get(`${basePath}/available-payment-methods`, ...handlers.availablePaymentMethods)
    app.get(`${basePath}/fraud-config`, ...handlers.fraudConfig)

    // ==========================================================================
    // Apple Pay Endpoints
    // ==========================================================================
    
    app.get(`${basePath}/applepay/config`, ...handlers.applePayConfig)
    app.post(`${basePath}/applepay/session`, ...handlers.applePaySession)
    app.post(`${basePath}/applepay/authorize`, ...handlers.applePayAuthorize)

    // ==========================================================================
    // Payment Endpoints
    // ==========================================================================
    
    app.post(`${basePath}/authorize`, ...handlers.authorize)
    app.post(`${basePath}/verify`, ...handlers.verify)

    // ==========================================================================
    // Order Management Endpoints (Server-side)
    // ==========================================================================

    /**
     * POST /api/jpmorgan/order/create
     * Creates an SFCC order server-side from a basket.
     * Used by PIE, Google Pay, and Apple Pay flows for locale-aware order creation.
     */
    app.post(`${basePath}/order/create`, ...handlers.createOrder)

    /**
     * POST /api/jpmorgan/order/:orderNo/confirm
     * Confirm order after successful payment
     * - Updates payment status to PAID
     * - Updates confirmation status to CONFIRMED
     * - Patches payment instrument with JPMC data
     */
    app.post(`${basePath}/order/:orderNo/confirm`, ...handlers.confirmOrder)

    /**
     * POST /api/jpmorgan/order/:orderNo/fail
     * Mark order as failed after payment failure
     */
    app.post(`${basePath}/order/:orderNo/fail`, ...handlers.failOrder)

    /**
     * PUT /api/jpmorgan/order/:orderNo/status
     * Update order statuses
     */
    app.put(`${basePath}/order/:orderNo/status`, ...handlers.updateOrderStatus)

    /**
     * PATCH /api/jpmorgan/order/:orderNo/payment-instruments/:paymentInstrumentId
     * Patch payment instrument with custom attributes
     */
    app.patch(
        `${basePath}/order/:orderNo/payment-instruments/:paymentInstrumentId`, 
        ...handlers.patchPaymentInstrument
    )

    /**
     * GET /api/jpmorgan/order/:orderNo
     * Get order details
     */
    app.get(`${basePath}/order/:orderNo`, ...handlers.getOrder)

    // ==========================================================================
    // 3D Secure Endpoints
    // ==========================================================================

    /**
     * POST /checkout/3ds-callback
     * 3DS callback endpoint - receives POST from JPMC after authentication
     * Note: This uses a different base path (/checkout) as it's the return URL
     * for the 3DS flow and renders HTML for postMessage communication.
     */
    app.post('/checkout/3ds-callback', ...handlers.threeDSCallback)

    /**
     * POST /api/jpmorgan/3ds/fail
     * Fail 3DS order - called when user cancels or times out
     */
    app.post(`${basePath}/3ds/fail`, ...handlers.fail3DSOrder)

    // Google Pay Cart/PDP Endpoints removed - integrators handle basket operations directly
    // via onPaymentDataChanged and onPaymentAuthorized callbacks (matching Apple Pay pattern)

    // ==========================================================================
    // Error Handler
    // ==========================================================================
    
    app.use(overrides.ErrorHandler || ErrorHandler)

    if (debug) {
        logger.info('[JPMC Endpoints] All endpoints registered successfully')
        logger.info('[JPMC Endpoints] Available endpoints:')
        logger.info(`  GET/POST ${basePath}/config`)
        logger.info(`  GET/POST ${basePath}/googlepay/config`)
        logger.info(`  GET      ${basePath}/applepay/config`)
        logger.info(`  POST     ${basePath}/applepay/session`)
        logger.info(`  POST     ${basePath}/applepay/authorize`)
        logger.info(`  POST     ${basePath}/authorize`)
        logger.info(`  POST     ${basePath}/verify`)
        logger.info(`  POST     ${basePath}/order/:orderNo/confirm`)
        logger.info(`  POST     ${basePath}/order/:orderNo/fail`)
        logger.info(`  PUT      ${basePath}/order/:orderNo/status`)
        logger.info(`  PATCH    ${basePath}/order/:orderNo/payment-instruments/:id`)
        logger.info(`  GET      ${basePath}/order/:orderNo`)
        logger.info(`  POST     /checkout/3ds-callback`)
        logger.info(`  POST     ${basePath}/3ds/fail`)
    }
}

// Re-export controllers for direct access
export { configureApplePayController } from './controllers/applepay-controller'
export { configureThreeDSController } from './controllers/threeds-controller'

export default { registerJPMCEndpoints, SuccessHandler, ErrorHandler, configureApplePayController, configureThreeDSController }
