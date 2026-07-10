/**
 * JP Morgan PWA Kit - SSR Module
 * 
 * This module provides the main entry point for server-side integration.
 * It auto-registers API routes, CSP headers, and checkout enhancements.
 * 
 * Usage in ssr.js:
 * ```javascript
 * import { createJPMCHandler } from '@jpmorgan/jpmorgan-salesforce-pwa/ssr'
 * 
 * const { handler } = createJPMCHandler(runtime, options, (app) => {
 *     app.get('*', runtime.render)
 * })
 * 
 * export const get = handler
 * ```
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/ssr
 */

import { registerJPMCEndpoints } from './routes'
import { jpmorganCSPMiddleware } from './middleware/csp'
import { jpmorganErrorHandler } from './middleware/error-handler'
import bodyParser from 'body-parser'
import dotenv from 'dotenv'
import path from 'node:path'
import fs from 'node:fs'
import logger from '../utils/logger'

// =============================================================================
// Environment Variable Loading
// =============================================================================

/**
 * Find and load .env file from the project root
 * 
 * PWA Kit runs from the build directory, so we need to search upward
 * to find the project root where .env is located.
 * 
 * Search order:
 * 1. Current working directory
 * 2. Parent of current working directory (for when running from /build)
 * 3. Explicit path via JPMC_ENV_PATH environment variable
 */
const loadEnvFile = () => {
    // If sensitive JPMC credentials are already loaded, skip
    // Non-sensitive config (merchantId, environment) comes from BM site preferences
    if (process.env.JPMC_PRIVATE_KEY_BASE64 || process.env.JPMC_PRIVATE_KEY_PATH) {
        return true
    }
    
    // Check for explicit env path
    if (process.env.JPMC_ENV_PATH) {
        const explicitPath = process.env.JPMC_ENV_PATH
        if (fs.existsSync(explicitPath)) {
            dotenv.config({ path: explicitPath })
            return true
        }
        logger.warn('[JPMC] JPMC_ENV_PATH specified but file not found:', explicitPath)
    }
    
    const cwd = process.cwd()
    
    // Search paths in order of priority
    const searchPaths = [
        path.resolve(cwd, '.env'),                    // Current directory
        path.resolve(cwd, '..', '.env'),              // Parent directory (project root from build/)
        path.resolve(cwd, '..', '..', '.env'),        // Two levels up (edge cases)
    ]
    
    for (const envPath of searchPaths) {
        if (fs.existsSync(envPath)) {
            const result = dotenv.config({ path: envPath })
            if (result.error) {
                logger.error('[JPMC] Error loading .env:', result.error.message)
                return false
            }
            return true
        }
    }
    
    logger.warn('[JPMC] No .env file found. Searched:', searchPaths)
    logger.warn('[JPMC] Ensure environment variables are set via other means (e.g., MRT secrets)')
    return false
}

// Auto-load .env when this module is imported
loadEnvFile()

// =============================================================================
// Configuration
// =============================================================================

/**
 * Default JPMC configuration
 * Can be overridden via options parameter
 */
const DEFAULT_CONFIG = {
    // API settings
    apiBasePath: '/api/jpmorgan',
    
    // Debug mode
    debug: process.env.JPMC_DEBUG === 'true',
    
    // CSP settings
    additionalCSPDirectives: {},
    
    // Site Preferences
    useSitePreferences: process.env.JPMC_USE_SITE_PREFERENCES !== 'false'
}

// Cache for resolved JPMC config (keyed by locale)
// TTL: 5 minutes to balance freshness with performance
const resolvedConfigCache = new Map()
const RESOLVED_CONFIG_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get JPMC configuration from environment variables (synchronous)
 * 
 * Returns ONLY sensitive configuration from environment variables.
 * Non-sensitive configuration (merchantId, environment, PIE URLs, etc.)
 * comes from BM site preferences via getJPMCConfigAsync().
 * 
 * @returns {Object} Sensitive JPMC configuration from environment variables
 */
