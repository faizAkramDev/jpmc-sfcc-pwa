/**
 * Unit Tests for SFCC Custom Object Service
 *
 * @jest-environment node
 */

import {
    getCustomObjectConfig,
    clearCustomObjectCache,
    getCustomObjectCacheStatus,
    MULTI_LOCALE_ERROR_CODES
} from '../custom-object-service'

// =============================================================================
// Mocks
// =============================================================================

jest.mock('../../../utils/logger', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }
}))

// Store original env
const originalEnv = process.env

// =============================================================================
// Test Data
// =============================================================================

const mockSlasToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'

const mockCustomObjectResponse = {
    c_enabled: true,
    c_merchantId: '998482157630',
    c_apiHost: 'https://api-ms-test.payments.jpmorgan.com',
    c_clientId: 'client-123',
    c_resourceId: 'resource-456',
    c_googlePayMerchantName: 'Test Store Canada',
    c_googlePayEnvironment: 'TEST',
    c_merchantSoftwareCompany: 'JPMC',
    c_merchantSoftwareProduct: 'CommerceCloud',
    c_merchantSoftwareVersion: '1.0.0'
}

// =============================================================================
// Test Setup
// =============================================================================

beforeEach(() => {
    // Reset env for each test
    process.env = {
        ...originalEnv,
        COMMERCE_API_SHORT_CODE: 'kv7kzm78',
        COMMERCE_API_ORG_ID: 'f_ecom_zzte_053',
        COMMERCE_API_SITE_ID: 'RefArch'
    }

    // Clear cache before each test
    clearCustomObjectCache()

    // Reset fetch mock
    global.fetch = jest.fn()
})

afterEach(() => {
    process.env = originalEnv
    delete global.fetch
})

// =============================================================================
// getCustomObjectConfig Tests
// =============================================================================

