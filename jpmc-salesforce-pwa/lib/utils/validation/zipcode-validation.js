/**
 * Zipcode Validation Module
 * 
 * Server-side zipcode validation for US and CA locales.
 * Validates postal codes before JPMC API calls to prevent
 * unnecessary API requests with invalid address data.
 * 
 * Supported formats:
 * - US: 5 digits (12345) or ZIP+4 (12345-6789)
 * - CA: A1A 1A1 or A1A1A1 (alternating letter-digit pattern)
 * 
 * @module utils/validation/zipcode-validation
 */

import logger from '../logger'

// =============================================================================
// Constants
// =============================================================================

/**
 * US ZIP code patterns
 * - Basic: 5 digits (e.g., 12345)
 * - ZIP+4: 5 digits, hyphen, 4 digits (e.g., 12345-6789)
 */
const US_ZIPCODE_PATTERN = /^[0-9]{5}(?:-[0-9]{4})?$/

/**
 * Canadian postal code pattern
 * - Format: A1A 1A1 or A1A1A1 (with optional space)
 * - Letters exclude D, F, I, O, Q, U (not used in Canadian postal codes)
 * - First letter cannot be W or Z
 */
const CA_POSTALCODE_PATTERN = /^[ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTV-Z]\s?[0-9][ABCEGHJ-NPRSTV-Z][0-9]$/i

/**
 * Length constraints for postal codes
 */
const ZIPCODE_LENGTH = {
    US_MIN: 5,          // 12345
    US_MAX: 10,         // 12345-6789
    CA_MIN: 6,          // A1A1A1
    CA_MAX: 7,          // A1A 1A1 (with space)
    MAX_INPUT: 20       // Maximum input length to prevent regex DoS
}

/**
 * Country codes that require zipcode validation
 * Maps both 2-letter (ISO 3166-1 alpha-2) and 3-letter (ISO 3166-1 alpha-3) codes
 */
const COUNTRY_CODE_MAP = {
    // United States
    'US': 'US',
    'USA': 'US',
    'UNITED STATES': 'US',
    'UNITED STATES OF AMERICA': 'US',
    
    // Canada
    'CA': 'CA',
    'CAN': 'CA',
    'CANADA': 'CA'
}

// =============================================================================
// Validation Result Type
// =============================================================================

/**
 * @typedef {Object} ZipcodeValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string} [error] - Error message if invalid
 * @property {string} [field] - Field name that failed validation
 * @property {string} [code] - Error code for programmatic handling
 */

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Normalize country code/name to standard 2-letter code
 * 
 * @param {string} countryCode - Country code or name (US, USA, CAN, Canada, etc.)
 * @returns {string|null} Normalized 2-letter code or null if not US/CA
 */
const normalizeCountryCode = (countryCode) => {
    if (!countryCode || typeof countryCode !== 'string') {
        return null
    }
    
    const normalized = countryCode.toUpperCase().trim()
    return COUNTRY_CODE_MAP[normalized] || null
}

/**
 * Validate US ZIP code format and length
 * 
 * @param {string} zipcode - Zipcode to validate
 * @returns {{valid: boolean, reason?: string}} Validation result with reason if invalid
 */
const isValidUSZipcode = (zipcode) => {
    if (!zipcode || typeof zipcode !== 'string') {
        return { valid: false, reason: 'missing' }
    }
    
    const cleanZip = zipcode.trim()
    
    // Check length bounds first (prevents regex DoS and provides better error messages)
    if (cleanZip.length < ZIPCODE_LENGTH.US_MIN) {
        return { valid: false, reason: 'too_short' }
    }
    if (cleanZip.length > ZIPCODE_LENGTH.US_MAX) {
        return { valid: false, reason: 'too_long' }
    }
    
    // Validate format
    if (!US_ZIPCODE_PATTERN.test(cleanZip)) {
        return { valid: false, reason: 'invalid_format' }
    }
    
    return { valid: true }
}

/**
 * Validate Canadian postal code format and length
 * 
 * @param {string} postalCode - Postal code to validate
 * @returns {{valid: boolean, reason?: string}} Validation result with reason if invalid
 */
