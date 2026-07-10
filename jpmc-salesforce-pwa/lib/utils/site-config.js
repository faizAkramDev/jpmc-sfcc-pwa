/**
 * Site Configuration Utility
 * 
 * Provides access to site configuration including default locale detection.
 * This allows Apple Pay logic to properly determine if a locale is the default.
 * 
 * @module utils/site-config
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import logger from './logger.js'

// Cache for site configuration
let sitesConfigCache = null

/**
 * Get the sites configuration
 * Attempts to load from multiple possible locations
 * 
 * @returns {Array|null} Sites configuration array or null
 */
const getSitesConfig = () => {
    if (sitesConfigCache) {
        return sitesConfigCache
    }

    try {
        // Try to require the sites.js from the retail-react-app
        // This works when running in the PWA Kit environment
        let possiblePaths = []
        
        // Try to get __dirname from import.meta (ESM mode)
        // Wrap import.meta check to avoid Babel parser errors in CommonJS
        try {
            // Use Function constructor to access import.meta safely
            // This allows the code to run in both ESM and CommonJS environments
            const getImportMeta = new Function('return import.meta')
            const meta = getImportMeta()
            if (meta && meta.url) {
                const __dirname = dirname(fileURLToPath(meta.url))
                possiblePaths = [
                    // From jpmorgan-salesforce-pwa to retail-react-app
                    resolve(__dirname, '../../../../retail-react-app/config/sites.js'),
                    resolve(__dirname, '../../../retail-react-app/config/sites.js'),
                    resolve(__dirname, '../../retail-react-app/config/sites.js')
                ]
            }
        } catch (_e) {
            // import.meta not available (e.g., in Jest/CommonJS mode) - skip path resolution
        }
        
        // Always include process.cwd() based paths as fallback
        possiblePaths.push(
            resolve(process.cwd(), 'config/sites.js'),
            resolve(process.cwd(), '../config/sites.js')
        )

        for (const path of possiblePaths) {
            try {
                const content = readFileSync(path, 'utf8')
                // Basic CommonJS module.exports parsing
                const moduleExportsMatch = content.match(/module\.exports\s*=\s*(\[[\s\S]*?\])/m)
                if (moduleExportsMatch) {
                    // Use Function constructor instead of eval - safer approach for JSON/object parsing
                    // Function constructor runs in different scope and prevents direct variable access
                    const dataStr = moduleExportsMatch[1]
                    const func = new Function('return ' + dataStr)
                    sitesConfigCache = func()
                    logger.info('[Site Config] Loaded sites configuration from:', path)
                    return sitesConfigCache
                }
            } catch (err) {
                // Try next path
                continue
            }
        }

        logger.warn('[Site Config] Could not load sites.js from any known location')
        return null
    } catch (error) {
        logger.error('[Site Config] Error loading sites configuration:', error.message)
        return null
    }
}

/**
 * Get the default locale for a given site
 * 
 * @param {string} [siteId] - Site ID (defaults to first site if not provided)
 * @returns {string|null} Default locale (e.g., 'en-US') or null if not found
 */
export const getDefaultLocale = (siteId) => {
    // Check environment variable first
    const envDefaultLocale = process.env.SITE_DEFAULT_LOCALE
    if (envDefaultLocale) {
        logger.info('[Site Config] Using default locale from env:', envDefaultLocale)
        return envDefaultLocale
    }

    // Try to load from sites.js
    const sites = getSitesConfig()
    if (!sites || !Array.isArray(sites) || sites.length === 0) {
        logger.warn('[Site Config] No sites configuration available, returning null')
        return null
    }

    // Find the site (or use first one if siteId not specified)
    const site = siteId
        ? sites.find(s => s.id === siteId)
        : sites[0]

    if (!site) {
        logger.warn('[Site Config] Site not found:', siteId)
        return null
    }

    const defaultLocale = site.l10n?.defaultLocale
    if (defaultLocale) {
        logger.info('[Site Config] Default locale for site', site.id, ':', defaultLocale)
        return defaultLocale
    }

    logger.warn('[Site Config] No default locale configured for site:', site.id)
    return null
}

/**
 * Check if a locale is the default locale for the site
 * 
 * @param {string|undefined} locale - Locale to check (e.g., 'en-US', 'en-CA')
 * @param {string} [siteId] - Site ID (optional)
 * @returns {boolean} True if locale is undefined (meaning default) or matches the default locale
 */
export const isDefaultLocale = (locale, siteId) => {
    // If no locale specified, it means use the default
    if (!locale || locale === '') {
        logger.info('[Site Config] No locale specified - treating as default')
        return true
    }

    // Get the actual default locale from configuration
    const defaultLocale = getDefaultLocale(siteId)
    
    // If we can't determine the default, be conservative and allow it
    // (This prevents breaking Apple Pay if configuration can't be loaded)
    if (!defaultLocale) {
        logger.warn('[Site Config] Cannot determine default locale - allowing Apple Pay for:', locale)
        return true
    }

    // Normalize locales for comparison (handle both en-US and en_US formats)
    const normalizedLocale = locale.replace('_', '-')
    const normalizedDefault = defaultLocale.replace('_', '-')

    const isDefault = normalizedLocale === normalizedDefault
    logger.info('[Site Config] Locale comparison:', {
        requested: normalizedLocale,
        default: normalizedDefault,
        isDefault
    })

    return isDefault
}

export default {
    getDefaultLocale,
    isDefaultLocale
}
