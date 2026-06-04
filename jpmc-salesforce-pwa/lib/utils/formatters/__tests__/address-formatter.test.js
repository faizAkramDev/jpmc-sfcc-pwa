/**
 * Unit Tests for Address Formatter
 */

import {
    formatBillingAddress,
    formatShippingAddress,
    validateAddress,
    areAddressesEqual
} from '../address-formatter'

// Mock country code converter
jest.mock('../country-codes', () => ({
    convertCountryCode: jest.fn((code) => {
        const map = { US: 'USA', CA: 'CAN', GB: 'GBR' }
        return map[code] || code || 'USA'
    })
}))

describe('Address Formatter', () => {
    describe('formatBillingAddress', () => {
        it('returns null for null input', () => {
            expect(formatBillingAddress(null)).toBeNull()
        })

        it('returns null for undefined input', () => {
            expect(formatBillingAddress(undefined)).toBeNull()
        })

        it('formats standard address fields', () => {
            const address = {
                line1: '123 Main St',
                line2: 'Apt 4',
                city: 'New York',
                state: 'NY',
                postalCode: '10001',
                countryCode: 'US'
            }

            const result = formatBillingAddress(address)

            expect(result.line1).toBe('123 Main St')
            expect(result.line2).toBe('Apt 4')
            expect(result.city).toBe('New York')
            expect(result.state).toBe('NY')
            expect(result.postalCode).toBe('10001')
            expect(result.countryCode).toBe('USA')
        })

        it('maps SFCC address field names', () => {
            const address = {
                address1: '456 Oak Ave',
                address2: 'Suite 100',
                city: 'Los Angeles',
                stateCode: 'CA',
                zipCode: '90001',
                country: 'US'
            }

            const result = formatBillingAddress(address)

            expect(result.line1).toBe('456 Oak Ave')
            expect(result.line2).toBe('Suite 100')
            expect(result.state).toBe('CA')
            expect(result.postalCode).toBe('90001')
        })

        it('excludes line2 when not present', () => {
            const address = {
                line1: '123 Main St',
                city: 'Boston',
                state: 'MA',
                postalCode: '02101',
                countryCode: 'US'
            }

            const result = formatBillingAddress(address)

            expect(result.line2).toBeUndefined()
        })

        it('handles empty strings for address fields', () => {
            const address = {
                line1: '',
                city: '',
                state: '',
                postalCode: ''
            }

            const result = formatBillingAddress(address)

            expect(result.line1).toBe('')
            expect(result.city).toBe('')
        })
    })

    describe('formatShippingAddress', () => {
        it('formats shipping address like billing address', () => {
            const address = {
                line1: '789 Pine Rd',
                city: 'Chicago',
                state: 'IL',
                postalCode: '60601',
                countryCode: 'US'
            }

            const result = formatShippingAddress(address)

            expect(result.line1).toBe('789 Pine Rd')
            expect(result.city).toBe('Chicago')
        })

        it('adds recipient name from fullName', () => {
            const address = {
                line1: '123 Main St',
                city: 'Miami',
                state: 'FL',
                postalCode: '33101',
                countryCode: 'US'
            }
            const recipient = { fullName: 'John Doe' }

            const result = formatShippingAddress(address, recipient)

            expect(result.recipientName).toBe('John Doe')
        })

        it('builds recipient name from firstName and lastName', () => {
            const address = {
                line1: '123 Main St',
                city: 'Miami',
                state: 'FL',
                postalCode: '33101',
                countryCode: 'US'
            }
            const recipient = { firstName: 'Jane', lastName: 'Smith' }

            const result = formatShippingAddress(address, recipient)

            expect(result.recipientName).toBe('Jane Smith')
        })

        it('handles recipient with only firstName', () => {
            const address = {
                line1: '123 Main St',
                city: 'Miami',
                state: 'FL',
                postalCode: '33101',
                countryCode: 'US'
            }
            const recipient = { firstName: 'Jane' }

            const result = formatShippingAddress(address, recipient)

            expect(result.recipientName).toBe('Jane')
        })

        it('returns null for null address', () => {
            expect(formatShippingAddress(null)).toBeNull()
        })
    })

    describe('validateAddress', () => {
        it('returns invalid for null address', () => {
            const result = validateAddress(null)

            expect(result.valid).toBe(false)
            expect(result.errors.address).toBe('Address is required')
        })

        it('validates required fields', () => {
            const address = {
                line1: '',
                city: '',
                state: '',
                postalCode: ''
            }

            const result = validateAddress(address)

            expect(result.valid).toBe(false)
            expect(result.errors.line1).toBe('Street address is required')
            expect(result.errors.city).toBe('City is required')
            expect(result.errors.state).toBe('State is required')
            expect(result.errors.postalCode).toBe('Postal code is required')
        })

        it('returns valid for complete address', () => {
            const address = {
                address1: '123 Main St',
                city: 'New York',
                stateCode: 'NY',
                postalCode: '10001'
            }

            const result = validateAddress(address)

            expect(result.valid).toBe(true)
            expect(Object.keys(result.errors)).toHaveLength(0)
        })

        it('does not require state when requireState is false', () => {
            const address = {
                line1: '123 Main St',
                city: 'London',
                postalCode: 'SW1A 1AA'
            }

            const result = validateAddress(address, { requireState: false })

            expect(result.valid).toBe(true)
        })

        it('requires line2 when requireLine2 is true', () => {
            const address = {
                line1: '123 Main St',
                city: 'New York',
                state: 'NY',
                postalCode: '10001'
            }

            const result = validateAddress(address, { requireLine2: true })

            expect(result.valid).toBe(false)
            expect(result.errors.line2).toBe('Address line 2 is required')
        })
    })

    describe('areAddressesEqual', () => {
        it('returns true for equal addresses', () => {
            const addr1 = {
                line1: '123 Main St',
                city: 'New York',
                state: 'NY',
                postalCode: '10001',
                countryCode: 'US'
            }
            const addr2 = { ...addr1 }

            expect(areAddressesEqual(addr1, addr2)).toBe(true)
        })

        it('returns false for different addresses', () => {
            const addr1 = {
                line1: '123 Main St',
                city: 'New York',
                state: 'NY',
                postalCode: '10001',
                countryCode: 'US'
            }
            const addr2 = {
                ...addr1,
                city: 'Boston'
            }

            expect(areAddressesEqual(addr1, addr2)).toBe(false)
        })

        it('returns true when both null', () => {
            expect(areAddressesEqual(null, null)).toBe(true)
        })

        it('returns false when one is null', () => {
            const addr = { line1: '123 Main St', city: 'NY', state: 'NY', postalCode: '10001' }
            expect(areAddressesEqual(addr, null)).toBe(false)
            expect(areAddressesEqual(null, addr)).toBe(false)
        })

        it('handles missing line2 in comparison', () => {
            const addr1 = {
                line1: '123 Main St',
                city: 'New York',
                state: 'NY',
                postalCode: '10001',
                countryCode: 'US'
            }
            const addr2 = {
                ...addr1,
                line2: ''
            }

            expect(areAddressesEqual(addr1, addr2)).toBe(true)
        })
    })
})
