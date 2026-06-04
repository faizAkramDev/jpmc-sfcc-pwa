/**
 * JP Morgan Payment API Route Handler
 * 
 * This module provides server-side API endpoints for JPMC payment processing.
 * These endpoints should be registered in PWA Kit's SSR server.
 * 
 * SECURITY: All JPMC API calls happen server-side to protect credentials.
 * Authentication is handled automatically via OAuth 2.0 with JWT Client Assertion.
 * 
 * Endpoints:
 * - POST /api/jpmorgan/verify - Verify card and get token
 * - POST /api/jpmorgan/authorize - Create payment authorization
 * - POST /api/jpmorgan/config - Get client config (merchantId, environment)
 * - GET  /api/jpmorgan/googlepay/config - Get Google Pay configuration
 * - GET  /api/jpmorgan/fraud-config - Get fraud check configuration
 * - POST /api/jpmorgan/order/:orderNo/confirm - Confirm order after authorization
 * - PATCH /api/jpmorgan/order/:orderNo/payment-instruments/:paymentInstrumentId - Patch order with JPMC data
 * - GET  /api/jpmorgan/available-payment-methods - Get available payment methods
 * 
 * @module api-routes
 */

// =============================================================================
// Handler Imports (from modular handler files)
// =============================================================================

import { 
    handleGetConfig, 
    handleGetGooglePayConfig,
    handleGetApplePayConfig,
    handleGetFraudConfig 
} from './api/handlers/config-handlers'

import { 
    handleAuthorize, 
    handleVerify 
} from './api/handlers/payment-handlers'

import { 
    handleConfirmOrder, 
    handlePatchOrderPaymentInstrument 
} from './api/handlers/order-handlers'

import { 
    handleGetAvailablePaymentMethods 
} from './api/handlers/payment-methods-handler'



// =============================================================================
// Supporting Imports
// =============================================================================

import { verifyAuthConfiguration } from './auth'
import { getJPMCConfigAsync } from '../ssr'
import logger from '../utils/logger'

// =============================================================================
// Express Router Setup (for PWA Kit SSR)
// =============================================================================

/**
 * Register JPMC API routes with Express app
 * 
 * Usage in ssr.js:
 * ```
 * import { registerJPMCRoutes } from '@jpmorgan/jpmorgan-salesforce-pwa/lib/services/api-routes'
 * 
 * // In runtime.createHandler options:
 * {
 *   extendHandler: (app) => {
 *     registerJPMCRoutes(app)
 *   }
 * }
 * ```
 * 
 * @param {Express} app - Express application instance
 * @param {object} [runtime] - Optional PWA Kit runtime (not currently used, accepted for compatibility)
 */
export const registerJPMCRoutes = (app, _runtime = null) => {
    // Note: _runtime parameter is accepted for compatibility with PWA Kit patterns
    // but is not currently used by JPMC routes
    
    // Verify authentication configuration early (non-blocking, async)
    getJPMCConfigAsync().then(config => {
        try {
            const result = verifyAuthConfiguration(config)
            if (result.valid) {
                // auth config verified
            } else {
                logger.warn('[JPMC] Authentication configuration warning:', result.message)
            }
        } catch (error) {
            logger.warn('[JPMC] Could not verify auth configuration:', error.message)
            // Non-fatal - routes are still registered, will fail at runtime if config is invalid
        }
    }).catch(error => {
        logger.warn('[JPMC] Could not load config for auth verification:', error.message)
    })

    // JSON body parser for API routes
    app.use('/api/jpmorgan', (req, res, next) => {
        if (req.method !== 'GET' && !req.body) {
            let data = ''
            req.on('data', chunk => { data += chunk })
            req.on('end', () => {
                try {
                    req.body = JSON.parse(data)
                } catch (e) {
                    req.body = {}
                }
                next()
            })
        } else {
            next()
        }
    })

    // ==========================================================================
    // Payment Routes
    // ==========================================================================
    
    // Card verification endpoint (returns SAFETECH token for subsequent payments)
    app.post('/api/jpmorgan/verify', handleVerify)
    
    // Payment authorization endpoint (supports card, token, or Google Pay)
    app.post('/api/jpmorgan/authorize', handleAuthorize)

    // ==========================================================================
    // Configuration Routes
    // ==========================================================================
    
    // Client configuration endpoint (merchantId, environment, etc.)
    app.post('/api/jpmorgan/config', handleGetConfig)
    app.get('/api/jpmorgan/config', handleGetConfig)
    
    // Google Pay configuration endpoint
    app.get('/api/jpmorgan/googlepay/config', handleGetGooglePayConfig)
    app.post('/api/jpmorgan/googlepay/config', handleGetGooglePayConfig)
    
    // Fraud configuration endpoint (kountClientId, kountEnvironment, fraud flags)
    app.get('/api/jpmorgan/fraud-config', handleGetFraudConfig)

    // ==========================================================================
    // Order Routes
    // ==========================================================================
    
    // Order confirmation endpoint (confirms order after JPMC authorization)
    app.post('/api/jpmorgan/order/:orderNo/confirm', handleConfirmOrder)
    
    // Order patching endpoint (for updating orders with JPMC transaction data)
    app.patch('/api/jpmorgan/order/:orderNo/payment-instruments/:paymentInstrumentId', handlePatchOrderPaymentInstrument)

    // ==========================================================================
    // Payment Methods Route
    // ==========================================================================
    
    // Available payment methods endpoint (auto-detects which payment types are enabled in BM)
    app.get('/api/jpmorgan/available-payment-methods', handleGetAvailablePaymentMethods)
}

// =============================================================================
// Named Exports (for direct handler imports if needed)
// =============================================================================

// Config handlers
export { handleGetConfig, handleGetGooglePayConfig, handleGetApplePayConfig, handleGetFraudConfig } from './api/handlers/config-handlers'
// Payment handlers
export { handleVerify, handleAuthorize } from './api/handlers/payment-handlers'
// Order handlers
export { handleConfirmOrder, handlePatchOrderPaymentInstrument } from './api/handlers/order-handlers'
// Payment methods handler
export { handleGetAvailablePaymentMethods } from './api/handlers/payment-methods-handler'

// =============================================================================
// Default Export
// =============================================================================

export default {
    handleVerify,
    handleAuthorize,
    handleGetConfig,
    handleGetGooglePayConfig,
    handleGetApplePayConfig,
    handleGetFraudConfig,
    handleConfirmOrder,
    handlePatchOrderPaymentInstrument,
    handleGetAvailablePaymentMethods,
    registerJPMCRoutes
}
