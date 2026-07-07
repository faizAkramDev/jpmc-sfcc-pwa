/**
 * Preference Mapper
 * 
 * Maps SFCC Site Preferences to JPMC configuration object.
 * Handles the translation between BM preference IDs and internal config keys.
 * 
 * @module services/sfcc/preference-mapper
 */

import logger from '../../utils/logger.js'

// =============================================================================
// Preference ID to Config Key Mapping
// =============================================================================

/**
 * Maps SFCC Site Preference IDs to internal JPMC config keys
 * 
 * Format: { preferenceId: configKey }
 */
const PREFERENCE_MAPPING = {
    // Multi-Merchant Feature Flag
    JPMCEnableMultiMerchant: 'enableMultiMerchant',

    // OAuth / Authentication
    JPMCClientID: 'clientId',
    JPMCResourceID: 'resourceId',

    // Merchant Configuration
    JPMC_MerchantCode: 'merchantId',
    JPMCPlatformId: 'platformId',
    JPMCApiHost: 'apiHost',
    JPMCEnvironment: 'environment',
    JPMCMerchantCategoryCode: 'merchantCategoryCode',

    // PIE Encryption URLs
    JPMCEncryptionUrl: 'pieEncryptionUrl',
    JPMCGetKeyUrl: 'pieGetKeyUrl',
    JPMCPieKey: 'pieKey',

    // Payment Configuration
    JPMCCaptureMethod: 'captureMethod',
    JPMCTokenizationType: 'tokenizationType',

    // Merchant Software Identification
    JPMCMerchantSoftwareCompany: 'merchantSoftwareCompany',
    JPMCMerchantSoftwareProduct: 'merchantSoftwareProduct',
    JPMCMerchantSoftwareVersion: 'merchantSoftwareVersion',

    // Google Pay Configuration
    JPMCGooglePayEnvironment: 'googlePayEnvironment',
    JPMCGooglePayGatewayMerchantId: 'googlePayGatewayMerchantId',
    JPMCGooglePayMerchantId: 'googlePayMerchantId',
    JPMCGooglePayMerchantName: 'googlePayMerchantName',
    JPMCGooglePayAllowedCardNetworks: 'googlePayAllowedCardNetworks',
    JPMCGooglePayGateway: 'googlePayGateway',
    JPMCGooglePayAllowedAuthMethods: 'googlePayAllowedAuthMethods',

    // Google Pay Cart/PDP Configuration
    // These preferences enable Google Pay on cart and PDP pages with shipping callbacks
    JPMCGooglePayCartEnabled: 'googlePayCartEnabled',
    JPMCGooglePayPDPEnabled: 'googlePayPDPEnabled',
    JPMCGooglePayAllowedShippingCountries: 'googlePayAllowedShippingCountries',

    // AVS Configuration
    JPMCEnableAVS: 'enableAVS',

    // Fraud Check Configuration
    JPMCEnableFraudCheck: 'enableFraudCheck',
    JPMCEnableFraudCheckAtAuth: 'enableFraudCheckAtAuth',
    jpmcKountClientId: 'kountClientId',
    jpmcKountEnvironment: 'kountEnvironment',

    // Apple Pay Configuration
    JPMCApplePayEnabled: 'applePayEnabled',
    JPMCApplePayMerchantId: 'applePayMerchantId',
    JPMCApplePayMerchantName: 'applePayMerchantName',
    JPMCApplePayCountryCode: 'applePayCountryCode',
    JPMCApplePaySupportedNetworks: 'applePaySupportedNetworks',
    JPMCApplePayMerchantCapabilities: 'applePayMerchantCapabilities',

    // 3D Secure Configuration
    jpmc3DSEnabled: 'jpmc3DSEnabled',

    // Drop-in UI Configuration
    JPMCCheckoutMode: 'checkoutMode',
    JPMCDropInScriptUrl: 'dropInScriptUrl',
    JPMCDropInIntentUrl: 'checkoutIntentUrl',
    JPMCDropInThemeOverrides: 'dropInThemeOverrides',
    JPMCSaveConsumerProfile: 'saveConsumerProfile',
    JPMCDropInControlledSubmit: 'dropInControlledSubmit'
}

/**
 * NO DEFAULT VALUES
 * 
 * All configurations MUST be explicitly set in Business Manager.
 * This ensures proper configuration validation and prevents silent fallbacks.
 * If a required preference is missing, it will be undefined and validation
 * should catch it at runtime.
 */
const DEFAULT_VALUES = {}

// =============================================================================
// Public API
// =============================================================================

/**
 * Build JPMC configuration from SFCC Site Preferences
 * 
 * Transforms BM preference IDs to internal config keys and applies
 * default values where preferences are not set.
 * 
 * @param {Object} preferences - Raw preferences from getJPMCPreferences()
 * @returns {Object} JPMC configuration object
 * 
 * @example
 * const prefs = await getJPMCPreferences()
 * const config = buildJPMCConfigFromPreferences(prefs)
 * // config = { clientId: '...', merchantId: '...', ... }
 */
