/**
 * Browser Info Collection for 3D Secure
 * 
 * Collects browser fingerprint data required by JPMC for 3DS authentication.
 * All string values per SFRA implementation.
 * 
 * @module utils/browser-info
 * @see https://developer.payments.jpmorgan.com/docs/commerce/online-payments/capabilities/online-payments/payment-enhancements/3d-secure
 */

import { THREE_DS } from './constants.mjs'

/**
 * Collect browser information for 3DS authentication
 * 
 * All values are strings per SFRA implementation.
 * Note: deviceIPAddress is collected server-side and must be merged separately.
 * 
 * @returns {Object} Browser info object for JPMC API
 * @returns {string} returns.browserAcceptHeader - Accept header (application/json)
 * @returns {string} returns.browserLanguage - Browser language (max 8 chars)
 * @returns {string} returns.browserColorDepth - Screen color depth
 * @returns {string} returns.browserScreenHeight - Screen height in pixels
 * @returns {string} returns.browserScreenWidth - Screen width in pixels
 * @returns {string} returns.deviceLocalTimeZone - Timezone offset in minutes
 * @returns {string} returns.browserUserAgent - Full user agent string
 * @returns {string} returns.javaEnabled - 'true' or 'false' string
 * @returns {string} returns.javaScriptEnabled - Always 'true' string
 * @returns {string} returns.challengeWindowSize - Window size for 3DS challenge
 * 
 * @example
 * import { collectBrowserInfo } from '@jpmorgan/jpmorgan-salesforce-pwa/utils'
 * 
 * const browserInfo = collectBrowserInfo()
 * // Pass to payment API along with server-collected deviceIPAddress
 */
export function collectBrowserInfo() {
    // Safely access browser APIs (handles SSR where navigator/screen may not exist)
    const nav = typeof navigator !== 'undefined' ? navigator : {}
    const scr = typeof screen !== 'undefined' ? screen : {}
    
    return {
        // Standard accept header for JSON APIs
        browserAcceptHeader: 'application/json',
        
        // Browser language, truncated to 8 characters per JPMC spec
        browserLanguage: (nav.language || 'en-US').substring(0, 8),
        
        // Screen color depth (bits per pixel)
        browserColorDepth: String(scr.colorDepth || 24),
        
        // Screen dimensions
        browserScreenHeight: String(scr.height || 1080),
        browserScreenWidth: String(scr.width || 1920),
        
        // Timezone offset in minutes (inverted for JPMC)
        // JavaScript returns negative for UTC+, JPMC expects positive
        deviceLocalTimeZone: String(-new Date().getTimezoneOffset()),
        
        // Full user agent string
        browserUserAgent: nav.userAgent || '',
        
        // Java enabled - returns string 'true'/'false'
        javaEnabled: String(typeof nav.javaEnabled === 'function' && nav.javaEnabled()),
        
        // JavaScript enabled - always 'true' since this code is running
        javaScriptEnabled: 'true',
        
        // Challenge window size - hardcoded to FULL_SCREEN
        challengeWindowSize: THREE_DS.CHALLENGE_WINDOW_SIZE
        
        // Note: deviceIPAddress must be collected server-side and merged separately
    }
}

/**
 * Check if browser info collection is available
 * Returns false during SSR (server-side rendering)
 * 
 * @returns {boolean} True if browser APIs are available
 */
export function isBrowserInfoAvailable() {
    return typeof navigator !== 'undefined' && typeof screen !== 'undefined'
}

export default {
    collectBrowserInfo,
    isBrowserInfoAvailable
}
