/**
 * Unit Tests for JP Morgan Payment API Service
 *
 * @jest-environment node
 */

// Mock auth module (index.js) - this is what jpmorgan-api.js imports from
jest.mock('../auth', () => ({
    getAccessToken: jest.fn().mockImplementation((_config, _forceRefresh) => {
        const env = process.env.JPMC_ENVIRONMENT
        if (env === 'mock') {
            return Promise.resolve('mock-access-token-for-development')
        }
        return Promise.resolve('mock-access-token')
    }),
    clearTokenCache: jest.fn(),
    isTokenValid: jest.fn().mockReturnValue(false),
    getCachedToken: jest.fn(),
    cacheToken: jest.fn(),
    getTokenCacheStatus: jest.fn().mockReturnValue({ expiresAt: null }),
    getTimeUntilExpiry: jest.fn(),
    needsRefresh: jest.fn(),
    verifyAuthConfiguration: jest.fn(),
    loadCertificate: jest.fn(),
    loadPrivateKey: jest.fn(),
    getCertificateThumbprints: jest.fn(),
    getCertificateThumbprint: jest.fn(),
    generateClientAssertion: jest.fn()
}))

// Also mock oauth-service for payment-api.js which imports directly
jest.mock('../auth/oauth-service', () => ({
    getAccessToken: jest.fn().mockImplementation((_config, _forceRefresh) => {
        const env = process.env.JPMC_ENVIRONMENT
        if (env === 'mock') {
            return Promise.resolve('mock-access-token-for-development')
        }
        return Promise.resolve('mock-access-token')
    }),
    clearTokenCache: jest.fn(),
    isTokenValid: jest.fn().mockReturnValue(false),
    getTokenCacheStatus: jest.fn().mockReturnValue({ expiresAt: null }),
    verifyAuthConfiguration: jest.fn()
}))
jest.mock('../auth/token-manager', () => ({
    clearTokenCache: jest.fn(),
    isTokenValid: jest.fn().mockReturnValue(false),
    getCachedToken: jest.fn(),
    cacheToken: jest.fn(),
    getTokenCacheStatus: jest.fn().mockReturnValue({ expiresAt: null }),
    getTimeUntilExpiry: jest.fn(),
    needsRefresh: jest.fn()
}))

const jpmorganApi = require('../api/payment-api')
const responseNormalizer = require('../api/response-normalizer')
const oauthService = require('../auth/oauth-service')
const tokenManager = require('../auth/token-manager')
const authModule = require('../auth')
const _jpmcConfig = require('../../utils/config/jpmc-config')

// =============================================================================
// Test Data
// =============================================================================

const mockConfig = {
    merchantId: '998482157630',
    platformId: '909876543210',
    environment: 'sandbox',
    apiHost: 'api-ms-test.payments.jpmorgan.com'
}

const mockCardData = {
    accountNumber: '4111111111111111',
    cvv: '123',
    expiryMonth: 12,
    expiryYear: 2027
}

const mockEncryptedCard = {
    accountNumberType: 'SAFETECH_PAGE_ENCRYPTION',
    accountNumber: 'encrypted_pan_12345',
    cvv: 'encrypted_cvv',
    encryptionIntegrityCheck: 'integrity_hash_xyz',
    expiryMonth: 12,
    expiryYear: 2027
}

const mockBillingAddress = {
    line1: '123 Main Street',
    city: 'New York',
    state: 'NY',
    postalCode: '10001',
    countryCode: 'USA'
}

const mockPaymentResponse = {
    responseStatus: 'SUCCESS',
    transactionId: 'TXN-123456789',
    transactionState: 'AUTHORIZED',
    approvalCode: 'ABC123',
    amount: 100.00,
    currency: 'USD'
}

// =============================================================================
// Setup & Teardown
// =============================================================================

