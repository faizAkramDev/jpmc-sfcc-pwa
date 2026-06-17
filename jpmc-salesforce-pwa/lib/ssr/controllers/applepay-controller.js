/**
 * Apple Pay SSR Controller
 * 
 * Server-side handlers for Apple Pay merchant validation and payment authorization.
 * Unlike Google Pay, Apple Pay requires server-side merchant validation with
 * merchant identity certificates.
 * 
 * @module ssr/controllers/applepay-controller
 */

import crypto from 'node:crypto'
import { validateMerchant } from '../../services/applepay/session.js'
import { 
    buildJPMorganApplePayPayload, 
    parseJPMCApplePayResponse 
} from '../../services/applepay/token-mapper.js'
import { APPLE_PAY_ERROR_CODES, APPLE_PAY_DEFAULTS } from '../../utils/constants.mjs'
import { getJPMCConfigAsync } from '../index.js'
import { getAccessToken, clearTokenCache } from '../../services/auth/oauth-service.js'
import { buildJPMCHeaders } from '../../utils/http/http-client.js'
import logger from '../../utils/logger.js'
import { extractLocale, extractSlasToken } from '../../utils/locale-extractor.js'
import { GENERIC_API_ERROR_MESSAGE } from '../../utils/constants/error-constants'
import { isDefaultLocale } from '../../utils/site-config.js'

// =============================================================================
// Request Helpers (Multi-Locale Support)
// =============================================================================

/**
 * Get JPMC config with multi-locale support
 * @param {Object} req - Express request
 * @returns {Promise<Object>} JPMC configuration
 */
