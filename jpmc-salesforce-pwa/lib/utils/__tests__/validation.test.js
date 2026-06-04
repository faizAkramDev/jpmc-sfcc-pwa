/**
 * Unit Tests for Card Utilities
 * 
 * NOTE: Card validation is handled by SFCC PWA Kit OOTB validation.
 * This file tests utility functions for formatting, display, and type detection.
 *
 * @jest-environment node
 */

const validation = require('../validation')

// =============================================================================
// Test Data
// =============================================================================

const validCards = {
    visa: '4111111111111111',
    visaWithSpaces: '4111 1111 1111 1111',
    mastercard: '5500000000000004',
    amex: '340000000000009',
    discover: '6011000000000004',
    unionpay: '6221234567890123'
}

const invalidCards = {
    failsLuhn: '4111111111111112',
    tooShort: '411111',
    tooLong: '41111111111111111111111',
    allZeros: '0000000000000000',
    letters: '4111abcd11111111'
}

// =============================================================================
// Tests
// =============================================================================

describe('Card Utilities', () => {

    // =========================================================================
    // luhnCheck Tests
    // =========================================================================

    describe('luhnCheck', () => {
        it('should return true for valid Visa card', () => {
            expect(validation.luhnCheck(validCards.visa)).toBe(true)
        })

        it('should return true for valid Mastercard', () => {
            expect(validation.luhnCheck(validCards.mastercard)).toBe(true)
        })

        it('should return true for valid Amex card', () => {
            expect(validation.luhnCheck(validCards.amex)).toBe(true)
        })

        it('should return true for valid Discover card', () => {
            expect(validation.luhnCheck(validCards.discover)).toBe(true)
        })

        it('should return false for card failing Luhn check', () => {
            expect(validation.luhnCheck(invalidCards.failsLuhn)).toBe(false)
        })

        it('should return false for null input', () => {
            expect(validation.luhnCheck(null)).toBe(false)
        })

        it('should return false for undefined input', () => {
            expect(validation.luhnCheck(undefined)).toBe(false)
        })

        it('should return false for empty string', () => {
            expect(validation.luhnCheck('')).toBe(false)
        })

        it('should return false for non-string input', () => {
            expect(validation.luhnCheck(4111111111111111)).toBe(false)
        })

        it('should strip non-digit characters before validation', () => {
            expect(validation.luhnCheck(validCards.visaWithSpaces)).toBe(true)
            expect(validation.luhnCheck('4111-1111-1111-1111')).toBe(true)
        })

        it('should return false for card number too short', () => {
            expect(validation.luhnCheck(invalidCards.tooShort)).toBe(false)
        })

        it('should return false for card number too long', () => {
            expect(validation.luhnCheck(invalidCards.tooLong)).toBe(false)
        })
    })

    // =========================================================================
    // detectCardType Tests
    // =========================================================================

    describe('detectCardType', () => {
        it('should detect Visa card', () => {
            expect(validation.detectCardType(validCards.visa)).toBe('visa')
        })

        it('should detect Mastercard', () => {
            expect(validation.detectCardType(validCards.mastercard)).toBe('mc')
        })

        it('should detect Amex card', () => {
            expect(validation.detectCardType(validCards.amex)).toBe('amex')
        })

        it('should detect Discover card', () => {
            expect(validation.detectCardType(validCards.discover)).toBe('discover')
        })

        it('should detect China UnionPay card', () => {
            expect(validation.detectCardType(validCards.unionpay)).toBe('unionpay')
        })

        it('should return null for unrecognized card', () => {
            expect(validation.detectCardType('1234567890123456')).toBeNull()
        })

        it('should return null for null input', () => {
            expect(validation.detectCardType(null)).toBeNull()
        })

        it('should return null for empty string', () => {
            expect(validation.detectCardType('')).toBeNull()
        })

        it('should strip non-digit characters before detection', () => {
            expect(validation.detectCardType(validCards.visaWithSpaces)).toBe('visa')
        })

        it('should detect card type from partial number', () => {
            expect(validation.detectCardType('4111')).toBeNull() // Too short for full match
        })
    })

    // =========================================================================
    // formatCardNumber Tests
    // =========================================================================

    describe('formatCardNumber', () => {
        it('should format standard card with 4-4-4-4 spacing', () => {
            expect(validation.formatCardNumber('4111111111111111')).toBe('4111 1111 1111 1111')
        })

        it('should format Amex with 4-6-5 spacing', () => {
            expect(validation.formatCardNumber('340000000000009')).toBe('3400 000000 00009')
        })

        it('should handle partial card numbers', () => {
            expect(validation.formatCardNumber('4111')).toBe('4111')
            expect(validation.formatCardNumber('41111111')).toBe('4111 1111')
        })

        it('should return empty string for null input', () => {
            expect(validation.formatCardNumber(null)).toBe('')
        })

        it('should return empty string for empty input', () => {
            expect(validation.formatCardNumber('')).toBe('')
        })

        it('should strip existing formatting before reformatting', () => {
            expect(validation.formatCardNumber('4111 1111 1111 1111')).toBe('4111 1111 1111 1111')
        })
    })

    // =========================================================================
    // maskCardNumber Tests
    // =========================================================================

    describe('maskCardNumber', () => {
        it('should mask card number showing last 4 digits', () => {
            expect(validation.maskCardNumber('4111111111111111')).toBe('•••• 1111')
        })

        it('should mask formatted card number', () => {
            expect(validation.maskCardNumber('4111 1111 1111 1111')).toBe('•••• 1111')
        })

        it('should mask Amex card', () => {
            expect(validation.maskCardNumber('340000000000009')).toBe('•••• 0009')
        })

        it('should return empty string for null input', () => {
            expect(validation.maskCardNumber(null)).toBe('')
        })

        it('should return empty string for empty input', () => {
            expect(validation.maskCardNumber('')).toBe('')
        })

        it('should handle short card numbers', () => {
            expect(validation.maskCardNumber('123')).toBe('123')
        })
    })
})
