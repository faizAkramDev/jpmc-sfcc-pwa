/**
 * Configuration Handlers
 * 
 * API handlers for retrieving JPMC configuration.
 * 
 * @module services/api/handlers/config-handlers
 */

import { getJPMCConfigAsync } from '../../../ssr'
import { getApplePayPreferences } from '../../sfcc/site-preferences'
import logger from '../../../utils/logger'
import { extractLocale, extractSlasToken } from '../../../utils/locale-extractor'
import { GENERIC_API_ERROR_MESSAGE } from '../../../utils/constants/error-constants'
import { isDefaultLocale } from '../../../utils/site-config.js'

// =============================================================================
// Configuration
// =============================================================================

/**
 * Get server-side JPMC configuration (asynchronous)
 * 
 * Fetches from Custom Object (if locale provided) or BM site preferences.
 * Merges with env config for sensitive data.
 * 
 * @param {Object} req - Express request
 * @returns {Promise<Object>} JPMC configuration
 */
const getServerConfigAsync = async (req) => {
    const locale = extractLocale(req)
    const slasToken = extractSlasToken(req)
    
    return getJPMCConfigAsync({ locale, slasToken })
}

/**
 * Handle multi-locale configuration errors with appropriate status codes
 * 
 * @param {Error} error - Error from getServerConfigAsync
 * @param {Object} res - Express response
 * @param {string} context - Handler context for error message
 * @param {string} [friendlyName] - Friendly name for error message (optional)
 * @returns {Object} Error response
 */
const handleConfigError = (error, res, context, friendlyName) => {
    logger.error(`[${context}] Error:`, error)
    
    // Return 401 for auth errors
    if (error.code === 'MULTI_LOCALE_AUTH_ERROR' || error.statusCode === 401) {
        return res.status(401).json({
            success: false,
            errorCode: 'MULTI_LOCALE_AUTH_ERROR',
            message: GENERIC_API_ERROR_MESSAGE
        })
    }
    
    // Return 500 for other errors
    // Use friendlyName if provided, otherwise derive from context
    const configName = friendlyName || context.replace('JPMC ', '')
    return res.status(500).json({
        success: false,
        errorCode: 'CONFIGURATION_ERROR',
        message: `Failed to retrieve ${configName} configuration.`
    })
}

// =============================================================================
// Google Pay Configuration Helpers
// =============================================================================

/**
 * Parse allowed shipping countries from BM preference
 * 
 * Converts a comma-separated string of ISO 3166-1 alpha-2 country codes
 * into an array of uppercase country codes.
 * 
 * @param {string|undefined} preferenceValue - Comma-separated country codes (e.g., "US,CA,MX")
 * @returns {string[]} Array of uppercase country codes, or empty array if not configured
 * 
 * @example
 * parseAllowedShippingCountries('US, CA, MX') // ['US', 'CA', 'MX']
 * parseAllowedShippingCountries('us,ca')      // ['US', 'CA']
 * parseAllowedShippingCountries('')           // []
 * parseAllowedShippingCountries(undefined)    // []
 */
const parseAllowedShippingCountries = (preferenceValue) => {
    if (!preferenceValue || typeof preferenceValue !== 'string') {
        return []
    }
    
    return preferenceValue
        .split(',')
        .map(code => code.trim().toUpperCase())
        .filter(code => {
            // Validate ISO 3166-1 alpha-2 format (2 uppercase letters)
            if (!/^[A-Z]{2}$/.test(code)) {
                if (code.length > 0) {
                    logger.warn(`[JPMC Google Pay] Invalid country code ignored: "${code}" - must be ISO 3166-1 alpha-2 format`)
                }
                return false
            }
            return true
        })
}

// =============================================================================
// Fraud Config Handler
// =============================================================================

/**
 * Handle fraud configuration request
 *
 * GET /api/jpmorgan/fraud-config
 *
 * Returns client-safe fraud/Safetech Fraud configuration:
 * - enableFraudCheck: whether pre-verify fraud check is enabled (JPMCEnableFraudCheck)
 * - enableFraudCheckAtAuth: whether pre-auth fraud check is enabled (JPMCEnableFraudCheckAtAuth)
 * - kountClientId: Safetech Fraud client ID for SDK initialization (jpmcKountClientId)
 * - kountEnvironment: Safetech Fraud environment - TEST or PROD (jpmcKountEnvironment)
 */
export const handleGetFraudConfig = async (req, res) => {
    try {
        const config = await getServerConfigAsync(req)
        return res.status(200).json({
            enableFraudCheck: config.enableFraudCheck === true,
            enableFraudCheckAtAuth: config.enableFraudCheckAtAuth === true,
            kountClientId: config.kountClientId || null,
            kountEnvironment: config.kountEnvironment || 'TEST'
        })
    } catch (error) {
        return handleConfigError(error, res, 'JPMC Fraud Config', 'fraud')
    }
}

