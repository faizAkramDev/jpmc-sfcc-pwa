/**
 * Luhn Algorithm (MOD 10 Check)
 * 
 * Single source of truth for Luhn checksum validation.
 * Used for credit card number validation.
 * 
 * @module utils/validation/luhn
 */

/**
 * Validate card number using Luhn algorithm (MOD 10)
 * 
 * The Luhn algorithm is used to validate credit card numbers:
 * 1. Starting from the rightmost digit, double every second digit
 * 2. If doubling results in a number > 9, subtract 9
 * 3. Sum all digits
 * 4. If sum is divisible by 10, the number is valid
 * 
 * @param {string} cardNumber - Card number to validate (can contain spaces/dashes)
 * @returns {boolean} True if the card number passes Luhn check
 * 
 * @example
 * luhnCheck('4012000033330026')  // true (valid test card)
 * luhnCheck('4012 0000 3333 0026')  // true (handles spaces)
 * luhnCheck('1234567890123456')  // false (invalid)
 */
export const luhnCheck = (cardNumber) => {
    // Handle null/undefined/non-string
    if (!cardNumber || typeof cardNumber !== 'string') {
        return false
    }
    
    // Remove all non-digit characters (spaces, dashes, etc.)
    const digits = cardNumber.replace(/\D/g, '')
    
    // Card numbers are typically 13-19 digits
    if (digits.length < 13 || digits.length > 19) {
        return false
    }
    
    let sum = 0
    let isEven = false
    
    // Process from right to left
    for (let i = digits.length - 1; i >= 0; i--) {
        let digit = Number.parseInt(digits[i], 10)
        
        if (isEven) {
            digit *= 2
            if (digit > 9) {
                digit -= 9
            }
        }
        
        sum += digit
        isEven = !isEven
    }
    
    return sum % 10 === 0
}

/**
 * Calculate Luhn check digit
 * 
 * Given a partial card number, calculate the check digit
 * that would make it valid.
 * 
 * @param {string} partialNumber - Card number without check digit
 * @returns {number} Check digit (0-9)
 * 
 * @example
 * calculateCheckDigit('401200003333002')  // 6
 * // Full valid number: 4012000033330026
 */
export const calculateCheckDigit = (partialNumber) => {
    if (!partialNumber || typeof partialNumber !== 'string') {
        return -1
    }
    
    const digits = partialNumber.replace(/\D/g, '')
    
    // Add a placeholder '0' for the check digit
    const withPlaceholder = digits + '0'
    
    let sum = 0
    let isEven = false
    
    for (let i = withPlaceholder.length - 1; i >= 0; i--) {
        let digit = Number.parseInt(withPlaceholder[i], 10)
        
        if (isEven) {
            digit *= 2
            if (digit > 9) {
                digit -= 9
            }
        }
        
        sum += digit
        isEven = !isEven
    }
    
    // Calculate what check digit would make sum divisible by 10
    return (10 - (sum % 10)) % 10
}

export default {
    luhnCheck,
    calculateCheckDigit
}
