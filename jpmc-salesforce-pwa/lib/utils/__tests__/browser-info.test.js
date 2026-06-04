/**
 * Unit Tests for Browser Info Collection
 *
 * @jest-environment jsdom
 */

import { collectBrowserInfo, isBrowserInfoAvailable } from '../browser-info'
import { THREE_DS } from '../constants.mjs'

describe('Browser Info Collection', () => {
    
    // Store original values
    let originalNavigator
    let originalScreen
    let originalDate

    beforeEach(() => {
        // Store originals
        originalNavigator = global.navigator
        originalScreen = global.screen
        originalDate = global.Date
    })

    afterEach(() => {
        // Restore originals
        jest.restoreAllMocks()
    })

    // =========================================================================
    // collectBrowserInfo Tests
    // =========================================================================

    describe('collectBrowserInfo', () => {
        it('should return browser info object with all required fields', () => {
            const browserInfo = collectBrowserInfo()

            expect(browserInfo).toHaveProperty('browserAcceptHeader')
            expect(browserInfo).toHaveProperty('browserLanguage')
            expect(browserInfo).toHaveProperty('browserColorDepth')
            expect(browserInfo).toHaveProperty('browserScreenHeight')
            expect(browserInfo).toHaveProperty('browserScreenWidth')
            expect(browserInfo).toHaveProperty('deviceLocalTimeZone')
            expect(browserInfo).toHaveProperty('browserUserAgent')
            expect(browserInfo).toHaveProperty('javaEnabled')
            expect(browserInfo).toHaveProperty('javaScriptEnabled')
            expect(browserInfo).toHaveProperty('challengeWindowSize')
        })

        it('should return application/json as browserAcceptHeader', () => {
            const browserInfo = collectBrowserInfo()
            expect(browserInfo.browserAcceptHeader).toBe('application/json')
        })

        it('should return browser language truncated to 8 characters', () => {
            const browserInfo = collectBrowserInfo()
            expect(browserInfo.browserLanguage.length).toBeLessThanOrEqual(8)
        })

        it('should return string values for all numeric fields', () => {
            const browserInfo = collectBrowserInfo()

            expect(typeof browserInfo.browserColorDepth).toBe('string')
            expect(typeof browserInfo.browserScreenHeight).toBe('string')
            expect(typeof browserInfo.browserScreenWidth).toBe('string')
            expect(typeof browserInfo.deviceLocalTimeZone).toBe('string')
        })

        it('should return FULL_SCREEN as challengeWindowSize', () => {
            const browserInfo = collectBrowserInfo()
            expect(browserInfo.challengeWindowSize).toBe(THREE_DS.CHALLENGE_WINDOW_SIZE)
            expect(browserInfo.challengeWindowSize).toBe('FULL_SCREEN')
        })

        it('should always return "true" for javaScriptEnabled', () => {
            const browserInfo = collectBrowserInfo()
            expect(browserInfo.javaScriptEnabled).toBe('true')
        })

        it('should return string "true" or "false" for javaEnabled', () => {
            const browserInfo = collectBrowserInfo()
            expect(['true', 'false']).toContain(browserInfo.javaEnabled)
        })

        it('should calculate timezone offset correctly', () => {
            const browserInfo = collectBrowserInfo()
            // Timezone should be a string representation of a number
            expect(browserInfo.deviceLocalTimeZone).toMatch(/^-?\d+$/)
        })

        it('should return user agent string', () => {
            const browserInfo = collectBrowserInfo()
            expect(typeof browserInfo.browserUserAgent).toBe('string')
            expect(browserInfo.browserUserAgent.length).toBeGreaterThan(0)
        })

        it('should handle missing navigator gracefully', () => {
            // Delete navigator temporarily
            const origNavValue = global.navigator
            delete global.navigator

            const browserInfo = collectBrowserInfo()

            // Should return defaults
            expect(browserInfo.browserLanguage).toBe('en-US')
            expect(browserInfo.browserUserAgent).toBe('')
            expect(browserInfo.javaEnabled).toBe('false')

            // Restore
            global.navigator = origNavValue
        })

        it('should handle missing screen gracefully', () => {
            // Temporarily remove screen
            const origScreen = global.screen
            delete global.screen

            const browserInfo = collectBrowserInfo()

            // Should return defaults
            expect(browserInfo.browserColorDepth).toBe('24')
            expect(browserInfo.browserScreenHeight).toBe('1080')
            expect(browserInfo.browserScreenWidth).toBe('1920')

            // Restore
            global.screen = origScreen
        })

        it('should handle javaEnabled returning false', () => {
            // Mock javaEnabled to return false
            Object.defineProperty(navigator, 'javaEnabled', {
                value: () => false,
                configurable: true
            })

            const browserInfo = collectBrowserInfo()
            expect(browserInfo.javaEnabled).toBe('false')
        })

        it('should handle javaEnabled returning true', () => {
            // Mock javaEnabled to return true
            Object.defineProperty(navigator, 'javaEnabled', {
                value: () => true,
                configurable: true
            })

            const browserInfo = collectBrowserInfo()
            expect(browserInfo.javaEnabled).toBe('true')
        })

        it('should truncate long language codes', () => {
            Object.defineProperty(navigator, 'language', {
                value: 'en-US-EXTENDED-LONG',
                configurable: true
            })

            const browserInfo = collectBrowserInfo()
            expect(browserInfo.browserLanguage).toBe('en-US-EX')
            expect(browserInfo.browserLanguage.length).toBe(8)
        })
    })

    // =========================================================================
    // isBrowserInfoAvailable Tests
    // =========================================================================

    describe('isBrowserInfoAvailable', () => {
        it('should return true when both navigator and screen are defined', () => {
            // In jsdom environment, both should be defined
            expect(isBrowserInfoAvailable()).toBe(true)
        })

        it('should return false when navigator is undefined', () => {
            const origNav = global.navigator
            delete global.navigator

            expect(isBrowserInfoAvailable()).toBe(false)

            global.navigator = origNav
        })

        it('should return false when screen is undefined', () => {
            const origScreen = global.screen
            delete global.screen

            expect(isBrowserInfoAvailable()).toBe(false)

            global.screen = origScreen
        })
    })

    // =========================================================================
    // Default Export Tests
    // =========================================================================

    describe('Default Export', () => {
        it('should export default object with all functions', () => {
            const defaultExport = require('../browser-info').default

            expect(defaultExport).toHaveProperty('collectBrowserInfo')
            expect(defaultExport).toHaveProperty('isBrowserInfoAvailable')
            expect(typeof defaultExport.collectBrowserInfo).toBe('function')
            expect(typeof defaultExport.isBrowserInfoAvailable).toBe('function')
        })
    })

    // =========================================================================
    // Edge Cases
    // =========================================================================

    describe('Edge Cases', () => {
        it('should handle colorDepth of 0', () => {
            Object.defineProperty(screen, 'colorDepth', {
                value: 0,
                configurable: true
            })

            const browserInfo = collectBrowserInfo()
            // 0 is falsy so should use default
            expect(browserInfo.browserColorDepth).toBe('24')
        })

        it('should handle negative timezone offset', () => {
            // Mock Date to return specific timezone
            const mockDate = class extends Date {
                getTimezoneOffset() {
                    return 300 // UTC-5
                }
            }
            global.Date = mockDate

            const browserInfo = collectBrowserInfo()
            expect(browserInfo.deviceLocalTimeZone).toBe('-300')

            global.Date = originalDate
        })

        it('should handle positive timezone offset', () => {
            const mockDate = class extends Date {
                getTimezoneOffset() {
                    return -330 // UTC+5:30 (India)
                }
            }
            global.Date = mockDate

            const browserInfo = collectBrowserInfo()
            expect(browserInfo.deviceLocalTimeZone).toBe('330')

            global.Date = originalDate
        })

        it('should handle zero timezone offset (UTC)', () => {
            const mockDate = class extends Date {
                getTimezoneOffset() {
                    return 0 // UTC
                }
            }
            global.Date = mockDate

            const browserInfo = collectBrowserInfo()
            expect(browserInfo.deviceLocalTimeZone).toBe('0')

            global.Date = originalDate
        })

        it('should handle various screen dimensions', () => {
            Object.defineProperty(screen, 'width', { value: 2560, configurable: true })
            Object.defineProperty(screen, 'height', { value: 1440, configurable: true })

            const browserInfo = collectBrowserInfo()
            expect(browserInfo.browserScreenWidth).toBe('2560')
            expect(browserInfo.browserScreenHeight).toBe('1440')
        })

        it('should handle 32-bit color depth', () => {
            Object.defineProperty(screen, 'colorDepth', {
                value: 32,
                configurable: true
            })

            const browserInfo = collectBrowserInfo()
            expect(browserInfo.browserColorDepth).toBe('32')
        })
    })
})
