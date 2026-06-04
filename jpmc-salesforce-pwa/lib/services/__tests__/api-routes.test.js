/**
 * Unit Tests for API Routes
 *
 * @jest-environment node
 */

// Mock dependencies BEFORE requiring modules
jest.mock('../api/payment-api', () => ({
    createPayment: jest.fn()
}))

jest.mock('../api/response-normalizer', () => ({
    normalizePaymentResponse: jest.fn()
}))

jest.mock('../auth', () => ({
    verifyAuthConfiguration: jest.fn()
}))

// Mock getJPMCConfigAsync to return test config
jest.mock('../../ssr', () => ({
    getJPMCConfigAsync: jest.fn().mockResolvedValue({
        merchantId: '998482157630',
        platformId: '909876543210',
        clientId: 'test-client-id',
        resourceId: 'test-resource-id',
        tokenEndpoint: 'https://test.token.endpoint',
        pieEncryptionUrl: null,
        pieGetKeyUrl: null,
        captureMethod: 'NOW'
    })
}))

const apiRoutes = require('../api-routes')
const paymentApi = require('../api/payment-api')
const responseNormalizer = require('../api/response-normalizer')
const authService = require('../auth')
const ssrModule = require('../../ssr')

// =============================================================================
// Test Data
// =============================================================================

const mockPaymentRequest = {
    amount: 10000, // cents
    currency: 'USD',
    merchantOrderNumber: 'ORDER-00001234',
    card: {
        encryptedCardNumber: 'encrypted_pan_123',
        encryptedCVV: 'encrypted_cvv_456',
        integrityCheck: 'integrity_hash',
        expiryMonth: 12,
        expiryYear: 2027
    },
    captureMethod: 'NOW',
    basketId: 'basket-123',
    billingAddress: {
        line1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        countryCode: 'USA'
    }
}

const mockPaymentResponse = {
    success: true,
    responseStatus: 'SUCCESS',
    transactionId: 'TXN-123456789',
    transactionState: 'AUTHORIZED',
    approvalCode: 'ABC123',
    amount: 100.00
}

const mockNormalizedResponse = {
    success: true,
    transactionId: 'TXN-123456789',
    state: 'AUTHORIZED',
    approvalCode: 'ABC123',
    amount: 100.00
}

// =============================================================================
// Mock Request/Response helpers
// =============================================================================

const createMockRequest = (body = {}, params = {}) => ({
    body,
    params,
    headers: {},
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' }
})

const createMockResponse = () => {
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    }
    return res
}

// =============================================================================
// Setup & Teardown
// =============================================================================

// Default mock config that mimics BM site preferences
const defaultMockConfig = {
    merchantId: '998482157630',
    platformId: '909876543210',
    clientId: 'test-client-id',
    resourceId: 'test-resource-id',
    tokenEndpoint: 'https://test.token.endpoint',
    pieEncryptionUrl: null,
    pieGetKeyUrl: null,
    captureMethod: 'NOW',
    apiHost: 'api-ms-test.payments.jpmorgan.com'
}