// =============================================================================
// PIE/Payment Config Handler
// =============================================================================

/**
 * Handle payment configuration request
 * 
 * GET/POST /api/jpmorgan/config
 * 
 * Returns only safe information for client-side:
 * - merchantId (for PIE SDK)
 * - PIE SDK URLs
 * 
 * NOTE: Never expose clientId, clientSecret, or accessToken
 */
export const handleGetConfig = async (req, res) => {
    try {
        const config = await getServerConfigAsync(req)
        
        // Get PIE URLs and key from config (BM preferences) - REQUIRED
        // JPMCEncryptionUrl (pieEncryptionUrl) = encryption.js URL (enum: Test/CAT or Production)
        // JPMCGetKeyUrl (pieGetKeyUrl) = base PIE URL (enum: Test/CAT or Production)
        // JPMCPieKey (pieKey) = PE Key ID, appended to build: {pieGetKeyUrl}/{pieKey}/getkey.js
        const pieEncryptionUrl = config.pieEncryptionUrl
        const pieBaseUrl = config.pieGetKeyUrl
        const pieKey = config.pieKey
        
        if (!pieEncryptionUrl || !pieBaseUrl) {
            logger.error('[JPMC Config] Missing PIE URLs - JPMCEncryptionUrl and JPMCGetKeyUrl must be configured in BM')
        }
        if (!pieKey) {
            logger.error('[JPMC Config] Missing PIE Key - JPMCPieKey must be configured in BM')
        }
        
        const merchantId = config.merchantId

        // Only return client-safe config
        const clientConfig = {
            merchantId: merchantId, // Merchant ID for PIE encryption SDK
            // PIE SDK URLs (MUST be configured in BM)
            pieUrls: {
                encryption: pieEncryptionUrl,
                getKey: (pieBaseUrl && pieKey) ? `${pieBaseUrl}/${pieKey}/getkey.js` : undefined
            },
            // Payment form configuration
            captureMethod: config.captureMethod // From BM site preferences (required)
        }

        return res.status(200).json(clientConfig)
    } catch (error) {
        return handleConfigError(error, res, 'JPMC Payment', 'payment')
    }
}

// =============================================================================
// Google Pay Config Handler
// =============================================================================

/**
 * Handle Google Pay configuration request
 * 
 * GET /api/jpmorgan/googlepay/config
 * 
 * Returns Google Pay specific configuration including:
 * - Gateway merchant ID (for Google Pay tokenization)
 * - Supported networks
 * - Supported auth methods
 * - Environment (TEST/PRODUCTION)
 * 
 * NOTE: This is safe client-side config - no secrets exposed
 */
