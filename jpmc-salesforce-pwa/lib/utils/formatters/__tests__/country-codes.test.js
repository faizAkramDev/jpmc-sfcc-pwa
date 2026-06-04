/**
 * Unit Tests for country-codes module
 */

import { 
    COUNTRY_CODE_2_TO_3, 
    convertCountryCode, 
    isValidCountryCode, 
    getSupportedCountryCodes
} from '../country-codes'

describe('country-codes', () => {
    describe('COUNTRY_CODE_2_TO_3', () => {
        it('contains common country codes', () => {
            expect(COUNTRY_CODE_2_TO_3.US).toBe('USA')
            expect(COUNTRY_CODE_2_TO_3.CA).toBe('CAN')
            expect(COUNTRY_CODE_2_TO_3.GB).toBe('GBR')
            expect(COUNTRY_CODE_2_TO_3.UK).toBe('GBR') // Alias
        })

        it('contains North American countries', () => {
            expect(COUNTRY_CODE_2_TO_3.MX).toBe('MEX')
        })

        it('contains European countries', () => {
            expect(COUNTRY_CODE_2_TO_3.DE).toBe('DEU')
            expect(COUNTRY_CODE_2_TO_3.FR).toBe('FRA')
            expect(COUNTRY_CODE_2_TO_3.ES).toBe('ESP')
            expect(COUNTRY_CODE_2_TO_3.IT).toBe('ITA')
        })

        it('contains Asia Pacific countries', () => {
            expect(COUNTRY_CODE_2_TO_3.JP).toBe('JPN')
            expect(COUNTRY_CODE_2_TO_3.AU).toBe('AUS')
            expect(COUNTRY_CODE_2_TO_3.SG).toBe('SGP')
        })
    })

    describe('convertCountryCode', () => {
        it('converts 2-letter codes to 3-letter codes', () => {
            expect(convertCountryCode('US')).toBe('USA')
            expect(convertCountryCode('CA')).toBe('CAN')
            expect(convertCountryCode('GB')).toBe('GBR')
            expect(convertCountryCode('MX')).toBe('MEX')
        })

        it('handles lowercase input', () => {
            expect(convertCountryCode('us')).toBe('USA')
            expect(convertCountryCode('ca')).toBe('CAN')
        })

        it('returns 3-letter codes unchanged', () => {
            expect(convertCountryCode('USA')).toBe('USA')
            expect(convertCountryCode('CAN')).toBe('CAN')
            expect(convertCountryCode('GBR')).toBe('GBR')
        })

        it('returns 3-letter codes uppercase', () => {
            expect(convertCountryCode('usa')).toBe('USA')
        })

        it('returns undefined for unknown 2-letter codes', () => {
            expect(convertCountryCode('XX')).toBeUndefined()
            expect(convertCountryCode('ZZ')).toBeUndefined()
        })

        it('returns undefined for empty input', () => {
            expect(convertCountryCode('')).toBeUndefined()
            expect(convertCountryCode(null)).toBeUndefined()
            expect(convertCountryCode(undefined)).toBeUndefined()
        })

        it('returns undefined for non-string input', () => {
            expect(convertCountryCode(123)).toBeUndefined()
            expect(convertCountryCode({})).toBeUndefined()
            expect(convertCountryCode([])).toBeUndefined()
        })

        it('returns undefined for invalid length codes', () => {
            expect(convertCountryCode('U')).toBeUndefined()
            expect(convertCountryCode('USAA')).toBeUndefined()
        })

        it('handles codes with whitespace', () => {
            expect(convertCountryCode(' US ')).toBe('USA')
            expect(convertCountryCode('  CA  ')).toBe('CAN')
        })
    })

    describe('isValidCountryCode', () => {
        it('returns true for valid 2-letter codes', () => {
            expect(isValidCountryCode('US')).toBe(true)
            expect(isValidCountryCode('CA')).toBe(true)
            expect(isValidCountryCode('GB')).toBe(true)
        })

        it('returns true for valid 3-letter codes', () => {
            expect(isValidCountryCode('USA')).toBe(true)
            expect(isValidCountryCode('CAN')).toBe(true)
            expect(isValidCountryCode('GBR')).toBe(true)
        })

        it('handles lowercase input', () => {
            expect(isValidCountryCode('us')).toBe(true)
            expect(isValidCountryCode('usa')).toBe(true)
        })

        it('returns false for unknown codes', () => {
            expect(isValidCountryCode('XX')).toBe(false)
            expect(isValidCountryCode('XXX')).toBe(false)
        })

        it('returns false for empty input', () => {
            expect(isValidCountryCode('')).toBe(false)
            expect(isValidCountryCode(null)).toBe(false)
            expect(isValidCountryCode(undefined)).toBe(false)
        })

        it('returns false for non-string input', () => {
            expect(isValidCountryCode(123)).toBe(false)
            expect(isValidCountryCode({})).toBe(false)
        })

        it('returns false for invalid length codes', () => {
            expect(isValidCountryCode('U')).toBe(false)
            expect(isValidCountryCode('USAA')).toBe(false)
        })

        it('handles codes with whitespace', () => {
            expect(isValidCountryCode(' US ')).toBe(true)
        })
    })

    describe('getSupportedCountryCodes', () => {
        it('returns an object with alpha2 and alpha3 arrays', () => {
            const result = getSupportedCountryCodes()
            expect(result).toHaveProperty('alpha2')
            expect(result).toHaveProperty('alpha3')
            expect(Array.isArray(result.alpha2)).toBe(true)
            expect(Array.isArray(result.alpha3)).toBe(true)
        })

        it('alpha2 contains all 2-letter codes', () => {
            const result = getSupportedCountryCodes()
            expect(result.alpha2).toContain('US')
            expect(result.alpha2).toContain('CA')
            expect(result.alpha2).toContain('GB')
            expect(result.alpha2).toContain('UK') // Alias
        })

        it('alpha3 contains unique 3-letter codes', () => {
            const result = getSupportedCountryCodes()
            expect(result.alpha3).toContain('USA')
            expect(result.alpha3).toContain('CAN')
            expect(result.alpha3).toContain('GBR')
            // GBR should only appear once even though GB and UK both map to it
            expect(result.alpha3.filter(c => c === 'GBR').length).toBe(1)
        })

        it('alpha2 count matches keys in map', () => {
            const result = getSupportedCountryCodes()
            expect(result.alpha2.length).toBe(Object.keys(COUNTRY_CODE_2_TO_3).length)
        })
    })
})