const getConfigForRequest = async (req) => {
    const locale = extractLocale(req)
    const slasToken = extractSlasToken(req)
    return getJPMCConfigAsync({ locale, slasToken })
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Apple Pay configuration
 * 
 * Apple Pay specific settings (merchantId, certs) come from Apple Pay setup.
 * JPMC settings come from BM site preferences via configureApplePayController().
 */
let applePayConfig = {
    // Apple Pay merchant settings
    merchantId: process.env.APPLE_PAY_MERCHANT_ID,
    merchantName: process.env.APPLE_PAY_MERCHANT_NAME || 'Store',
    countryCode: process.env.APPLE_PAY_COUNTRY_CODE || 'US',
    supportedNetworks: process.env.APPLE_PAY_SUPPORTED_NETWORKS
        ? process.env.APPLE_PAY_SUPPORTED_NETWORKS.split(',')
        : ['visa', 'masterCard', 'amex', 'discover'],
    merchantCapabilities: process.env.APPLE_PAY_MERCHANT_CAPABILITIES
        ? process.env.APPLE_PAY_MERCHANT_CAPABILITIES.split(',')
        : ['supports3DS'],
    merchantIdentityCert: null,
    merchantIdentityKey: null,
    merchantIdentityPassphrase: null,
    environment: 'sandbox', // Will be set from JPMC config
    debug: process.env.JPMC_DEBUG === 'true',
    
    // JPMC API configuration (populated from BM site preferences)
    jpmcApiUrl: null,
    jpmcMerchantId: null,
    
    // Certificate loading function (to be provided by user)
    loadCertificates: null
}

/**
 * Configure Apple Pay controller
 * 
 * @param {Object} config - Configuration options
 * @param {string} config.merchantId - Apple Pay Merchant ID
 * @param {string} config.merchantName - Merchant display name
 * @param {string|Buffer} config.merchantIdentityCert - Merchant identity certificate (PEM)
 * @param {string|Buffer} config.merchantIdentityKey - Merchant identity private key (PEM)
 * @param {string} [config.merchantIdentityPassphrase] - Private key passphrase
 * @param {string} [config.environment] - 'sandbox' or 'production' (from BM site preferences)
 * @param {boolean} [config.debug] - Enable debug logging
 * @param {string} [config.jpmcApiUrl] - JP Morgan API base URL (from BM site preferences)
 * @param {string} [config.jpmcMerchantId] - JP Morgan Merchant ID (from BM site preferences)
 * @param {Function} [config.loadCertificates] - Async function to load certificates
 * 
 * @example
 * import fs from 'fs'
 * import { getJPMCConfigAsync } from '../ssr'
 * 
 * const jpmcConfig = await getJPMCConfigAsync()
 * 
 * configureApplePayController({
 *   merchantId: 'merchant.com.yourcompany',
 *   merchantName: 'Your Store',
 *   merchantIdentityCert: fs.readFileSync('/path/to/cert.pem', 'utf8'),
 *   merchantIdentityKey: fs.readFileSync('/path/to/key.pem', 'utf8'),
 *   jpmcMerchantId: jpmcConfig.merchantId,
 *   jpmcApiUrl: `https://${jpmcConfig.apiHost}`,
 *   environment: jpmcConfig.environment
 * })
 */
export const configureApplePayController = (config) => {
    applePayConfig = {
        ...applePayConfig,
        ...config
    }
    
    if (applePayConfig.debug) {
        logger.info('[ApplePay Controller] Configured with merchant:', applePayConfig.merchantId)
    }
}

/**
 * Get current Apple Pay configuration (without secrets)
 * @returns {Object} Safe configuration for client
 */
export const getApplePayConfig = () => ({
    merchantId: applePayConfig.merchantId,
    merchantName: applePayConfig.merchantName,
    countryCode: applePayConfig.countryCode,
    supportedNetworks: applePayConfig.supportedNetworks,
    merchantCapabilities: applePayConfig.merchantCapabilities,
    environment: applePayConfig.environment,
    isConfigured: !!(
        applePayConfig.merchantId &&
        (applePayConfig.merchantIdentityCert || applePayConfig.loadCertificates)
    )
})

// =============================================================================
// Certificate Loading
// =============================================================================

/**
 * Load merchant certificates
 * @returns {Promise<{cert: string, key: string}>}
 */
const loadCertificates = async () => {
    // If certificates are already loaded in config, use them
    if (applePayConfig.merchantIdentityCert && applePayConfig.merchantIdentityKey) {
        return {
            cert: applePayConfig.merchantIdentityCert,
            key: applePayConfig.merchantIdentityKey,
            passphrase: applePayConfig.merchantIdentityPassphrase
        }
    }
    
    // If a custom loader is provided, use it
    if (applePayConfig.loadCertificates) {
        return await applePayConfig.loadCertificates()
    }
    
    // Try to load from environment variables (base64 encoded)
    const certBase64 = process.env.APPLE_PAY_MERCHANT_IDENTITY_CERT_BASE64
    const keyBase64 = process.env.APPLE_PAY_MERCHANT_IDENTITY_KEY_BASE64
    
    if (certBase64 && keyBase64) {
        return {
            cert: Buffer.from(certBase64, 'base64').toString('utf8'),
            key: Buffer.from(keyBase64, 'base64').toString('utf8'),
            passphrase: process.env.APPLE_PAY_MERCHANT_IDENTITY_PASSPHRASE
        }
    }
    
    throw new Error('Apple Pay merchant certificates not configured')
}

// =============================================================================
// Handlers
// =============================================================================

/**
 * Handle Apple Pay session validation request
 * 
 * This endpoint is called by the client when Apple Pay's onvalidatemerchant
 * event fires. It validates the merchant with Apple's servers using the
 * merchant identity certificate.
 * 
 * IMPORTANT: Apple Pay is ONLY supported for the default locale (no multi-locale support)
 * 
 * POST /api/jpmorgan/applepay/session
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export const handleApplePaySession = async (req, res, next) => {
    try {
        // Apple Pay: ONLY supported for default locale
        const locale = extractLocale(req)
        if (!isDefaultLocale(locale)) {
            logger.info(`[ApplePay Session] Rejected: Apple Pay not available for non-default locale: ${locale}`)
            return res.status(400).json({
                success: false,
                error: {
                    code: APPLE_PAY_ERROR_CODES.INVALID_CONFIG,
                    message: `Apple Pay is only available for the default locale. Current locale: ${locale}`
                }
            })
        }
        
        const { validationURL } = req.body
        
        if (!validationURL) {
            return res.status(400).json({
                success: false,
                error: {
                    code: APPLE_PAY_ERROR_CODES.INVALID_CONFIG,
                    message: 'validationURL is required'
                }
            })
        }

        // Validate the URL is from Apple
        const url = new URL(validationURL)
        if (!url.hostname.endsWith('.apple.com')) {
            return res.status(400).json({
                success: false,
                error: {
                    code: APPLE_PAY_ERROR_CODES.MERCHANT_VALIDATION_FAILED,
                    message: 'Invalid validation URL - must be from apple.com'
                }
            })
        }

        // Resolve merchantId and merchantName from server-side configuration only
        // Priority: BM fetch > env-var static config (no client-side override)
        let resolvedMerchantId = applePayConfig.merchantId
        let resolvedMerchantName = applePayConfig.merchantName
        try {
            const jpmcConfig = await getConfigForRequest(req)
            resolvedMerchantId = jpmcConfig.applePayMerchantId || resolvedMerchantId
            resolvedMerchantName = jpmcConfig.applePayMerchantName || resolvedMerchantName
        } catch (_err) {
            // BM fetch failed — continue with env-var static config
        }

        if (applePayConfig.debug) {
            logger.info('[ApplePay Session] Validating merchant with URL:', validationURL)
        }

        // Load certificates
        const certs = await loadCertificates()

        // Validate merchant with Apple
        const merchantSession = await validateMerchant({
            validationURL,
            merchantId: resolvedMerchantId,
            merchantName: resolvedMerchantName,
            domain: req.hostname,
            merchantIdentityCert: certs.cert,
            merchantIdentityKey: certs.key,
            merchantIdentityPassphrase: certs.passphrase
        })

        if (applePayConfig.debug) {
            logger.info('[ApplePay Session] Merchant validated successfully')
        }

        // Return the merchant session to the client
        res.json(merchantSession)

    } catch (error) {
        if (applePayConfig.debug) {
            logger.error('[ApplePay Session] Validation failed:', error.message)
        }

        // Return 401 for multi-locale auth errors
        if (error.code === 'MULTI_LOCALE_AUTH_ERROR' || error.statusCode === 401) {
            return res.status(401).json({
                success: false,
                error: {
                    code: error.code || 'MULTI_LOCALE_AUTH_ERROR',
                    message: GENERIC_API_ERROR_MESSAGE
                }
            })
        }

        // Check if it's a known error type
        if (error.code) {
            return res.status(400).json({
                success: false,
                error: {
                    code: error.code,
                    message: GENERIC_API_ERROR_MESSAGE
                }
            })
        }

        next(error)
    }
}

// =============================================================================
// Apple Pay Authorization Helpers
// =============================================================================

/**
 * Validate Apple Pay authorize request body
 * @returns {Object|null} Error response object if invalid, null if valid
 */
const validateApplePayAuthorizeRequest = ({ applePayToken, amount }) => {
    if (!applePayToken) {
        return { status: 400, body: { success: false, error: { code: APPLE_PAY_ERROR_CODES.TOKEN_MISSING, message: 'Apple Pay token is required' } } }
    }
    if (!amount) {
        return { status: 400, body: { success: false, error: { code: APPLE_PAY_ERROR_CODES.INVALID_CONFIG, message: 'Payment amount is required' } } }
    }
    return null
}

/**
 * Handle API call error response
 * @private
 */
const handleApplePayError = (error, res, next) => {
    if (error.code === 'MULTI_LOCALE_AUTH_ERROR' || error.statusCode === 401) {
        return res.status(401).json({
            success: false,
            error: { code: error.code || 'MULTI_LOCALE_AUTH_ERROR', message: GENERIC_API_ERROR_MESSAGE }
        })
    }
    if (error.code) {
        return res.status(400).json({ success: false, error: { code: error.code, message: GENERIC_API_ERROR_MESSAGE } })
    }
    return next(error)
}

/**
 * Send authorization result response
 * @private
 */
const sendAuthorizationResponse = (result, res) => {
    if (result.success) {
        return res.json({ success: true, ...result })
    }
    return res.status(400).json({
        success: false,
        error: { code: result.responseCode || APPLE_PAY_ERROR_CODES.AUTHORIZATION_FAILED, message: GENERIC_API_ERROR_MESSAGE },
        details: result
    })
}

/**
 * Make JPMC API call with token retry on 401
 */
const callJPMCWithRetry = async ({ jpmcConfig, jpmcPayload, accessToken }) => {
    const requestId = generateRequestId()
    const headers = buildJPMCHeaders({
        merchantId: jpmcConfig.merchantId,
        platformId: jpmcConfig.platformId,
        requestId,
        accessToken
    })
    
    const apiUrl = `https://${jpmcConfig.apiHost}/api/v2/payments`
    let response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(jpmcPayload)
    })
    
    // Retry once on 401 (token may have just expired)
    if (response.status === 401) {
        logger.warn('[ApplePay Authorize] 401 received — refreshing token and retrying')
        clearTokenCache()
        const newToken = await getAccessToken(jpmcConfig, true)
        headers['Authorization'] = `Bearer ${newToken}`
        response = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(jpmcPayload)
        })
    }
    
    return response.json()
}