const isValidCAPostalCode = (postalCode) => {
    if (!postalCode || typeof postalCode !== 'string') {
        return { valid: false, reason: 'missing' }
    }
    
    const cleanPostal = postalCode.trim().toUpperCase()
    
    // Check length bounds first (prevents regex DoS and provides better error messages)
    if (cleanPostal.length < ZIPCODE_LENGTH.CA_MIN) {
        return { valid: false, reason: 'too_short' }
    }
    if (cleanPostal.length > ZIPCODE_LENGTH.CA_MAX) {
        return { valid: false, reason: 'too_long' }
    }
    
    // Validate format
    if (!CA_POSTALCODE_PATTERN.test(cleanPostal)) {
        return { valid: false, reason: 'invalid_format' }
    }
    
    return { valid: true }
}

// =============================================================================
// Main Validation Functions
// =============================================================================

/**
 * Validate zipcode/postal code based on country
 * 
 * Only validates US and CA zipcodes. For other countries,
 * validation passes by default (returns valid: true).
 * 
 * @param {string} postalCode - Postal code to validate
 * @param {string} countryCode - Country code (US, USA, CA, CAN, etc.)
 * @returns {ZipcodeValidationResult}
 * 
 * @example
 * // US validation
 * validateZipcode('12345', 'US')      // { valid: true }
 * validateZipcode('12345-6789', 'US') // { valid: true }
 * validateZipcode('1234', 'US')       // { valid: false, error: '...', code: 'INVALID_US_ZIPCODE' }
 * 
 * @example
 * // CA validation
 * validateZipcode('K1A 0B1', 'CA')    // { valid: true }
 * validateZipcode('K1A0B1', 'CAN')    // { valid: true }
 * validateZipcode('12345', 'CA')      // { valid: false, error: '...', code: 'INVALID_CA_POSTALCODE' }
 * 
 * @example
 * // Other countries pass through
 * validateZipcode('SW1A 1AA', 'GB')   // { valid: true } - not validated
 */
export const validateZipcode = (postalCode, countryCode) => {
    const normalizedCountry = normalizeCountryCode(countryCode)
    
    // If not US or CA, skip validation (pass through)
    if (!normalizedCountry) {
        return { valid: true }
    }
    
    // Check if postal code is provided
    if (!postalCode || typeof postalCode !== 'string' || postalCode.trim() === '') {
        return {
            valid: false,
            field: 'postalCode',
            code: 'REQUIRED',
            error: 'Postal code is required'
        }
    }
    
    // Validate based on country
    if (normalizedCountry === 'US') {
        const usResult = isValidUSZipcode(postalCode)
        if (!usResult.valid) {
            logger.warn('[Zipcode Validation] Invalid US zipcode:', postalCode, 'reason:', usResult.reason)
            return {
                valid: false,
                field: 'postalCode',
                code: usResult.reason === 'too_short' ? 'US_ZIPCODE_TOO_SHORT' :
                      usResult.reason === 'too_long' ? 'US_ZIPCODE_TOO_LONG' : 'INVALID_US_ZIPCODE',
                error: 'Invalid US ZIP code format. Expected: 12345 or 12345-6789'
            }
        }
    } else if (normalizedCountry === 'CA') {
        const caResult = isValidCAPostalCode(postalCode)
        if (!caResult.valid) {
            logger.warn('[Zipcode Validation] Invalid CA postal code:', postalCode, 'reason:', caResult.reason)
            return {
                valid: false,
                field: 'postalCode',
                code: caResult.reason === 'too_short' ? 'CA_POSTALCODE_TOO_SHORT' :
                      caResult.reason === 'too_long' ? 'CA_POSTALCODE_TOO_LONG' : 'INVALID_CA_POSTALCODE',
                error: 'Invalid Canadian postal code format. Expected: A1A 1A1'
            }
        }
    }
    
    return { valid: true }
}

