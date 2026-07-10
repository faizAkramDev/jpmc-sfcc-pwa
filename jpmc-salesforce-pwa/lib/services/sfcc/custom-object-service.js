/**
 * SFCC Custom Object Service
 * 
 * Fetches and caches JPMC merchant configuration from SFCC Custom Objects.
 * Used for multi-locale/multi-MID support where each locale can have different
 * merchant configurations stored as Custom Objects.
 * 
 * Custom Object Type: JPMCMerchantConfig
 * Key Format: {siteId}::{locale} (e.g., "RefArch::en_US", "RefArch::en_CA")
 * 
 * @module services/sfcc/custom-object-service
 */

import logger from '../../utils/logger.js'

// =============================================================================
// Constants
// =============================================================================

/**
 * Cache configuration for Custom Object configs
 */
const CACHE_CONFIG = {
    /** Default cache TTL in milliseconds (5 minutes) */
    DEFAULT_TTL_MS: 5 * 60 * 1000,
    /** Minimum TTL in milliseconds (1 minute) */
    MIN_TTL_MS: 60 * 1000,
    /** Maximum TTL in milliseconds (30 minutes) */
    MAX_TTL_MS: 30 * 60 * 1000
}

/**
 * Custom Object type for JPMC merchant configuration
 */
const CUSTOM_OBJECT_TYPE = 'JPMCMerchantConfig'

/**
 * Error codes for multi-locale configuration
 */
export const MULTI_LOCALE_ERROR_CODES = {
    AUTH_ERROR: 'MULTI_LOCALE_AUTH_ERROR',
    FETCH_ERROR: 'MULTI_LOCALE_FETCH_ERROR',
    CONFIG_ERROR: 'MULTI_LOCALE_CONFIG_ERROR'
}

// =============================================================================
// Cache State
// =============================================================================

/**
 * In-memory cache for Custom Object configs
 * Keyed by locale (e.g., "en_US" -> { data, timestamp, expiresAt })
 * @type {Map<string, {data: Object|null, timestamp: number, expiresAt: number}>}
 */
const configCache = new Map()

// =============================================================================
// Custom Object to Config Key Mapping
// =============================================================================

/**
 * Maps Custom Object attribute IDs to internal JPMC config keys
 * 
 * This aligns with site preference naming conventions for consistency.
 * Format: { customObjectAttributeId: configKey }
 */
const CUSTOM_OBJECT_ATTRIBUTE_MAPPING = {
    // Master Switch
    enabled: 'enabled',

    // OAuth / Authentication
    clientId: 'clientId',
    resourceId: 'resourceId',

    // Merchant Configuration
    merchantId: 'merchantId',
    platformId: 'platformId',
    apiHost: 'apiHost',
    merchantCategoryCode: 'merchantCategoryCode',

    // PIE Encryption URLs
    pieEncryptionUrl: 'pieEncryptionUrl',
    pieGetKeyUrl: 'pieGetKeyUrl',
    pieKey: 'pieKey',

    // Payment Configuration
    captureMethod: 'captureMethod',
    tokenizationType: 'tokenizationType',

    // Merchant Software Identification
    merchantSoftwareCompany: 'merchantSoftwareCompany',
    merchantSoftwareProduct: 'merchantSoftwareProduct',
    merchantSoftwareVersion: 'merchantSoftwareVersion',

    // Google Pay Configuration
    googlePayEnvironment: 'googlePayEnvironment',
    googlePayGatewayMerchantId: 'googlePayGatewayMerchantId',
    googlePayMerchantId: 'googlePayMerchantId',
    googlePayMerchantName: 'googlePayMerchantName',
    googlePayAllowedCardNetworks: 'googlePayAllowedCardNetworks',
    googlePayGateway: 'googlePayGateway',
    googlePayAllowedAuthMethods: 'googlePayAllowedAuthMethods',

    // Google Pay Cart/PDP Configuration
    googlePayCartEnabled: 'googlePayCartEnabled',
    googlePayPDPEnabled: 'googlePayPDPEnabled',
    googlePayAllowedShippingCountries: 'googlePayAllowedShippingCountries',

    // AVS Configuration
    enableAVS: 'enableAVS',

    // Fraud Check Configuration
    enableFraudCheck: 'enableFraudCheck',
    enableFraudCheckAtAuth: 'enableFraudCheckAtAuth',
    kountClientId: 'kountClientId',
    kountEnvironment: 'kountEnvironment',

    // NOTE: Apple Pay is NOT supported in Custom Objects (no multi-locale support)
    // Apple Pay configuration is only read from Site Preferences for the default locale

    // 3D Secure Configuration
    jpmc3DSEnabled: 'jpmc3DSEnabled',

    // Drop-in UI Configuration (allows per-locale override of payment method)
    // These fields enable different payment flows per locale (e.g., Drop-in for EU, PIE for US)
    checkoutMode: 'checkoutMode',
    dropInScriptUrl: 'dropInScriptUrl',
    dropInThemeOverrides: 'dropInThemeOverrides',
    saveConsumerProfile: 'saveConsumerProfile'
}

