/**
 * JPMC CSP (Content Security Policy) Middleware
 * 
 * Automatically injects the required CSP headers for JP Morgan PIE SDK
 * and API domains.
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/ssr/middleware/csp
 */

import crypto from 'node:crypto'
import helmet from 'helmet'
import logger from '../../utils/logger'

/**
 * Check if running in remote/production environment
 * Matches PWA Kit's isRemote() logic without importing from pwa-kit-runtime
 * to avoid bundling issues
 */
const isRemote = () => {
    return !!(
        process.env.AWS_LAMBDA_FUNCTION_NAME ||
        process.env.MOBIFY_PROPERTY_ID ||
        process.env.X_MOBIFY_DEPLOYID
    )
}

/**
 * Default CSP directives required for JP Morgan payment integration
 */
const JPMC_CSP_DIRECTIVES = {
    // PIE SDK and JPMC resources
    'script-src': [
        "'self'",
        // PIE SDK domains
        'https://safetechpageencryptionvar.chasepaymentech.com',
        'https://safetechpageencryption.chasepaymentech.com',
        // Google Pay - ALL required domains
        'https://pay.google.com',
        'https://*.google.com',
        'https://*.gstatic.com',
        'https://apis.google.com',
        'https://www.googletagmanager.com',
        'https://www.google-analytics.com',
        // Apple Pay
        'https://applepay.cdn-apple.com',
        // Kount device fingerprinting SDK
        'https://*.kaptcha.com'
    ],
    
    // API connections
    'connect-src': [
        "'self'",
        // PIE SDK key retrieval
        'https://safetechpageencryptionvar.chasepaymentech.com',
        'https://safetechpageencryption.chasepaymentech.com',
        // JPMC API (test/sandbox)
        'https://api-ms-test.payments.jpmorgan.com',
        // JPMC API (production)
        'https://api-ms.payments.jpmorgan.com',
        // SFCC API
        'api.cquotient.com',
        // Google Pay - include root domain and wildcard
        'https://google.com',
        'https://pay.google.com',
        'https://*.google.com',
        'https://*.googleapis.com',
        // Kount device fingerprinting (tst.kaptcha.com = TEST, ssl.kaptcha.com = PROD)
        'https://*.kaptcha.com',
        // Apple Pay - All gateway domains
        'https://apple-pay-gateway.apple.com',
        'https://apple-pay-gateway-cert.apple.com',
        'https://apple-pay-gateway-nc-pod1.apple.com',
        'https://apple-pay-gateway-nc-pod2.apple.com',
        'https://apple-pay-gateway-nc-pod3.apple.com',
        'https://apple-pay-gateway-nc-pod4.apple.com',
        'https://apple-pay-gateway-nc-pod5.apple.com',
        'https://apple-pay-gateway-pr-pod1.apple.com',
        'https://apple-pay-gateway-pr-pod2.apple.com',
        'https://apple-pay-gateway-pr-pod3.apple.com',
        'https://apple-pay-gateway-pr-pod4.apple.com',
        'https://apple-pay-gateway-pr-pod5.apple.com',
        'https://*.apple.com'
    ],
    
    // Embedded frames (for 3DS, future payment methods)
    'frame-src': [
        "'self'",
        'https://*.jpmorgan.com',
        'https://*.chasepaymentech.com',
        // Kount device fingerprinting iframe (tst.kaptcha.com = TEST, ssl.kaptcha.com = PROD)
        'https://*.kaptcha.com',
        // Google Pay - ALL required frame sources
        'https://pay.google.com',
        'https://*.google.com',
        'https://accounts.google.com',
        'https://payments.google.com',
        // Apple Pay
        'https://applepay.cdn-apple.com',
        'https://*.apple.com'
    ],
    
    // Form submissions (for 3DS orchestration)
    'form-action': [
        "'self'",
        // JPMC 3DS orchestration (test/sandbox)
        'https://api-ms-test.payments.jpmorgan.com',
        // JPMC 3DS orchestration (production)
        'https://api-ms.payments.jpmorgan.com',
        // Wildcard for any JPMC subdomain
        'https://*.jpmorgan.com'
    ],
    
    // Images (card logos, etc.)
    'img-src': [
        "'self'",
        'data:',
        '*.commercecloud.salesforce.com',
        // Payment method logos
        'https://*.visa.com',
        'https://*.mastercard.com',
        'https://www.paypalobjects.com',
        // Google
        'https://*.google.com',
        'https://*.gstatic.com',
        'https://*.googleusercontent.com'
    ],
    
    // Styles for Google Pay button and React/Chakra UI inline styles
    // 'unsafe-inline' is required because React/Chakra UI (Emotion CSS-in-JS) renders
    // inline style attributes (style="...") which cannot be nonce'd — nonces only apply
    // to <style> tags, not style attributes. Blocking style-src inline in a React app
    // provides negligible security benefit compared to the breakage it causes.
    // The meaningful XSS protection comes from locking down script-src (no unsafe-inline there).
    'style-src': [
        "'self'",
        "'unsafe-inline'",
        'https://*.google.com',
        'https://*.gstatic.com'
    ],
    
    // Fonts
    'font-src': [
        "'self'",
        'data:',
        'https://*.gstatic.com'
    ]
}

