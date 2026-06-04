/**
 * Unit Tests for Request Helpers
 */

import { buildMerchantSoftware, buildMerchant, formatPhoneForJPMC, getClientIp } from '../request-helpers'

// Mock logger
jest.mock('../../../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}))

describe('Request Helpers', () => {
    describe('buildMerchantSoftware', () => {
        it('returns merchant software object', () => {
            const result = buildMerchantSoftware()

            expect(result).toHaveProperty('companyName')
            expect(result).toHaveProperty('productName')
            expect(result).toHaveProperty('version')
        })
    })

    describe('buildMerchant', () => {
        it('returns merchant object with software info', () => {
            const result = buildMerchant()

            expect(result.merchantSoftware).toBeDefined()
            expect(result.merchantSoftware.companyName).toBeDefined()
        })

        it('includes merchantCategoryCode when valid 4-digit code', () => {
            const result = buildMerchant({ merchantCategoryCode: '5411' })

            expect(result.merchantCategoryCode).toBe('5411')
        })

        it('excludes invalid merchantCategoryCode', () => {
            const result = buildMerchant({ merchantCategoryCode: '123' })

            expect(result.merchantCategoryCode).toBeUndefined()
        })

        it('excludes merchantCategoryCode with non-numeric characters', () => {
            const result = buildMerchant({ merchantCategoryCode: '541a' })

            expect(result.merchantCategoryCode).toBeUndefined()
        })

        it('handles missing config', () => {
            const result = buildMerchant()

            expect(result.merchantSoftware).toBeDefined()
            expect(result.merchantCategoryCode).toBeUndefined()
        })
    })

    describe('formatPhoneForJPMC', () => {
        it('returns undefined for null input', () => {
            expect(formatPhoneForJPMC(null)).toBeUndefined()
        })

        it('returns undefined for undefined input', () => {
            expect(formatPhoneForJPMC(undefined)).toBeUndefined()
        })

        it('returns undefined for empty string', () => {
            expect(formatPhoneForJPMC('')).toBeUndefined()
        })

        it('formats phone string removing non-digits', () => {
            const result = formatPhoneForJPMC('(555) 123-4567')

            expect(result.phoneNumber).toBe('5551234567')
            expect(result.countryCode).toBeUndefined()
        })

        it('returns digits as-is without modification', () => {
            const result = formatPhoneForJPMC('15551234567')

            expect(result.phoneNumber).toBe('15551234567')
            expect(result.countryCode).toBeUndefined()
        })

        it('handles phone object with phoneNumber', () => {
            const result = formatPhoneForJPMC({
                phoneNumber: '5551234567',
                countryCode: '1'
            })

            expect(result.phoneNumber).toBe('5551234567')
            expect(result.countryCode).toBeUndefined()
        })

        it('strips non-digits from phone object phoneNumber', () => {
            const result = formatPhoneForJPMC({
                phoneNumber: '(555) 123-4567',
                countryCode: '1'
            })

            expect(result.phoneNumber).toBe('5551234567')
            expect(result.countryCode).toBeUndefined()
        })

        it('handles 10-digit phone', () => {
            const result = formatPhoneForJPMC('5551234567')

            expect(result.phoneNumber).toBe('5551234567')
            expect(result.countryCode).toBeUndefined()
        })

        it('sets countryCode for US', () => {
            const result = formatPhoneForJPMC('5551234567', 'US')

            expect(result.phoneNumber).toBe('5551234567')
            expect(result.countryCode).toBe(1)
        })

        it('sets countryCode for CA', () => {
            const result = formatPhoneForJPMC('5551234567', 'CA')

            expect(result.phoneNumber).toBe('5551234567')
            expect(result.countryCode).toBe(1)
        })

        it('sets countryCode for DE', () => {
            const result = formatPhoneForJPMC('5551234567', 'DE')

            expect(result.phoneNumber).toBe('5551234567')
            expect(result.countryCode).toBe(49)
        })

        it('sets countryCode for FR', () => {
            const result = formatPhoneForJPMC('5551234567', 'FR')

            expect(result.phoneNumber).toBe('5551234567')
            expect(result.countryCode).toBe(33)
        })

        it('handles lowercase country code', () => {
            const result = formatPhoneForJPMC('5551234567', 'us')

            expect(result.phoneNumber).toBe('5551234567')
            expect(result.countryCode).toBe(1)
        })

        it('does not set countryCode for unknown country', () => {
            const result = formatPhoneForJPMC('5551234567', 'XX')

            expect(result.phoneNumber).toBe('5551234567')
            expect(result.countryCode).toBeUndefined()
        })

        it('truncates phone number to 12 characters', () => {
            const result = formatPhoneForJPMC('12345678901234567890')

            expect(result.phoneNumber).toBe('123456789012')
        })
    })

    describe('getClientIp', () => {
        it('extracts rightmost IP from x-forwarded-for header (closest trusted proxy)', () => {
            const req = {
                headers: {
                    'x-forwarded-for': '192.168.1.100, 10.0.0.1'
                }
            }

            const ip = getClientIp(req)

            // Returns rightmost valid IP (added by closest trusted proxy), not first (client-controlled)
            expect(ip).toBe('10.0.0.1')
        })

        it('extracts IP from x-real-ip header', () => {
            const req = {
                headers: {
                    'x-real-ip': '192.168.1.200'
                }
            }

            const ip = getClientIp(req)

            expect(ip).toBe('192.168.1.200')
        })

        it('falls back to req.ip', () => {
            const req = {
                headers: {},
                ip: '192.168.1.50'
            }

            const ip = getClientIp(req)

            expect(ip).toBe('192.168.1.50')
        })

        it('falls back to socket remote address', () => {
            const req = {
                headers: {},
                socket: { remoteAddress: '10.0.0.5' }
            }

            const ip = getClientIp(req)

            expect(ip).toBe('10.0.0.5')
        })

        it('filters out localhost/loopback addresses', () => {
            const req = {
                headers: {
                    'x-forwarded-for': '127.0.0.1'
                },
                ip: '192.168.1.100'
            }

            const ip = getClientIp(req)

            expect(ip).toBe('192.168.1.100')
        })

        it('filters out ::1 IPv6 loopback', () => {
            const req = {
                headers: {
                    'x-real-ip': '::1'
                },
                ip: '10.0.0.1'
            }

            const ip = getClientIp(req)

            expect(ip).toBe('10.0.0.1')
        })

        it('returns undefined when no valid IP found', () => {
            const req = {
                headers: {
                    'x-forwarded-for': '127.0.0.1'
                },
                ip: '::1'
            }

            const ip = getClientIp(req)

            expect(ip).toBeUndefined()
        })

        it('handles IPv6 addresses', () => {
            const req = {
                headers: {
                    'x-forwarded-for': '2001:db8::1'
                }
            }

            const ip = getClientIp(req)

            expect(ip).toBe('2001:db8::1')
        })
    })
})