// =============================================================================
// Private Helpers
// =============================================================================

/**
 * Check if the cache for a locale is still valid
 * @param {string} locale - Locale identifier
 * @returns {boolean} True if cache is valid and not expired
 */
const isCacheValid = (locale) => {
    const cached = configCache.get(locale)
    if (!cached?.data) {
        return false
    }
    return Date.now() < cached.expiresAt
}

/**
 * Get SFCC configuration from environment variables
 * @returns {Object} SFCC configuration
 * @throws {Error} If required configuration is missing
 */
const getSFCCConfig = () => {
    const config = {
        shortCode: process.env.COMMERCE_API_SHORT_CODE || process.env.SFCC_SHORT_CODE,
        orgId: process.env.COMMERCE_API_ORG_ID || process.env.SFCC_ORG_ID,
        siteId: process.env.COMMERCE_API_SITE_ID || process.env.SFCC_SITE_ID || 'RefArch'
    }

    // Validate required fields
    if (!config.shortCode) {
        throw new Error(
            `[${MULTI_LOCALE_ERROR_CODES.CONFIG_ERROR}] Missing COMMERCE_API_SHORT_CODE or SFCC_SHORT_CODE env variable`
        )
    }
    if (!config.orgId) {
        throw new Error(
            `[${MULTI_LOCALE_ERROR_CODES.CONFIG_ERROR}] Missing COMMERCE_API_ORG_ID or SFCC_ORG_ID env variable`
        )
    }

    return config
}

/**
 * Build Custom Object key from site ID and locale
 * @param {string} siteId - SFCC site ID
 * @param {string} locale - Locale identifier (e.g., "en-CA" or "en_US")
 * @returns {string} Custom Object key (e.g., "RefArch::en_CA")
 */
const buildCustomObjectKey = (siteId, locale) => {
    // Normalize locale: PWA Kit uses en-CA (hyphen), but CO keys use en_CA (underscore)
    const normalizedLocale = locale.replaceAll('-', '_')
    return `${siteId}::${normalizedLocale}`
}

/**
 * Fetch Custom Object from SCAPI
 * 
 * Uses Shopper Custom Objects API which requires SLAS token.
 * 
 * @param {string} objectKey - Custom Object key
 * @param {string} slasToken - SLAS access token
 * @param {Object} sfccConfig - SFCC configuration
 * @returns {Promise<Object|null>} Custom Object data or null if not found
 * @throws {Error} If API request fails with non-404 error
 */
