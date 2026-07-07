/**
 * Input Validation Module
 * 
 * Server-side input validation for API request payloads.
 * Validates payment and order data before processing.
 * 
 * Design principles:
 * - Fail fast with clear error messages
 * - Accept valid edge cases (don't be overly strict)
 * - Log warnings for suspicious but valid data
 * 
 * @module utils/validation/input-validation
 */

import logger from '../logger'
import { toMinorUnits } from '../currency.js'

// =============================================================================
// Constants
// =============================================================================

/**
 * ISO 4217 currency codes we support
 * Add more as needed - this is intentionally permissive
 */
const SUPPORTED_CURRENCIES = new Set([
    'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'INR', 'CHF', 'SEK',
    'NZD', 'MXN', 'SGD', 'HKD', 'NOK', 'KRW', 'TRY', 'RUB', 'BRL', 'ZAR'
])

/**
 * Maximum reasonable payment amount in major currency units.
 * 1,000,000 = $1,000,000 USD equivalent.
 * Adjust based on your business requirements.
 * This is multiplied by currency exponent to get minor units for validation.
 */
const MAX_PAYMENT_AMOUNT_MAJOR = 1_000_000

/**
 * Order number validation - SFCC order numbers are alphanumeric
 * Supports: 00001234, ORDER-123, ord_abc123, etc.
 */
const ORDER_NUMBER_PATTERN = /^[A-Za-z0-9_-]{1,50}$/

/**
 * Maximum string lengths for various fields
 */
const MAX_LENGTHS = {
    merchantOrderNumber: 50,
    cardHolderName: 100,
    addressLine: 200,
    city: 100,
    postalCode: 20,
    countryCode: 3,
    stateCode: 10,
    phone: 30,
    email: 254
}

// =============================================================================
// Validation Result Type
// =============================================================================

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string} [error] - Error message if invalid
 * @property {string} [field] - Field name that failed validation
 * @property {string} [code] - Error code for programmatic handling
 */

// =============================================================================
// Amount Validation
// =============================================================================

/**
 * Validate payment amount
 * 
 * @param {*} amount - Amount to validate (in minor units - cents, yen, etc.)
 * @param {string} currency - ISO 4217 currency code for max amount calculation
 * @returns {ValidationResult}
 */
export const validateAmount = (amount, currency = 'USD') => {
    // Must be present
    if (amount === undefined || amount === null) {
        return { valid: false, field: 'amount', code: 'REQUIRED', error: 'Amount is required' }
    }

    // Must be a number (accept strings that can be parsed)
    const numAmount = typeof amount === 'string' ? Number.parseFloat(amount) : amount
    
    if (typeof numAmount !== 'number' || Number.isNaN(numAmount)) {
        return { valid: false, field: 'amount', code: 'INVALID_TYPE', error: 'Amount must be a number' }
    }

    // Must be positive
    if (numAmount <= 0) {
        return { valid: false, field: 'amount', code: 'INVALID_RANGE', error: 'Amount must be greater than 0' }
    }

    // Must be within reasonable range (converted to minor units for currency)
    const maxMinorUnits = toMinorUnits(MAX_PAYMENT_AMOUNT_MAJOR, currency)
    if (numAmount > maxMinorUnits) {
        logger.warn('[Validation] Suspiciously large amount:', numAmount)
        return { valid: false, field: 'amount', code: 'EXCEEDS_MAX', error: `Amount exceeds maximum allowed for ${currency}` }
    }

    // Warn on very small amounts (might be test data or error)
    if (numAmount < 1) {
        logger.warn('[Validation] Very small amount:', numAmount)
        // Still valid - fractional cents might be intentional
    }

    return { valid: true }
}

// =============================================================================
// Currency Validation
// =============================================================================

/**
 * Validate currency code
 * 
 * @param {*} currency - Currency code to validate
 * @returns {ValidationResult}
 */