describe('getCustomObjectConfig', () => {
    describe('Parameter validation', () => {
        it('should throw when locale is missing', async () => {
            await expect(
                getCustomObjectConfig({ slasToken: mockSlasToken })
            ).rejects.toThrow(MULTI_LOCALE_ERROR_CODES.CONFIG_ERROR)
        })

        it('should throw when slasToken is missing', async () => {
            await expect(
                getCustomObjectConfig({ locale: 'en_US' })
            ).rejects.toThrow(MULTI_LOCALE_ERROR_CODES.AUTH_ERROR)
        })

        it('should include locale in error message when slasToken missing', async () => {
            await expect(
                getCustomObjectConfig({ locale: 'en_CA' })
            ).rejects.toThrow('Locale "en_CA" was requested')
        })
    })

    describe('SFCC config validation', () => {
        it('should throw when SHORT_CODE is missing', async () => {
            delete process.env.COMMERCE_API_SHORT_CODE
            delete process.env.SFCC_SHORT_CODE

            await expect(
                getCustomObjectConfig({ locale: 'en_US', slasToken: mockSlasToken })
            ).rejects.toThrow(MULTI_LOCALE_ERROR_CODES.CONFIG_ERROR)
        })

        it('should throw when ORG_ID is missing', async () => {
            delete process.env.COMMERCE_API_ORG_ID
            delete process.env.SFCC_ORG_ID

            await expect(
                getCustomObjectConfig({ locale: 'en_US', slasToken: mockSlasToken })
            ).rejects.toThrow(MULTI_LOCALE_ERROR_CODES.CONFIG_ERROR)
        })

        it('should fallback to SFCC_* env vars', async () => {
            delete process.env.COMMERCE_API_SHORT_CODE
            delete process.env.COMMERCE_API_ORG_ID
            process.env.SFCC_SHORT_CODE = 'sfcc-code'
            process.env.SFCC_ORG_ID = 'sfcc-org'

            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                text: () => Promise.resolve(JSON.stringify(mockCustomObjectResponse)),
                headers: new Map()
            })

            const result = await getCustomObjectConfig({
                locale: 'en_US',
                slasToken: mockSlasToken
            })

            expect(global.fetch).toHaveBeenCalled()
            expect(result).not.toBeNull()
        })
    })

    describe('API call construction', () => {
        it('should call correct SCAPI endpoint', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                text: () => Promise.resolve(JSON.stringify(mockCustomObjectResponse)),
                headers: new Map()
            })

            await getCustomObjectConfig({
                locale: 'en_US',
                slasToken: mockSlasToken
            })

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('api.commercecloud.salesforce.com'),
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({
                        'Authorization': `Bearer ${mockSlasToken}`
                    })
                })
            )
        })

        it('should normalize locale format from hyphen to underscore', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                text: () => Promise.resolve(JSON.stringify(mockCustomObjectResponse)),
                headers: new Map()
            })

            await getCustomObjectConfig({
                locale: 'en-CA',  // PWA Kit format (hyphen)
                slasToken: mockSlasToken
            })

            // URL should contain en_CA (underscore format)
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('RefArch%3A%3Aen_CA'),
                expect.anything()
            )
        })
    })

    describe('Successful fetch', () => {
        it('should map Custom Object attributes to config', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                text: () => Promise.resolve(JSON.stringify(mockCustomObjectResponse)),
                headers: new Map()
            })

            const config = await getCustomObjectConfig({
                locale: 'en_CA',
                slasToken: mockSlasToken
            })

            expect(config.enabled).toBe(true)
            expect(config.merchantId).toBe('998482157630')
            expect(config.googlePayMerchantName).toBe('Test Store Canada')
        })

        it('should strip https:// from apiHost', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                text: () => Promise.resolve(JSON.stringify(mockCustomObjectResponse)),
                headers: new Map()
            })

            const config = await getCustomObjectConfig({
                locale: 'en_US',
                slasToken: mockSlasToken
            })

            expect(config.apiHost).toBe('api-ms-test.payments.jpmorgan.com')
        })

        it('should build merchantSoftware object', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                text: () => Promise.resolve(JSON.stringify(mockCustomObjectResponse)),
                headers: new Map()
            })

            const config = await getCustomObjectConfig({
                locale: 'en_US',
                slasToken: mockSlasToken
            })

            expect(config.merchantSoftware).toEqual({
                companyName: 'JPMC',
                productName: 'CommerceCloud',
                version: '1.0.0'
            })
        })

        it('should handle attributes without c_ prefix', async () => {
            const responseWithoutPrefix = {
                enabled: true,
                merchantId: '123456789',
                apiHost: 'api.example.com'
            }

            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                text: () => Promise.resolve(JSON.stringify(responseWithoutPrefix)),
                headers: new Map()
            })

            const config = await getCustomObjectConfig({
                locale: 'en_US',
                slasToken: mockSlasToken
            })

            expect(config.merchantId).toBe('123456789')
        })
    })

    describe('404 handling', () => {
        it('should return null for 404 response', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: () => Promise.resolve('{"message":"Not found"}'),
                headers: new Map()
            })

            const config = await getCustomObjectConfig({
                locale: 'en_XX',  // Non-existent locale
                slasToken: mockSlasToken
            })

            expect(config).toBeNull()
        })

        it('should NOT cache null result (allows retry on 404)', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: () => Promise.resolve('{"message":"Not found"}'),
                headers: new Map()
            })

            // First call - 404
            await getCustomObjectConfig({ locale: 'en_XX', slasToken: mockSlasToken })
            // Second call - cache doesn't serve null data, so refetch
            await getCustomObjectConfig({ locale: 'en_XX', slasToken: mockSlasToken })

            // isCacheValid returns false for null data, so fetch is called twice
            expect(global.fetch).toHaveBeenCalledTimes(2)
        })
    })

    describe('Auth error handling', () => {
        it('should throw auth error for 401 response', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: () => Promise.resolve('{"error":"Invalid token"}'),
                headers: new Map()
            })

            await expect(
                getCustomObjectConfig({ locale: 'en_US', slasToken: mockSlasToken })
            ).rejects.toThrow(MULTI_LOCALE_ERROR_CODES.AUTH_ERROR)
        })

        it('should throw auth error for 403 response', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
                text: () => Promise.resolve('{"error":"Missing scope"}'),
                headers: new Map()
            })

            await expect(
                getCustomObjectConfig({ locale: 'en_US', slasToken: mockSlasToken })
            ).rejects.toThrow(MULTI_LOCALE_ERROR_CODES.AUTH_ERROR)
        })

        it('should include scope hint in auth error message', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: () => Promise.resolve('{}'),
                headers: new Map()
            })

            await expect(
                getCustomObjectConfig({ locale: 'en_US', slasToken: mockSlasToken })
            ).rejects.toThrow('sfcc.shopper-custom-objects')
        })
    })

    describe('Other API errors', () => {
        it('should wrap 500 errors as fetch error', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                text: () => Promise.resolve('Server error'),
                headers: new Map()
            })

            await expect(
                getCustomObjectConfig({ locale: 'en_US', slasToken: mockSlasToken })
            ).rejects.toThrow(MULTI_LOCALE_ERROR_CODES.FETCH_ERROR)
        })

        it('should handle network errors', async () => {
            global.fetch.mockRejectedValue(new Error('Network error'))

            await expect(
                getCustomObjectConfig({ locale: 'en_US', slasToken: mockSlasToken })
            ).rejects.toThrow(MULTI_LOCALE_ERROR_CODES.FETCH_ERROR)
        })
    })

    describe('Caching behavior', () => {
        it('should cache successful responses', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                text: () => Promise.resolve(JSON.stringify(mockCustomObjectResponse)),
                headers: new Map()
            })

            // First call
            await getCustomObjectConfig({ locale: 'en_US', slasToken: mockSlasToken })
            // Second call
            await getCustomObjectConfig({ locale: 'en_US', slasToken: mockSlasToken })

            // fetch should only be called once
            expect(global.fetch).toHaveBeenCalledTimes(1)
        })

        it('should cache different locales separately', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                text: () => Promise.resolve(JSON.stringify(mockCustomObjectResponse)),
                headers: new Map()
            })

            await getCustomObjectConfig({ locale: 'en_US', slasToken: mockSlasToken })
            await getCustomObjectConfig({ locale: 'en_CA', slasToken: mockSlasToken })

            expect(global.fetch).toHaveBeenCalledTimes(2)
        })

        it('should bypass cache when forceRefresh is true', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                text: () => Promise.resolve(JSON.stringify(mockCustomObjectResponse)),
                headers: new Map()
            })

            // First call
            await getCustomObjectConfig({ locale: 'en_US', slasToken: mockSlasToken })
            // Second call with forceRefresh
            await getCustomObjectConfig({
                locale: 'en_US',
                slasToken: mockSlasToken,
                forceRefresh: true
            })

            expect(global.fetch).toHaveBeenCalledTimes(2)
        })
    })
})