const fetchCustomObjectFromAPI = async (objectKey, slasToken, sfccConfig) => {
    const { shortCode, orgId, siteId } = sfccConfig

    // Shopper Custom Objects API endpoint (SCAPI)
    // Ref: https://developer.salesforce.com/docs/commerce/commerce-api/references/shopper-custom-objects
    // GET /custom-object/shopper-custom-objects/v1/organizations/{organizationId}/custom-objects/{objectType}/{key}
    const apiUrl = `https://${shortCode}.api.commercecloud.salesforce.com` +
        `/custom-object/shopper-custom-objects/v1/organizations/${orgId}` +
        `/custom-objects/${CUSTOM_OBJECT_TYPE}/${encodeURIComponent(objectKey)}` +
        `?siteId=${siteId}`

    const requestHeaders = {
        'Authorization': `Bearer ${slasToken}`,
        'Content-Type': 'application/json'
    }


    const response = await fetch(apiUrl, {
        method: 'GET',
        headers: requestHeaders
    })

    const responseBody = await response.text()
    

    // 404 = Custom Object doesn't exist for this locale (not an error)
    if (response.status === 404) {
        logger.info(`[Custom Object Service] No Custom Object found for key: ${objectKey}`)
        return null
    }

    // 401/403 = Auth error (token expired, missing scope, etc.)
    if (response.status === 401 || response.status === 403) {
        logger.error('[Custom Object Service] Auth error:', response.status, responseBody)
        const error = new Error(
            `[${MULTI_LOCALE_ERROR_CODES.AUTH_ERROR}] SCAPI auth failed (${response.status}): ` +
            `Ensure SLAS token has 'sfcc.shopper-custom-objects' scope and is not expired.`
        )
        error.code = MULTI_LOCALE_ERROR_CODES.AUTH_ERROR
        error.statusCode = response.status
        throw error
    }

    if (!response.ok) {
        logger.error('[Custom Object Service] API request failed:', response.status, responseBody)
        throw new Error(`Custom Object API failed: ${response.status} - ${responseBody}`)
    }

    // Parse response body as JSON (we already have it as text)
    const data = JSON.parse(responseBody)
    logger.info(`[Custom Object Service] Retrieved Custom Object for key: ${objectKey}`)

    return data
}

/**
 * Build JPMC config from Custom Object data
 * 
 * Maps Custom Object c_ attributes to internal config keys.
 * 
 * @param {Object} customObject - Raw Custom Object from SCAPI
 * @returns {Object} JPMC configuration object
 */
