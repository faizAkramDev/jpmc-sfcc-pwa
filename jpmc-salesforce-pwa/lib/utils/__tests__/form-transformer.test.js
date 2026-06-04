/**
 * Form Transformer Unit Tests
 * 
 * Tests for transformPWAKitFormData and related utilities
 */

import {
    transformPWAKitFormData,
    mapPWAKitCardType,
    parseExpiryDate,
    transformBillingAddress
} from '../form-transformer'

describe('form-transformer', () => {
    // =========================================================================
    // mapPWAKitCardType Tests
    // =========================================================================
    
    describe('mapPWAKitCardType', () => {
        it('should map PWA Kit visa to SFCC Visa', () => {
            expect(mapPWAKitCardType('visa')).toBe('Visa')
        })

        it('should map PWA Kit "master card" to SFCC Master Card', () => {
            expect(mapPWAKitCardType('master card')).toBe('Master Card')
        })

        it('should map PWA Kit mastercard to SFCC Master Card', () => {
            expect(mapPWAKitCardType('mastercard')).toBe('Master Card')
        })

        it('should map PWA Kit "american express" to SFCC Amex', () => {
            expect(mapPWAKitCardType('american express')).toBe('Amex')
        })

        it('should map PWA Kit "american-express" to SFCC Amex', () => {
            expect(mapPWAKitCardType('american-express')).toBe('Amex')
        })

        it('should map PWA Kit amex to SFCC Amex', () => {
            expect(mapPWAKitCardType('amex')).toBe('Amex')
        })

        it('should map PWA Kit discover to SFCC Discover', () => {
            expect(mapPWAKitCardType('discover')).toBe('Discover')
        })

        it('should map PWA Kit jcb to SFCC JCB', () => {
            expect(mapPWAKitCardType('jcb')).toBe('JCB')
        })

        it('should map PWA Kit diners to SFCC DinersClub', () => {
            expect(mapPWAKitCardType('diners')).toBe('DinersClub')
        })

        it('should map PWA Kit "diners club" to SFCC DinersClub', () => {
            expect(mapPWAKitCardType('diners club')).toBe('DinersClub')
        })

        it('should map PWA Kit unionpay to SFCC China UnionPay', () => {
            expect(mapPWAKitCardType('unionpay')).toBe('China UnionPay')
        })

        it('should map PWA Kit "china unionpay" to SFCC China UnionPay', () => {
            expect(mapPWAKitCardType('china unionpay')).toBe('China UnionPay')
        })

        it('should map PWA Kit cup to SFCC China UnionPay', () => {
            expect(mapPWAKitCardType('cup')).toBe('China UnionPay')
        })

        it('should handle case-insensitive input', () => {
            expect(mapPWAKitCardType('VISA')).toBe('Visa')
            expect(mapPWAKitCardType('MasterCard')).toBe('Master Card')
            expect(mapPWAKitCardType('AMERICAN EXPRESS')).toBe('Amex')
        })

        it('should handle whitespace in input', () => {
            expect(mapPWAKitCardType('  visa  ')).toBe('Visa')
            expect(mapPWAKitCardType(' master card ')).toBe('Master Card')
        })

        it('should default to Visa for unknown card type', () => {
            expect(mapPWAKitCardType('unknown')).toBe('Visa')
        })

        it('should default to Visa for null/undefined', () => {
            expect(mapPWAKitCardType(null)).toBe('Visa')
            expect(mapPWAKitCardType(undefined)).toBe('Visa')
        })
    })

    // =========================================================================
    // parseExpiryDate Tests
    // =========================================================================
    
    describe('parseExpiryDate', () => {
        it('should parse MM/YY format', () => {
            const result = parseExpiryDate('12/25')
            expect(result.month).toBe(12)
            expect(result.year).toBe(2025)
        })

        it('should parse MM/YYYY format', () => {
            const result = parseExpiryDate('03/2026')
            expect(result.month).toBe(3)
            expect(result.year).toBe(2026)
        })

        it('should handle single-digit month', () => {
            const result = parseExpiryDate('1/25')
            expect(result.month).toBe(1)
            expect(result.year).toBe(2025)
        })

        it('should handle whitespace around separator', () => {
            const result = parseExpiryDate('06 / 27')
            expect(result.month).toBe(6)
            expect(result.year).toBe(2027)
        })

        it('should throw for invalid format (no separator)', () => {
            expect(() => parseExpiryDate('1225')).toThrow('Invalid expiry date format')
        })

        it('should throw for invalid format (wrong separator)', () => {
            expect(() => parseExpiryDate('12-25')).toThrow('Invalid expiry date format')
        })

        it('should throw for invalid month (0)', () => {
            expect(() => parseExpiryDate('00/25')).toThrow('Invalid expiry month')
        })

        it('should throw for invalid month (13)', () => {
            expect(() => parseExpiryDate('13/25')).toThrow('Invalid expiry month')
        })

        it('should throw for invalid month (non-numeric)', () => {
            expect(() => parseExpiryDate('ab/25')).toThrow('Invalid expiry month')
        })

        it('should throw for invalid year (non-numeric)', () => {
            expect(() => parseExpiryDate('12/ab')).toThrow('Invalid expiry year')
        })

        it('should throw for null/undefined', () => {
            expect(() => parseExpiryDate(null)).toThrow('Invalid expiry date')
            expect(() => parseExpiryDate(undefined)).toThrow('Invalid expiry date')
        })

        it('should throw for non-string input', () => {
            expect(() => parseExpiryDate(1225)).toThrow('Invalid expiry date')
        })
    })

    // =========================================================================
    // transformBillingAddress Tests
    // =========================================================================
    
    describe('transformBillingAddress', () => {
        it('should transform complete address', () => {
            const input = {
                firstName: 'John',
                lastName: 'Doe',
                address1: '123 Main St',
                address2: 'Apt 4',
                city: 'New York',
                stateCode: 'NY',
                postalCode: '10001',
                countryCode: 'US',
                phone: '555-123-4567'
            }

            const result = transformBillingAddress(input)

            expect(result).toEqual({
                firstName: 'John',
                lastName: 'Doe',
                address1: '123 Main St',
                address2: 'Apt 4',
                city: 'New York',
                stateCode: 'NY',
                postalCode: '10001',
                countryCode: 'US',
                phone: '555-123-4567'
            })
        })

        it('should handle missing optional fields', () => {
            const input = {
                firstName: 'John',
                lastName: 'Doe',
                address1: '123 Main St',
                city: 'New York',
                stateCode: 'NY',
                postalCode: '10001'
            }

            const result = transformBillingAddress(input)

            expect(result.address2).toBe('')
            expect(result.countryCode).toBe('US')
            expect(result.phone).toBe('')
        })

        it('should default countryCode to US', () => {
            const input = {
                firstName: 'John',
                lastName: 'Doe',
                address1: '123 Main St',
                city: 'New York',
                stateCode: 'NY',
                postalCode: '10001'
            }

            const result = transformBillingAddress(input)
            expect(result.countryCode).toBe('US')
        })

        it('should return undefined for null address', () => {
            expect(transformBillingAddress(null)).toBeUndefined()
        })

        it('should return undefined for undefined address', () => {
            expect(transformBillingAddress(undefined)).toBeUndefined()
        })
    })

    // =========================================================================
    // transformPWAKitFormData Tests
    // =========================================================================
    
    describe('transformPWAKitFormData', () => {
        const validFormValues = {
            number: '4111 1111 1111 1111',
            holder: 'John Doe',
            expiry: '12/25',
            securityCode: '123',
            cardType: 'visa'
        }

        const validBillingAddress = {
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Main St',
            city: 'New York',
            stateCode: 'NY',
            postalCode: '10001',
            countryCode: 'US'
        }

        it('should transform valid form data with billing address', () => {
            const result = transformPWAKitFormData(validFormValues, validBillingAddress)

            expect(result).toEqual({
                cardNumber: '4111111111111111',
                cvv: '123',
                expiryMonth: 12,
                expiryYear: 2025,
                holder: 'John Doe',
                cardType: 'Visa',
                billingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    address2: '',
                    city: 'New York',
                    stateCode: 'NY',
                    postalCode: '10001',
                    countryCode: 'US',
                    phone: ''
                }
            })
        })

        it('should transform valid form data without billing address', () => {
            const result = transformPWAKitFormData(validFormValues, null)

            expect(result.cardNumber).toBe('4111111111111111')
            expect(result.billingAddress).toBeUndefined()
        })

        it('should strip spaces from card number', () => {
            const formValues = { ...validFormValues, number: '4111 1111 1111 1111' }
            const result = transformPWAKitFormData(formValues)
            expect(result.cardNumber).toBe('4111111111111111')
        })

        it('should strip dashes from card number', () => {
            const formValues = { ...validFormValues, number: '4111-1111-1111-1111' }
            const result = transformPWAKitFormData(formValues)
            expect(result.cardNumber).toBe('4111111111111111')
        })

        it('should strip dots from card number', () => {
            const formValues = { ...validFormValues, number: '4111.1111.1111.1111' }
            const result = transformPWAKitFormData(formValues)
            expect(result.cardNumber).toBe('4111111111111111')
        })

        it('should handle mastercard type', () => {
            const formValues = { ...validFormValues, cardType: 'master card' }
            const result = transformPWAKitFormData(formValues)
            expect(result.cardType).toBe('Master Card')
        })

        it('should handle amex type', () => {
            const formValues = { ...validFormValues, cardType: 'american express' }
            const result = transformPWAKitFormData(formValues)
            expect(result.cardType).toBe('Amex')
        })

        it('should handle missing holder name', () => {
            const formValues = { ...validFormValues, holder: undefined }
            const result = transformPWAKitFormData(formValues)
            expect(result.holder).toBe('')
        })

        it('should throw for missing formValues', () => {
            expect(() => transformPWAKitFormData(null)).toThrow('formValues is required')
        })

        it('should throw for missing card number', () => {
            const formValues = { ...validFormValues, number: undefined }
            expect(() => transformPWAKitFormData(formValues)).toThrow('Card number is required')
        })

        it('should throw for missing expiry', () => {
            const formValues = { ...validFormValues, expiry: undefined }
            expect(() => transformPWAKitFormData(formValues)).toThrow('Expiry date is required')
        })

        it('should throw for missing security code', () => {
            const formValues = { ...validFormValues, securityCode: undefined }
            expect(() => transformPWAKitFormData(formValues)).toThrow('Security code (CVV) is required')
        })

        it('should handle MM/YYYY expiry format', () => {
            const formValues = { ...validFormValues, expiry: '06/2030' }
            const result = transformPWAKitFormData(formValues)
            expect(result.expiryMonth).toBe(6)
            expect(result.expiryYear).toBe(2030)
        })
    })
})
