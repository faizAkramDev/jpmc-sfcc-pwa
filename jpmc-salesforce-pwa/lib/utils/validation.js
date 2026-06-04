/**
 * Card Utilities
 * 
 * This module provides utility functions for card data formatting and display.
 * 
 * IMPORTANT: Card validation is handled by SFCC PWA Kit's OOTB validation
 * using the `card-validator` library via `useCreditCardFields` hook.
 * This ensures consistent validation with proper support for all card types
 * (including Amex 4-digit CVV).
 * 
 * @module validation
 */

import { CARD_PATTERNS } from './constants.mjs'

// Re-export from shared Luhn module - single source of truth
export { luhnCheck } from './validation/luhn'

/**
 * Detect card type from card number
 * @param {string} cardNumber - Card number
 * @returns {string|null} Card type or null
 */
export const detectCardType = (cardNumber) => {
    if (!cardNumber) return null

    const cleaned = cardNumber.replace(/\D/g, '')

    for (const [type, pattern] of Object.entries(CARD_PATTERNS)) {
        if (pattern.test(cleaned)) {
            return type
        }
    }

    return null
}

/**
 * Format card number with spaces for display
 * @param {string} cardNumber - Card number
 * @returns {string} Formatted card number
 */
export const formatCardNumber = (cardNumber) => {
    if (!cardNumber) return ''

    const cleaned = cardNumber.replace(/\D/g, '')
    const cardType = detectCardType(cleaned)

    // Amex has different formatting (4-6-5)
    if (cardType === 'amex') {
        const match = cleaned.match(/^(\d{0,4})(\d{0,6})(\d{0,5})$/)
        if (match) {
            return [match[1], match[2], match[3]].filter(Boolean).join(' ')
        }
    }

    // Standard formatting (4-4-4-4)
    const match = cleaned.match(/\d{1,4}/g)
    return match ? match.join(' ') : cleaned
}

/**
 * Mask card number for secure display (show last 4 digits)
 * @param {string} cardNumber - Card number
 * @returns {string} Masked card number
 */
export const maskCardNumber = (cardNumber) => {
    if (!cardNumber) return ''

    const cleaned = cardNumber.replace(/\D/g, '')
    if (cleaned.length < 4) return cardNumber

    return '•••• ' + cleaned.slice(-4)
}
