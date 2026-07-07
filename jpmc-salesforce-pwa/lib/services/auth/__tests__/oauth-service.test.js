/**
 * Tests for OAuth Service
 * 
 * Tests OAuth 2.0 authentication with JWT Client Assertion grant type
 */

import { getAccessToken, verifyAuthConfiguration } from '../oauth-service'

jest.mock('../jwt-generator', () => ({
    generateClientAssertion: jest.fn()
}))

jest.mock('../certificate-loader', () => ({
    getCertificateThumbprint: jest.fn(),
    loadPrivateKey: jest.fn()
}))

jest.mock('../token-manager', () => ({
    isTokenValid: jest.fn(),
    getCachedToken: jest.fn(),
    cacheToken: jest.fn(),
    clearTokenCache: jest.fn(),
    getTokenCacheStatus: jest.fn(),
    acquireRefreshLock: jest.fn()
}))

jest.mock('../../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}))

describe('OAuth Service', () => {
    let mockFetch
    const mockConfig = {
        clientId: 'test-client-id',
        resourceId: 'test-resource-id',
        certificateBase64: 'cert-base64',
        privateKeyBase64: 'key-base64'
    }
    const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJ0b2tlbiJ9.sig'

    beforeEach(() => {
        jest.clearAllMocks()
        mockFetch = jest.fn()
        global.fetch = mockFetch
        process.env.JPMC_DEBUG = 'false'
    })

    afterEach(() => {
        delete process.env.JPMC_DEBUG
    })

    describe('getAccessToken', () => {
        it('should throw error when config is null', async () => {
            await expect(getAccessToken(null)).rejects.toThrow(
                'Config is required for getAccessToken'
            )
        })

        it('should throw error when config is undefined', async () => {
            await expect(getAccessToken(undefined)).rejects.toThrow(
                'Config is required for getAccessToken'
            )
        })

        it('should return cached token if valid and not forcing refresh', async () => {
            const { isTokenValid, getCachedToken, getTokenCacheStatus } = require('../token-manager')
            
            isTokenValid.mockReturnValue(true)
            getCachedToken.mockReturnValue(mockToken)
            getTokenCacheStatus.mockReturnValue({ expiresIn: 7200 })

            const result = await getAccessToken(mockConfig)

            expect(result).toBe(mockToken)
            expect(isTokenValid).toHaveBeenCalled()
            expect(getCachedToken).toHaveBeenCalled()
        })

        it('should request new token when cache is invalid', async () => {
            const { isTokenValid, getCachedToken, acquireRefreshLock, cacheToken } = require('../token-manager')
            const { generateClientAssertion } = require('../jwt-generator')

            isTokenValid.mockReturnValue(false)
            generateClientAssertion.mockReturnValue('jwt-assertion')
            acquireRefreshLock.mockImplementation((fn) => fn())

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    access_token: mockToken,
                    expires_in: 3600,
                    token_type: 'Bearer'
                })
            })

            const result = await getAccessToken(mockConfig)

            expect(result).toBe(mockToken)
            expect(generateClientAssertion).toHaveBeenCalledWith(mockConfig)
            expect(cacheToken).toHaveBeenCalledWith(mockToken, 3600, 'Bearer')
        })

        it('should force refresh token even if cached token is valid', async () => {
            const { generateClientAssertion } = require('../jwt-generator')
            const { acquireRefreshLock, cacheToken, isTokenValid } = require('../token-manager')

            isTokenValid.mockReturnValue(true) // Cache is valid
            generateClientAssertion.mockReturnValue('jwt-assertion')
            acquireRefreshLock.mockImplementation((fn) => fn())

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    access_token: mockToken,
                    expires_in: 3600
                })
            })

            const result = await getAccessToken(mockConfig, true) // forceRefresh = true

            expect(result).toBe(mockToken)
            expect(generateClientAssertion).toHaveBeenCalled()
        })

        it('should use expires_in from response to cache token', async () => {
            const { acquireRefreshLock, cacheToken } = require('../token-manager')
            const { generateClientAssertion } = require('../jwt-generator')

            generateClientAssertion.mockReturnValue('jwt-assertion')
            acquireRefreshLock.mockImplementation((fn) => fn())

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    access_token: mockToken,
                    expires_in: 7200,
                    token_type: 'Bearer'
                })
            })

            await getAccessToken(mockConfig, true)

            expect(cacheToken).toHaveBeenCalledWith(mockToken, 7200, 'Bearer')
        })

        it('should use default token validity if expires_in not provided', async () => {
            const { acquireRefreshLock, cacheToken } = require('../token-manager')
            const { generateClientAssertion } = require('../jwt-generator')

            generateClientAssertion.mockReturnValue('jwt-assertion')
            acquireRefreshLock.mockImplementation((fn) => fn())

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    access_token: mockToken,
                    token_type: 'Bearer'
                    // expires_in not provided
                })
            })

            await getAccessToken(mockConfig, true)

            // Should use DEFAULT_TOKEN_VALIDITY_SECONDS (28800)
            const call = cacheToken.mock.calls[0]
            expect(call[0]).toBe(mockToken)
            expect(call[1]).toBe(28800) // Default 8 hours
        })

        it('should build correct token request body', async () => {
            const { acquireRefreshLock } = require('../token-manager')
            const { generateClientAssertion } = require('../jwt-generator')

            generateClientAssertion.mockReturnValue('jwt-assertion')
            acquireRefreshLock.mockImplementation((fn) => fn())

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    access_token: mockToken
                })
            })

            await getAccessToken(mockConfig, true)

            const fetchCall = mockFetch.mock.calls[0]
            const body = new URLSearchParams(fetchCall[1].body)

            expect(body.get('grant_type')).toBe('client_credentials')
            expect(body.get('client_id')).toBe('test-client-id')
            expect(body.get('client_assertion_type')).toBe('urn:ietf:params:oauth:client-assertion-type:jwt-bearer')
            expect(body.get('client_assertion')).toBe('jwt-assertion')
            expect(body.get('resource')).toBe('test-resource-id')
        })

        it('should send correct headers', async () => {
            const { acquireRefreshLock } = require('../token-manager')
            const { generateClientAssertion } = require('../jwt-generator')

            generateClientAssertion.mockReturnValue('jwt-assertion')
            acquireRefreshLock.mockImplementation((fn) => fn())

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    access_token: mockToken
                })
            })

            await getAccessToken(mockConfig, true)

            const fetchCall = mockFetch.mock.calls[0]
            const headers = fetchCall[1].headers

            expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded')
            expect(headers['Accept']).toBe('application/json')
        })

        it('should throw error when token response is not ok', async () => {
            const { acquireRefreshLock } = require('../token-manager')
            const { generateClientAssertion } = require('../jwt-generator')

            generateClientAssertion.mockReturnValue('jwt-assertion')
            acquireRefreshLock.mockImplementation((fn) => fn())

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                text: async () => 'Unauthorized'
            })

            await expect(getAccessToken(mockConfig, true)).rejects.toThrow(
                'Token request failed: 401'
            )
        })

        it('should throw error when access_token missing from response', async () => {
            const { acquireRefreshLock } = require('../token-manager')
            const { generateClientAssertion } = require('../jwt-generator')

            generateClientAssertion.mockReturnValue('jwt-assertion')
            acquireRefreshLock.mockImplementation((fn) => fn())

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    // access_token missing
                    expires_in: 3600
                })
            })

            await expect(getAccessToken(mockConfig, true)).rejects.toThrow(
                'Token response missing access_token'
            )
        })

        it('should handle JSON error response', async () => {
            const { acquireRefreshLock } = require('../token-manager')
            const { generateClientAssertion } = require('../jwt-generator')
            const logger = require('../../../utils/logger')

            process.env.JPMC_DEBUG = 'true'

            generateClientAssertion.mockReturnValue('jwt-assertion')
            acquireRefreshLock.mockImplementation((fn) => fn())

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: async () => '{"error": "invalid_grant", "error_description": "Invalid assertion"}'
            })

            await expect(getAccessToken(mockConfig, true)).rejects.toThrow()

            expect(logger.debug).toHaveBeenCalledWith(
                '[OAuth] Token request error details:',
                expect.stringContaining('invalid_grant')
            )
        })

        it('should handle non-JSON error response', async () => {
            const { acquireRefreshLock } = require('../token-manager')
            const { generateClientAssertion } = require('../jwt-generator')

            generateClientAssertion.mockReturnValue('jwt-assertion')
            acquireRefreshLock.mockImplementation((fn) => fn())

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error'
            })

            await expect(getAccessToken(mockConfig, true)).rejects.toThrow(
                'Token request failed: 500'
            )
        })

        it('should log successful token acquisition', async () => {
            const { acquireRefreshLock } = require('../token-manager')
            const { generateClientAssertion } = require('../jwt-generator')
            const logger = require('../../../utils/logger')

            generateClientAssertion.mockReturnValue('jwt-assertion')
            acquireRefreshLock.mockImplementation((fn) => fn())

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    access_token: mockToken,
                    expires_in: 3600
                })
            })

            await getAccessToken(mockConfig, true)

            expect(logger.info).toHaveBeenCalledWith(
                '[OAuth] Access token obtained successfully'
            )
        })

        it('should re-check cache in lock to handle concurrent requests', async () => {
            const { acquireRefreshLock, isTokenValid, getCachedToken } = require('../token-manager')
            const { generateClientAssertion } = require('../jwt-generator')

            let callCount = 0
            isTokenValid.mockImplementation(() => {
                callCount++
                return callCount === 2 // Return true on second call (inside lock)
            })
            getCachedToken.mockReturnValue(mockToken)
            generateClientAssertion.mockReturnValue('jwt-assertion')

            let lockFnCalled = false
            acquireRefreshLock.mockImplementation((fn) => {
                lockFnCalled = true
                return fn()
            })

            const result = await getAccessToken(mockConfig, false)

            expect(result).toBe(mockToken)
            expect(lockFnCalled).toBe(true)
            // isTokenValid called twice: once before lock, once inside lock
            expect(isTokenValid).toHaveBeenCalledTimes(2)
        })
    })

    describe('verifyAuthConfiguration', () => {
        it('should verify valid configuration', () => {
            const logger = require('../../../utils/logger')
            const { getCertificateThumbprint, loadPrivateKey } = require('../certificate-loader')

            getCertificateThumbprint.mockReturnValue('abcd1234')
            loadPrivateKey.mockReturnValue('-----BEGIN PRIVATE KEY-----')

            const config = {
                clientId: 'client-id',
                certificateBase64: 'cert-base64',
                privateKeyBase64: 'key-base64'
            }

            const result = verifyAuthConfiguration(config)

            expect(result).toBeDefined()
            expect(result.valid).toBe(true)
            expect(logger.info).toHaveBeenCalledWith(
                '[OAuth] Verifying authentication configuration...'
            )
        })

        it('should throw error when config is null', () => {
            expect(() => verifyAuthConfiguration(null)).toThrow(
                'Config is required for verifyAuthConfiguration'
            )
        })

        it('should throw error when certificate loading fails', () => {
            const { getCertificateThumbprint } = require('../certificate-loader')

            getCertificateThumbprint.mockImplementation(() => {
                throw new Error('Certificate not found')
            })

            const config = {
                clientId: 'client-id'
            }

            expect(() => verifyAuthConfiguration(config)).toThrow()
        })

        it('should throw error when private key loading fails', () => {
            const { getCertificateThumbprint, loadPrivateKey } = require('../certificate-loader')

            getCertificateThumbprint.mockReturnValue('abcd1234')
            loadPrivateKey.mockImplementation(() => {
                throw new Error('Private key not found')
            })

            const config = {
                clientId: 'client-id'
            }

            expect(() => verifyAuthConfiguration(config)).toThrow()
        })

        it('should return configuration status with thumbprint', () => {
            const { getCertificateThumbprint, loadPrivateKey } = require('../certificate-loader')

            getCertificateThumbprint.mockReturnValue('thumbprint-value')
            loadPrivateKey.mockReturnValue('key')

            const config = {
                clientId: 'client-id-12345',
                certificateBase64: 'cert',
                privateKeyBase64: 'key'
            }

            const result = verifyAuthConfiguration(config)

            expect(result.thumbprint).toBe('thumbprint-value')
            expect(result.clientId).toContain('client-id')
            expect(result.message).toContain('valid')
        })
    })
})
