/**
 * SFCC Site Preferences Service
 * 
 * Fetches and caches site preferences from SFCC Business Manager.
 * Uses OAuth 2.0 client credentials grant with sfcc.preferences scope.
 * 
 * @module services/sfcc/site-preferences
 */

import logger from '../../utils/logger.js'

// =============================================================================
// Constants
// =============================================================================

/**
 * Cache configuration for site preferences
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
 * JPMC preference ID prefix patterns for filtering
 */
const JPMC_PREFERENCE_PATTERNS = [
    /^jpmc/i,
    /^JPMC/
]

// =============================================================================
// Cache State
// =============================================================================

/**
 * In-memory cache for site preferences
 * @type {{data: Object|null, timestamp: number, expiresAt: number}}
 */
let preferencesCache = {
    data: null,
    timestamp: 0,
    expiresAt: 0
}

// =============================================================================
// Private Helpers
// =============================================================================

/**
 * Check if the cache is still valid
 * @returns {boolean} True if cache is valid and not expired
 */
const isCacheValid = () => {
    if (!preferencesCache.data) {
        return false
    }
    return Date.now() < preferencesCache.expiresAt
}

/**
 * Get SFCC configuration from environment variables
 * @returns {Object} SFCC configuration
 * @throws {Error} If required environment variables are missing
 */
const getSFCCConfig = () => {
    const config = {
        clientId: process.env.COMMERCE_API_CLIENT_ID_PRIVATE,
        clientSecret: process.env.COMMERCE_API_CLIENT_SECRET,
        shortCode: process.env.COMMERCE_API_SHORT_CODE,
        orgId: process.env.COMMERCE_API_ORG_ID,
        siteId: process.env.COMMERCE_API_SITE_ID,
        realmId: process.env.SFCC_REALM_ID,
        instanceId: process.env.SFCC_INSTANCE_ID,
        accountManagerHost: process.env.SFCC_ACCOUNT_MANAGER_HOST || 'account.demandware.com'
    }

    // Validate required fields
    const requiredFields = ['clientId', 'clientSecret', 'shortCode', 'orgId', 'siteId', 'realmId', 'instanceId']
    const missingFields = requiredFields.filter(field => !config[field])

    if (missingFields.length > 0) {
        throw new Error(
            `Missing required SFCC configuration: ${missingFields.join(', ')}. ` +
            'Ensure COMMERCE_API_* and SFCC_* environment variables are set.'
        )
    }

    return config
}

/**
 * Get OAuth access token from SFCC Account Manager
 * @param {Object} sfccConfig - SFCC configuration
 * @returns {Promise<string>} Access token
 * @throws {Error} If token request fails
 */
const getAccessToken = async (sfccConfig) => {
    const { clientId, clientSecret, realmId, instanceId, accountManagerHost } = sfccConfig

    // Build scope with preferences permission
    const scope = `SALESFORCE_COMMERCE_API:${realmId}_${instanceId} sfcc.preferences`

    // Base64 encode credentials
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const response = await fetch(`https://${accountManagerHost}/dwsso/oauth2/access_token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`
        },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            scope: scope
        }).toString()
    })

    if (!response.ok) {
        const errorText = await response.text()
        logger.error('[SFCC Preferences] Token request failed:', response.status, errorText)
        throw new Error(`SFCC token request failed: ${response.status}`)
    }

    const data = await response.json()

    if (!data.access_token) {
        throw new Error('SFCC token response missing access_token')
    }

    return data.access_token
}

/**
 * Fetch site custom preferences from SFCC SCAPI
 * @param {Object} sfccConfig - SFCC configuration
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<Array>} Array of preference objects
 * @throws {Error} If API request fails
 */
const fetchPreferencesFromAPI = async (sfccConfig, accessToken) => {
    const { shortCode, orgId, siteId } = sfccConfig

    const apiUrl = `https://${shortCode}.api.commercecloud.salesforce.com` +
        `/configuration/preferences/v1/organizations/${orgId}` +
        `/site-custom-preferences?siteId=${siteId}`

    logger.info('[SFCC Preferences] Fetching from:', apiUrl)

    const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    })

    if (!response.ok) {
        const errorText = await response.text()
        logger.error('[SFCC Preferences] API request failed:', response.status, errorText)
        throw new Error(`SFCC preferences API failed: ${response.status}`)
    }

    const data = await response.json()

    logger.info('[SFCC Preferences] Retrieved', data.total || 0, 'total preferences')

    return data.data || []
}

/**
 * Filter preferences to get only JPMC-related ones
 * @param {Array} allPreferences - All site preferences
 * @returns {Object} Object with preference ID as key and value as value
 */
