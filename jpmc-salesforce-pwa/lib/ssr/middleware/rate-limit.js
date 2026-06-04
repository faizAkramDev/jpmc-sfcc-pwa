/**
 * Rate Limiting Middleware for JPMC Payment Endpoints
 * 
 * Protects payment endpoints from abuse by limiting request frequency.
 * 
 * Default limits by category:
 * - Payment (authorize, verify, capture): 5 req/60s (strict - prevents fraud)
 * - Config (config, googlepay/config, etc.): 30 req/60s (lenient - read-only)
 * - Google Pay Cart flow: 20 req/60s (user flow - reasonable)
 * - Google Pay PDP flow: 20 req/60s (user flow - reasonable)
 * - Apple Pay: 10 req/60s (payment related)
 * - Order management: 10 req/60s (post-payment operations)
 * 
 * Merchants can override any category via options passed to applyRateLimiting.
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/ssr/middleware/rate-limit
 */

import rateLimit from 'express-rate-limit'
import logger from '../../utils/logger.js'

/**
 * Default rate limit configurations by category
 */
const DEFAULT_RATE_LIMITS = {
    payment: {
        windowMs: 60 * 1000,  // 60 seconds
        max: 5,               // 5 requests per window (strict for payment)
        message: 'Too many payment attempts, please try again later'
    },
    config: {
        windowMs: 60 * 1000,
        max: 30,              // 30 requests per window (lenient for config)
        message: 'Too many configuration requests'
    },
    googlePayCart: {
        windowMs: 60 * 1000,
        max: 20,              // 20 requests per window (user flow)
        message: 'Too many Google Pay requests, please try again later'
    },
    googlePayPdp: {
        windowMs: 60 * 1000,
        max: 20,              // 20 requests per window (user flow)
        message: 'Too many Google Pay requests, please try again later'
    },
    applePay: {
        windowMs: 60 * 1000,
        max: 10,              // 10 requests per window (payment related)
        message: 'Too many Apple Pay requests, please try again later'
    },
    order: {
        windowMs: 60 * 1000,
        max: 10,              // 10 requests per window (post-payment)
        message: 'Too many order requests, please try again later'
    }
}

/**
 * Base rate limiter configuration
 */
const BASE_RATE_LIMIT_CONFIG = {
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false,  // Disable X-RateLimit-* headers
    // Use req.ip as the rate-limit key. Express resolves this correctly
    // when the app has configured `trust proxy`. If trust proxy is not
    // configured, express-rate-limit will emit a warning at startup.
    keyGenerator: (req) => req.ip,
    skip: (req) => {
        // Skip rate limiting for health checks
        return req.path.endsWith('/health')
    }
}

/**
 * Create a rate limiter with specified options
 * 
 * @param {object} options - Rate limit options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60000)
 * @param {number} options.max - Max requests per window (default: 5)
 * @param {string} options.message - Error message
 * @returns {Function} Express middleware
 */
export const createRateLimiter = (options = {}) => {
    const windowMs = options.windowMs || DEFAULT_RATE_LIMITS.payment.windowMs
    const max = options.max || DEFAULT_RATE_LIMITS.payment.max
    const message = options.message || DEFAULT_RATE_LIMITS.payment.message

    const config = {
        ...BASE_RATE_LIMIT_CONFIG,
        windowMs,
        max,
        message: {
            success: false,
            error: message,
            errorCode: 'RATE_LIMIT_EXCEEDED',
            retryAfter: Math.ceil(windowMs / 1000)
        },
        handler: (req, res, _next, options) => {
            logger.warn('[JPMC Rate Limit] Request blocked:', {
                ip: req.ip,
                path: req.path,
                method: req.method,
                category: options.category || 'unknown'
            })
            res.status(429).json(options.message)
        }
    }

    return rateLimit(config)
}

/**
 * Create a rate limiter for a specific category
 * 
 * @param {string} category - Category name (payment, config, googlePayCart, etc.)
 * @param {object} overrides - Override options for this category
 * @returns {Function} Express middleware
 */
export const createCategoryRateLimiter = (category, overrides = {}) => {
    const defaults = DEFAULT_RATE_LIMITS[category] || DEFAULT_RATE_LIMITS.payment
    return createRateLimiter({
        ...defaults,
        ...overrides,
        category
    })
}

// Legacy export - kept for backward compatibility
export const createPaymentRateLimiter = createRateLimiter

/**
 * Pre-configured rate limiter for authorization endpoints (5 req/60s)
 */
export const paymentRateLimiter = createCategoryRateLimiter('payment')

/**
 * Pre-configured rate limiter for config endpoints (30 req/60s)
 */
export const configRateLimiter = createCategoryRateLimiter('config')

/**
 * Pre-configured rate limiter for Google Pay Cart flow (20 req/60s)
 */
export const googlePayCartRateLimiter = createCategoryRateLimiter('googlePayCart')

/**
 * Pre-configured rate limiter for Google Pay PDP flow (20 req/60s)
 */
export const googlePayPdpRateLimiter = createCategoryRateLimiter('googlePayPdp')

/**
 * Pre-configured rate limiter for Apple Pay (10 req/60s)
 */
export const applePayRateLimiter = createCategoryRateLimiter('applePay')

/**
 * Pre-configured rate limiter for order management (10 req/60s)
 */
export const orderRateLimiter = createCategoryRateLimiter('order')

