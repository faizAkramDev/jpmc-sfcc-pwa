/**
 * Unit Tests for payment-api module
 */

import {
    generateRequestId,
    createPayment,
    getPaymentStatus,
    callFraudCheck
} from '../payment-api'

// Mock dependencies
jest.mock('../../../utils/constants/api-constants', () => ({
    JPMC_ENDPOINTS: {
        PAYMENTS: '/api/v2/payments',
        FRAUD_CHECK: '/api/v2/fraudcheck'
    }
}))

jest.mock('../../../utils/constants', () => ({
    RESPONSE_STATUS: { SUCCESS: 'SUCCESS', ERROR: 'ERROR' },
    PAYMENT_STATES: { AUTHORIZED: 'AUTHORIZED', ERROR: 'ERROR' }
}))

jest.mock('../../../utils/constants/error-constants', () => ({
    GENERIC_API_ERROR_MESSAGE: 'An error occurred processing your payment'
}))

jest.mock('../../../utils/http/http-client', () => ({
    buildJPMCHeaders: jest.fn(() => ({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token'
    }))
}))

jest.mock('../../auth/oauth-service', () => ({
    getAccessToken: jest.fn().mockResolvedValue('mock-access-token'),
    clearTokenCache: jest.fn()
}))

jest.mock('../request-builder', () => ({
    buildPaymentRequestBody: jest.fn(() => ({ amount: 100, currency: 'USD' }))
}))

jest.mock('../response-normalizer', () => ({
    normalizePaymentResponse: jest.fn(data => data),
    buildErrorResponse: jest.fn((code, message, meta) => ({
        success: false,
        errorCode: code,
        message,
        ...meta
    }))
}))

jest.mock('../../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    safeStringify: jest.fn(obj => JSON.stringify(obj))
}))

jest.mock('uuid', () => ({
    v4: jest.fn(() => 'mock-uuid-1234')
}))