/**
 * Handle Apple Pay payment authorization
 * 
 * This endpoint receives the Apple Pay token from the client and
 * sends it to JP Morgan's Online Payments API for authorization.
 * 
 * IMPORTANT: Apple Pay is ONLY supported for the default locale (no multi-locale support)
 * 
 * POST /api/jpmorgan/applepay/authorize
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export const handleApplePayAuthorize = async (req, res, next) => {
    try {
        // Apple Pay: ONLY supported for default locale
        const locale = extractLocale(req)
        if (!isDefaultLocale(locale)) {
            logger.info(`[ApplePay Authorize] Rejected: Apple Pay not available for non-default locale: ${locale}`)
            return res.status(400).json({
                success: false,
                error: {
                    code: 'LOCALE_NOT_SUPPORTED',
                    message: `Apple Pay is only available for the default locale. Current locale: ${locale}`
                }
            })
        }
        
        const jpmcConfig = await getConfigForRequest(req)
        const { applePayToken, amount, currency, merchantOrderNumber, billingContact, shippingContact } = req.body
        const captureMethod = req.body.captureMethod || jpmcConfig.captureMethod

        // Validate required fields
        const validationError = validateApplePayAuthorizeRequest({ applePayToken, amount })
        if (validationError) return res.status(validationError.status).json(validationError.body)

        if (applePayConfig.debug) logger.info('[ApplePay Authorize] Processing payment for amount:', amount, currency)

        // Build JP Morgan payment payload
        const jpmcPayload = buildJPMorganApplePayPayload({
            applePayToken, amount: Math.round(Number.parseFloat(amount) * 100), currency,
            merchantOrderNumber, billingContact, shippingContact,
            latLong: APPLE_PAY_DEFAULTS.latLong, captureMethod,
            merchant: {
                ...(jpmcConfig.merchantCategoryCode && { merchantCategoryCode: jpmcConfig.merchantCategoryCode }) }
        })

        // Get access token
        const accessToken = await getAccessToken(jpmcConfig).catch(err => {
            logger.error('[ApplePay Authorize] Failed to get access token:', err.message)
            return null
        })
        if (!accessToken) {
            return res.status(500).json({ success: false, error: { code: 'AUTHENTICATION_ERROR', message: 'Failed to get access token' } })
        }

        // Make JPMC API call with retry
        const jpmcData = await callJPMCWithRetry({ jpmcConfig, jpmcPayload, accessToken })
        if (applePayConfig.debug) logger.info('[ApplePay Authorize] JPMC response:', jpmcData.responseStatus, jpmcData.transactionId)

        // Parse and send response
        return sendAuthorizationResponse(parseJPMCApplePayResponse(jpmcData), res)
    } catch (error) {
        if (applePayConfig.debug) logger.error('[ApplePay Authorize] Error:', error.message)
        return handleApplePayError(error, res, next)
    }
}

/**
 * Handle Apple Pay configuration request
 * 
 * Returns client-safe Apple Pay configuration, merging BM site preferences
 * (applePayMerchantId, applePayCountryCode, etc.) with env-var defaults.
 * 
 * IMPORTANT: Apple Pay is ONLY supported for the default locale (no multi-locale support)
 * 
 * GET /api/jpmorgan/applepay/config
 */
