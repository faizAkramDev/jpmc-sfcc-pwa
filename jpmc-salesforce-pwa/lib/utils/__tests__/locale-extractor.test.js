/**
 * Unit tests for Locale Extractor Utility
 * 
 * @jest-environment node
 */

import { extractLocale, extractSlasToken } from '../locale-extractor'

// Mock logger to avoid console noise in tests
jest.mock('../logger', () => ({
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    },
    __esModule: true
}))

describe('locale-extractor', () => {
    describe('extractLocale', () => {
        // =====================================================================
        // Priority 1: Explicit query param
        // =====================================================================
        describe('explicit query param (highest priority)', () => {
            it('should extract locale from query param', () => {
                const req = { query: { locale: 'en-CA' } }
                expect(extractLocale(req)).toBe('en-CA')
            })

            it('should prefer query param over body', () => {
                const req = { 
                    query: { locale: 'en-CA' }, 
                    body: { locale: 'fr-FR' } 
                }
                expect(extractLocale(req)).toBe('en-CA')
            })

            it('should prefer query param over Referer', () => {
                const req = { 
                    query: { locale: 'en-CA' }, 
                    headers: { referer: 'http://localhost:3000/fr-FR/checkout' } 
                }
                expect(extractLocale(req)).toBe('en-CA')
            })
        })

        // =====================================================================
        // Priority 2: Explicit body param
        // =====================================================================
        describe('explicit body param', () => {
            it('should extract locale from body', () => {
                const req = { body: { locale: 'fr-FR' } }
                expect(extractLocale(req)).toBe('fr-FR')
            })

            it('should prefer body over Referer', () => {
                const req = { 
                    body: { locale: 'fr-FR' },
                    headers: { referer: 'http://localhost:3000/de-DE/checkout' }
                }
                expect(extractLocale(req)).toBe('fr-FR')
            })
        })

        // =====================================================================
        // Priority 3: Auto-detect from Referer - Path-based
        // =====================================================================
        describe('auto-detect from Referer (path-based)', () => {
            it('should extract en-CA from path', () => {
                const req = { 
                    headers: { referer: 'http://localhost:3000/en-CA/checkout' } 
                }
                expect(extractLocale(req)).toBe('en-CA')
            })

            it('should extract en-US from path', () => {
                const req = { 
                    headers: { referer: 'http://localhost:3000/en-US/product/123' } 
                }
                expect(extractLocale(req)).toBe('en-US')
            })

            it('should extract fr-FR from path', () => {
                const req = { 
                    headers: { referer: 'https://store.example.com/fr-FR/cart' } 
                }
                expect(extractLocale(req)).toBe('fr-FR')
            })

            it('should extract underscore format en_CA from path', () => {
                const req = { 
                    headers: { referer: 'http://localhost:3000/en_CA/checkout' } 
                }
                expect(extractLocale(req)).toBe('en_CA')
            })

            it('should handle locale at root path', () => {
                const req = { 
                    headers: { referer: 'http://localhost:3000/en-CA' } 
                }
                expect(extractLocale(req)).toBe('en-CA')
            })

            it('should handle locale at root path with trailing slash', () => {
                const req = { 
                    headers: { referer: 'http://localhost:3000/en-CA/' } 
                }
                expect(extractLocale(req)).toBe('en-CA')
            })
        })

        // =====================================================================
        // Priority 3: Auto-detect from Referer - Query param based
        // =====================================================================
        describe('auto-detect from Referer (query param)', () => {
            it('should extract locale from Referer query param', () => {
                const req = { 
                    headers: { referer: 'http://localhost:3000/checkout?locale=en-CA' } 
                }
                expect(extractLocale(req)).toBe('en-CA')
            })

            it('should extract locale from Referer query param with other params', () => {
                const req = { 
                    headers: { referer: 'http://localhost:3000/checkout?foo=bar&locale=de-DE&baz=qux' } 
                }
                expect(extractLocale(req)).toBe('de-DE')
            })

            it('should prefer Referer query param over Referer path', () => {
                const req = { 
                    headers: { referer: 'http://localhost:3000/en-US/checkout?locale=en-CA' } 
                }
                // Query param wins over path
                expect(extractLocale(req)).toBe('en-CA')
            })
        })

        // =====================================================================
        // Fallback: No locale detected
        // =====================================================================
        describe('fallback (no locale)', () => {
            it('should return undefined when no query, body, or Referer', () => {
                const req = {}
                expect(extractLocale(req)).toBeUndefined()
            })

            it('should return undefined when empty request', () => {
                expect(extractLocale(null)).toBeUndefined()
                expect(extractLocale(undefined)).toBeUndefined()
            })

            it('should return undefined when Referer has no locale', () => {
                const req = { 
                    headers: { referer: 'http://localhost:3000/checkout' } 
                }
                expect(extractLocale(req)).toBeUndefined()
            })

            it('should return undefined for root URL', () => {
                const req = { 
                    headers: { referer: 'http://localhost:3000/' } 
                }
                expect(extractLocale(req)).toBeUndefined()
            })

            it('should return undefined for invalid URL', () => {
                const req = { 
                    headers: { referer: 'not-a-valid-url' } 
                }
                expect(extractLocale(req)).toBeUndefined()
            })
        })

        // =====================================================================
        // Edge cases
        // =====================================================================
        describe('edge cases', () => {
            it('should handle both referer and referrer header spellings', () => {
                const req = { 
                    headers: { referrer: 'http://localhost:3000/en-CA/checkout' } 
                }
                expect(extractLocale(req)).toBe('en-CA')
            })

            it('should prefer referer over referrer', () => {
                const req = { 
                    headers: { 
                        referer: 'http://localhost:3000/en-CA/checkout',
                        referrer: 'http://localhost:3000/fr-FR/checkout'
                    } 
                }
                expect(extractLocale(req)).toBe('en-CA')
            })

            it('should not match invalid locale format (lowercase country)', () => {
                const req = { 
                    headers: { referer: 'http://localhost:3000/en-ca/checkout' } 
                }
                expect(extractLocale(req)).toBeUndefined()
            })

            it('should not match invalid locale format (3-letter language)', () => {
                const req = { 
                    headers: { referer: 'http://localhost:3000/eng-CA/checkout' } 
                }
                expect(extractLocale(req)).toBeUndefined()
            })

            it('should not match paths that look like locales but are not', () => {
                const req = { 
                    headers: { referer: 'http://localhost:3000/en/checkout' } 
                }
                expect(extractLocale(req)).toBeUndefined()
            })
        })
    })

    describe('extractSlasToken', () => {
        it('should extract Bearer token from Authorization header', () => {
            const req = { 
                headers: { authorization: 'Bearer abc123xyz' } 
            }
            expect(extractSlasToken(req)).toBe('abc123xyz')
        })

        it('should return undefined when no Authorization header', () => {
            const req = { headers: {} }
            expect(extractSlasToken(req)).toBeUndefined()
        })

        it('should return undefined for non-Bearer authorization', () => {
            const req = { 
                headers: { authorization: 'Basic abc123xyz' } 
            }
            expect(extractSlasToken(req)).toBeUndefined()
        })

        it('should handle null/undefined request', () => {
            expect(extractSlasToken(null)).toBeUndefined()
            expect(extractSlasToken(undefined)).toBeUndefined()
        })
    })

})