describe('payment-api', () => {
    const mockConfig = {
        merchantId: 'test-merchant-123',
        platformId: 'test-platform',
        apiHost: 'api.jpmorgan.com'
    }

    beforeEach(() => {
        jest.clearAllMocks()
        
        // Default fetch mock
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    responseStatus: 'SUCCESS',
                    transactionId: 'txn-123',
                    transactionState: 'AUTHORIZED'
                })
            })
        )
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    describe('generateRequestId', () => {
        it('generates request IDs with correct format', () => {
            const id1 = generateRequestId()
            
            expect(id1).toMatch(/^req-\d+-mock-uui/)
        })

        it('generates different IDs when called at different times', async () => {
            const id1 = generateRequestId()
            // Small delay to ensure different timestamp
            await new Promise(resolve => setTimeout(resolve, 5))
            const id2 = generateRequestId()
            
            expect(id1).not.toBe(id2)
        })

        it('includes timestamp prefix', () => {
            const id = generateRequestId()
            expect(id).toMatch(/^req-\d+/)
        })
    })

    describe('createPayment', () => {
        it('throws error when config is not provided', async () => {
            await expect(createPayment({ paymentData: {} })).rejects.toThrow(
                'Config is required for createPayment'
            )
        })

        it('throws error when merchantId is missing', async () => {
            await expect(
                createPayment({ config: { apiHost: 'api.test.com' }, paymentData: {} })
            ).rejects.toThrow('Missing required BM config: JPMC_MerchantCode')
        })

        it('throws error when apiHost is missing', async () => {
            await expect(
                createPayment({ config: { merchantId: 'test' }, paymentData: {} })
            ).rejects.toThrow('Missing required BM config: JPMCApiHost')
        })

        it('makes payment API call with correct parameters', async () => {
            const result = await createPayment({
                config: mockConfig,
                paymentData: { amount: 100, currency: 'USD' }
            })

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/v2/payments'),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.any(Object),
                    body: expect.any(String)
                })
            )

            expect(result.success).toBe(true)
        })

        it('uses provided accessToken if available', async () => {
            const { getAccessToken } = require('../../auth/oauth-service')
            
            await createPayment({
                accessToken: 'provided-token',
                config: mockConfig,
                paymentData: {}
            })

            // Should not fetch new token
            expect(getAccessToken).not.toHaveBeenCalled()
        })

        it('fetches accessToken when not provided', async () => {
            const { getAccessToken } = require('../../auth/oauth-service')
            
            await createPayment({
                config: mockConfig,
                paymentData: {}
            })

            expect(getAccessToken).toHaveBeenCalledWith(mockConfig, false)
        })

        it('returns error response when token fetch fails', async () => {
            const { getAccessToken } = require('../../auth/oauth-service')
            getAccessToken.mockRejectedValueOnce(new Error('Token error'))
            
            const result = await createPayment({
                config: mockConfig,
                paymentData: {}
            })

            expect(result.success).toBe(false)
            expect(result.errorCode).toBe('AUTHENTICATION_ERROR')
        })

        it('retries on 401 response', async () => {
            const { getAccessToken, clearTokenCache } = require('../../auth/oauth-service')
            
            // First call returns 401, second succeeds
            global.fetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 401,
                    json: () => Promise.resolve({ error: 'Unauthorized' })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        responseStatus: 'SUCCESS',
                        transactionId: 'txn-456'
                    })
                })

            const result = await createPayment({
                config: mockConfig,
                paymentData: {}
            })

            expect(clearTokenCache).toHaveBeenCalled()
            expect(getAccessToken).toHaveBeenCalledWith(mockConfig, true)
            expect(global.fetch).toHaveBeenCalledTimes(2)
            expect(result.success).toBe(true)
        })

        it('returns error response when 401 token refresh fails', async () => {
            const { getAccessToken, clearTokenCache } = require('../../auth/oauth-service')
            
            // First call succeeds for initial token, then 401, then refresh fails
            getAccessToken
                .mockResolvedValueOnce('initial-token') // Initial token fetch
                .mockRejectedValueOnce(new Error('Refresh token expired')) // Refresh after 401 fails

            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: () => Promise.resolve({ error: 'Token expired' })
            })

            const result = await createPayment({
                config: mockConfig,
                paymentData: {}
            })

            expect(clearTokenCache).toHaveBeenCalled()
            expect(result.success).toBe(false)
            expect(result.errorCode).toBe('AUTHENTICATION_ERROR')
        })

        it('returns error response on network failure', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'))
            
            const result = await createPayment({
                config: mockConfig,
                paymentData: {}
            })

            expect(result.success).toBe(false)
            expect(result.errorCode).toBe('NETWORK_ERROR')
        })

        it('returns error response when API returns non-ok status', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: () => Promise.resolve({
                    responseStatus: 'ERROR',
                    errorMessage: 'Bad request'
                })
            })
            
            const result = await createPayment({
                config: mockConfig,
                paymentData: {}
            })

            expect(result.success).toBe(false)
        })
    })

    describe('getPaymentStatus', () => {
        it('throws error when config is not provided', async () => {
            await expect(
                getPaymentStatus({ transactionId: 'txn-123' })
            ).rejects.toThrow('Config is required for getPaymentStatus')
        })

        it('throws error when merchantId is missing', async () => {
            await expect(
                getPaymentStatus({ config: { apiHost: 'api.test.com' }, transactionId: 'txn-123' })
            ).rejects.toThrow('Missing required BM config: JPMC_MerchantCode')
        })

        it('makes GET request with transaction ID', async () => {
            await getPaymentStatus({
                config: mockConfig,
                transactionId: 'txn-123'
            })

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/v2/payments/txn-123'),
                expect.objectContaining({ method: 'GET' })
            )
        })

        it('retries on 401 response', async () => {
            const { getAccessToken, clearTokenCache } = require('../../auth/oauth-service')
            
            global.fetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 401,
                    json: () => Promise.resolve({})
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({ transactionState: 'AUTHORIZED' })
                })

            const result = await getPaymentStatus({
                config: mockConfig,
                transactionId: 'txn-123'
            })

            expect(clearTokenCache).toHaveBeenCalled()
            expect(getAccessToken).toHaveBeenCalledWith(mockConfig, true)
            expect(result.success).toBe(true)
        })

        it('throws error on network failure', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'))
            
            await expect(
                getPaymentStatus({
                    config: mockConfig,
                    transactionId: 'txn-123'
                })
            ).rejects.toThrow('Network error')
        })
    })

    describe('callFraudCheck', () => {
        it('throws error when config is not provided', async () => {
            await expect(
                callFraudCheck({ fraudPayload: {} })
            ).rejects.toThrow('Config is required for callFraudCheck')
        })

        it('throws error when merchantId is missing', async () => {
            await expect(
                callFraudCheck({ config: { apiHost: 'api.test.com' }, fraudPayload: {} })
            ).rejects.toThrow('Missing required BM config: JPMC_MerchantCode')
        })

        it('returns null on token fetch failure (fail-open)', async () => {
            const { getAccessToken } = require('../../auth/oauth-service')
            getAccessToken.mockRejectedValueOnce(new Error('Token error'))
            
            const result = await callFraudCheck({
                config: mockConfig,
                fraudPayload: { orderId: '123' }
            })

            expect(result).toBeNull() // Fail-open
        })

        it('makes POST request to fraud check endpoint', async () => {
            await callFraudCheck({
                config: mockConfig,
                fraudPayload: { orderId: '123' }
            })

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/v2/fraudcheck'),
                expect.objectContaining({ method: 'POST' })
            )
        })

        it('returns null on API error (fail-open)', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: () => Promise.resolve({ error: 'Server error' })
            })
            
            const result = await callFraudCheck({
                config: mockConfig,
                fraudPayload: {}
            })

            expect(result).toBeNull()
        })

        it('returns null on network error (fail-open)', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'))
            
            const result = await callFraudCheck({
                config: mockConfig,
                fraudPayload: {}
            })

            expect(result).toBeNull()
        })

        it('retries on 401 response', async () => {
            const { clearTokenCache } = require('../../auth/oauth-service')
            
            global.fetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 401,
                    json: () => Promise.resolve({})
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({ fraudScore: 0 })
                })

            const result = await callFraudCheck({
                config: mockConfig,
                fraudPayload: {}
            })

            expect(clearTokenCache).toHaveBeenCalled()
            expect(result).toEqual({ fraudScore: 0 })
        })

        it('returns null when 401 refresh fails (fail-open)', async () => {
            const { getAccessToken } = require('../../auth/oauth-service')
            
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: () => Promise.resolve({})
            })
            
            getAccessToken.mockRejectedValueOnce(new Error('Refresh failed'))
            
            const result = await callFraudCheck({
                config: mockConfig,
                fraudPayload: {}
            })

            expect(result).toBeNull()
        })
    })
})
