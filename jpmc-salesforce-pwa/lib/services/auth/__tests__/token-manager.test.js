/**
 * Unit Tests for token-manager module
 */

import {
    isTokenValid,
    getCachedToken,
    cacheToken,
    clearTokenCache,
    getTokenCacheStatus,
    getTimeUntilExpiry,
    needsRefresh
} from '../token-manager'

// Mock TOKEN_CONFIG
jest.mock('../../../utils/constants/misc-constants', () => ({
    TOKEN_CONFIG: {
        TOKEN_BUFFER_MS: 60000 // 1 minute buffer
    }
}))

// Mock logger
jest.mock('../../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}))

describe('token-manager', () => {
    beforeEach(() => {
        // Clear cache before each test
        clearTokenCache()
        jest.clearAllMocks()
    })

    describe('isTokenValid', () => {
        it('returns false when no token is cached', () => {
            expect(isTokenValid()).toBe(false)
        })

        it('returns true when token is cached and not expiring soon', () => {
            // Cache a token that expires in 5 minutes
            cacheToken('test-token', 300, 'Bearer')
            expect(isTokenValid()).toBe(true)
        })

        it('returns false when token is expired', () => {
            // Cache token then mock it as expired
            jest.useFakeTimers()
            cacheToken('test-token', 10, 'Bearer') // 10 seconds
            
            // Advance time past expiry + buffer
            jest.advanceTimersByTime(70000) // 70 seconds
            
            expect(isTokenValid()).toBe(false)
            jest.useRealTimers()
        })

        it('returns false when token is within buffer time', () => {
            jest.useFakeTimers()
            cacheToken('test-token', 30, 'Bearer') // 30 seconds
            
            // Advance time so remaining is less than buffer (60s)
            jest.advanceTimersByTime(20000) // 20 seconds - leaves 10 seconds
            
            expect(isTokenValid()).toBe(false) // Within buffer
            jest.useRealTimers()
        })
    })

    describe('getCachedToken', () => {
        it('returns null when no token is cached', () => {
            expect(getCachedToken()).toBeNull()
        })

        it('returns token when valid', () => {
            cacheToken('my-token', 300, 'Bearer')
            expect(getCachedToken()).toBe('my-token')
        })

        it('returns null when token is expired', () => {
            jest.useFakeTimers()
            cacheToken('test-token', 10, 'Bearer')
            jest.advanceTimersByTime(70000)
            expect(getCachedToken()).toBeNull()
            jest.useRealTimers()
        })
    })

    describe('cacheToken', () => {
        it('stores token with expiry time', () => {
            cacheToken('new-token', 600, 'Bearer')
            expect(getCachedToken()).toBe('new-token')
        })

        it('uses default token type Bearer', () => {
            cacheToken('new-token', 600)
            const status = getTokenCacheStatus()
            expect(status.tokenType).toBe('Bearer')
        })

        it('accepts custom token type', () => {
            cacheToken('new-token', 600, 'CustomType')
            const status = getTokenCacheStatus()
            expect(status.tokenType).toBe('CustomType')
        })

        it('replaces existing cached token', () => {
            cacheToken('first-token', 600, 'Bearer')
            cacheToken('second-token', 300, 'Bearer')
            expect(getCachedToken()).toBe('second-token')
        })
    })

    describe('clearTokenCache', () => {
        it('removes cached token', () => {
            cacheToken('token-to-clear', 600, 'Bearer')
            expect(getCachedToken()).toBe('token-to-clear')
            
            clearTokenCache()
            expect(getCachedToken()).toBeNull()
        })

        it('resets all cache properties', () => {
            cacheToken('token', 600, 'Bearer')
            clearTokenCache()
            
            const status = getTokenCacheStatus()
            expect(status.hasToken).toBe(false)
            expect(status.expiresAt).toBeNull()
            expect(status.tokenType).toBeNull()
        })
    })

    describe('getTokenCacheStatus', () => {
        it('returns empty status when no token cached', () => {
            const status = getTokenCacheStatus()
            expect(status.hasToken).toBe(false)
            expect(status.isValid).toBe(false)
            expect(status.expiresAt).toBeNull()
            expect(status.expiresIn).toBeNull()
            expect(status.tokenType).toBeNull()
        })

        it('returns status when token is cached', () => {
            cacheToken('status-token', 300, 'Bearer')
            const status = getTokenCacheStatus()
            
            expect(status.hasToken).toBe(true)
            expect(status.isValid).toBe(true)
            expect(status.expiresAt).toBeDefined()
            expect(status.expiresIn).toBeGreaterThan(0)
            expect(status.tokenType).toBe('Bearer')
        })

        it('expiresAt is ISO string', () => {
            cacheToken('token', 300, 'Bearer')
            const status = getTokenCacheStatus()
            
            // Validate ISO format
            expect(status.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
        })
    })

    describe('getTimeUntilExpiry', () => {
        it('returns 0 when no token is cached', () => {
            expect(getTimeUntilExpiry()).toBe(0)
        })

        it('returns positive seconds when token is valid', () => {
            cacheToken('token', 300, 'Bearer') // 5 minutes
            const remaining = getTimeUntilExpiry()
            
            expect(remaining).toBeGreaterThan(290) // Allow some execution time
            expect(remaining).toBeLessThanOrEqual(300)
        })

        it('returns 0 when token is expired', () => {
            jest.useFakeTimers()
            cacheToken('token', 10, 'Bearer')
            jest.advanceTimersByTime(15000) // Past expiry
            
            expect(getTimeUntilExpiry()).toBe(0)
            jest.useRealTimers()
        })
    })

    describe('needsRefresh', () => {
        it('returns true when no token is cached', () => {
            expect(needsRefresh()).toBe(true)
        })

        it('returns false when token has plenty of time left', () => {
            cacheToken('token', 600, 'Bearer') // 10 minutes
            expect(needsRefresh()).toBe(false)
        })

        it('returns true when token is within buffer time', () => {
            jest.useFakeTimers()
            cacheToken('token', 90, 'Bearer') // 90 seconds
            jest.advanceTimersByTime(40000) // 40 seconds - leaves 50 seconds (< 60 buffer)
            
            expect(needsRefresh()).toBe(true)
            jest.useRealTimers()
        })

        it('returns true when token is expired', () => {
            jest.useFakeTimers()
            cacheToken('token', 10, 'Bearer')
            jest.advanceTimersByTime(15000)
            
            expect(needsRefresh()).toBe(true)
            jest.useRealTimers()
        })
    })
})