/**
 * Validate zipcode from billing address object
 * 
 * Extracts postalCode and countryCode from billing address and validates.
 * Handles both 2-letter and 3-letter country codes, and country names.
 * 
 * @param {Object} billingAddress - Billing address object
 * @param {string} [billingAddress.postalCode] - Postal code
 * @param {string} [billingAddress.countryCode] - Country code (US, USA, etc.)
 * @param {string} [billingAddress.country] - Alternative country field
 * @returns {ZipcodeValidationResult}
 * 
 * @example
 * validateBillingAddressZipcode({
 *   postalCode: '12345',
 *   countryCode: 'US'
 * })
 * // Returns: { valid: true }
 * 
 * @example
 * validateBillingAddressZipcode({
 *   postalCode: 'K1A0B1',
 *   country: 'Canada'
 * })
 * // Returns: { valid: true }
 */
export const validateBillingAddressZipcode = (billingAddress) => {
    // If no billing address provided, skip validation
    if (!billingAddress || typeof billingAddress !== 'object') {
        return { valid: true }
    }
    
    const postalCode = billingAddress.postalCode || billingAddress.zipCode || billingAddress.zip
    const countryCode = billingAddress.countryCode || billingAddress.country
    
    return validateZipcode(postalCode, countryCode)
}

/**
 * Validate zipcode from shipping address object
 * 
 * Extracts postalCode and countryCode from shipping address and validates.
 * Handles both 2-letter and 3-letter country codes, and country names.
 * Supports multiple field naming conventions (shipTo, shippingAddress).
 * 
 * @param {Object} shippingAddress - Shipping address object
 * @param {string} [shippingAddress.postalCode] - Postal code
 * @param {string} [shippingAddress.countryCode] - Country code (US, USA, etc.)
 * @param {string} [shippingAddress.country] - Alternative country field
 * @returns {ZipcodeValidationResult}
 * 
 * @example
 * validateShippingAddressZipcode({
 *   postalCode: '12345',
 *   countryCode: 'US'
 * })
 * // Returns: { valid: true }
 */
export const validateShippingAddressZipcode = (shippingAddress) => {
    // If no shipping address provided, skip validation
    if (!shippingAddress || typeof shippingAddress !== 'object') {
        return { valid: true }
    }
    
    const postalCode = shippingAddress.postalCode || shippingAddress.zipCode || shippingAddress.zip
    const countryCode = shippingAddress.countryCode || shippingAddress.country
    
    return validateZipcode(postalCode, countryCode)
}

/**
 * Validate zipcodes for both billing and shipping addresses
 * 
 * Convenience function to validate both addresses in one call.
 * Returns the first validation failure, or success if both pass.
 * 
 * @param {Object} billingAddress - Billing address object
 * @param {Object} shippingAddress - Shipping address object (e.g., shipTo)
 * @returns {ZipcodeValidationResult}
 * 
 * @example
 * validateAddressZipcodes(
 *   { postalCode: '12345', countryCode: 'US' },
 *   { postalCode: 'K1A 0B1', countryCode: 'CA' }
 * )
 * // Returns: { valid: true }
 */
export const validateAddressZipcodes = (billingAddress, shippingAddress) => {
    // Validate billing address first
    const billingResult = validateBillingAddressZipcode(billingAddress)
    if (!billingResult.valid) {
        return {
            ...billingResult,
            addressType: 'billing'
        }
    }
    
    // Validate shipping address
    const shippingResult = validateShippingAddressZipcode(shippingAddress)
    if (!shippingResult.valid) {
        return {
            ...shippingResult,
            addressType: 'shipping'
        }
    }
    
    return { valid: true }
}

/**
 * Check if country requires zipcode validation
 * 
 * @param {string} countryCode - Country code or name
 * @returns {boolean} True if country requires zipcode validation (US or CA)
 */
export const requiresZipcodeValidation = (countryCode) => {
    return normalizeCountryCode(countryCode) !== null
}

// =============================================================================

export const _testExports = {
    US_ZIPCODE_PATTERN,
    CA_POSTALCODE_PATTERN,
    ZIPCODE_LENGTH,
    normalizeCountryCode,
    isValidUSZipcode,
    isValidCAPostalCode
}

export default {
    validateZipcode,
    validateBillingAddressZipcode,
    validateShippingAddressZipcode,
    validateAddressZipcodes,
    requiresZipcodeValidation
}
