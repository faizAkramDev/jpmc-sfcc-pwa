/**
 * Locale Extractor Utility
 * 
 * Extracts locale from Express request using multiple strategies:
 * 1. Explicit query param (?locale=en-CA)
 * 2. Explicit body param (for POST requests)
 * 3. Auto-detect from Referer header (PWA Kit path or query param)
 * 
 * This enables multi-MID support without requiring integrators to
 * manually pass locale in every API call.
 * 
 * @module utils/locale-extractor
 */

import logger from './logger.js'

/**
 * Supported locale formats:
 * - en-CA (hyphen, PWA Kit default)
 * - en_CA (underscore, SFCC internal)
 * - en-US, fr-FR, de-DE, etc.
 */
const LOCALE_PATTERN = /^\/([a-z]{2}[-_][A-Z]{2})(\/|$)/

/**
 * Extract locale from Referer header URL
 * 
 * Handles both PWA Kit URL configurations:
 * - Path-based: /en-CA/checkout
 * - Query-based: /checkout?locale=en-CA
 * 
 * @param {string} referer - Referer header value
 * @returns {string|undefined} Extracted locale or undefined
 */
const extractLocaleFromReferer = (referer) => {
    if (!referer) return undefined
    
    try {
        const url = new URL(referer)
        
        // 1. Check query param first: ?locale=en-CA
        const queryLocale = url.searchParams.get('locale')
        if (queryLocale) {
            return queryLocale
        }
        
        // 2. Check path format: /en-CA/... or /en_CA/...
        const pathMatch = LOCALE_PATTERN.exec(url.pathname)
        if (pathMatch) {
            const locale = pathMatch[1]
            return locale
        }
        
    } catch (_e) {
        // Invalid URL - return undefined
        logger.warn('[Locale Extractor] Failed to parse Referer URL:', referer)
    }
    
    return undefined
}

/**
 * Extract locale from Express request
 * 
 * Priority order:
 * 1. Explicit query param (?locale=) - highest priority
 * 2. Explicit body param (POST requests)
 * 3. Auto-detect from Referer header
 * 4. Returns undefined (caller falls back to Site Preferences)
 * 
 * @param {Object} req - Express request object
 * @returns {string|undefined} Locale identifier (e.g., 'en-CA', 'en_CA') or undefined
 * 
 * @example
 * // GET /api/jpmorgan/config?locale=en-CA
 * extractLocale(req) // Returns 'en-CA'
 * 
 * @example
 * // GET /api/jpmorgan/config (with Referer: http://localhost:3000/en-CA/checkout)
 * extractLocale(req) // Returns 'en-CA' (auto-detected)
 * 
 * @example
 * // GET /api/jpmorgan/config (no locale, no Referer)
 * extractLocale(req) // Returns undefined (uses Site Preferences)
 */
export const extractLocale = (req) => {
    // 1. Explicit query param (highest priority)
    if (req?.query?.locale) {
        return req.query.locale
    }
    
    // 2. Explicit body param (for POST requests)
    if (req?.body?.locale) {
        return req.body.locale
    }
    
    // 3. Auto-detect from Referer header
    // Note: Referer is spelled both ways due to HTTP spec typo
    const referer = req?.headers?.referer || req?.headers?.referrer
    if (referer) {
        const detectedLocale = extractLocaleFromReferer(referer)
        if (detectedLocale) {
            return detectedLocale
        }
    }
    
    // 4. No locale detected - caller will fall back to Site Preferences
    return undefined
}

/**
 * Extract SLAS token from request Authorization header
 * 
 * @param {Object} req - Express request object
 * @returns {string|undefined} SLAS access token or undefined
 */
export const extractSlasToken = (req) => {
    const authHeader = req?.headers?.authorization
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        return token
    }
    return undefined
}

export default {
    extractLocale,
    extractSlasToken
}