/**
 * Merge custom CSP directives with JPMC defaults
 * 
 * @param {object} customDirectives - Custom CSP directives to merge
 * @returns {object} Merged directives
 */
export function mergeCSPDirectives(customDirectives = {}) {
    const merged = { ...JPMC_CSP_DIRECTIVES }
    
    Object.keys(customDirectives).forEach(key => {
        if (merged[key]) {
            // Merge arrays, avoiding duplicates
            merged[key] = [...new Set([...merged[key], ...customDirectives[key]])]
        } else {
            merged[key] = customDirectives[key]
        }
    })
    
    return merged
}

/**
 * Create JPMC CSP middleware using Helmet
 * 
 * @param {object} additionalDirectives - Additional CSP directives to merge
 * @returns {function} Express middleware
 * 
 * @example
 * ```javascript
 * app.use(jpmorganCSPMiddleware({
 *     'script-src': ['https://custom-script.com']
 * }))
 * ```
 */
export function jpmorganCSPMiddleware(additionalDirectives = {}) {
    if (!isRemote()) {
        logger.warn('[JPMC CSP] HSTS is disabled in non-production environments. Ensure HTTPS is enforced by your reverse proxy or load balancer.')
    }
    return (req, res, next) => {
        const nonce = crypto.randomBytes(16).toString('base64')
        res.locals.cspNonce = nonce

        const directives = mergeCSPDirectives(additionalDirectives)
        directives['script-src'] = [...directives['script-src'], `'nonce-${nonce}'`]

        // Handle upgrade-insecure-requests for local development
        if (!isRemote()) {
            directives['upgrade-insecure-requests'] = null
        }

        helmet({
            contentSecurityPolicy: {
                useDefaults: true,
                directives
            },
            // CRITICAL FOR GOOGLE PAY: Cross-Origin-Opener-Policy must be 'same-origin-allow-popups'
            // If set to 'same-origin' (helmet default), it blocks the Google Pay popup from
            // communicating back to the parent window, causing OR_BIBED_15 error.
            // See: https://developers.google.com/pay/api/web/guides/resources/troubleshooting
            crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
            // HSTS only in production
            hsts: isRemote()
        })(req, res, next)
    }
}

/**
 * Get raw CSP directives (for manual helmet configuration)
 * 
 * @param {object} additionalDirectives - Additional CSP directives to merge
 * @returns {object} CSP directives object
 */
export function getCSPDirectives(additionalDirectives = {}) {
    return mergeCSPDirectives(additionalDirectives)
}

export default { jpmorganCSPMiddleware, mergeCSPDirectives, getCSPDirectives }
