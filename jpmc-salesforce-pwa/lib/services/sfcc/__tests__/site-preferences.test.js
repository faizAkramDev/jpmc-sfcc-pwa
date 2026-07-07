/**
 * Unit Tests for SFCC Site Preferences Service
 *
 * @jest-environment node
 */

// Mock fetch globally
global.fetch = jest.fn()

const {
    getSitePreferences,
    getJPMCPreferences,
    refreshSitePreferences,
    clearPreferencesCache
} = require('../site-preferences')

// =============================================================================
// Setup & Teardown
// =============================================================================

describe('SFCC Site Preferences Service', () => {
    const originalEnv = process.env

    // Mock token response
    const mockTokenResponse = {
        ok: true,
        json: () => Promise.resolve({ access_token: 'mock-access-token' })
    }

    // Mock preferences response helper
    const createMockPreferencesResponse = (preferences) => ({
        ok: true,
        json: () => Promise.resolve({ data: preferences })
    })

    beforeEach(() => {
        jest.clearAllMocks()
        process.env = { ...originalEnv }
        global.fetch.mockReset()
        clearPreferencesCache()

        // Set up required env vars (matching getSFCCConfig requirements)
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

    // =========================================================================
    // getSitePreferences Tests
    // =========================================================================

    describe('getSitePreferences', () => {
        it('should fetch site preferences from SFCC API', async () => {
            const mockPreferences = [
                { id: 'JPMCClientID', value: 'test-client-id' },
                { id: 'JPMC_MerchantCode', value: 'test-merchant' }
            ]

            // Mock token fetch then preferences fetch
            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            const result = await getSitePreferences()

            // Should have called fetch twice (token + preferences)
            expect(global.fetch).toHaveBeenCalledTimes(2)
            // getSitePreferences returns the array directly
            expect(result).toEqual(mockPreferences)
        })

        it('should use cached preferences on subsequent calls', async () => {
            const mockPreferences = [{ id: 'JPMCClientID', value: 'cached-value' }]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            // First call
            await getSitePreferences()
            // Second call
            await getSitePreferences()

            // Fetch should only be called twice (token + preferences) for first call only
            expect(global.fetch).toHaveBeenCalledTimes(2)
        })

        it('should force refresh when forceRefresh is true', async () => {
            const mockPreferences = [{ id: 'JPMCClientID', value: 'refreshed-value' }]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            // First call
            await getSitePreferences()
            // Second call with force refresh
            await getSitePreferences({ forceRefresh: true })

            // Fetch should be called 4 times (2 per getSitePreferences call)
            expect(global.fetch).toHaveBeenCalledTimes(4)
        })

        it('should throw error when SFCC configuration is missing', async () => {
            delete process.env.COMMERCE_API_SHORT_CODE

            await expect(getSitePreferences()).rejects.toThrow(
                'Missing required SFCC configuration'
            )
        })

        it('should handle API errors gracefully', async () => {
            // Token succeeds but preferences fails
            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce({
                    ok: false,
                    status: 403,
                    statusText: 'Forbidden',
                    text: () => Promise.resolve('Access denied')
                })

            await expect(getSitePreferences()).rejects.toThrow()
        })
    })

    // =========================================================================
    // getJPMCPreferences Tests
    // =========================================================================

    describe('getJPMCPreferences', () => {
        it('should filter preferences to only JPMC-related ones', async () => {
            const mockPreferences = [
                { id: 'JPMCClientID', value: 'test-client-id' },
                { id: 'JPMC_MerchantCode', value: 'test-merchant' },
                { id: 'JPMCCaptureMethod', value: 'NOW' },
                { id: 'UnrelatedPreference', value: 'should-be-excluded' },
                { id: 'AnotherPref', value: 'also-excluded' }
            ]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            const result = await getJPMCPreferences()

            expect(result).toHaveProperty('JPMCClientID', 'test-client-id')
            expect(result).toHaveProperty('JPMC_MerchantCode', 'test-merchant')
            expect(result).toHaveProperty('JPMCCaptureMethod', 'NOW')
            expect(result).not.toHaveProperty('UnrelatedPreference')
            expect(result).not.toHaveProperty('AnotherPref')
        })

        it('should return empty object when no JPMC preferences exist', async () => {
            const mockPreferences = [
                { id: 'SomeOtherPref', value: 'value' }
            ]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            const result = await getJPMCPreferences()

            expect(result).toEqual({})
        })
    })

    // =========================================================================
    // refreshSitePreferences Tests
    // =========================================================================

    describe('refreshSitePreferences', () => {
        it('should force refresh preferences from API', async () => {
            const mockPreferences = [{ id: 'JPMCClientID', value: 'refreshed' }]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            // Populate cache first
            await getSitePreferences()
            
            // Clear mock counts
            const callsBefore = global.fetch.mock.calls.length

            // Refresh should make new API call
            await refreshSitePreferences()

            expect(global.fetch.mock.calls.length - callsBefore).toBe(2)
        })
    })

    // =========================================================================
    // clearPreferencesCache Tests
    // =========================================================================

    describe('clearPreferencesCache', () => {
        it('should clear the preferences cache', async () => {
            const mockPreferences = [{ id: 'JPMCClientID', value: 'cached' }]

            global.fetch
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))
                .mockResolvedValueOnce(mockTokenResponse)
                .mockResolvedValueOnce(createMockPreferencesResponse(mockPreferences))

            // Populate cache
            await getSitePreferences()
            
            // Clear cache
            clearPreferencesCache()
            
            // Should make new API call (2 more calls)
            await getSitePreferences()

            expect(global.fetch).toHaveBeenCalledTimes(4)
        })
    })
})