const buildConfigFromCustomObject = (customObject) => {
    if (!customObject) {
        return null
    }

    const config = {}

    // Map Custom Object c_ attributes to config keys
    for (const [attrKey, configKey] of Object.entries(CUSTOM_OBJECT_ATTRIBUTE_MAPPING)) {
        // Try both c_{attrKey} and direct attrKey (SCAPI may return either)
        const value = customObject[`c_${attrKey}`] ?? customObject[attrKey]
        if (value !== undefined && value !== null) {
            config[configKey] = value
        }
    }

    // Process apiHost - strip protocol if present
    if (config.apiHost) {
        config.apiHost = config.apiHost.replace(/^https?:\/\//, '')
    }

    // Build merchant software object for API requests
    if (config.merchantSoftwareCompany || config.merchantSoftwareProduct || config.merchantSoftwareVersion) {
        config.merchantSoftware = {
            companyName: config.merchantSoftwareCompany,
            productName: config.merchantSoftwareProduct,
            version: config.merchantSoftwareVersion
        }
    }

    return config
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get JPMC configuration from Custom Object for a specific locale
 * 
 * Fetches merchant configuration from SFCC Custom Objects using SCAPI.
 * Uses 5-minute TTL caching to reduce API calls.
 * 
 * @param {Object} options - Options
 * @param {string} options.locale - Locale identifier (e.g., "en_US", "en_CA")
 * @param {string} options.slasToken - SLAS access token (required)
 * @param {boolean} [options.forceRefresh=false] - Force refresh from API
 * @returns {Promise<Object|null>} JPMC config for locale, or null if not found
 * @throws {Error} If SLAS token is missing or API call fails
 * 
 * @example
 * const config = await getCustomObjectConfig({
 *   locale: 'en_CA',
 *   slasToken: 'eyJ...'
 * })
 * if (config) {
 *   console.log('Canada merchant ID:', config.merchantId)
 * }
 */
export const getCustomObjectConfig = async (options = {}) => {
    const { locale, slasToken, forceRefresh = false } = options

    // Validate required parameters
    if (!locale) {
        throw new Error(`[${MULTI_LOCALE_ERROR_CODES.CONFIG_ERROR}] locale is required for Custom Object config`)
    }

    if (!slasToken) {
        const error = new Error(
            `[${MULTI_LOCALE_ERROR_CODES.AUTH_ERROR}] SLAS token required for multi-locale configuration. ` +
            `Locale "${locale}" was requested but no SLAS token provided.`
        )
        error.code = MULTI_LOCALE_ERROR_CODES.AUTH_ERROR
        throw error
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh && isCacheValid(locale)) {
        logger.info(`[Custom Object Service] Using cached config for locale: ${locale}`)
        return configCache.get(locale).data
    }

    // Build Custom Object key
    const sfccConfig = getSFCCConfig()
    const objectKey = buildCustomObjectKey(sfccConfig.siteId, locale)
    logger.info(`[Custom Object Service] Looking up CO key: ${objectKey}`)

    try {
        // Fetch from SCAPI
        const customObject = await fetchCustomObjectFromAPI(objectKey, slasToken, sfccConfig)

        // Build config from Custom Object
        const config = buildConfigFromCustomObject(customObject)

        // Update cache (even if null - prevents repeated 404 lookups)
        const now = Date.now()
        configCache.set(locale, {
            data: config,
            timestamp: now,
            expiresAt: now + CACHE_CONFIG.DEFAULT_TTL_MS
        })

        if (config) {
            logger.debug(`[Custom Object Service] Loaded config for locale "${locale}":`, {
                locale,
                objectKey,
                hasCheckoutMode: !!config.checkoutMode,
                checkoutMode: config.checkoutMode || 'not set',
                hasMerchantId: !!config.merchantId,
                hasApiHost: !!config.apiHost,
                hasGooglePay: !!config.googlePayMerchantName
            })
        } else {
            logger.debug(`[Custom Object Service] ⚠️  Custom object found but returned empty config for locale "${locale}"`, {
                locale,
                objectKey,
                reason: 'Custom object exists but has no mapped attributes'
            })
        }

        return config

    } catch (error) {
        // Re-throw auth errors as-is
        if (error.code === MULTI_LOCALE_ERROR_CODES.AUTH_ERROR) {
            logger.error(`[Custom Object Service] ❌ Authentication error fetching custom object for locale "${locale}":`, {
                locale,
                objectKey,
                errorCode: error.code,
                statusCode: error.statusCode,
                reason: 'SLAS token may be missing, expired, or lack required "sfcc.shopper-custom-objects" scope',
                fallback: 'Will fall back to Site Preferences'
            })
            throw error
        }

        // Wrap other errors
        logger.error(`[Custom Object Service] ❌ Failed to fetch custom object for locale "${locale}":`, {
            locale,
            objectKey,
            errorMessage: error.message,
            reason: 'Possible 404 (key does not exist) or API error'
        })
        const wrappedError = new Error(
            `[${MULTI_LOCALE_ERROR_CODES.FETCH_ERROR}] Failed to fetch locale config for "${locale}": ${error.message}`
        )
        wrappedError.code = MULTI_LOCALE_ERROR_CODES.FETCH_ERROR
        wrappedError.cause = error
        throw wrappedError
    }
}

/**
 * Clear Custom Object config cache
 * 
 * @param {string} [locale] - Optional locale to clear. If not provided, clears all.
 */
export const clearCustomObjectCache = (locale) => {
    if (locale) {
        configCache.delete(locale)
        logger.info(`[Custom Object Service] Cache cleared for locale: ${locale}`)
    } else {
        configCache.clear()
        logger.info('[Custom Object Service] Cache cleared for all locales')
    }
}

/**
 * Get cache status for debugging
 * 
 * @returns {Object} Cache status information
 */
export const getCustomObjectCacheStatus = () => {
    const status = {
        cachedLocales: Array.from(configCache.keys()),
        entries: []
    }

    for (const [locale, cache] of configCache.entries()) {
        status.entries.push({
            locale,
            hasData: !!cache.data,
            timestamp: new Date(cache.timestamp).toISOString(),
            expiresAt: new Date(cache.expiresAt).toISOString(),
            isValid: isCacheValid(locale)
        })
    }

    return status
}

// =============================================================================
// Exports
// =============================================================================

export default {
    getCustomObjectConfig,
    clearCustomObjectCache,
    getCustomObjectCacheStatus,
    MULTI_LOCALE_ERROR_CODES
}