export const getJPMCConfig = () => {
    return {
        // OAuth / Authentication (sensitive - MUST come from env/MRT secrets)
        privateKeyBase64: process.env.JPMC_PRIVATE_KEY_BASE64,
        privateKeyPath: process.env.JPMC_PRIVATE_KEY_PATH,
        certificateBase64: process.env.JPMC_CERTIFICATE_BASE64,
        certificatePath: process.env.JPMC_CERTIFICATE_PATH,
        
        // Debug flag
        debug: process.env.JPMC_DEBUG === 'true'
    }
}

/**
 * Get JPMC configuration with BM site preferences (asynchronous)
 * 
 * Resolution Algorithm (per multi-mid-guide.md):
 * 
 * isMultiMerchantEnabled()?
 * ├── NO  → return buildSitePrefsConfig() only
 * └── YES → 
 *     ├── Try getMerchantConfigCO(siteId::locale)
 *     │   ├── Found + enabled → mergeConfigWithSPFallback(co, spConfig)
 *     │   └── Not found/disabled → continue
 *     ├── Try getMerchantConfigCO(siteId::default)
 *     │   ├── Found + enabled → mergeConfigWithSPFallback(co, spConfig)
 *     │   └── Not found/disabled → continue
 *     └── return buildSitePrefsConfig()
 * 
 * @param {Object} options - Options
 * @param {string} [options.locale] - Locale identifier for multi-MID (e.g., "en_US", "en_CA")
 * @param {string} [options.slasToken] - SLAS access token (required for CO lookup)
 * @param {boolean} [options.forceRefresh=false] - Force refresh from source
 * @param {boolean} [options.useSitePreferences=true] - Whether to fetch from BM
 * @returns {Promise<Object>} Merged JPMC configuration
 * 
 * @example
 * // Single-site (existing behavior)
 * const config = await getJPMCConfigAsync()
 * 
 * // Multi-locale
 * const config = await getJPMCConfigAsync({ 
 *   locale: 'en_CA', 
 *   slasToken: 'eyJ...' 
 * })
 */