export const validateCurrency = (currency) => {
    // Must be present
    if (!currency) {
        return { valid: false, field: 'currency', code: 'REQUIRED', error: 'Currency is required' }
    }

    // Must be a string
    if (typeof currency !== 'string') {
        return { valid: false, field: 'currency', code: 'INVALID_TYPE', error: 'Currency must be a string' }
    }

    // Normalize to uppercase
    const normalized = currency.toUpperCase().trim()

    // Must be 3 characters (ISO 4217)
    if (normalized.length !== 3) {
        return { valid: false, field: 'currency', code: 'INVALID_FORMAT', error: 'Currency must be a 3-letter ISO 4217 code' }
    }

    // Check against known currencies (warn but don't reject unknown)
    if (!SUPPORTED_CURRENCIES.has(normalized)) {
        logger.warn('[Validation] Unknown currency code:', normalized)
        // Still valid - might be a currency we haven't listed
    }

    return { valid: true }
}

// =============================================================================
// Order Number Validation
// =============================================================================

/**
 * Validate order number (for path parameters)
 * 
 * @param {*} orderNo - Order number to validate
 * @returns {ValidationResult}
 */
export const validateOrderNumber = (orderNo) => {
    // Must be present
    if (!orderNo) {
        return { valid: false, field: 'orderNo', code: 'REQUIRED', error: 'Order number is required' }
    }

    // Must be a string
    if (typeof orderNo !== 'string') {
        return { valid: false, field: 'orderNo', code: 'INVALID_TYPE', error: 'Order number must be a string' }
    }

    // Check format - alphanumeric with hyphens/underscores
    if (!ORDER_NUMBER_PATTERN.test(orderNo)) {
        logger.warn('[Validation] Invalid order number format:', orderNo.substring(0, 20))
        return { 
            valid: false, 
            field: 'orderNo', 
            code: 'INVALID_FORMAT', 
            error: 'Order number contains invalid characters or exceeds maximum length' 
        }
    }

    // Check for path traversal attempts
    if (orderNo.includes('..') || orderNo.includes('/') || orderNo.includes('\\')) {
        logger.error('[Validation] Path traversal attempt in order number:', orderNo)
        return { valid: false, field: 'orderNo', code: 'SECURITY_VIOLATION', error: 'Invalid order number' }
    }

    return { valid: true }
}

// =============================================================================
// String Field Validation
// =============================================================================

/**
 * Validate a string field with max length
 * 
 * @param {*} value - Value to validate
 * @param {string} fieldName - Field name for error messages
 * @param {number} maxLength - Maximum allowed length
 * @param {boolean} required - Whether field is required
 * @returns {ValidationResult}
 */
export const validateStringField = (value, fieldName, maxLength, required = false) => {
    // Check required
    if (required && (value === undefined || value === null || value === '')) {
        return { valid: false, field: fieldName, code: 'REQUIRED', error: `${fieldName} is required` }
    }

    // If not provided and not required, it's valid
    if (value === undefined || value === null) {
        return { valid: true }
    }

    // Must be string
    if (typeof value !== 'string') {
        return { valid: false, field: fieldName, code: 'INVALID_TYPE', error: `${fieldName} must be a string` }
    }

    // Check length
    if (value.length > maxLength) {
        return { 
            valid: false, 
            field: fieldName, 
            code: 'EXCEEDS_MAX_LENGTH', 
            error: `${fieldName} exceeds maximum length of ${maxLength}` 
        }
    }

    return { valid: true }
}

// =============================================================================
// Card Expiry Validation
// =============================================================================

/**
 * Validate card expiry
 * 
 * @param {Object} cardExpiry - Card expiry object {month, year}
 * @returns {ValidationResult}
 */
