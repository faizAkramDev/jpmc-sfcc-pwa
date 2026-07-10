/**
 * Unit Tests for SFCC Site Preferences Service
 *
 * @jest-environment node
 */

global.fetch = jest.fn()

const {
    getSitePreferences,
    getJPMCPreferences,
    refreshSitePreferences,
    clearPreferencesCache,
    getPreferencesCacheStatus,
    getApplePayPreferences,
    clearApplePayPreferencesCache
} = require('../site-preferences')

describe('SFCC Site Preferences Service', () => {
    const originalEnv = process.env

    const mockTokenResponse = {
        ok: true,
        json: () => Promise.resolve({ access_token: 'mock-access-token' })
    }

    const mockTokenErrorResponse = {
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized')
    }

    const createMockPreferencesResponse = (preferences) => ({
        ok: true,
        json: () => Promise.resolve({ data: preferences, total: preferences.length })
    })

    const createMockErrorResponse = (status) => ({
        ok: false,
        status,
        text: () => Promise.resolve('Error')
    })

    beforeEach(() => {
        jest.clearAllMocks()
        process.env = { ...originalEnv }
        global.fetch.mockReset()
        clearPreferencesCache()
        clearApplePayPreferencesCache()

        process.env.COMMERCE_API_CLIENT_ID_PRIVATE = 'test-client-id'
        process.env.COMMERCE_API_CLIENT_SECRET = 'test-client-secret'
        process.env.COMMERCE_API_SHORT_CODE = 'test-short-code'
        process.env.COMMERCE_API_ORG_ID = 'test-org'
        process.env.COMMERCE_API_SITE_ID = 'RefArch'
        process.env.SFCC_REALM_ID = 'test-realm'
        process.env.SFCC_INSTANCE_ID = 'test-instance'
    })

    afterAll(() => {
        process.env = originalEnv
    })

    describe('getSitePreferences', () => {
        it('should fetch site preferences from SFCC API', async () => {
            const mockPreferences = [
                { id: 'JPMCClientID', value: 'test-client-id' },
                { id: 'JPMC_MerchantCode', value: 'test-merchant' }
            ]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            const result = await getSitePreferences()
            expect(global.fetch).toHaveBeenCalledTimes(2)
            expect(result).toEqual(mockPreferences)
        })

        it('should use cached preferences on subsequent calls', async () => {
            const mockPreferences = [{ id: 'JPMCClientID', value: 'cached-value' }]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            await getSitePreferences()
            await getSitePreferences()

            expect(global.fetch).toHaveBeenCalledTimes(2)
        })

        it('should force refresh when forceRefresh is true', async () => {
            const mockPreferences = [{ id: 'JPMCClientID', value: 'refreshed-value' }]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            await getSitePreferences()
            await getSitePreferences({ forceRefresh: true })

            expect(global.fetch).toHaveBeenCalledTimes(4)
        })

        it('should throw error when SFCC configuration is missing', async () => {
            delete process.env.COMMERCE_API_SHORT_CODE

            await expect(getSitePreferences()).rejects.toThrow(
                'Missing required SFCC configuration'
            )
        })

        it('should throw error when token request fails', async () => {
            global.fetch.mockResolvedValueOnce(mockTokenErrorResponse)

            await expect(getSitePreferences()).rejects.toThrow('token request failed')
        })

        it('should throw error when token response missing access_token', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ error: 'invalid_grant' })
            })

            await expect(getSitePreferences()).rejects.toThrow('missing access_token')
        })

        it('should throw error when preferences API call fails', async () => {
            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockErrorResponse(403))

            await expect(getSitePreferences()).rejects.toThrow('preferences API failed')
        })

        it('should return stale cache when API fails but cache exists', async () => {
            const mockPreferences = [{ id: 'JPMCClientID', value: 'stale-value' }]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            await getSitePreferences()

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockErrorResponse(500))

            const result = await getSitePreferences({ forceRefresh: true })
            expect(result).toEqual(mockPreferences)
        })

        it('should respect custom cache TTL', async () => {
            const mockPreferences = [{ id: 'test', value: 'value' }]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            await getSitePreferences({ cacheTTL: 10000 })
            expect(global.fetch).toHaveBeenCalledTimes(2)
        })
    })

    describe('getJPMCPreferences', () => {
        it('should filter preferences to only JPMC-related ones', async () => {
            const mockPreferences = [
                { id: 'JPMCClientID', value: 'test-client-id' },
                { id: 'JPMC_MerchantCode', value: 'test-merchant' },
                { id: 'UnrelatedPreference', value: 'excluded' }
            ]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            const result = await getJPMCPreferences()

            expect(result).toHaveProperty('JPMCClientID')
            expect(result).toHaveProperty('JPMC_MerchantCode')
            expect(result).not.toHaveProperty('UnrelatedPreference')
        })

        it('should return empty object when no JPMC preferences', async () => {
            const mockPreferences = [
                { id: 'SomeOtherPref', value: 'value' }
            ]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            const result = await getJPMCPreferences()
            expect(result).toEqual({})
        })

        it('should use cached JPMC prefs if valid', async () => {
            const mockPreferences = [
                { id: 'jpmc_test', value: 'cached' }
            ]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            await getJPMCPreferences()
            global.fetch.mockClear()

            await getJPMCPreferences()
            expect(global.fetch).not.toHaveBeenCalled()
        })

        it('should fetch fresh JPMC prefs when forceRefresh true', async () => {
            const mockPreferences = [{ id: 'jpmc_pref', value: 'test' }]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            await getJPMCPreferences()
            await getJPMCPreferences({ forceRefresh: true })

            expect(global.fetch).toHaveBeenCalledTimes(4)
        })
    })

    describe('getApplePayPreferences', () => {

        it('should disable Apple Pay when merchant ID missing', async () => {
            const mockPreferences = [
                { id: 'jpmcApplePayEnabled', value: 'true' }
            ]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            const result = await getApplePayPreferences()

            expect(result.enabled).toBe(false)
            expect(result.merchantId).toBeNull()
        })



        it('should force refresh Apple Pay config', async () => {
            const mockPreferences = [
                { id: 'jpmcApplePayMerchantId', value: 'merchant123' }
            ]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            await getApplePayPreferences()
            await getApplePayPreferences({ forceRefresh: true })

            expect(global.fetch).toHaveBeenCalledTimes(4)
        })

        it('should return null when API fails and no cache', async () => {
            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockErrorResponse(500))

            const result = await getApplePayPreferences()
            expect(result).toBeNull()
        })



        it('should use default values when preferences missing', async () => {
            const mockPreferences = [
                { id: 'jpmcApplePayMerchantId', value: 'merchant123' }
            ]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            const result = await getApplePayPreferences()

            expect(result.countryCode).toBe('US')
        })

        it('should parse comma-separated networks', async () => {
            const mockPreferences = [
                { id: 'jpmcApplePayMerchantId', value: 'merchant' },
                { id: 'jpmcApplePaySupportedNetworks', value: ' visa , masterCard , amex ' }
            ]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            const result = await getApplePayPreferences()
            expect(result.supportedNetworks).toContain('visa')
            expect(result.supportedNetworks).toContain('masterCard')
        })
    })

    describe('Cache Management', () => {
        it('should clear preferences cache', async () => {
            const mockPreferences = [{ id: 'JPMCClientID', value: 'cached' }]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            await getSitePreferences()
            clearPreferencesCache()
            await getSitePreferences()

            expect(global.fetch).toHaveBeenCalledTimes(4)
        })



        it('should return cache status', async () => {
            const mockPreferences = [{ id: 'test', value: 'value' }]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            await getSitePreferences()
            const status = getPreferencesCacheStatus()

            expect(status).toHaveProperty('isCached', true)
            expect(status).toHaveProperty('isValid', true)
        })

        it('should return cache status when not cached', () => {
            const status = getPreferencesCacheStatus()
            expect(status.isCached).toBe(false)
        })
    })

    describe('refreshSitePreferences', () => {
        it('should force refresh preferences from API', async () => {
            const mockPreferences = [{ id: 'JPMCClientID', value: 'refreshed' }]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            await getSitePreferences()
            const callsBefore = global.fetch.mock.calls.length

            await refreshSitePreferences()

            expect(global.fetch.mock.calls.length - callsBefore).toBe(2)
        })
    })
})