export const getJPMCConfigAsync = async (options = {}) => {
    const { 
        locale,
        slasToken,
        forceRefresh = false, 
        useSitePreferences = DEFAULT_CONFIG.useSitePreferences 
    } = options

    // Log input parameters for debugging
    logger.debug('[JPMC Config] getJPMCConfigAsync called with:', {
        locale: locale || 'NOT_PROVIDED',
        hasSlasToken: !!slasToken,
        slasTokenLength: slasToken ? slasToken.length : 0,
        forceRefresh,
        useSitePreferences
    })

    // Check resolved config cache first (unless forceRefresh)
    const cacheKey = `${locale || 'default'}`
    if (!forceRefresh) {
        const cached = resolvedConfigCache.get(cacheKey)
        if (cached && (Date.now() - cached.timestamp < RESOLVED_CONFIG_TTL)) {
            return cached.config
        }
    }

    // Helper to cache and return config.
    // Config is sourced exclusively from BM (Site Preferences or Custom Objects)
    // merged with environment variables for sensitive credentials.
    const cacheAndReturn = (config) => {
        resolvedConfigCache.set(cacheKey, { config, timestamp: Date.now() })
        return config
    }

    // Get environment config (always needed for sensitive data)
    const envConfig = getJPMCConfig()

    // If not using site preferences, return env config only
    if (!useSitePreferences) {
        return cacheAndReturn(envConfig)
    }

    // =========================================================================
    // STEP 1: Always load Site Preferences first (needed for enableMultiMerchant check and fallback)
    // =========================================================================
    let spConfig
    try {
        const { getJPMCPreferences, buildJPMCConfigFromPreferences, mergeWithEnvironmentConfig } = 
            await import('../services/sfcc')

        const bmPrefs = await getJPMCPreferences({ forceRefresh })
        const bmConfig = buildJPMCConfigFromPreferences(bmPrefs)
        spConfig = mergeWithEnvironmentConfig(bmConfig, envConfig)
    } catch (error) {
        logger.warn('[JPMC Config] ⚠️  Failed to load site preferences, falling back to env:', error.message)
        return cacheAndReturn(envConfig)
    }

    // =========================================================================
    // STEP 2: Check if Multi-Merchant is enabled (JPMCEnableMultiMerchant)
    // =========================================================================
    const isMultiMerchantEnabled = spConfig.enableMultiMerchant === true || 
                                    spConfig.enableMultiMerchant === 'true'

    if (!isMultiMerchantEnabled) {
        // Multi-Merchant disabled → Return Site Preferences only (no CO lookup)
        spConfig._configSource = 'sitePreferences'
        logger.info('[JPMC Config] Multi-Merchant disabled. Using Site Preferences.', {
            locale,
            checkoutMode: spConfig.checkoutMode,
            dropInEnabled: spConfig.checkoutMode === 'DROP_IN'
        })
        return cacheAndReturn(spConfig)
    }

    // =========================================================================
    // STEP 3: Multi-Merchant enabled → Try Custom Object lookup
    // =========================================================================
    // Need SLAS token for CO lookup
    if (!slasToken) {
        logger.warn('[JPMC Config] Multi-Merchant enabled BUT no SLAS token provided.', {
            locale,
            multiMerchantEnabled: true,
            reason: 'SLAS token is required for custom object lookup but was not provided by client',
            fallback: 'Using Site Preferences instead. This will apply the same config to all locales.',
            checkoutMode: spConfig.checkoutMode,
            note: 'If you want per-locale configuration, ensure the client is sending the Authorization header with SLAS token.'
        })
        spConfig._configSource = 'sitePreferences'
        spConfig._multiMerchantEnabled = true
        return cacheAndReturn(spConfig)
    }

    try {
        const { getCustomObjectConfig, mergeConfigWithSPFallback, mergeWithEnvironmentConfig } = 
            await import('../services/sfcc')

        // Helper to check if CO is valid and enabled
        const isCoEnabledAndValid = (coConfig) => {
            if (!coConfig) return false
            // Check enabled flag (default to true if not explicitly set to false)
            const enabled = coConfig.enabled !== false && coConfig.enabled !== 'false'
            return enabled
        }

        // =====================================================================
        // STEP 3a: Try locale-specific Custom Object (siteId::locale)
        // =====================================================================
        if (locale) {
            const localeCoConfig = await getCustomObjectConfig({ 
                locale, 
                slasToken, 
                forceRefresh 
            })

            if (isCoEnabledAndValid(localeCoConfig)) {
                // Found + enabled → merge with SP fallback
                const mergedCoConfig = mergeConfigWithSPFallback(localeCoConfig, spConfig)
                const finalConfig = mergeWithEnvironmentConfig(mergedCoConfig, envConfig)
                
                finalConfig._configSource = 'customObject'
                finalConfig._locale = locale
                logger.info('[JPMC Config] ✅ Locale-specific Custom Object found and applied.', {
                    locale,
                    checkoutMode: finalConfig.checkoutMode,
                    dropInEnabled: finalConfig.checkoutMode === 'DROP_IN',
                    source: 'customObject',
                    note: 'Custom object is overriding Site Preferences'
                })
                return cacheAndReturn(finalConfig)
            } else if (localeCoConfig) {
                // Found but disabled
                logger.info('[JPMC Config] ⚠️  Locale-specific Custom Object found but DISABLED.', {
                    locale,
                    reason: 'Custom object has enabled=false',
                    fallback: 'Falling back to Site Preferences'
                })
            } else {
                // Not found (404)
                logger.info('[JPMC Config] ⚠️  Locale-specific Custom Object not found.', {
                    locale,
                    expectedKeyFormat: '{siteId}::' + locale,
                    fallback: 'Falling back to default Custom Object or Site Preferences'
                })
            }
        }

        // =====================================================================
        // STEP 3b: Try default Custom Object (siteId::default)
        // =====================================================================
        const defaultCoConfig = await getCustomObjectConfig({ 
            locale: 'default', 
            slasToken, 
            forceRefresh 
        })

        if (isCoEnabledAndValid(defaultCoConfig)) {
            // Found + enabled → merge with SP fallback
            const mergedCoConfig = mergeConfigWithSPFallback(defaultCoConfig, spConfig)
            const finalConfig = mergeWithEnvironmentConfig(mergedCoConfig, envConfig)
            
            finalConfig._configSource = 'customObject'
            finalConfig._locale = 'default'
            logger.info('[JPMC Config] ✅ Default Custom Object found and applied.', {
                locale: locale || 'not specified',
                checkoutMode: finalConfig.checkoutMode,
                dropInEnabled: finalConfig.checkoutMode === 'DROP_IN',
                source: 'customObject (default)',
                note: 'Locale-specific CO not found, using default CO which overrides Site Preferences'
            })
            if (locale) finalConfig._requestedLocale = locale
            return cacheAndReturn(finalConfig)
        } else if (defaultCoConfig) {
            // Default CO found but disabled
            logger.info('[JPMC Config] ⚠️  Default Custom Object found but DISABLED.', {
                reason: 'Custom object has enabled=false',
                fallback: 'Falling back to Site Preferences'
            })
        } else {
            // Default CO not found
            logger.info('[JPMC Config] ⚠️  Default Custom Object not found.', {
                expectedKey: `${this.siteId}::default`,
                fallback: 'Falling back to Site Preferences'
            })
        }

    } catch (error) {
        // Log error but continue to Site Preferences fallback
        logger.warn(`[JPMC Config] ⚠️  Custom Object lookup failed:`, error.message)
    }

    // =========================================================================
    // STEP 4: Fallback to Site Preferences
    // =========================================================================
    logger.info('[JPMC Config] ℹ️  No valid custom object found, using Site Preferences.', {
        locale: locale || 'not specified',
        multiMerchantEnabled: true,
        checkoutMode: spConfig.checkoutMode,
        dropInEnabled: spConfig.checkoutMode === 'DROP_IN',
        source: 'sitePreferences (fallback)'
    })
    spConfig._configSource = 'sitePreferences'
    spConfig._multiMerchantEnabled = true
    spConfig._fallback = true
    if (locale) spConfig._requestedLocale = locale
    
    logger.info('[JPMC Config] Using Site Preferences (no custom object found for locale or custom object lookup failed).', {
        locale,
        multiMerchantEnabled: true,
        checkoutMode: spConfig.checkoutMode,
        dropInEnabled: spConfig.checkoutMode === 'DROP_IN',
        message: 'This is expected if custom object is not configured for this locale. Drop-in will appear if JPMCCheckoutMode preference = DROP_IN globally in BM.'
    })
    
    return cacheAndReturn(spConfig)
}