const filterJPMCPreferences = (allPreferences) => {
    const jpmcPrefs = {}

    for (const pref of allPreferences) {
        const isJPMC = JPMC_PREFERENCE_PATTERNS.some(pattern => pattern.test(pref.id)) ||
            pref.groupId?.toLowerCase().includes('jpmc')

        if (isJPMC && pref.value !== undefined && pref.value !== null) {
            jpmcPrefs[pref.id] = pref.value
        }
    }

    return jpmcPrefs
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get all site preferences from SFCC Business Manager
 * 
 * Results are cached to minimize API calls. Use refreshSitePreferences()
 * to force a refresh, or clearPreferencesCache() to clear the cache.
 * 
 * @param {Object} options - Options
 * @param {boolean} [options.forceRefresh=false] - Force refresh from API
 * @param {number} [options.cacheTTL] - Cache TTL in milliseconds
 * @returns {Promise<Array>} Array of all site preferences
 * @throws {Error} If API request fails
 * 
 * @example
 * const allPrefs = await getSitePreferences()
 * console.log('Total preferences:', allPrefs.length)
 */
export const getSitePreferences = async (options = {}) => {
    const { forceRefresh = false, cacheTTL = CACHE_CONFIG.DEFAULT_TTL_MS } = options

    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && isCacheValid()) {
        logger.info('[SFCC Preferences] Returning cached preferences')
        return preferencesCache.data.all
    }

    logger.info('[SFCC Preferences] Fetching fresh preferences from SFCC...')

    try {
        const sfccConfig = getSFCCConfig()
        const accessToken = await getAccessToken(sfccConfig)
        const allPreferences = await fetchPreferencesFromAPI(sfccConfig, accessToken)

        // Update cache
        const now = Date.now()
        const ttl = Math.min(Math.max(cacheTTL, CACHE_CONFIG.MIN_TTL_MS), CACHE_CONFIG.MAX_TTL_MS)

        preferencesCache = {
            data: {
                all: allPreferences,
                jpmc: filterJPMCPreferences(allPreferences)
            },
            timestamp: now,
            expiresAt: now + ttl
        }

        logger.info('[SFCC Preferences] Cache updated, expires in', Math.round(ttl / 1000), 'seconds')

        return allPreferences
    } catch (error) {
        logger.error('[SFCC Preferences] Error fetching preferences:', error.message)

        // Return stale cache if available
        if (preferencesCache.data) {
            logger.warn('[SFCC Preferences] Returning stale cached data due to error')
            return preferencesCache.data.all
        }

        throw error
    }
}

/**
 * Get JPMC-specific preferences from Business Manager
 * 
 * Filters site preferences to return only JPMC-related ones,
 * formatted as a key-value object for easy access.
 * 
 * @param {Object} options - Options
 * @param {boolean} [options.forceRefresh=false] - Force refresh from API
 * @returns {Promise<Object>} Object with preference IDs as keys
 * @throws {Error} If API request fails
 * 
 * @example
 * const jpmcPrefs = await getJPMCPreferences()
 * console.log('Client ID:', jpmcPrefs.JPMCClientID)
 * console.log('Merchant ID:', jpmcPrefs.JPMC_MerchantCode)
 */
export const getJPMCPreferences = async (options = {}) => {
    const { forceRefresh = false } = options

    // Return cached JPMC prefs if valid
    if (!forceRefresh && isCacheValid() && preferencesCache.data?.jpmc) {
        logger.info('[SFCC Preferences] Using cached JPMC preferences')
        return preferencesCache.data.jpmc
    }

    logger.info('[SFCC Preferences] Fetching JPMC preferences from Business Manager...')
    
    // Fetch all preferences (will update cache)
    await getSitePreferences(options)

    const jpmcPrefs = preferencesCache.data?.jpmc || {}
    const prefCount = Object.keys(jpmcPrefs).length
    
    logger.info(`[SFCC Preferences] Loaded ${prefCount} JPMC preferences from BM`)
    
    return jpmcPrefs
}

/**
 * Force refresh of site preferences from SFCC
 * 
 * @returns {Promise<Object>} Fresh JPMC preferences
 */
export const refreshSitePreferences = async () => {
    logger.info('[SFCC Preferences] Forcing refresh...')
    return getJPMCPreferences({ forceRefresh: true })
}

/**
 * Clear the preferences cache
 * 
 * Use this when you know preferences have changed in BM
 * and need fresh data on the next request.
 */
export const clearPreferencesCache = () => {
    logger.info('[SFCC Preferences] Cache cleared')
    preferencesCache = {
        data: null,
        timestamp: 0,
        expiresAt: 0
    }
}

// =============================================================================
// Apple Pay Custom Site Preferences (PWA Kit / Headless)
// =============================================================================

/**
 * Apple Pay preferences cache
 */
let applePayPreferencesCache = {
    data: null,
    timestamp: 0,
    expiresAt: 0
}