export const handleGetGooglePayConfig = async (req, res) => {
    try {
        const config = await getServerConfigAsync(req)
        
        // Collect missing required configurations
        const missingConfigs = []
        
        // All Google Pay configurations MUST be set in Business Manager
        if (!config.googlePayGatewayMerchantId && !config.merchantId) {
            missingConfigs.push('JPMCGooglePayGatewayMerchantId (or JPMC_MerchantCode)')
        }
        if (!config.googlePayEnvironment) {
            missingConfigs.push('JPMCGooglePayEnvironment')
        }
        if (!config.googlePayMerchantName) {
            missingConfigs.push('JPMCGooglePayMerchantName')
        }
        if (!config.googlePayGateway) {
            missingConfigs.push('JPMCGooglePayGateway')
        }
        if (!config.googlePayAllowedCardNetworks) {
            missingConfigs.push('JPMCGooglePayAllowedCardNetworks')
        }
        if (!config.googlePayAllowedAuthMethods) {
            missingConfigs.push('JPMCGooglePayAllowedAuthMethods')
        }
        
        // For PRODUCTION environment, Google-issued merchant ID is required
        const googlePayEnvironment = config.googlePayEnvironment
        if (googlePayEnvironment === 'PRODUCTION' && !config.googlePayMerchantId) {
            missingConfigs.push('JPMCGooglePayMerchantId (required for PRODUCTION)')
        }
        
        if (missingConfigs.length > 0) {
            logger.error('[JPMC Google Pay] Missing required BM configurations:', missingConfigs.join(', '))
            return res.status(500).json({
                success: false,
                errorCode: 'CONFIGURATION_ERROR',
                message: `Google Pay requires the following BM Site Preferences to be configured: ${missingConfigs.join(', ')}`,
                missingConfigurations: missingConfigs
            })
        }
        
        // Get gateway merchant ID from BM preference (or fallback to general merchantId)
        const gatewayMerchantId = config.googlePayGatewayMerchantId || config.merchantId
        
        // Get Google Pay merchant info from BM preferences
        const googlePayMerchantName = config.googlePayMerchantName
        const googlePayMerchantId = config.googlePayMerchantId
        
        // Get gateway from BM preference
        const gateway = config.googlePayGateway
        
        // Parse allowed card networks from comma-separated BM preference
        const allowedCardNetworks = config.googlePayAllowedCardNetworks.split(',').map(n => n.trim()).filter(Boolean)
        
        // Parse allowed auth methods from comma-separated BM preference
        const allowedAuthMethods = config.googlePayAllowedAuthMethods.split(',').map(m => m.trim()).filter(Boolean)
        
        // Parse Cart/PDP configuration
        const cartEnabled = config.googlePayCartEnabled === true || config.googlePayCartEnabled === 'true'
        const pdpEnabled = config.googlePayPDPEnabled === true || config.googlePayPDPEnabled === 'true'
        
        // Parse allowed shipping countries from comma-separated BM preference
        // This controls which addresses are selectable in the Google Pay sheet
        const allowedShippingCountries = parseAllowedShippingCountries(config.googlePayAllowedShippingCountries)
        
        logger.info('[JPMC Google Pay] Configuration loaded from BM:')
        logger.info('[JPMC Google Pay]   - Environment:', googlePayEnvironment)
        logger.info('[JPMC Google Pay]   - Gateway:', gateway)
        logger.info('[JPMC Google Pay]   - Gateway Merchant ID:', gatewayMerchantId)
        logger.info('[JPMC Google Pay]   - Merchant Name:', googlePayMerchantName)
        logger.info('[JPMC Google Pay]   - Google Merchant ID:', googlePayMerchantId || 'not set (TEST mode)')
        logger.info('[JPMC Google Pay]   - Allowed Networks:', allowedCardNetworks.join(', '))
        logger.info('[JPMC Google Pay]   - Allowed Auth Methods:', allowedAuthMethods.join(', '))
        logger.info('[JPMC Google Pay]   - Cart Enabled:', cartEnabled)
        logger.info('[JPMC Google Pay]   - PDP Enabled:', pdpEnabled)
        logger.info('[JPMC Google Pay]   - Allowed Shipping Countries:', allowedShippingCountries.join(', ') || 'not configured')
        
        // Build Google Pay configuration
        const googlePayConfig = {
            // Gateway configuration from BM preferences
            gateway,
            gatewayMerchantId,
            
            // Environment from BM preference
            environment: googlePayEnvironment,
            
            // Merchant info (for PRODUCTION environment)
            merchantInfo: {
                merchantName: googlePayMerchantName,
                // merchantId is only required for PRODUCTION and is issued by Google
                ...(googlePayEnvironment === 'PRODUCTION' && googlePayMerchantId && {
                    merchantId: googlePayMerchantId
                })
            },
            
            // Supported payment methods from BM preferences
            allowedCardNetworks,
            allowedAuthMethods,
            
            // Cart/PDP Configuration
            cartEnabled,
            pdpEnabled,
            allowedShippingCountries,
            
            // AVS setting from BM - used for address verification with JPMC
            enableAVS: config.enableAVS === true || config.enableAVS === 'true',
            
            // Billing address required for SFCC order creation
            // SFCC Shopper Orders API requires a billing address
            billingAddressRequired: true
        }
        
        return res.status(200).json(googlePayConfig)
    } catch (error) {
        return handleConfigError(error, res, 'JPMC Google Pay', 'Google Pay')
    }
}

/**
 * Handle Apple Pay configuration request
 * 
 * GET /api/jpmorgan/applepay/config
 * 
 * Returns client-side safe Apple Pay configuration from SFCC Business Manager.
 * 
 * Reads from JPMC custom site preferences (Site Preferences > JPMC Apple Pay Configuration):
 * - JPMCApplePayEnabled - Enable/disable Apple Pay
 * - JPMCApplePayMerchantId - Apple Pay Merchant ID from Apple Developer Portal
 * - JPMCApplePayMerchantName - Merchant display name on payment sheet
 * - JPMCApplePaySupportedNetworks - Card networks
 * - JPMCApplePayMerchantCapabilities - Merchant capabilities
 * 
 * NOTE: SFCC's built-in Apple Pay preferences are NOT accessible via SCAPI,
 * so we use custom JPMC site preferences for headless/PWA Kit.
 * 
 * NOTE: This is safe client-side config - no secrets (certificates/keys) exposed
 * 
 * IMPORTANT: Apple Pay is ONLY supported for the default locale (no multi-locale support)
 */