export const buildJPMCConfigFromPreferences = (preferences) => {
    const config = {}

    // Map preferences to config keys
    for (const [prefId, configKey] of Object.entries(PREFERENCE_MAPPING)) {
        if (preferences[prefId] !== undefined && preferences[prefId] !== null) {
            config[configKey] = preferences[prefId]
        }
    }

    // Log drop-in configuration
    logger.info('[Preference Mapper] Drop-in UI Configuration:', {
        checkoutMode: config.checkoutMode || 'NOT_SET',
        isDropInEnabled: config.checkoutMode === 'DROP_IN',
        dropInScriptUrl: config.dropInScriptUrl || 'NOT_SET',
        dropInThemeOverrides: config.dropInThemeOverrides ? 'Configured' : 'NOT_SET',
        saveConsumerProfile: config.saveConsumerProfile !== undefined ? config.saveConsumerProfile : 'NOT_SET',
        dropInControlledSubmit: config.dropInControlledSubmit !== undefined ? config.dropInControlledSubmit : 'NOT_SET'
    })

    // NO defaults applied - all values must come from BM
    // Log warning for any values that were previously defaulted but are now missing
    const requiredConfigs = [
        'merchantId', 'clientId', 'resourceId', 'apiHost',
        'pieEncryptionUrl', 'pieGetKeyUrl', 'pieKey', 'captureMethod', 'tokenizationType'
    ]
    const missingRequired = requiredConfigs.filter(key => config[key] === undefined)
    if (missingRequired.length > 0) {
        logger.warn('[Preference Mapper] Missing required BM configurations:', missingRequired.join(', '))
    }

    // API Host - MUST be set in BM as JPMCApiHost
    if (config.apiHost) {
        // Strip protocol if present (BM preference should be host only)
        config.apiHost = config.apiHost.replace(/^https?:\/\//, '')
        logger.info('[Preference Mapper] API Host from BM preference:', config.apiHost)
    } else {
        logger.error('[Preference Mapper] Missing JPMCApiHost - must be configured in BM')
    }

    // Build merchant software object for API requests
    config.merchantSoftware = {
        companyName: config.merchantSoftwareCompany,
        productName: config.merchantSoftwareProduct,
        version: config.merchantSoftwareVersion
    }

    return config
}

/**
 * Merge BM preferences with environment variable configuration
 * 
 * Priority (highest to lowest):
 * 1. Environment variables (MRT secrets) - for sensitive data
 * 2. Site Preferences (BM) - for configurable settings
 * 3. Default values - fallbacks
 * 
 * @param {Object} bmConfig - Config built from BM preferences
 * @param {Object} envConfig - Config from environment variables
 * @returns {Object} Merged configuration
 * 
 * @example
 * const bmConfig = buildJPMCConfigFromPreferences(prefs)
 * const envConfig = getEnvironmentConfig()
 * const finalConfig = mergeWithEnvironmentConfig(bmConfig, envConfig)
 */
export const mergeWithEnvironmentConfig = (bmConfig, envConfig = {}) => {
    // Start with BM config as base
    const merged = { ...bmConfig }

    // Environment variables that MUST override BM (sensitive credentials)
    const sensitiveKeys = new Set([
        'privateKeyBase64',
        'privateKeyPath',
        'certificateBase64',
        'certificatePath'
    ])

    // Apply all environment config, but mark sensitive ones
    for (const [key, value] of Object.entries(envConfig)) {
        if (value !== undefined && value !== null && value !== '') {
            // Sensitive keys always override, non-sensitive only if BM value not set
            if (sensitiveKeys.has(key) || merged[key] === undefined || merged[key] === null) {
                merged[key] = value
            }
        }
    }

    // Ensure sensitive keys from env are always present

    return merged
}

/**
 * Merge Custom Object config with Site Preferences fallback
 * 
 * For each field: if CO has value → use it; if CO field is empty → use SP value
 * This provides field-level fallback, not object-level.
 * 
 * @param {Object} coConfig - Configuration from Custom Object (may have empty fields)
 * @param {Object} spConfig - Configuration from Site Preferences (fallback)
 * @returns {Object} Merged configuration with field-level fallback
 * 
 * @example
 * const coConfig = { merchantId: 'CA_MERCHANT', captureMethod: null }
 * const spConfig = { merchantId: 'DEFAULT', captureMethod: 'NOW', enableAVS: true }
 * const merged = mergeConfigWithSPFallback(coConfig, spConfig)
 * // merged = { merchantId: 'CA_MERCHANT', captureMethod: 'NOW', enableAVS: true }
 */
export const mergeConfigWithSPFallback = (coConfig, spConfig) => {
    // Start with Site Preferences as base (all fields have fallback values)
    const merged = { ...spConfig }
    
    // Override with Custom Object values where they are explicitly set
    // Field-level fallback: only override if CO value is not null/undefined/empty
    // Boolean false is a valid explicit value that should override
    for (const [key, value] of Object.entries(coConfig)) {
        const isValidValue = (value !== undefined && value !== null && value !== '') || value === false
        if (isValidValue) {
            merged[key] = value
        }
    }
    
    return merged
}

/**
 * Get the preference mapping for debugging/documentation
 * 
 * @returns {Object} Mapping of preference IDs to config keys
 */
export const getPreferenceMapping = () => {
    return { ...PREFERENCE_MAPPING }
}

/**
 * Get default values for reference
 * 
 * @returns {Object} Default values
 */
export const getDefaultValues = () => {
    return { ...DEFAULT_VALUES }
}

// Default export
export default {
    buildJPMCConfigFromPreferences,
    mergeWithEnvironmentConfig,
    mergeConfigWithSPFallback,
    getPreferenceMapping,
    getDefaultValues
}