/**
 * Apply rate limiting to JPMC payment routes
 * 
 * @param {object} app - Express app instance
 * @param {string} basePath - Base path for routes (default: /api/jpmorgan)
 * @param {object} options - Rate limit configuration
 * @param {number} options.windowMs - Global time window (overrides all categories)
 * @param {number} options.max - Global max requests (overrides payment category only for backward compat)
 * @param {object} options.categories - Per-category overrides
 * @param {object} options.categories.payment - Payment endpoint overrides {windowMs, max, message}
 * @param {object} options.categories.config - Config endpoint overrides
 * @param {object} options.categories.googlePayCart - Google Pay Cart endpoint overrides
 * @param {object} options.categories.googlePayPdp - Google Pay PDP endpoint overrides
 * @param {object} options.categories.applePay - Apple Pay endpoint overrides
 * @param {object} options.categories.order - Order management endpoint overrides
 * 
 * @example
 * // Use defaults
 * applyRateLimiting(app, '/api/jpmorgan')
 * 
 * @example
 * // Override payment limit only (backward compatible)
 * applyRateLimiting(app, '/api/jpmorgan', { max: 10 })
 * 
 * @example
 * // Override specific categories
 * applyRateLimiting(app, '/api/jpmorgan', {
 *     categories: {
 *         payment: { max: 10 },              // 10 req/60s for payment
 *         googlePayCart: { max: 50 },        // 50 req/60s for cart flow
 *         order: { windowMs: 120000, max: 20 } // 20 req/120s for orders
 *     }
 * })
 */
export const applyRateLimiting = (app, basePath, options = {}) => {
    const { categories = {} } = options
    
    // Backward compatibility: if options.max is set, use it for payment category
    const paymentOverrides = {
        ...(options.windowMs && { windowMs: options.windowMs }),
        ...(options.max && { max: options.max }),
        ...categories.payment
    }

    // Create rate limiters for each category (with optional overrides)
    const limiters = {
        payment: createCategoryRateLimiter('payment', paymentOverrides),
        config: createCategoryRateLimiter('config', categories.config),
        googlePayCart: createCategoryRateLimiter('googlePayCart', categories.googlePayCart),
        googlePayPdp: createCategoryRateLimiter('googlePayPdp', categories.googlePayPdp),
        applePay: createCategoryRateLimiter('applePay', categories.applePay),
        order: createCategoryRateLimiter('order', categories.order)
    }

    // ==========================================================================
    // Payment Endpoints (5 req/60s default - strict)
    // ==========================================================================
    const paymentEndpoints = [
        `${basePath}/authorize`,
        `${basePath}/verify`,
        `${basePath}/capture`
    ]
    paymentEndpoints.forEach(endpoint => {
        app.use(endpoint, limiters.payment)
    })

    // ==========================================================================
    // Config Endpoints (30 req/60s default - lenient, read-only)
    // ==========================================================================
    const configEndpoints = [
        `${basePath}/config`,
        `${basePath}/googlepay/config`,
        `${basePath}/applepay/config`,
        `${basePath}/available-payment-methods`,
        `${basePath}/fraud-config`
    ]
    configEndpoints.forEach(endpoint => {
        app.use(endpoint, limiters.config)
    })

    // ==========================================================================
    // Google Pay Cart Flow Endpoints (20 req/60s default)
    // ==========================================================================
    const googlePayCartEndpoints = [
        `${basePath}/googlepay/initialize`,
        `${basePath}/googlepay/update-shipping`,
        `${basePath}/googlepay/select-shipping-option`,
        `${basePath}/googlepay/submit-cart-order`,
        `${basePath}/googlepay/cart-totals`
    ]
    googlePayCartEndpoints.forEach(endpoint => {
        app.use(endpoint, limiters.googlePayCart)
    })

    // ==========================================================================
    // Google Pay PDP Flow Endpoints (20 req/60s default)
    // ==========================================================================
    const googlePayPdpEndpoints = [
        `${basePath}/googlepay/pdp/add-to-cart`,
        `${basePath}/googlepay/pdp/restore-basket`,
        `${basePath}/googlepay/pdp/validate-stock`,
        `${basePath}/googlepay/pdp/product-details`
    ]
    googlePayPdpEndpoints.forEach(endpoint => {
        app.use(endpoint, limiters.googlePayPdp)
    })

    // ==========================================================================
    // Apple Pay Endpoints (10 req/60s default)
    // ==========================================================================
    const applePayEndpoints = [
        `${basePath}/applepay/session`,
        `${basePath}/applepay/authorize`
    ]
    applePayEndpoints.forEach(endpoint => {
        app.use(endpoint, limiters.applePay)
    })

    // ==========================================================================
    // Order Management Endpoints (10 req/60s default)
    // Note: Uses path prefix matching for dynamic :orderNo parameter
    // ==========================================================================
    app.use(`${basePath}/order`, limiters.order)

    // Log applied rate limits
    const getLimit = (category) => {
        const override = categories[category] || {}
        const defaults = DEFAULT_RATE_LIMITS[category]
        const max = override.max || (category === 'payment' && options.max) || defaults.max
        const windowSec = Math.ceil((override.windowMs || options.windowMs || defaults.windowMs) / 1000)
        return `${max} req/${windowSec}s`
    }

    logger.info('[JPMC Rate Limit] Applied rate limiting:', {
        payment: getLimit('payment'),
        config: getLimit('config'),
        googlePayCart: getLimit('googlePayCart'),
        googlePayPdp: getLimit('googlePayPdp'),
        applePay: getLimit('applePay'),
        order: getLimit('order')
    })
}

export default {
    createRateLimiter,
    createCategoryRateLimiter,
    createPaymentRateLimiter, // Legacy export
    paymentRateLimiter,
    configRateLimiter,
    googlePayCartRateLimiter,
    googlePayPdpRateLimiter,
    applePayRateLimiter,
    orderRateLimiter,
    applyRateLimiting,
    DEFAULT_RATE_LIMITS
}
