/**
 * Validation Module Index
 * 
 * Re-exports validation utilities from the validation folder.
 * 
 * @module utils/validation
 */

// Luhn algorithm
export { luhnCheck, calculateCheckDigit } from './luhn'

// Input validation for API requests
export {
    validateAmount,
    validateCurrency,
    validateOrderNumber,
    validateStringField,
    validateCardExpiry,
    validateBillingAddress,
    validatePaymentRequest
} from './input-validation'

// Zipcode validation for US and CA locales
export {
    validateZipcode,
    validateBillingAddressZipcode,
    validateShippingAddressZipcode,
    validateAddressZipcodes,
    requiresZipcodeValidation
} from './zipcode-validation'