export const handleGetApplePayConfig = async (req, res) => {
    try {
        // Apple Pay: ONLY supported for default locale
        const locale = req.query?.locale || req.body?.locale
        
        if (!isDefaultLocale(locale)) {
            logger.info(`[JPMC Apple Pay] Apple Pay not available for non-default locale: ${locale}`)
            return res.status(200).json({
                success: true,
                isEnabled: false,
                isConfigured: false,
                message: `Apple Pay is only available for the default locale. Current locale: ${locale}`
            })
        }
        
        // Fetch from JPMC custom site preferences
        let applePayPrefs = await getApplePayPreferences()
        
        // Also get JPMC config for environment setting (always use default locale)
        const jpmcConfig = await getServerConfigAsync(req)
        
        // =====================================================================
        // Environment Variable Fallback (for development/testing)
        // If SFCC Site Preferences not configured, try env vars
        // =====================================================================
        const envMerchantId = process.env.APPLE_PAY_MERCHANT_ID
        
        if (!applePayPrefs?.merchantId && envMerchantId) {
            logger.info('[JPMC Apple Pay] Using environment variables (SFCC Site Preferences not set)')
            
            // Parse env var arrays
            const envNetworks = process.env.APPLE_PAY_SUPPORTED_NETWORKS
            const envCapabilities = process.env.APPLE_PAY_MERCHANT_CAPABILITIES
            
            applePayPrefs = {
                enabled: true,
                merchantId: envMerchantId,
                merchantName: process.env.APPLE_PAY_MERCHANT_NAME || 'Store',
                countryCode: process.env.APPLE_PAY_COUNTRY_CODE || 'US',
                supportedNetworks: envNetworks ? envNetworks.split(',').map(n => n.trim()) : ['visa', 'masterCard', 'amex', 'discover'],
                merchantCapabilities: envCapabilities ? envCapabilities.split(',').map(c => c.trim()) : ['supports3DS', 'supportsCredit', 'supportsDebit'],
                _source: 'env' // Track where config came from
            }
        }
        
        // Check if Apple Pay is configured (either from SFCC or env)
        if (!applePayPrefs?.merchantId) {
            logger.info('[JPMC Apple Pay] Apple Pay not configured in SFCC Site Preferences or environment variables')
            return res.status(200).json({
                success: true,
                isEnabled: false,
                isConfigured: false,
                message: 'Apple Pay is not configured. Set JPMCApplePayMerchantId in BM > Site Preferences > JPMC Apple Pay Configuration, or set APPLE_PAY_MERCHANT_ID env var.'
            })
        }
        
        // Use networks from config (already parsed by getApplePayPreferences)
        const supportedNetworks = applePayPrefs.supportedNetworks || ['visa', 'masterCard', 'amex', 'discover']
        
        // Use capabilities from config (already parsed by getApplePayPreferences)
        const merchantCapabilities = applePayPrefs.merchantCapabilities || ['supports3DS', 'supportsDebit', 'supportsCredit']
        
        // Apple Pay environment (from JPMC config, defaults to sandbox for safety)
        const environment = jpmcConfig?.environment || 'sandbox'
        const configSource = applePayPrefs._source === 'env' ? 'environment variables' : 'SFCC Site Preferences'
        
        logger.info(`[JPMC Apple Pay] Configuration loaded from ${configSource}:`)
        logger.info('[JPMC Apple Pay]   - Enabled:', applePayPrefs.enabled)
        logger.info('[JPMC Apple Pay]   - Merchant ID:', applePayPrefs.merchantId)
        logger.info('[JPMC Apple Pay]   - Display Name:', applePayPrefs.merchantName || 'not set')
        logger.info('[JPMC Apple Pay]   - Supported Networks:', supportedNetworks.join(', '))
        logger.info('[JPMC Apple Pay]   - Merchant Capabilities:', merchantCapabilities.join(', '))
        logger.info('[JPMC Apple Pay]   - Environment:', environment)
        
        // Build Apple Pay configuration (client-safe - no secrets)
        const applePayConfig = {
            // Merchant identification (from JPMC custom site preferences or env vars)
            merchantId: applePayPrefs.merchantId,
            merchantName: applePayPrefs.merchantName || jpmcConfig?.merchantName || 'Store',
            
            // Country code (for payment request)
            countryCode: applePayPrefs.countryCode || 'US',
            
            // Environment (from JPMC config)
            environment,
            
            // Supported payment options (parsed from config source)
            supportedNetworks,
            merchantCapabilities,
            
            // Ready flags
            isEnabled: true,
            isConfigured: true
        }
        
        return res.status(200).json({
            success: true,
            ...applePayConfig
        })
    } catch (error) {
        return handleConfigError(error, res, 'JPMC Apple Pay', 'Apple Pay')
    }
}

// =============================================================================
// Exports
// =============================================================================

export { parseAllowedShippingCountries }

export default {
    handleGetConfig,
    handleGetGooglePayConfig,
    handleGetApplePayConfig,
    handleGetFraudConfig
}