// =============================================================================
// clearCustomObjectCache Tests
// =============================================================================

describe('clearCustomObjectCache', () => {
    beforeEach(async () => {
        // Populate cache first
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockCustomObjectResponse)),
            headers: new Map()
        })

        await getCustomObjectConfig({ locale: 'en_US', slasToken: mockSlasToken })
        await getCustomObjectConfig({ locale: 'en_CA', slasToken: mockSlasToken })
    })

    it('should clear specific locale cache', async () => {
        clearCustomObjectCache('en_US')

        // en_US should need refetch
        await getCustomObjectConfig({ locale: 'en_US', slasToken: mockSlasToken })
        // en_CA should still be cached
        await getCustomObjectConfig({ locale: 'en_CA', slasToken: mockSlasToken })

        // 2 initial + 1 refetch for en_US = 3 total
        expect(global.fetch).toHaveBeenCalledTimes(3)
    })

    it('should clear all locales when no parameter', async () => {
        clearCustomObjectCache()

        // Both should need refetch
        await getCustomObjectConfig({ locale: 'en_US', slasToken: mockSlasToken })
        await getCustomObjectConfig({ locale: 'en_CA', slasToken: mockSlasToken })

        // 2 initial + 2 refetch = 4 total
        expect(global.fetch).toHaveBeenCalledTimes(4)
    })
})

// =============================================================================
// getCustomObjectCacheStatus Tests
// =============================================================================

describe('getCustomObjectCacheStatus', () => {
    it('should return empty status when no cache', () => {
        const status = getCustomObjectCacheStatus()

        expect(status.cachedLocales).toEqual([])
        expect(status.entries).toEqual([])
    })

    it('should return cached locales list', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockCustomObjectResponse)),
            headers: new Map()
        })

        await getCustomObjectConfig({ locale: 'en_US', slasToken: mockSlasToken })
        await getCustomObjectConfig({ locale: 'fr_CA', slasToken: mockSlasToken })

        const status = getCustomObjectCacheStatus()

        expect(status.cachedLocales).toContain('en_US')
        expect(status.cachedLocales).toContain('fr_CA')
        expect(status.entries.length).toBe(2)
    })

    it('should report cache validity', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockCustomObjectResponse)),
            headers: new Map()
        })

        await getCustomObjectConfig({ locale: 'en_US', slasToken: mockSlasToken })

        const status = getCustomObjectCacheStatus()
        const usEntry = status.entries.find((e) => e.locale === 'en_US')

        expect(usEntry.hasData).toBe(true)
        expect(usEntry.isValid).toBe(true)
        expect(usEntry.timestamp).toBeDefined()
        expect(usEntry.expiresAt).toBeDefined()
    })

    it('should handle null data entries', async () => {
        global.fetch.mockResolvedValue({
            ok: false,
            status: 404,
            text: () => Promise.resolve('Not found'),
            headers: new Map()
        })

        await getCustomObjectConfig({ locale: 'en_XX', slasToken: mockSlasToken })

        const status = getCustomObjectCacheStatus()
        const xxEntry = status.entries.find((e) => e.locale === 'en_XX')

        expect(xxEntry.hasData).toBe(false)
    })
})