describe('JP Morgan Payment API Service', () => {
    const originalEnv = process.env

    beforeEach(() => {
        jest.clearAllMocks()
        process.env = { ...originalEnv }
        
        // Set up sandbox environment for testing (not mock)
        process.env.JPMC_ENVIRONMENT = 'sandbox'
        process.env.JPMC_MERCHANT_ID = '998482157630'
        process.env.JPMC_PLATFORM_ID = '909876543210'
        process.env.JPMC_CLIENT_ID = 'test-client-id'
        process.env.JPMC_RESOURCE_ID = 'test-resource-id'
        process.env.JPMC_CERTIFICATE_BASE64 = 'dGVzdC1jZXJ0' // 'test-cert' base64
        
        // Default mock for oauth service (new module path)
        oauthService.getAccessToken.mockImplementation((_config, _forceRefresh) => {
            const env = process.env.JPMC_ENVIRONMENT
            if (env === 'mock') {
                return Promise.resolve('mock-access-token-for-development')
            }
            return Promise.resolve('mock-access-token')
        })
        oauthService.clearTokenCache.mockImplementation(() => {})
        
        // Default mock for token manager
        tokenManager.clearTokenCache.mockImplementation(() => {})
        tokenManager.isTokenValid.mockReturnValue(false)
        tokenManager.getTokenCacheStatus.mockReturnValue({ expiresAt: null })
        
        // Default mock for auth service
        authModule.getAccessToken.mockResolvedValue('mock-access-token')
        authModule.getTokenCacheStatus.mockReturnValue({ expiresAt: null })
        authModule.clearTokenCache.mockImplementation(() => {})
        
        // Mock global fetch - default to successful response
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockPaymentResponse)
        })
    })

    afterAll(() => {
        process.env = originalEnv
    })

    // =========================================================================
    // NOTE: getJPMCConfig tests removed - function deprecated
    // Non-sensitive config now comes from BM site preferences via getJPMCConfigAsync()
    // getJPMCConfig() now only returns sensitive credentials (certificates, keys)
    // =========================================================================

    // =========================================================================
    // generateRequestId Tests
    // =========================================================================

    describe('generateRequestId', () => {
        it('should generate a valid request ID format', () => {
            const requestId = jpmorganApi.generateRequestId()

            // New format: req-{timestamp}-{short-uuid}
            expect(requestId).toMatch(/^req-\d+-[0-9a-f]{8}$/)
        })

        it('should generate unique IDs on each call', () => {
            const id1 = jpmorganApi.generateRequestId()
            const id2 = jpmorganApi.generateRequestId()

            expect(id1).not.toBe(id2)
        })
    })

    // =========================================================================
    // getAccessToken Tests
    // =========================================================================

    // =========================================================================
    // getAccessToken Tests (from auth/oauth-service)
    // =========================================================================

    describe('getAccessToken', () => {
        it('should return mock token in mock environment', async () => {
            // Set mock environment
            process.env.JPMC_ENVIRONMENT = 'mock'
            
            const token = await oauthService.getAccessToken()

            expect(token).toBe('mock-access-token-for-development')
        })

        it('should call auth service for non-mock environment', async () => {
            // Environment is already 'sandbox' from beforeEach
            const token = await oauthService.getAccessToken()

            expect(token).toBe('mock-access-token')
        })

        it('should use environment variable when no environment param provided', async () => {
            process.env.JPMC_ENVIRONMENT = 'mock'
            
            const token = await oauthService.getAccessToken()

            expect(token).toBe('mock-access-token-for-development')
        })

        it('should throw error when auth service fails', async () => {
            oauthService.getAccessToken.mockRejectedValue(new Error('Auth failed'))

            await expect(oauthService.getAccessToken()).rejects.toThrow('Auth failed')
        })
    })

    // =========================================================================
    // clearTokenCache Tests (from auth/oauth-service)
    // =========================================================================

    describe('clearTokenCache', () => {
        it('should clear token cache', () => {
            oauthService.clearTokenCache()

            expect(oauthService.clearTokenCache).toHaveBeenCalled()
        })
    })

    // =========================================================================
    // createPayment Tests
    // =========================================================================

    describe('createPayment', () => {
        beforeEach(() => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: {
                    entries: () => []
                },
                json: () => Promise.resolve(mockPaymentResponse)
            })
        })

        it('should create payment with valid card data', async () => {
            // Use mock environment to skip auth token fetch
            const result = await jpmorganApi.createPayment({
                config: { ...mockConfig, environment: 'mock' },
                paymentData: {
                    amount: 100.00,
                    currency: 'USD',
                    card: mockCardData,
                    captureMethod: 'NOW'
                }
            })

            expect(result.success).toBe(true)
            expect(result.transactionId).toBe('TXN-123456789')
            expect(global.fetch).toHaveBeenCalled()
        })

        it('should include correct headers in request', async () => {
            await jpmorganApi.createPayment({
                config: mockConfig,
                paymentData: {
                    amount: 100.00,
                    currency: 'USD',
                    card: mockCardData
                }
            })

            const fetchCall = global.fetch.mock.calls[0]
            const headers = fetchCall[1].headers

            expect(headers['Content-Type']).toBe('application/json')
            expect(headers['merchant-id']).toBe(mockConfig.merchantId)
            expect(headers['platform-id']).toBe(mockConfig.platformId)
            expect(headers['request-id']).toBeDefined()
            expect(headers['Authorization']).toBe('Bearer mock-access-token')
        })

        it('should handle encrypted card data', async () => {
            await jpmorganApi.createPayment({
                config: mockConfig,
                paymentData: {
                    amount: 100.00,
                    currency: 'USD',
                    card: mockEncryptedCard
                }
            })

            const fetchCall = global.fetch.mock.calls[0]
            const body = JSON.parse(fetchCall[1].body)

            expect(body.paymentMethodType.card.accountNumberType).toBe('SAFETECH_PAGE_ENCRYPTION')
            expect(body.paymentMethodType.card.encryptionIntegrityCheck).toBe('integrity_hash_xyz')
        })

        it('should format billing address correctly when AVS is enabled', async () => {
            await jpmorganApi.createPayment({
                config: { ...mockConfig, enableAVS: true },
                paymentData: {
                    amount: 100.00,
                    currency: 'USD',
                    card: mockCardData,
                    billingAddress: {
                        address1: '123 Main St',
                        city: 'New York',
                        stateCode: 'NY',
                        postalCode: '10001',
                        countryCode: 'US'
                    }
                }
            })

            const fetchCall = global.fetch.mock.calls[0]
            const body = JSON.parse(fetchCall[1].body)

            expect(body.accountHolder.billingAddress.line1).toBe('123 Main St')
            expect(body.accountHolder.billingAddress.state).toBe('NY')
            expect(body.accountHolder.billingAddress.countryCode).toBe('USA')
        })

        it('should convert 2-letter country code to 3-letter when AVS is enabled', async () => {
            await jpmorganApi.createPayment({
                config: { ...mockConfig, enableAVS: true },
                paymentData: {
                    amount: 100.00,
                    currency: 'USD',
                    card: mockCardData,
                    billingAddress: { ...mockBillingAddress, countryCode: 'CA' }
                }
            })

            const fetchCall = global.fetch.mock.calls[0]
            const body = JSON.parse(fetchCall[1].body)

            expect(body.accountHolder.billingAddress.countryCode).toBe('CAN')
        })

        it('should not include billing address when AVS is disabled', async () => {
            await jpmorganApi.createPayment({
                config: { ...mockConfig, enableAVS: false },
                paymentData: {
                    amount: 100.00,
                    currency: 'USD',
                    card: mockCardData,
                    billingAddress: mockBillingAddress
                }
            })

            const fetchCall = global.fetch.mock.calls[0]
            const body = JSON.parse(fetchCall[1].body)

            // billingAddress should not be included when AVS is disabled
            expect(body.accountHolder?.billingAddress).toBeUndefined()
        })

        it('should return error response on API failure', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 400,
                json: () => Promise.resolve({
                    responseCode: 'VALIDATION_ERROR',
                    responseMessage: 'Invalid card number'
                })
            })

            const result = await jpmorganApi.createPayment({
                config: mockConfig,
                paymentData: {
                    amount: 100.00,
                    currency: 'USD',
                    card: mockCardData
                }
            })

            expect(result.success).toBe(false)
            expect(result.responseStatus).toBe('ERROR')
        })

        it('should return error when token fetch fails', async () => {
            oauthService.getAccessToken.mockRejectedValue(new Error('Failed to authenticate'))

            const result = await jpmorganApi.createPayment({
                config: mockConfig,
                paymentData: {
                    amount: 100.00,
                    currency: 'USD',
                    card: mockCardData
                }
            })

            expect(result.success).toBe(false)
            // Uses generic error message for MVP
            expect(result.userMessage).toBe("Payment couldn't be processed. Please try again later.")
        })

        it('should handle network errors', async () => {
            global.fetch.mockRejectedValue(new Error('Network error'))

            const result = await jpmorganApi.createPayment({
                config: mockConfig,
                paymentData: {
                    amount: 100.00,
                    currency: 'USD',
                    card: mockCardData
                }
            })

            expect(result.success).toBe(false)
            expect(result.responseStatus).toBe('ERROR')
        })

        it('should include merchantOrderNumber when provided', async () => {
            await jpmorganApi.createPayment({
                config: mockConfig,
                paymentData: {
                    amount: 100.00,
                    currency: 'USD',
                    card: mockCardData,
                    merchantOrderNumber: 'ORDER-12345'
                }
            })

            const fetchCall = global.fetch.mock.calls[0]
            const body = JSON.parse(fetchCall[1].body)

            expect(body.merchantOrderNumber).toBe('ORDER-12345')
        })

        it('should set captureMethod to NOW by default', async () => {
            await jpmorganApi.createPayment({
                config: mockConfig,
                paymentData: {
                    amount: 100.00,
                    currency: 'USD',
                    card: mockCardData
                }
            })

            const fetchCall = global.fetch.mock.calls[0]
            const body = JSON.parse(fetchCall[1].body)

            expect(body.captureMethod).toBe('NOW')
        })

        it('should support MANUAL captureMethod for auth-only', async () => {
            await jpmorganApi.createPayment({
                config: mockConfig,
                paymentData: {
                    amount: 100.00,
                    currency: 'USD',
                    card: mockCardData,
                    captureMethod: 'MANUAL'
                }
            })

            const fetchCall = global.fetch.mock.calls[0]
            const body = JSON.parse(fetchCall[1].body)

            expect(body.captureMethod).toBe('MANUAL')
        })
    })

    // =========================================================================
    // getPaymentStatus Tests
    // =========================================================================

    describe('getPaymentStatus', () => {
        beforeEach(() => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    responseStatus: 'SUCCESS',
                    transactionId: 'TXN-123456789',
                    transactionState: 'AUTHORIZED',
                    amount: 100.00
                })
            })
        })

        it('should get payment status by transaction ID', async () => {
            const result = await jpmorganApi.getPaymentStatus({
                config: mockConfig,
                transactionId: 'TXN-123456789'
            })

            expect(result.success).toBe(true)
            expect(result.transactionState).toBe('AUTHORIZED')
        })

        it('should return error for non-existent transaction', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 404,
                json: () => Promise.resolve({
                    responseCode: 'NOT_FOUND',
                    responseMessage: 'Transaction not found'
                })
            })

            const result = await jpmorganApi.getPaymentStatus({
                config: mockConfig,
                transactionId: 'NON-EXISTENT'
            })

            expect(result.success).toBe(false)
        })
    })

    // =========================================================================
    // normalizePaymentResponse Tests
    // =========================================================================

    describe('normalizePaymentResponse', () => {
        it('should normalize successful response', () => {
            const response = {
                responseStatus: 'SUCCESS',
                transactionId: 'TXN-123',
                transactionState: 'AUTHORIZED',
                approvalCode: 'ABC',
                amount: 100.00
            }

            const normalized = responseNormalizer.normalizePaymentResponse(response)

            expect(normalized.success).toBe(true)
            expect(normalized.transactionId).toBeUndefined()  // transactionId not exposed to client
            expect(normalized.amount).toBe(100.00)
        })

        it('should normalize error response', () => {
            const response = {
                responseStatus: 'DENIED',
                transactionState: 'DECLINED'
            }

            const normalized = responseNormalizer.normalizePaymentResponse(response)

            expect(normalized.success).toBe(false)
            expect(normalized.canRetry).toBe(true)
        })

        it('should include canRetry flag for failed responses', () => {
            const response = {
                responseStatus: 'ERROR',
                transactionState: 'ERROR'
            }

            const normalized = responseNormalizer.normalizePaymentResponse(response)

            expect(normalized.canRetry).toBe(true)
        })
    })
})
