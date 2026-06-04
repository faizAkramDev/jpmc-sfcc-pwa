/**
 * Unit Tests for zipcode-validation module
 */

import {
    validateZipcode,
    validateBillingAddressZipcode,
    validateShippingAddressZipcode,
    validateAddressZipcodes,
    requiresZipcodeValidation,
    _testExports
} from '../zipcode-validation'

// Mock logger
jest.mock('../../logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}))

describe('zipcode-validation', () => {
    describe('validateZipcode', () => {
        describe('US ZIP codes', () => {
            it('returns valid for 5-digit ZIP codes', () => {
                expect(validateZipcode('12345', 'US').valid).toBe(true)
                expect(validateZipcode('00000', 'US').valid).toBe(true)
                expect(validateZipcode('99999', 'US').valid).toBe(true)
            })

            it('returns valid for ZIP+4 format', () => {
                expect(validateZipcode('12345-6789', 'US').valid).toBe(true)
                expect(validateZipcode('00000-0000', 'US').valid).toBe(true)
                expect(validateZipcode('99999-9999', 'US').valid).toBe(true)
            })

            it('handles 3-letter country code USA', () => {
                expect(validateZipcode('12345', 'USA').valid).toBe(true)
                expect(validateZipcode('12345-6789', 'USA').valid).toBe(true)
            })

            it('handles full country name', () => {
                expect(validateZipcode('12345', 'United States').valid).toBe(true)
                expect(validateZipcode('12345', 'UNITED STATES OF AMERICA').valid).toBe(true)
            })

            it('returns invalid for incorrect US ZIP codes', () => {
                expect(validateZipcode('1234', 'US').valid).toBe(false)
                expect(validateZipcode('123456', 'US').valid).toBe(false)
                expect(validateZipcode('1234-5678', 'US').valid).toBe(false)
                expect(validateZipcode('12345-678', 'US').valid).toBe(false)
                expect(validateZipcode('ABCDE', 'US').valid).toBe(false)
                expect(validateZipcode('12 345', 'US').valid).toBe(false)
            })

            it('returns proper error code for too short US ZIP', () => {
                const result = validateZipcode('1234', 'US')
                expect(result.valid).toBe(false)
                expect(result.code).toBe('US_ZIPCODE_TOO_SHORT')
                expect(result.field).toBe('postalCode')
            })

            it('returns proper error code for too long US ZIP', () => {
                const result = validateZipcode('12345678901', 'US')
                expect(result.valid).toBe(false)
                expect(result.code).toBe('US_ZIPCODE_TOO_LONG')
                expect(result.field).toBe('postalCode')
            })

            it('returns proper error code for invalid format US ZIP', () => {
                const result = validateZipcode('ABCDE', 'US')
                expect(result.valid).toBe(false)
                expect(result.code).toBe('INVALID_US_ZIPCODE')
                expect(result.field).toBe('postalCode')
            })

            it('trims whitespace from US ZIP codes', () => {
                expect(validateZipcode('  12345  ', 'US').valid).toBe(true)
                expect(validateZipcode('12345-6789  ', 'US').valid).toBe(true)
            })
        })

        describe('Canadian postal codes', () => {
            it('returns valid for standard format with space (A1A 1A1)', () => {
                expect(validateZipcode('K1A 0B1', 'CA').valid).toBe(true)
                expect(validateZipcode('H3Z 2Y7', 'CA').valid).toBe(true)
                expect(validateZipcode('V6B 3K9', 'CA').valid).toBe(true)
            })

            it('returns valid for compact format without space (A1A1A1)', () => {
                expect(validateZipcode('K1A0B1', 'CA').valid).toBe(true)
                expect(validateZipcode('H3Z2Y7', 'CA').valid).toBe(true)
                expect(validateZipcode('V6B3K9', 'CA').valid).toBe(true)
            })

            it('handles lowercase input', () => {
                expect(validateZipcode('k1a 0b1', 'CA').valid).toBe(true)
                expect(validateZipcode('h3z2y7', 'CA').valid).toBe(true)
            })

            it('handles 3-letter country code CAN', () => {
                expect(validateZipcode('K1A 0B1', 'CAN').valid).toBe(true)
                expect(validateZipcode('K1A0B1', 'CAN').valid).toBe(true)
            })

            it('handles full country name Canada', () => {
                expect(validateZipcode('K1A 0B1', 'Canada').valid).toBe(true)
                expect(validateZipcode('K1A 0B1', 'CANADA').valid).toBe(true)
            })

            it('returns invalid for incorrect Canadian postal codes', () => {
                // Letters not used in Canadian postal codes
                expect(validateZipcode('D1A 0B1', 'CA').valid).toBe(false) // D not allowed first position
                expect(validateZipcode('F1A 0B1', 'CA').valid).toBe(false) // F not allowed first position
                expect(validateZipcode('I1A 0B1', 'CA').valid).toBe(false) // I not allowed first position
                expect(validateZipcode('O1A 0B1', 'CA').valid).toBe(false) // O not allowed first position
                expect(validateZipcode('Q1A 0B1', 'CA').valid).toBe(false) // Q not allowed first position
                expect(validateZipcode('U1A 0B1', 'CA').valid).toBe(false) // U not allowed first position
                expect(validateZipcode('W1A 0B1', 'CA').valid).toBe(false) // W not allowed first position
                expect(validateZipcode('Z1A 0B1', 'CA').valid).toBe(false) // Z not allowed first position
            })

            it('returns invalid for wrong format', () => {
                expect(validateZipcode('12345', 'CA').valid).toBe(false)
                expect(validateZipcode('K1A 0B', 'CA').valid).toBe(false)
                expect(validateZipcode('K1A0B', 'CA').valid).toBe(false)
                expect(validateZipcode('K1A 0B12', 'CA').valid).toBe(false)
                expect(validateZipcode('1K1 A0B', 'CA').valid).toBe(false)
            })

            it('returns proper error code for too short CA postal code', () => {
                const result = validateZipcode('K1A', 'CA')
                expect(result.valid).toBe(false)
                expect(result.code).toBe('CA_POSTALCODE_TOO_SHORT')
                expect(result.field).toBe('postalCode')
            })

            it('returns proper error code for too long CA postal code', () => {
                const result = validateZipcode('K1A 0B1X', 'CA')
                expect(result.valid).toBe(false)
                expect(result.code).toBe('CA_POSTALCODE_TOO_LONG')
                expect(result.field).toBe('postalCode')
            })

            it('returns proper error code for invalid format CA postal code', () => {
                const result = validateZipcode('123456', 'CA')
                expect(result.valid).toBe(false)
                expect(result.code).toBe('INVALID_CA_POSTALCODE')
                expect(result.field).toBe('postalCode')
            })

            it('trims whitespace from Canadian postal codes', () => {
                expect(validateZipcode('  K1A 0B1  ', 'CA').valid).toBe(true)
                expect(validateZipcode('K1A0B1  ', 'CA').valid).toBe(true)
            })
        })

        describe('Other countries', () => {
            it('passes validation for non-US/CA countries', () => {
                expect(validateZipcode('SW1A 1AA', 'GB').valid).toBe(true)
                expect(validateZipcode('10115', 'DE').valid).toBe(true)
                expect(validateZipcode('75001', 'FR').valid).toBe(true)
                expect(validateZipcode('anything', 'AU').valid).toBe(true)
            })

            it('passes validation for unknown country codes', () => {
                expect(validateZipcode('12345', 'XX').valid).toBe(true)
                expect(validateZipcode('anything', 'ZZ').valid).toBe(true)
            })

            it('passes validation when country code is empty', () => {
                expect(validateZipcode('12345', '').valid).toBe(true)
                expect(validateZipcode('12345', null).valid).toBe(true)
                expect(validateZipcode('12345', undefined).valid).toBe(true)
            })
        })

        describe('Missing postal code', () => {
            it('returns invalid when postal code is missing for US', () => {
                const result = validateZipcode('', 'US')
                expect(result.valid).toBe(false)
                expect(result.code).toBe('REQUIRED')
            })

            it('returns invalid when postal code is null for CA', () => {
                const result = validateZipcode(null, 'CA')
                expect(result.valid).toBe(false)
                expect(result.code).toBe('REQUIRED')
            })

            it('returns invalid when postal code is undefined for US', () => {
                const result = validateZipcode(undefined, 'USA')
                expect(result.valid).toBe(false)
                expect(result.code).toBe('REQUIRED')
            })

            it('returns invalid when postal code is only whitespace for CA', () => {
                const result = validateZipcode('   ', 'CAN')
                expect(result.valid).toBe(false)
                expect(result.code).toBe('REQUIRED')
            })
        })
    })

    describe('validateBillingAddressZipcode', () => {
        it('validates using postalCode and countryCode fields', () => {
            const result = validateBillingAddressZipcode({
                postalCode: '12345',
                countryCode: 'US'
            })
            expect(result.valid).toBe(true)
        })

        it('validates using postalCode and country fields', () => {
            const result = validateBillingAddressZipcode({
                postalCode: 'K1A 0B1',
                country: 'CA'
            })
            expect(result.valid).toBe(true)
        })

        it('validates using zipCode alternative field', () => {
            const result = validateBillingAddressZipcode({
                zipCode: '12345',
                countryCode: 'US'
            })
            expect(result.valid).toBe(true)
        })

        it('validates using zip alternative field', () => {
            const result = validateBillingAddressZipcode({
                zip: '12345-6789',
                countryCode: 'USA'
            })
            expect(result.valid).toBe(true)
        })

        it('returns invalid for incorrect US ZIP in billing address', () => {
            const result = validateBillingAddressZipcode({
                postalCode: '1234',
                countryCode: 'US'
            })
            expect(result.valid).toBe(false)
            expect(result.code).toBe('US_ZIPCODE_TOO_SHORT')
        })

        it('returns invalid for incorrect CA postal code in billing address', () => {
            const result = validateBillingAddressZipcode({
                postalCode: '12345',
                countryCode: 'CA'
            })
            expect(result.valid).toBe(false)
            expect(result.code).toBe('CA_POSTALCODE_TOO_SHORT')
        })

        it('passes validation for non-US/CA billing address', () => {
            const result = validateBillingAddressZipcode({
                postalCode: 'SW1A 1AA',
                countryCode: 'GB'
            })
            expect(result.valid).toBe(true)
        })

        it('passes validation when billing address is null', () => {
            expect(validateBillingAddressZipcode(null).valid).toBe(true)
        })

        it('passes validation when billing address is undefined', () => {
            expect(validateBillingAddressZipcode(undefined).valid).toBe(true)
        })

        it('passes validation when billing address is empty object', () => {
            // No country code means we don't know if it's US/CA, so pass
            expect(validateBillingAddressZipcode({}).valid).toBe(true)
        })

        it('handles full billing address object', () => {
            const billingAddress = {
                line1: '123 Main St',
                line2: 'Apt 4',
                city: 'New York',
                state: 'NY',
                postalCode: '10001',
                countryCode: 'US'
            }
            expect(validateBillingAddressZipcode(billingAddress).valid).toBe(true)
        })
    })

    describe('validateShippingAddressZipcode', () => {
        it('validates using postalCode and countryCode fields', () => {
            const result = validateShippingAddressZipcode({
                postalCode: '12345',
                countryCode: 'US'
            })
            expect(result.valid).toBe(true)
        })

        it('validates Canadian shipping addresses', () => {
            const result = validateShippingAddressZipcode({
                postalCode: 'K1A 0B1',
                countryCode: 'CA'
            })
            expect(result.valid).toBe(true)
        })

        it('returns invalid for incorrect US ZIP in shipping address', () => {
            const result = validateShippingAddressZipcode({
                postalCode: '1234',
                countryCode: 'US'
            })
            expect(result.valid).toBe(false)
            expect(result.code).toBe('US_ZIPCODE_TOO_SHORT')
        })

        it('returns invalid for incorrect CA postal code in shipping address', () => {
            const result = validateShippingAddressZipcode({
                postalCode: '12345',
                countryCode: 'CA'
            })
            expect(result.valid).toBe(false)
            expect(result.code).toBe('CA_POSTALCODE_TOO_SHORT')
        })

        it('passes validation when shipping address is null', () => {
            expect(validateShippingAddressZipcode(null).valid).toBe(true)
        })

        it('passes validation when shipping address is undefined', () => {
            expect(validateShippingAddressZipcode(undefined).valid).toBe(true)
        })

        it('handles full shipping address object (shipTo format)', () => {
            const shipTo = {
                line1: '456 Oak Ave',
                city: 'Los Angeles',
                state: 'CA',
                postalCode: '90001',
                countryCode: 'US'
            }
            expect(validateShippingAddressZipcode(shipTo).valid).toBe(true)
        })
    })

    describe('validateAddressZipcodes', () => {
        it('returns valid when both addresses are valid', () => {
            const billing = { postalCode: '12345', countryCode: 'US' }
            const shipping = { postalCode: 'K1A 0B1', countryCode: 'CA' }
            const result = validateAddressZipcodes(billing, shipping)
            expect(result.valid).toBe(true)
        })

        it('returns invalid with addressType=billing when billing fails', () => {
            const billing = { postalCode: '1234', countryCode: 'US' }
            const shipping = { postalCode: 'K1A 0B1', countryCode: 'CA' }
            const result = validateAddressZipcodes(billing, shipping)
            expect(result.valid).toBe(false)
            expect(result.addressType).toBe('billing')
            expect(result.code).toBe('US_ZIPCODE_TOO_SHORT')
        })

        it('returns invalid with addressType=shipping when shipping fails', () => {
            const billing = { postalCode: '12345', countryCode: 'US' }
            const shipping = { postalCode: '12345', countryCode: 'CA' } // Invalid CA format
            const result = validateAddressZipcodes(billing, shipping)
            expect(result.valid).toBe(false)
            expect(result.addressType).toBe('shipping')
            expect(result.code).toBe('CA_POSTALCODE_TOO_SHORT')
        })

        it('returns billing error first when both are invalid', () => {
            const billing = { postalCode: '1234', countryCode: 'US' }
            const shipping = { postalCode: '12345', countryCode: 'CA' }
            const result = validateAddressZipcodes(billing, shipping)
            expect(result.valid).toBe(false)
            expect(result.addressType).toBe('billing')
        })

        it('handles null billing address', () => {
            const shipping = { postalCode: '12345', countryCode: 'US' }
            const result = validateAddressZipcodes(null, shipping)
            expect(result.valid).toBe(true)
        })

        it('handles null shipping address', () => {
            const billing = { postalCode: '12345', countryCode: 'US' }
            const result = validateAddressZipcodes(billing, null)
            expect(result.valid).toBe(true)
        })

        it('handles both addresses null', () => {
            const result = validateAddressZipcodes(null, null)
            expect(result.valid).toBe(true)
        })

        it('handles both addresses undefined', () => {
            const result = validateAddressZipcodes(undefined, undefined)
            expect(result.valid).toBe(true)
        })

        it('handles non-US/CA addresses', () => {
            const billing = { postalCode: 'SW1A 1AA', countryCode: 'GB' }
            const shipping = { postalCode: '10115', countryCode: 'DE' }
            const result = validateAddressZipcodes(billing, shipping)
            expect(result.valid).toBe(true)
        })

        it('validates mixed US/CA/other addresses', () => {
            const billing = { postalCode: '12345', countryCode: 'US' }
            const shipping = { postalCode: 'anything', countryCode: 'GB' }
            const result = validateAddressZipcodes(billing, shipping)
            expect(result.valid).toBe(true)
        })
    })

    describe('requiresZipcodeValidation', () => {
        it('returns true for US country codes', () => {
            expect(requiresZipcodeValidation('US')).toBe(true)
            expect(requiresZipcodeValidation('USA')).toBe(true)
            expect(requiresZipcodeValidation('United States')).toBe(true)
            expect(requiresZipcodeValidation('UNITED STATES OF AMERICA')).toBe(true)
        })

        it('returns true for CA country codes', () => {
            expect(requiresZipcodeValidation('CA')).toBe(true)
            expect(requiresZipcodeValidation('CAN')).toBe(true)
            expect(requiresZipcodeValidation('Canada')).toBe(true)
            expect(requiresZipcodeValidation('CANADA')).toBe(true)
        })

        it('returns false for other countries', () => {
            expect(requiresZipcodeValidation('GB')).toBe(false)
            expect(requiresZipcodeValidation('DE')).toBe(false)
            expect(requiresZipcodeValidation('FR')).toBe(false)
            expect(requiresZipcodeValidation('AU')).toBe(false)
        })

        it('returns false for null/undefined', () => {
            expect(requiresZipcodeValidation(null)).toBe(false)
            expect(requiresZipcodeValidation(undefined)).toBe(false)
            expect(requiresZipcodeValidation('')).toBe(false)
        })

        it('is case-insensitive', () => {
            expect(requiresZipcodeValidation('us')).toBe(true)
            expect(requiresZipcodeValidation('ca')).toBe(true)
            expect(requiresZipcodeValidation('Usa')).toBe(true)
            expect(requiresZipcodeValidation('Can')).toBe(true)
        })
    })

    describe('_testExports', () => {
        describe('US_ZIPCODE_PATTERN', () => {
            it('matches valid US ZIP codes', () => {
                const { US_ZIPCODE_PATTERN } = _testExports
                expect(US_ZIPCODE_PATTERN.test('12345')).toBe(true)
                expect(US_ZIPCODE_PATTERN.test('12345-6789')).toBe(true)
            })

            it('does not match invalid formats', () => {
                const { US_ZIPCODE_PATTERN } = _testExports
                expect(US_ZIPCODE_PATTERN.test('1234')).toBe(false)
                expect(US_ZIPCODE_PATTERN.test('123456')).toBe(false)
                expect(US_ZIPCODE_PATTERN.test('12345-678')).toBe(false)
            })
        })

        describe('CA_POSTALCODE_PATTERN', () => {
            it('matches valid Canadian postal codes', () => {
                const { CA_POSTALCODE_PATTERN } = _testExports
                expect(CA_POSTALCODE_PATTERN.test('K1A 0B1')).toBe(true)
                expect(CA_POSTALCODE_PATTERN.test('K1A0B1')).toBe(true)
                expect(CA_POSTALCODE_PATTERN.test('k1a 0b1')).toBe(true)
            })

            it('does not match invalid formats', () => {
                const { CA_POSTALCODE_PATTERN } = _testExports
                expect(CA_POSTALCODE_PATTERN.test('12345')).toBe(false)
                expect(CA_POSTALCODE_PATTERN.test('K1A 0B')).toBe(false)
                expect(CA_POSTALCODE_PATTERN.test('W1A 0B1')).toBe(false) // W not allowed first
            })
        })

        describe('normalizeCountryCode', () => {
            it('normalizes various US formats', () => {
                const { normalizeCountryCode } = _testExports
                expect(normalizeCountryCode('US')).toBe('US')
                expect(normalizeCountryCode('USA')).toBe('US')
                expect(normalizeCountryCode('United States')).toBe('US')
            })

            it('normalizes various CA formats', () => {
                const { normalizeCountryCode } = _testExports
                expect(normalizeCountryCode('CA')).toBe('CA')
                expect(normalizeCountryCode('CAN')).toBe('CA')
                expect(normalizeCountryCode('Canada')).toBe('CA')
            })

            it('returns null for unsupported countries', () => {
                const { normalizeCountryCode } = _testExports
                expect(normalizeCountryCode('GB')).toBeNull()
                expect(normalizeCountryCode('DE')).toBeNull()
                expect(normalizeCountryCode(null)).toBeNull()
            })
        })

        describe('isValidUSZipcode', () => {
            it('returns valid for correct US ZIP codes', () => {
                const { isValidUSZipcode } = _testExports
                expect(isValidUSZipcode('12345').valid).toBe(true)
                expect(isValidUSZipcode('12345-6789').valid).toBe(true)
            })

            it('returns invalid with reason for incorrect formats', () => {
                const { isValidUSZipcode } = _testExports
                expect(isValidUSZipcode('1234').valid).toBe(false)
                expect(isValidUSZipcode('1234').reason).toBe('too_short')
                expect(isValidUSZipcode('12345678901').valid).toBe(false)
                expect(isValidUSZipcode('12345678901').reason).toBe('too_long')
                expect(isValidUSZipcode('ABCDE').valid).toBe(false)
                expect(isValidUSZipcode('ABCDE').reason).toBe('invalid_format')
                expect(isValidUSZipcode(null).valid).toBe(false)
                expect(isValidUSZipcode(null).reason).toBe('missing')
            })
        })

        describe('isValidCAPostalCode', () => {
            it('returns valid for correct Canadian postal codes', () => {
                const { isValidCAPostalCode } = _testExports
                expect(isValidCAPostalCode('K1A 0B1').valid).toBe(true)
                expect(isValidCAPostalCode('K1A0B1').valid).toBe(true)
            })

            it('returns invalid with reason for incorrect formats', () => {
                const { isValidCAPostalCode } = _testExports
                expect(isValidCAPostalCode('K1A').valid).toBe(false)
                expect(isValidCAPostalCode('K1A').reason).toBe('too_short')
                expect(isValidCAPostalCode('K1A 0B1X').valid).toBe(false)
                expect(isValidCAPostalCode('K1A 0B1X').reason).toBe('too_long')
                expect(isValidCAPostalCode('12345').valid).toBe(false)
                expect(isValidCAPostalCode('12345').reason).toBe('too_short')
                expect(isValidCAPostalCode(null).valid).toBe(false)
                expect(isValidCAPostalCode(null).reason).toBe('missing')
            })
        })
    })
})