export const handleApplePayConfig = async (req, res) => {
    try {
        // Apple Pay: ONLY supported for default locale
        const locale = extractLocale(req)
        if (!isDefaultLocale(locale)) {
            logger.info(`[ApplePay Config] Rejected: Apple Pay not available for non-default locale: ${locale}`)
            return res.status(200).json({
                success: false,
                isConfigured: false,
                message: `Apple Pay is only available for the default locale. Current locale: ${locale}`
            })
        }
        
        const jpmcConfig = await getConfigForRequest(req)

        // BM strings like "visa,masterCard" → array; fall back to env-var arrays
        const toArray = (val) => {
            if (!val) return undefined
            if (Array.isArray(val)) return val
            return val.split(',').map((s) => s.trim()).filter(Boolean)
        }

        const merchantId = jpmcConfig.applePayMerchantId || applePayConfig.merchantId || null
        const merchantName = jpmcConfig.applePayMerchantName || applePayConfig.merchantName || null
        const countryCode = jpmcConfig.applePayCountryCode || applePayConfig.countryCode || 'US'
        const supportedNetworks = toArray(jpmcConfig.applePaySupportedNetworks) || applePayConfig.supportedNetworks
        const merchantCapabilities = toArray(jpmcConfig.applePayMerchantCapabilities) || applePayConfig.merchantCapabilities

        res.json({
            merchantId,
            merchantName,
            countryCode,
            supportedNetworks,
            merchantCapabilities,
            environment: applePayConfig.environment,
            isConfigured: !!(
                merchantId &&
                (applePayConfig.merchantIdentityCert ||
                    applePayConfig.loadCertificates ||
                    process.env.APPLE_PAY_MERCHANT_IDENTITY_CERT_BASE64)
            )
        })
    } catch (_err) {
        // BM fetch failed — fall back to static controller config
        res.json(getApplePayConfig())
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate unique request ID
 * @returns {string} UUID request ID
 */
const generateRequestId = () => {
    // Node.js crypto.randomUUID() is available since v14.17.0
    return crypto.randomUUID()
}

// =============================================================================
// Exports
// =============================================================================

export default {
    configureApplePayController,
    getApplePayConfig,
    handleApplePaySession,
    handleApplePayAuthorize,
    handleApplePayConfig
}