/**
 * Validate required configuration
 * 
 * Validates that sensitive credentials are available from environment.
 * Non-sensitive config is validated when fetched from BM site preferences.
 * 
/**
 * Validate JPMC configuration at boot time
 * Throws error if required configuration is missing
 * @throws {Error} If required environment variables are missing
 */
const validateRequiredConfig = () => {
    const config = getJPMCConfig()
    const errors = []
    
    if (!config.privateKeyBase64 && !config.privateKeyPath) {
        errors.push('JPMC_PRIVATE_KEY_BASE64 or JPMC_PRIVATE_KEY_PATH is required')
    }
    
    if (!config.certificateBase64 && !config.certificatePath) {
        errors.push('JPMC_CERTIFICATE_BASE64 or JPMC_CERTIFICATE_PATH is required')
    }
    
    if (errors.length > 0) {
        throw new Error(`[JPMC] Missing required configuration: ${errors.join('; ')}`)
    }
}

/**
 * @param {Object} fullConfig - Optional full config from getJPMCConfigAsync()
 * @returns {object} { valid: boolean, errors: string[] }
 */
export const validateConfig = async () => {
    const envConfig = getJPMCConfig()
    const errors = []
    
    // Get full config from BM to check non-sensitive values
    let fullConfig = {}
    try {
        fullConfig = await getJPMCConfigAsync()
    } catch (e) {
        errors.push(`Failed to fetch config from BM: ${e.message}`)
    }
    
    // Validate sensitive credentials from environment
    if (!envConfig.privateKeyBase64 && !envConfig.privateKeyPath) {
        errors.push('JPMC_PRIVATE_KEY_BASE64 or JPMC_PRIVATE_KEY_PATH is required')
    }
    if (!envConfig.certificateBase64 && !envConfig.certificatePath) {
        errors.push('JPMC_CERTIFICATE_BASE64 or JPMC_CERTIFICATE_PATH is required')
    }
    
    // Validate non-sensitive values from BM site preferences
    if (!fullConfig.clientId) errors.push('JPMCClientID site preference is required')
    if (!fullConfig.merchantId) errors.push('JPMC_MerchantCode site preference is required')
    if (!fullConfig.resourceId) errors.push('JPMCResourceID site preference is required')
    if (!fullConfig.apiHost) errors.push('JPMCApiHost site preference is required')
    if (!fullConfig.tokenizationType) errors.push('JPMCTokenizationType site preference is required')
    
    return {
        valid: errors.length === 0,
        errors,
        config: fullConfig
    }
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Create JPMC-enhanced handler for PWA Kit SSR
 * 
 * This function wraps the PWA Kit runtime.createHandler to automatically:
 * 1. Register JPMC API routes
 * 2. Inject CSP headers for PIE SDK
 * 3. Add body parser middleware
 * 4. Add error handling
 * 
 * @param {object} runtime - PWA Kit runtime from getRuntime()
 * @param {object} options - PWA Kit options (buildDir, mobify, port, etc.)
 * @param {function} appCallback - Callback to configure Express app
 * @param {object} jpmcOptions - Optional JPMC configuration overrides
 * @returns {object} { handler } - Express handler for export
 * 
 * @example
 * ```javascript
 * import { getRuntime } from '@salesforce/pwa-kit-runtime/ssr/server/express'
 * import { createJPMCHandler } from '@jpmorgan/jpmorgan-salesforce-pwa/ssr'
 * 
 * const runtime = getRuntime()
 * const options = { buildDir: '...', mobify: getConfig(), port: 3000 }
 * 
 * const { handler } = createJPMCHandler(runtime, options, (app) => {
 *     app.get('/robots.txt', runtime.serveStaticFile('static/robots.txt'))
 *     app.get('*', runtime.render)
 * })
 * 
 * export const get = handler
 * ```
 */
export function createJPMCHandler(runtime, options, appCallback, jpmcOptions = {}) {
    // Validate required configuration immediately (fail-fast)
    validateRequiredConfig()
    
    // Merge options with defaults
    const config = { ...DEFAULT_CONFIG, ...jpmcOptions }
    
    if (config.debug) {
        logger.info('[JPMC] Creating handler with config:', {
            apiBasePath: config.apiBasePath
        })
    }
    
    // Create the handler with JPMC enhancements
    const { handler } = runtime.createHandler(options, (app) => {
        // 1. Add body parser for JSON requests
        app.use(bodyParser.json())
        
        // 2. Add JPMC CSP headers
        const cspMiddleware = jpmorganCSPMiddleware(config.additionalCSPDirectives)
        app.use(cspMiddleware)
        
        // 3. Register JPMC API routes
        registerJPMCEndpoints(app, runtime, {
            attributeMapping: {},
            commerceConfig: config,
            debug: config.debug
        })
        
        // 4. Call the developer's app callback
        if (typeof appCallback === 'function') {
            appCallback(app)
        }
        
        // 5. Add error handler (must be last)
        app.use(jpmorganErrorHandler)
    })
    
    return { handler }
}

// =============================================================================
// Exports
// =============================================================================

export { registerJPMCEndpoints, SuccessHandler, ErrorHandler, configureThreeDSController } from './routes'
export { jpmorganCSPMiddleware, mergeCSPDirectives } from './middleware/csp'
export { jpmorganErrorHandler } from './middleware/error-handler'
export { 
    createPaymentRateLimiter, 
    paymentRateLimiter, 
    configRateLimiter, 
    applyRateLimiting 
} from './middleware/rate-limit'

// Order API exports
export { OrderApiClient } from './api/order-api'
export { 
    mapJPMCResponseToAttributes,
    mapPaymentTransactionAttributes,
    mapAuthResponseToOrderAttributes,
    mapFraudResponseToOrderAttributes,
    createAttributeMapper, 
    DEFAULT_ATTRIBUTE_MAPPING,
    PAYMENT_TRANSACTION_ATTRIBUTE_MAPPING,
    AUTH_ORDER_ATTRIBUTE_MAPPING,
    FRAUD_CHECK_ORDER_ATTRIBUTE_MAPPING,
    validateAttributeMapping 
} from './api/attribute-mapping'

// 3DS Controller exports
export { handle3DSCallback, handleFail3DSOrder } from './controllers/threeds-controller'

// Default export for convenience
export default { createJPMCHandler, registerJPMCEndpoints }