describe('API Routes', () => {
    const originalEnv = process.env

    beforeEach(() => {
        jest.clearAllMocks()
        
        // Reset the mock config before each test
        ssrModule.getJPMCConfigAsync.mockResolvedValue({ ...defaultMockConfig })

        // Default mocks
        paymentApi.createPayment.mockResolvedValue(mockPaymentResponse)
        responseNormalizer.normalizePaymentResponse.mockReturnValue(mockNormalizedResponse)
        authService.verifyAuthConfiguration.mockReturnValue({ valid: true })
    })

    afterAll(() => {
        process.env = originalEnv
    })

    // =========================================================================
    // handleAuthorize Tests
    // =========================================================================

    describe('handleAuthorize', () => {
        it('should process payment authorization successfully', async () => {
            const req = createMockRequest(mockPaymentRequest)
            const res = createMockResponse()

            await apiRoutes.handleAuthorize(req, res)

            expect(res.status).toHaveBeenCalledWith(200)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                transactionId: 'TXN-123456789'
            }))
        })

        it('should return 500 when merchantId is missing', async () => {
            // Mock config with missing merchantId
            ssrModule.getJPMCConfigAsync.mockResolvedValue({
                ...defaultMockConfig,
                merchantId: null
            })
            
            const req = createMockRequest(mockPaymentRequest)
            const res = createMockResponse()

            await apiRoutes.handleAuthorize(req, res)

            expect(res.status).toHaveBeenCalledWith(500)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                errorCode: 'CONFIGURATION_ERROR'
            }))
        })

        it('should return 400 when amount is missing', async () => {
            const req = createMockRequest({ card: mockPaymentRequest.card })
            const res = createMockResponse()

            await apiRoutes.handleAuthorize(req, res)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                errorCode: 'VALIDATION_ERROR'
            }))
        })

        it('should return 400 when card is missing', async () => {
            const req = createMockRequest({ amount: 10000 })
            const res = createMockResponse()

            await apiRoutes.handleAuthorize(req, res)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                errorCode: 'VALIDATION_ERROR'
            }))
        })

        it('should pass encrypted card data to createPayment', async () => {
            const req = createMockRequest(mockPaymentRequest)
            const res = createMockResponse()

            await apiRoutes.handleAuthorize(req, res)

            expect(paymentApi.createPayment).toHaveBeenCalledWith(expect.objectContaining({
                paymentData: expect.objectContaining({
                    card: expect.objectContaining({
                        accountNumberType: 'SAFETECH_PAGE_ENCRYPTION',
                        accountNumber: 'encrypted_pan_123'
                    })
                })
            }))
        })

        it('should return 402 for declined payment', async () => {
            paymentApi.createPayment.mockResolvedValue({
                success: false,
                responseStatus: 'DENIED',
                errorCode: 'PAYMENT_DECLINED'
            })
            responseNormalizer.normalizePaymentResponse.mockReturnValue({
                success: false,
                errorCode: 'PAYMENT_DECLINED',
                message: 'Card declined'
            })

            const req = createMockRequest(mockPaymentRequest)
            const res = createMockResponse()

            await apiRoutes.handleAuthorize(req, res)

            expect(res.status).toHaveBeenCalledWith(402)
        })

        it('should return 500 for internal errors', async () => {
            paymentApi.createPayment.mockResolvedValue({
                success: false,
                responseStatus: 'ERROR',
                errorCode: 'INTERNAL_ERROR'
            })
            responseNormalizer.normalizePaymentResponse.mockReturnValue({
                success: false,
                errorCode: 'INTERNAL_ERROR'
            })

            const req = createMockRequest(mockPaymentRequest)
            const res = createMockResponse()

            await apiRoutes.handleAuthorize(req, res)

            expect(res.status).toHaveBeenCalledWith(500)
        })

        it('should handle exceptions gracefully', async () => {
            paymentApi.createPayment.mockRejectedValue(new Error('Unexpected error'))

            const req = createMockRequest(mockPaymentRequest)
            const res = createMockResponse()

            await apiRoutes.handleAuthorize(req, res)

            expect(res.status).toHaveBeenCalledWith(500)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                canRetry: true
            }))
        })

        it('should pass merchantOrderNumber when provided', async () => {
            const req = createMockRequest({
                ...mockPaymentRequest,
                merchantOrderNumber: 'ORDER-00001234'
            })
            const res = createMockResponse()

            await apiRoutes.handleAuthorize(req, res)

            expect(paymentApi.createPayment).toHaveBeenCalledWith(expect.objectContaining({
                paymentData: expect.objectContaining({
                    merchantOrderNumber: 'ORDER-00001234'
                })
            }))
        })

        it('should use captureMethod from BM config when not in request', async () => {
            // BM config has captureMethod: 'NOW'
            const req = createMockRequest({
                ...mockPaymentRequest,
                captureMethod: undefined  // Not provided, should use config
            })
            const res = createMockResponse()

            await apiRoutes.handleAuthorize(req, res)

            expect(paymentApi.createPayment).toHaveBeenCalledWith(expect.objectContaining({
                paymentData: expect.objectContaining({
                    captureMethod: 'NOW'  // From defaultMockConfig
                })
            }))
        })
    })

    // =========================================================================
    // handleGetConfig Tests
    // =========================================================================

    describe('handleGetConfig', () => {
        it('should return client configuration', async () => {
            const req = createMockRequest()
            const res = createMockResponse()

            await apiRoutes.handleGetConfig(req, res)

            expect(res.status).toHaveBeenCalledWith(200)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                merchantId: '998482157630'
            }))
        })

        it('should include PIE URLs in config', async () => {
            // Mock config with custom PIE URLs
            ssrModule.getJPMCConfigAsync.mockResolvedValue({
                ...defaultMockConfig,
                pieEncryptionUrl: 'https://pie.test.com/encryption.js',
                pieGetKeyUrl: 'https://pie.test.com',
                pieKey: 'test-pie-key'
            })

            const req = createMockRequest()
            const res = createMockResponse()

            await apiRoutes.handleGetConfig(req, res)

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                pieUrls: expect.objectContaining({
                    encryption: expect.any(String),
                    getKey: expect.any(String)
                })
            }))
        })

        it('should not expose sensitive credentials', async () => {
            // Even if env has credentials, they should not be in response
            const req = createMockRequest()
            const res = createMockResponse()

            await apiRoutes.handleGetConfig(req, res)

            const response = res.json.mock.calls[0][0]
            expect(response).not.toHaveProperty('certificateBase64')
            expect(response).not.toHaveProperty('privateKeyBase64')
            expect(response).not.toHaveProperty('clientSecret')
        })
    })

    // =========================================================================
    // registerJPMCRoutes Tests
    // =========================================================================

    describe('registerJPMCRoutes', () => {
        it('should register all routes on Express app', () => {
            const mockApp = {
                post: jest.fn(),
                get: jest.fn(),
                patch: jest.fn(),
                use: jest.fn()
            }

            apiRoutes.registerJPMCRoutes(mockApp)

            expect(mockApp.post).toHaveBeenCalledWith(
                '/api/jpmorgan/authorize',
                expect.any(Function)
            )
            expect(mockApp.post).toHaveBeenCalledWith(
                '/api/jpmorgan/config',
                expect.any(Function)
            )
        })

        it('should register JSON body parser middleware', () => {
            const mockApp = {
                post: jest.fn(),
                get: jest.fn(),
                patch: jest.fn(),
                use: jest.fn()
            }

            apiRoutes.registerJPMCRoutes(mockApp)

            expect(mockApp.use).toHaveBeenCalledWith(
                '/api/jpmorgan',
                expect.any(Function)
            )
        })
    })
})
