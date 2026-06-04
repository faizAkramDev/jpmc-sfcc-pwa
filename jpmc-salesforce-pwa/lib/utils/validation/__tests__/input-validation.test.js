/**
 * Unit Tests for input-validation module
 */

import {
    validateAmount,
    validateCurrency,
    validateOrderNumber,
    validateStringField,
    validateCardExpiry,
    validateBillingAddress,
    validatePaymentRequest
} from '../input-validation'
import inputValidationModule from '../input-validation'

// Mock logger
jest.mock('../../logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}))

describe('input-validation', () => {
    describe('validateAmount', () => {
        it('returns valid for positive numbers', () => {
            expect(validateAmount(100).valid).toBe(true)
            expect(validateAmount(0.50).valid).toBe(true)
            expect(validateAmount(999999).valid).toBe(true)
        })

        it('returns invalid when amount is missing', () => {
            const result = validateAmount(undefined)
            expect(result.valid).toBe(false)
            expect(result.code).toBe('REQUIRED')
        })

        it('returns invalid when amount is null', () => {
            const result = validateAmount(null)
            expect(result.valid).toBe(false)
            expect(result.code).toBe('REQUIRED')
        })

        it('returns invalid when amount is not a number', () => {
            expect(validateAmount('abc').valid).toBe(false)
            expect(validateAmount({}).valid).toBe(false)
            expect(validateAmount(NaN).valid).toBe(false)
        })

        it('returns invalid when amount is zero or negative', () => {
            expect(validateAmount(0).valid).toBe(false)
            expect(validateAmount(-100).valid).toBe(false)
        })

        it('returns invalid when amount exceeds maximum', () => {
            const result = validateAmount(100000001)
            expect(result.valid).toBe(false)
            expect(result.code).toBe('EXCEEDS_MAX')
        })

        it('accepts string numbers', () => {
            expect(validateAmount('100').valid).toBe(true)
            expect(validateAmount('50.25').valid).toBe(true)
        })

        it('warns but accepts very small amounts', () => {
            const result = validateAmount(0.001)
            expect(result.valid).toBe(true)
        })
    })

    describe('validateCurrency', () => {
        it('returns valid for supported currencies', () => {
            expect(validateCurrency('USD').valid).toBe(true)
            expect(validateCurrency('EUR').valid).toBe(true)
            expect(validateCurrency('GBP').valid).toBe(true)
        })

        it('handles lowercase input', () => {
            expect(validateCurrency('usd').valid).toBe(true)
        })

        it('returns invalid when currency is missing', () => {
            const result = validateCurrency('')
            expect(result.valid).toBe(false)
            expect(result.code).toBe('REQUIRED')
        })

        it('returns invalid when currency is not a string', () => {
            const result = validateCurrency(123)
            expect(result.valid).toBe(false)
            expect(result.code).toBe('INVALID_TYPE')
        })

        it('returns invalid when currency is not 3 characters', () => {
            expect(validateCurrency('US').valid).toBe(false)
            expect(validateCurrency('USDD').valid).toBe(false)
        })

        it('warns but accepts unknown currencies', () => {
            const result = validateCurrency('XYZ')
            expect(result.valid).toBe(true) // Unknown but valid format
        })
    })

    describe('validateOrderNumber', () => {
        it('returns valid for alphanumeric order numbers', () => {
            expect(validateOrderNumber('00001234').valid).toBe(true)
            expect(validateOrderNumber('ORDER-123').valid).toBe(true)
            expect(validateOrderNumber('ord_abc123').valid).toBe(true)
        })

        it('returns invalid when order number is missing', () => {
            const result = validateOrderNumber('')
            expect(result.valid).toBe(false)
            expect(result.code).toBe('REQUIRED')
        })

        it('returns invalid when order number is not a string', () => {
            const result = validateOrderNumber(123)
            expect(result.valid).toBe(false)
            expect(result.code).toBe('INVALID_TYPE')
        })

        it('returns invalid for path traversal attempts', () => {
            expect(validateOrderNumber('../etc/passwd').valid).toBe(false)
            expect(validateOrderNumber('order/123').valid).toBe(false)
            expect(validateOrderNumber('order\\123').valid).toBe(false)
        })

        it('returns invalid for invalid characters', () => {
            expect(validateOrderNumber('order@123').valid).toBe(false)
            expect(validateOrderNumber('order#123').valid).toBe(false)
        })
    })

    describe('validateStringField', () => {
        it('returns valid for strings within max length', () => {
            expect(validateStringField('test', 'fieldName', 10).valid).toBe(true)
        })

        it('returns valid when optional field is missing', () => {
            expect(validateStringField(undefined, 'fieldName', 10, false).valid).toBe(true)
            expect(validateStringField(null, 'fieldName', 10, false).valid).toBe(true)
        })

        it('returns invalid when required field is missing', () => {
            const result = validateStringField('', 'fieldName', 10, true)
            expect(result.valid).toBe(false)
            expect(result.code).toBe('REQUIRED')
        })

        it('returns invalid when value is not a string', () => {
            const result = validateStringField(123, 'fieldName', 10)
            expect(result.valid).toBe(false)
            expect(result.code).toBe('INVALID_TYPE')
        })

        it('returns invalid when string exceeds max length', () => {
            const result = validateStringField('this is too long', 'fieldName', 5)
            expect(result.valid).toBe(false)
            expect(result.code).toBe('EXCEEDS_MAX_LENGTH')
        })
    })

    describe('validateCardExpiry', () => {
        it('returns valid when expiry is not provided (optional)', () => {
            expect(validateCardExpiry(undefined).valid).toBe(true)
            expect(validateCardExpiry(null).valid).toBe(true)
        })

        it('returns valid for valid expiry', () => {
            const currentYear = new Date().getFullYear()
            expect(validateCardExpiry({ month: 12, year: currentYear + 1 }).valid).toBe(true)
        })

        it('returns valid for 2-digit year', () => {
            expect(validateCardExpiry({ month: 6, year: 30 }).valid).toBe(true)
        })

        it('returns invalid for invalid month', () => {
            expect(validateCardExpiry({ month: 0, year: 2030 }).valid).toBe(false)
            expect(validateCardExpiry({ month: 13, year: 2030 }).valid).toBe(false)
        })

        it('returns invalid for expired card', () => {
            const result = validateCardExpiry({ month: 1, year: 2020 })
            expect(result.valid).toBe(false)
            expect(result.code).toBe('EXPIRED')
        })

        it('returns invalid for year too far in future', () => {
            const result = validateCardExpiry({ month: 1, year: 2100 })
            expect(result.valid).toBe(false)
            expect(result.code).toBe('INVALID_RANGE')
        })

        it('accepts string month/year', () => {
            expect(validateCardExpiry({ month: '12', year: '2030' }).valid).toBe(true)
        })

        it('returns invalid for non-numeric year', () => {
            const result = validateCardExpiry({ month: 12, year: 'abc' })
            expect(result.valid).toBe(false)
            expect(result.code).toBe('INVALID_TYPE')
        })
    })

    describe('validateBillingAddress', () => {
        it('returns valid when address is not provided (optional)', () => {
            expect(validateBillingAddress(undefined).valid).toBe(true)
            expect(validateBillingAddress(null).valid).toBe(true)
        })

        it('returns valid for valid address', () => {
            const result = validateBillingAddress({
                address1: '123 Main St',
                city: 'New York',
                postalCode: '10001',
                countryCode: 'US'
            })
            expect(result.valid).toBe(true)
        })

        it('returns invalid when field exceeds max length', () => {
            const result = validateBillingAddress({
                city: 'A'.repeat(200) // Exceeds MAX_LENGTHS.city
            })
            expect(result.valid).toBe(false)
        })

        it('returns valid for empty address object', () => {
            expect(validateBillingAddress({}).valid).toBe(true)
        })
    })

    describe('validatePaymentRequest', () => {
        it('returns valid for complete payment request', () => {
            const result = validatePaymentRequest({
                amount: 100,
                currency: 'USD',
                card: { number: '4111111111111111' }
            })
            expect(result.valid).toBe(true)
        })

        it('returns invalid when amount is missing', () => {
            const result = validatePaymentRequest({
                currency: 'USD',
                card: { number: '4111111111111111' }
            })
            expect(result.valid).toBe(false)
        })

        it('returns invalid when no payment method provided', () => {
            const result = validatePaymentRequest({ amount: 100 })
            expect(result.valid).toBe(false)
            expect(result.field).toBe('paymentMethod')
        })

        it('accepts token as payment method', () => {
            const result = validatePaymentRequest({
                amount: 100,
                token: 'tok_123'
            })
            expect(result.valid).toBe(true)
        })

        it('accepts googlePayToken as payment method', () => {
            const result = validatePaymentRequest({
                amount: 100,
                googlePayToken: 'gpay_token_123'
            })
            expect(result.valid).toBe(true)
        })

        it('validates optional fields when provided', () => {
            const currentYear = new Date().getFullYear()
            const result = validatePaymentRequest({
                amount: 100,
                token: 'tok_123',
                currency: 'USD',
                cardExpiry: { month: 12, year: currentYear + 1 },
                merchantOrderNumber: 'ORDER-123',
                billingAddress: { city: 'NYC' }
            })
            expect(result.valid).toBe(true)
        })
    })

    describe('MAX_LENGTHS', () => {
        it('exports expected max lengths', () => {
            const MAX_LENGTHS = inputValidationModule.MAX_LENGTHS
            expect(MAX_LENGTHS.merchantOrderNumber).toBe(50)
            expect(MAX_LENGTHS.cardHolderName).toBe(100)
            expect(MAX_LENGTHS.email).toBe(254)
        })

        it('includes all required field lengths', () => {
            const MAX_LENGTHS = inputValidationModule.MAX_LENGTHS
            expect(MAX_LENGTHS.addressLine).toBeDefined()
            expect(MAX_LENGTHS.city).toBeDefined()
            expect(MAX_LENGTHS.postalCode).toBeDefined()
            expect(MAX_LENGTHS.countryCode).toBeDefined()
            expect(MAX_LENGTHS.stateCode).toBeDefined()
            expect(MAX_LENGTHS.phone).toBeDefined()
        })
    })

    describe('SUPPORTED_CURRENCIES', () => {
        it('exports supported currencies set', () => {
            const SUPPORTED_CURRENCIES = inputValidationModule.SUPPORTED_CURRENCIES
            expect(SUPPORTED_CURRENCIES).toBeDefined()
            expect(SUPPORTED_CURRENCIES.has('USD')).toBe(true)
            expect(SUPPORTED_CURRENCIES.has('EUR')).toBe(true)
        })
    })
})
