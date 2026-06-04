/**
 * Address Formatter
 * 
 * Utilities for formatting addresses according to JPMC API requirements.
 * JPMC expects specific field names: line1, line2, city, state, postalCode, countryCode
 * 
 * @module utils/formatters/address-formatter
 */

import { convertCountryCode } from './country-codes'

/**
 * Format billing address for JPMC API
 * 
 * Converts various input formats to JPMC-expected format:
 * - address1/address2 → line1/line2
 * - stateCode → state
 * - country → countryCode (3-letter ISO)
 * 
 * @param {object} address - Input address object
 * @returns {object|null} Formatted address or null if empty
 * 
 * @example
 * formatBillingAddress({
 *   address1: '123 Main St',
 *   address2: 'Apt 4',
 *   city: 'Los Angeles',
 *   stateCode: 'CA',
 *   postalCode: '90001',
 *   country: 'US'
 * })
 * // Returns:
 * // {
 * //   line1: '123 Main St',
 * //   line2: 'Apt 4',
 * //   city: 'Los Angeles',
 * //   state: 'CA',
 * //   postalCode: '90001',
 * //   countryCode: 'USA'
 * // }
 */
export const formatBillingAddress = (address) => {
    if (!address) {
        return null
    }
    
    // Get country code (convert 2-letter to 3-letter) - value from SFCC basket
    const countryCode = convertCountryCode(
        address.countryCode || address.country
    )
    
    // Build formatted address
    const formatted = {
        line1: address.line1 || address.address1 || '',
        city: address.city || '',
        state: address.state || address.stateCode || '',
        postalCode: address.postalCode || address.zipCode || '',
        countryCode
    }
    
    // Add line2 only if present (JPMC doesn't want empty line2)
    const line2 = address.line2 || address.address2
    if (line2) {
        formatted.line2 = line2
    }
    
    return formatted
}

/**
 * Format shipping address for JPMC API
 * 
 * Similar to billing address but may include recipient info.
 * 
 * @param {object} address - Input address object
 * @param {object} recipient - Optional recipient info { firstName, lastName }
 * @returns {object|null} Formatted address or null if empty
 */
export const formatShippingAddress = (address, recipient = null) => {
    const formatted = formatBillingAddress(address)
    
    if (!formatted) {
        return null
    }
    
    // Add recipient name if provided
    if (recipient) {
        if (recipient.fullName) {
            formatted.recipientName = recipient.fullName
        } else if (recipient.firstName || recipient.lastName) {
            formatted.recipientName = [recipient.firstName, recipient.lastName]
                .filter(Boolean)
                .join(' ')
        }
    }
    
    return formatted
}

/**
 * Validate that address has required fields
 * 
 * @param {object} address - Address to validate
 * @param {object} options - Validation options
 * @param {boolean} options.requireLine2 - Require line2 (default: false)
 * @param {boolean} options.requireState - Require state (default: true)
 * @returns {object} { valid: boolean, errors: object }
 */
export const validateAddress = (address, options = {}) => {
    const { requireLine2 = false, requireState = true } = options
    const errors = {}
    
    if (!address) {
        return {
            valid: false,
            errors: { address: 'Address is required' }
        }
    }
    
    // Check line1
    const line1 = address.line1 || address.address1
    if (!line1?.trim()) {
        errors.line1 = 'Street address is required'
    }
    
    // Check line2 (optional by default)
    if (requireLine2) {
        const line2 = address.line2 || address.address2
        if (!line2?.trim()) {
            errors.line2 = 'Address line 2 is required'
        }
    }
    
    // Check city
    if (!address.city?.trim()) {
        errors.city = 'City is required'
    }
    
    // Check state
    if (requireState) {
        const state = address.state || address.stateCode
        if (!state?.trim()) {
            errors.state = 'State is required'
        }
    }
    
    // Check postal code
    const postalCode = address.postalCode || address.zipCode
    if (!postalCode?.trim()) {
        errors.postalCode = 'Postal code is required'
    }
    
    return {
        valid: Object.keys(errors).length === 0,
        errors
    }
}

/**
 * Check if two addresses are equal (for comparison)
 * 
 * @param {object} addr1 - First address
 * @param {object} addr2 - Second address
 * @returns {boolean} True if addresses are equal
 */
export const areAddressesEqual = (addr1, addr2) => {
    if (!addr1 || !addr2) {
        return addr1 === addr2
    }
    
    const formatted1 = formatBillingAddress(addr1)
    const formatted2 = formatBillingAddress(addr2)
    
    if (!formatted1 || !formatted2) {
        return false
    }
    
    return (
        formatted1.line1 === formatted2.line1 &&
        (formatted1.line2 || '') === (formatted2.line2 || '') &&
        formatted1.city === formatted2.city &&
        formatted1.state === formatted2.state &&
        formatted1.postalCode === formatted2.postalCode &&
        formatted1.countryCode === formatted2.countryCode
    )
}

export default {
    formatBillingAddress,
    formatShippingAddress,
    validateAddress,
    areAddressesEqual
}
