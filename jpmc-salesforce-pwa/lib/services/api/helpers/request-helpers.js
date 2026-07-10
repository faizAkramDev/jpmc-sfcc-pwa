/**
 * Request Helpers
 * 
 * Common helper functions for processing JPMC API requests.
 * 
 * @module services/api/helpers/request-helpers
 */

import { MERCHANT_SOFTWARE } from '../../../utils/constants/misc-constants'
import { PHONE_COUNTRY_CODES } from '../../../utils/constants.mjs'

// =============================================================================
// Merchant Software
// =============================================================================


/**
 * Build merchantSoftware object for JPMC API
 * Always includes softwareId with realm and optional siteId
 * 
 * @returns {object} merchantSoftware object for JPMC API
 */
export const buildMerchantSoftware = () => {
    const realm = process.env.SFCC_REALM_ID
    
    let softwareId = `realm=${realm}`
    const siteId = process.env.COMMERCE_API_SITE_ID
    if (siteId) {
        softwareId = `${softwareId}|site=${siteId}`
    }
    
    return { ...MERCHANT_SOFTWARE, softwareId }
}

/**
 * Build complete merchant object from config
 * Includes merchantSoftware and optionally merchantCategoryCode
 * 
 * @param {object} config - JPMC config with merchant* properties
 * @returns {object} merchant object for JPMC API
 */
export const buildMerchant = (config = {}) => {
    const merchant = {
        merchantSoftware: buildMerchantSoftware()
    }
    
    if (config.merchantCategoryCode && /^\d{4}$/.test(config.merchantCategoryCode)) {
        merchant.merchantCategoryCode = config.merchantCategoryCode
    }
    
    return merchant
}

// =============================================================================
// Phone Formatting
// =============================================================================

/**
 * Format phone number for JPMC API
 * Strip non-digits, max 12 chars. Sets countryCode when country is in PHONE_COUNTRY_CODES map.
 * 
 * @param {string|object} phone - Phone number string or object with phoneNumber property
 * @param {string} [countryAlpha2] - ISO 3166 Alpha-2 country code (e.g. 'US', 'CA')
 * @returns {object|undefined} Formatted phone object or undefined if not provided
 */
export const formatPhoneForJPMC = (phone, countryAlpha2) => {
    if (!phone) return undefined
    
    const digits = typeof phone === 'object' ? String(phone.phoneNumber || '').replace(/\D/g, '') : String(phone).replace(/\D/g, '')
    if (!digits) return undefined
    
    const phoneObj = {
        phoneNumber: digits.substring(0, 12)
    }
    
    if (countryAlpha2) {
        const code = countryAlpha2.toUpperCase()
        const dialCode = PHONE_COUNTRY_CODES[code]
        if (dialCode) {
            phoneObj.countryCode = dialCode
        }
    }
    
    return phoneObj
}

// =============================================================================
// IP Address Extraction
// =============================================================================

/**
 * Extract client IP address from request headers
 * Used for fraud detection in JPMC API (accountHolder.IPAddress)
 * 
 * @param {object} req - Express request object
 * @returns {string|undefined} Client IP address
 */
export const getClientIp = (req) => {
    // Validate that a candidate string looks like a real external IP address.
    // Filters out loopback addresses (::1, 127.0.0.1), garbage values like "1",
    // and localhost — all of which appear in local/proxy dev environments.
    const isValidExternalIp = (ip) => {
        if (!ip) return false
        const t = ip.trim()
        if (!t || t === '::1' || t === '127.0.0.1' || t === 'localhost') return false
        // IPv4: four dot-separated octets
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(t)) return true
        // IPv6: contains a colon and has enough length to be real
        if (t.includes(':') && t.length > 4) return true
        return false
    }

    // x-forwarded-for may contain multiple IPs: "client, proxy1, proxy2"
    // SECURITY: The first IP in the chain is client-controlled and can be spoofed.
    // Use req.ip as the primary source — Express resolves this correctly when
    // the app has configured `trust proxy`. Only fall back to the raw header
    // as a last resort, using the LAST IP (added by the closest trusted proxy).
    const forwardedFor = req.headers['x-forwarded-for']

    // Primary: req.ip (Express trust-proxy-aware resolved IP)
    const directIp = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress
    if (isValidExternalIp(directIp)) return directIp

    // Secondary: x-real-ip (set by nginx/trusted reverse proxy)
    const realIp = req.headers['x-real-ip']
    if (isValidExternalIp(realIp)) return realIp

    // Last resort: rightmost IP in x-forwarded-for chain (set by the closest proxy)
    if (forwardedFor) {
        const ips = forwardedFor.split(',')
        for (let i = ips.length - 1; i >= 0; i--) {
            const ip = ips[i].trim()
            if (isValidExternalIp(ip)) return ip
        }
    }

    return undefined
}

// =============================================================================
// Exports
// =============================================================================

export default {
    buildMerchantSoftware,
    buildMerchant,
    formatPhoneForJPMC,
    getClientIp
}