/**
 * Fetch Apple Pay configuration from JPMC custom site preferences
 * 
 * NOTE: SFCC's built-in Apple Pay site preferences (Site Preferences > Apple Pay)
 * are NOT accessible via SCAPI. For PWA Kit headless implementations, we use
 * custom JPMC site preferences instead.
 * 
 * Custom Apple Pay preference IDs (in JPMC_ApplePay group):
 * - JPMCApplePayEnabled - Enable/disable Apple Pay
 * - JPMCApplePayMerchantId - Apple Pay Merchant ID from Apple Developer Portal
 * - JPMCApplePayMerchantName - Display name on payment sheet
 * - JPMCApplePayCountryCode - ISO 3166-1 alpha-2 country code
 * - JPMCApplePaySupportedNetworks - Comma-separated card networks
 * - JPMCApplePayMerchantCapabilities - Merchant capabilities
 * 
 * @param {Object} options - Options
 * @param {boolean} [options.forceRefresh=false] - Force refresh from API
 * @returns {Promise<Object>} Apple Pay configuration
 */
export const getApplePayPreferences = async (options = {}) => {
    const { forceRefresh = false } = options
    
    // Check cache
    if (!forceRefresh && applePayPreferencesCache.data && Date.now() < applePayPreferencesCache.expiresAt) {
        logger.info('[SFCC Apple Pay] Returning cached preferences')
        return applePayPreferencesCache.data
    }
    
    logger.info('[SFCC Apple Pay] Fetching Apple Pay custom site preferences...')
    
    try {
        // Get JPMC preferences which includes Apple Pay config
        const jpmcPrefs = await getJPMCPreferences({ forceRefresh })
        
        if (!jpmcPrefs) {
            logger.warn('[SFCC Apple Pay] Could not fetch JPMC preferences')
            return null
        }
        
        // Extract Apple Pay configuration from JPMC preferences
        const applePayConfig = {
            enabled: jpmcPrefs.applePayEnabled === true || jpmcPrefs.applePayEnabled === 'true',
            merchantId: jpmcPrefs.applePayMerchantId || null,
            merchantName: jpmcPrefs.applePayMerchantName || null,
            countryCode: jpmcPrefs.applePayCountryCode || 'US',
            supportedNetworks: parseCommaSeparated(jpmcPrefs.applePaySupportedNetworks) || ['visa', 'masterCard', 'amex', 'discover'],
            merchantCapabilities: parseCommaSeparated(jpmcPrefs.applePayMerchantCapabilities) || ['supports3DS', 'supportsCredit', 'supportsDebit']
        }
        
        // Apple Pay is enabled if explicitly enabled AND merchant ID is configured
        applePayConfig.enabled = applePayConfig.enabled && !!applePayConfig.merchantId
        
        logger.info('[SFCC Apple Pay] Configuration loaded from custom site preferences:')
        logger.info('[SFCC Apple Pay]   - Enabled:', applePayConfig.enabled)
        logger.info('[SFCC Apple Pay]   - Merchant ID:', applePayConfig.merchantId || 'not set')
        logger.info('[SFCC Apple Pay]   - Merchant Name:', applePayConfig.merchantName || 'not set')
        logger.info('[SFCC Apple Pay]   - Country:', applePayConfig.countryCode)
        logger.info('[SFCC Apple Pay]   - Networks:', applePayConfig.supportedNetworks.join(', '))
        
        // Cache the result
        const now = Date.now()
        applePayPreferencesCache = {
            data: applePayConfig,
            timestamp: now,
            expiresAt: now + CACHE_CONFIG.DEFAULT_TTL_MS
        }
        
        return applePayConfig
        
    } catch (error) {
        logger.error('[SFCC Apple Pay] Error fetching preferences:', error.message)
        
        // Return cached data if available
        if (applePayPreferencesCache.data) {
            logger.info('[SFCC Apple Pay] Returning stale cached data')
            return applePayPreferencesCache.data
        }
        
        return null
    }
}

/**
 * Parse comma-separated string into array
 * @private
 */
const parseCommaSeparated = (value) => {
    if (!value) return null
    if (Array.isArray(value)) return value
    return value.split(',').map(s => s.trim()).filter(Boolean)
}

/**
 * Clear Apple Pay preferences cache
 */
export const clearApplePayPreferencesCache = () => {
    logger.info('[SFCC Apple Pay] Cache cleared')
    applePayPreferencesCache = {
        data: null,
        timestamp: 0,
        expiresAt: 0
    }
}

/**
 * Get cache status information
 * 
 * @returns {Object} Cache status
 */
export const getPreferencesCacheStatus = () => {
    const now = Date.now()
    const isValid = isCacheValid()

    return {
        isCached: preferencesCache.data !== null,
        isValid,
        timestamp: preferencesCache.timestamp,
        expiresAt: preferencesCache.expiresAt,
        expiresIn: isValid ? preferencesCache.expiresAt - now : 0,
        jpmcPreferenceCount: preferencesCache.data?.jpmc 
            ? Object.keys(preferencesCache.data.jpmc).length 
            : 0
    }
}

// Default export
export default {
    getSitePreferences,
    getJPMCPreferences,
    refreshSitePreferences,
    clearPreferencesCache,
    getPreferencesCacheStatus,
    getApplePayPreferences,
    clearApplePayPreferencesCache
}
