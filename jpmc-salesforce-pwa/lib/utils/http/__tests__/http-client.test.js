/**
 * Unit Tests for HTTP Client Utilities
 */

import {
    generateRequestId,
    sleep,
    fetchWithRetry,
    fetchWithAuth,
    buildJPMCHeaders,
    parseJSONResponse
} from '../http-client'

// Mock logger
jest.mock('../../logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}))

// Mock uuid
jest.mock('uuid', () => ({
    v4: jest.fn(() => 'mock-uuid-1234')
}))

describe('HTTP Client Utilities', () => {
    describe('generateRequestId', () => {
        it('generates a request ID with default prefix', () => {
            const id = generateRequestId()
            expect(id).toMatch(/^req-\d+-mock-uui/)
        })

        it('generates a request ID with custom prefix', () => {
            const id = generateRequestId('custom')
            expect(id).toMatch(/^custom-\d+-mock-uui/)
        })
    })

    describe('sleep', () => {
        it('resolves after specified duration', async () => {
            const start = Date.now()
            await sleep(50)
            const elapsed = Date.now() - start
            expect(elapsed).toBeGreaterThanOrEqual(40) // Allow some timing variance
        })
    })

    describe('fetchWithRetry', () => {
        const originalFetch = global.fetch

        beforeEach(() => {
            global.fetch = jest.fn()
        })

        afterEach(() => {
            global.fetch = originalFetch
        })

        it('returns response on success', async () => {
            const mockResponse = { ok: true, status: 200 }
            global.fetch.mockResolvedValueOnce(mockResponse)

            const response = await fetchWithRetry('https://api.test.com', {})
            expect(response).toBe(mockResponse)
            expect(global.fetch).toHaveBeenCalledTimes(1)
        })

        it('does not retry on 400 errors', async () => {
            const mockResponse = { ok: false, status: 400 }
            global.fetch.mockResolvedValueOnce(mockResponse)

            const response = await fetchWithRetry('https://api.test.com', {})
            expect(response.status).toBe(400)
            expect(global.fetch).toHaveBeenCalledTimes(1)
        })

        it('retries on 500 errors', async () => {
            const errorResponse = { ok: false, status: 500 }
            const successResponse = { ok: true, status: 200 }
            
            global.fetch
                .mockResolvedValueOnce(errorResponse)
                .mockResolvedValueOnce(successResponse)

            const response = await fetchWithRetry('https://api.test.com', {}, {
                maxRetries: 1,
                baseDelay: 10
            })
            
            expect(response.status).toBe(200)
            expect(global.fetch).toHaveBeenCalledTimes(2)
        })

        it('throws error after max retries exhausted', async () => {
            global.fetch.mockRejectedValue(new Error('Network error'))

            await expect(
                fetchWithRetry('https://api.test.com', {}, {
                    maxRetries: 2,
                    baseDelay: 10
                })
            ).rejects.toThrow('Network error')
            
            expect(global.fetch).toHaveBeenCalledTimes(3) // Initial + 2 retries
        })

        it('returns last response when retries exhausted', async () => {
            const errorResponse = { ok: false, status: 503 }
            global.fetch.mockResolvedValue(errorResponse)

            const response = await fetchWithRetry('https://api.test.com', {}, {
                maxRetries: 1,
                baseDelay: 10
            })
            
            expect(response.status).toBe(503)
        })
    })

    describe('fetchWithAuth', () => {
        const originalFetch = global.fetch

        beforeEach(() => {
            global.fetch = jest.fn()
        })

        afterEach(() => {
            global.fetch = originalFetch
        })

        it('makes request with auth token', async () => {
            const mockResponse = { ok: true, status: 200 }
            global.fetch.mockResolvedValueOnce(mockResponse)

            await fetchWithAuth('https://api.test.com', {}, {
                getToken: jest.fn().mockResolvedValue('test-token')
            })

            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.test.com',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer test-token'
                    })
                })
            )
        })

        it('retries with new token on 401', async () => {
            const unauthorizedResponse = { ok: false, status: 401 }
            const successResponse = { ok: true, status: 200 }
            
            global.fetch
                .mockResolvedValueOnce(unauthorizedResponse)
                .mockResolvedValueOnce(successResponse)

            const getToken = jest.fn()
                .mockResolvedValueOnce('old-token')
                .mockResolvedValueOnce('new-token')
            const clearToken = jest.fn()

            const response = await fetchWithAuth('https://api.test.com', {}, {
                getToken,
                clearToken,
                retryOn401: true
            })

            expect(response.status).toBe(200)
            expect(clearToken).toHaveBeenCalled()
            expect(getToken).toHaveBeenCalledTimes(2)
        })

        it('does not retry on 401 when retryOn401 is false', async () => {
            const unauthorizedResponse = { ok: false, status: 401 }
            global.fetch.mockResolvedValueOnce(unauthorizedResponse)

            const response = await fetchWithAuth('https://api.test.com', {}, {
                getToken: jest.fn().mockResolvedValue('token'),
                retryOn401: false
            })

            expect(response.status).toBe(401)
            expect(global.fetch).toHaveBeenCalledTimes(1)
        })
    })

    describe('buildJPMCHeaders', () => {
        it('builds headers with required fields', () => {
            const headers = buildJPMCHeaders({
                merchantId: 'MERCHANT123'
            })

            expect(headers['merchant-id']).toBe('MERCHANT123')
            expect(headers['platform-id']).toBeUndefined() // Only sent if configured
            expect(headers['request-id']).toMatch(/^req-/)
            expect(headers['Accept']).toBe('application/json')
            expect(headers['Content-Type']).toBe('application/json')
        })

        it('includes access token when provided', () => {
            const headers = buildJPMCHeaders({
                merchantId: 'MERCHANT123',
                accessToken: 'test-access-token'
            })

            expect(headers['Authorization']).toBe('Bearer test-access-token')
        })

        it('uses custom request ID when provided', () => {
            const headers = buildJPMCHeaders({
                merchantId: 'MERCHANT123',
                requestId: 'custom-request-id'
            })

            expect(headers['request-id']).toBe('custom-request-id')
        })

        it('uses custom platform ID when provided', () => {
            const headers = buildJPMCHeaders({
                merchantId: 'MERCHANT123',
                platformId: 'CUSTOM_PLATFORM'
            })

            expect(headers['platform-id']).toBe('CUSTOM_PLATFORM')
        })
    })

    describe('parseJSONResponse', () => {
        it('parses valid JSON response', async () => {
            const mockResponse = {
                text: jest.fn().mockResolvedValue('{"status":"success"}')
            }

            const result = await parseJSONResponse(mockResponse)
            expect(result).toEqual({ status: 'success' })
        })

        it('returns empty object for empty response', async () => {
            const mockResponse = {
                text: jest.fn().mockResolvedValue('')
            }

            const result = await parseJSONResponse(mockResponse)
            expect(result).toEqual({})
        })

        it('returns error object for invalid JSON', async () => {
            const mockResponse = {
                text: jest.fn().mockResolvedValue('invalid json {')
            }

            const result = await parseJSONResponse(mockResponse)
            expect(result.parseError).toBe(true)
            expect(result.message).toBe('Failed to parse response')
        })
    })
})