export const validateCardExpiry = (cardExpiry) => {
    if (!cardExpiry) {
        return { valid: true }  // Optional field
    }

    const { month, year } = cardExpiry

    // Validate month
    const numMonth = typeof month === 'string' ? Number.parseInt(month, 10) : month
    if (typeof numMonth !== 'number' || Number.isNaN(numMonth) || numMonth < 1 || numMonth > 12) {
        return { valid: false, field: 'cardExpiry.month', code: 'INVALID_RANGE', error: 'Expiry month must be between 1 and 12' }
    }

    // Validate year - accept 2-digit or 4-digit
    let numYear = typeof year === 'string' ? Number.parseInt(year, 10) : year
    if (typeof numYear !== 'number' || Number.isNaN(numYear)) {
        return { valid: false, field: 'cardExpiry.year', code: 'INVALID_TYPE', error: 'Expiry year must be a number' }
    }

    // Convert 2-digit year to 4-digit
    if (numYear < 100) {
        numYear += 2000
    }

    // Check year is reasonable (not expired and not too far in future)
    const currentYear = new Date().getFullYear()
    if (numYear < currentYear) {
        return { valid: false, field: 'cardExpiry.year', code: 'EXPIRED', error: 'Card has expired' }
    }
    if (numYear > currentYear + 20) {
        return { valid: false, field: 'cardExpiry.year', code: 'INVALID_RANGE', error: 'Expiry year is too far in the future' }
    }

    return { valid: true }
}

// =============================================================================
// Billing Address Validation
// =============================================================================

/**
 * Validate billing address (loose validation - specific formats vary by country)
 * 
 * @param {Object} address - Address object
 * @returns {ValidationResult}
 */
export const validateBillingAddress = (address) => {
    if (!address) {
        return { valid: true }  // Optional - some flows don't require it
    }

    // Validate individual fields with max lengths
    const fields = [
        { name: 'address1', maxLength: MAX_LENGTHS.addressLine },
        { name: 'address2', maxLength: MAX_LENGTHS.addressLine },
        { name: 'city', maxLength: MAX_LENGTHS.city },
        { name: 'postalCode', maxLength: MAX_LENGTHS.postalCode },
        { name: 'countryCode', maxLength: MAX_LENGTHS.countryCode },
        { name: 'stateCode', maxLength: MAX_LENGTHS.stateCode }
    ]

    for (const { name, maxLength } of fields) {
        if (address[name]) {
            const result = validateStringField(address[name], `billingAddress.${name}`, maxLength)
            if (!result.valid) return result
        }
    }

    return { valid: true }
}

// =============================================================================
// Payment Request Validation
// =============================================================================

/**
 * Validate optional fields in payment request
 */
const validateOptionalPaymentFields = ({ currency, token, cardExpiry, merchantOrderNumber, billingAddress }) => {
    if (currency) {
        const currencyResult = validateCurrency(currency)
        if (!currencyResult.valid) return currencyResult
    }
    if (token && cardExpiry) {
        const expiryResult = validateCardExpiry(cardExpiry)
        if (!expiryResult.valid) return expiryResult
    }
    if (merchantOrderNumber) {
        const orderResult = validateStringField(merchantOrderNumber, 'merchantOrderNumber', MAX_LENGTHS.merchantOrderNumber)
        if (!orderResult.valid) return orderResult
    }
    if (billingAddress) {
        const addressResult = validateBillingAddress(billingAddress)
        if (!addressResult.valid) return addressResult
    }
    return { valid: true }
}

/**
 * Validate full payment authorization request
 * 
 * @param {Object} body - Request body
 * @returns {ValidationResult}
 */
export const validatePaymentRequest = (body) => {
    const { amount, currency, card, token, tokenRef, googlePayToken, cardExpiry, merchantOrderNumber, billingAddress } = body

    const amountResult = validateAmount(amount, currency)
    if (!amountResult.valid) return amountResult

    // Accept tokenRef (encrypted token) as valid payment method
    if (!card && !token && !tokenRef && !googlePayToken) {
        return { valid: false, field: 'paymentMethod', code: 'REQUIRED', error: 'One of card, token, tokenRef, or googlePayToken is required' }
    }

    return validateOptionalPaymentFields({ currency, token: token || tokenRef, cardExpiry, merchantOrderNumber, billingAddress })
}

// =============================================================================
// Exports
// =============================================================================

export default {
    validateAmount,
    validateCurrency,
    validateOrderNumber,
    validateStringField,
    validateCardExpiry,
    validateBillingAddress,
    validatePaymentRequest,
    MAX_LENGTHS,
    SUPPORTED_CURRENCIES
}
