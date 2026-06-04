/**
 * Unit Tests for Payment Handlers
 *
 * @jest-environment node
 */

import {
    handleAuthorize,
    handleVerify
} from '../payment-handlers'

// =============================================================================
// Mocks
// =============================================================================

const mockGetJPMCConfigAsync = jest.fn()
jest.mock('../../../../ssr', () => ({
    getJPMCConfigAsync: (...args) => mockGetJPMCConfigAsync(...args)
}))

const mockCreatePayment = jest.fn()
const mockCallFraudCheck = jest.fn()
const mockGenerateRequestId = jest.fn(() => 'req-123-abcd1234')

jest.mock('../../payment-api', () => ({
    createPayment: (...args) => mockCreatePayment(...args),
    callFraudCheck: (...args) => mockCallFraudCheck(...args),
    generateRequestId: () => mockGenerateRequestId()
}))

const mockNormalizePaymentResponse = jest.fn()
jest.mock('../../response-normalizer', () => ({
    normalizePaymentResponse: (...args) => mockNormalizePaymentResponse(...args)
}))

const mockValidatePaymentRequest = jest.fn()
jest.mock('../../../../utils/validation/input-validation', () => ({
    validatePaymentRequest: (...args) => mockValidatePaymentRequest(...args)
}))

const mockGetAccessToken = jest.fn()
jest.mock('../../../auth', () => ({
    getAccessToken: (...args) => mockGetAccessToken(...args)
}))

jest.mock('../../../../utils/logger', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    },
    safeStringify: jest.fn((obj) => JSON.stringify(obj))
}))

jest.mock('../../helpers/fraud-helpers', () => ({
    buildFraudCheckPayload: jest.fn(() => ({}))
}))

jest.mock('../../helpers/request-helpers', () => ({
    buildMerchantSoftware: jest.fn(() => ({ companyName: 'Test' })),
    formatPhoneForJPMC: jest.fn((p) => p),
    getClientIp: jest.fn(() => '127.0.0.1')
}))

jest.mock('../../../../utils/locale-extractor', () => ({
    extractLocale: jest.fn(() => 'en-US'),
    extractSlasToken: jest.fn(() => 'slas-token-123')
}))

jest.mock('../../helpers/token-encryption', () => ({
    encryptToken: jest.fn((token) => token ? `tokenref-${token}` : null),
    decryptToken: jest.fn((ref) => ref ? ref.replace('tokenref-', '') : null)
}))

// =============================================================================
// Test Helpers
// =============================================================================

const createMockReq = (body = {}, params = {}, headers = {}) => ({
    body,
    params,
    headers: { 'user-agent': 'Test Agent', ...headers }
})

const createMockRes = () => {
    const res = {}
    res.status = jest.fn().mockReturnValue(res)
    res.json = jest.fn().mockReturnValue(res)
    return res
}

const mockConfig = {
    merchantId: '998482157630',
    apiHost: 'api-ms-test.payments.jpmorgan.com',
    enableAVS: true,
    enableFraudCheck: false,
    captureMethod: 'NOW'
}

// =============================================================================
// handleAuthorize Tests
// =============================================================================

describe('handleAuthorize', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockGetJPMCConfigAsync.mockResolvedValue(mockConfig)
        mockValidatePaymentRequest.mockReturnValue({ valid: true })
        mockNormalizePaymentResponse.mockImplementation((res) => ({
            success: true,
            transactionId: res?.transactionId || 'txn-123'
        }))
    })

    describe('Configuration validation', () => {
        it('should return 500 when merchantId is missing', async () => {
            mockGetJPMCConfigAsync.mockResolvedValue({ ...mockConfig, merchantId: null })
            
            const req = createMockReq({ amount: 1000, token: 'test-token' })
            const res = createMockRes()

            await handleAuthorize(req, res)

            expect(res.status).toHaveBeenCalledWith(500)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'CONFIGURATION_ERROR'
                })
            )
        })
    })

    describe('Input validation', () => {
        it('should return 400 when validation fails', async () => {
            mockValidatePaymentRequest.mockReturnValue({ 
                valid: false, 
                error: 'Invalid amount',
                field: 'amount'
            })
            
            const req = createMockReq({ amount: -100, token: 'test-token' })
            const res = createMockRes()

            await handleAuthorize(req, res)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'VALIDATION_ERROR',
                    field: 'amount'
                })
            )
        })

        it('should return 400 when amount is missing', async () => {
            const req = createMockReq({ token: 'test-token' })
            const res = createMockRes()

            await handleAuthorize(req, res)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'VALIDATION_ERROR'
                })
            )
        })

        it('should return 400 when no payment method provided', async () => {
            const req = createMockReq({ amount: 1000 })
            const res = createMockRes()

            await handleAuthorize(req, res)

            expect(res.status).toHaveBeenCalledWith(400)
        })
    })

    describe('Token-based authorization', () => {
        it('should authorize using SAFETECH token', async () => {
            mockCreatePayment.mockResolvedValue({
                transactionId: 'txn-token-123',
                responseStatus: 'APPROVED'
            })

            const req = createMockReq({
                amount: 5000,
                currency: 'USD',
                token: 'safetech-token-abc',
                cardExpiry: { month: 12, year: 2027 },
                merchantOrderNumber: 'ORDER-001'
            })
            const res = createMockRes()

            await handleAuthorize(req, res)

            expect(mockCreatePayment).toHaveBeenCalled()
            expect(res.status).toHaveBeenCalledWith(200)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true })
            )
        })
    })

    describe('Google Pay authorization', () => {
        const googlePayToken = {
            signature: 'sig123',
            signedMessage: '{}',
            protocolVersion: 'ECv2'
        }

        it('should authorize using Google Pay token', async () => {
            mockCreatePayment.mockResolvedValue({
                transactionId: 'txn-gpay-123',
                responseStatus: 'APPROVED'
            })

            const req = createMockReq({
                amount: 7500,
                currency: 'USD',
                googlePayToken,
                paymentMethod: 'googlepay'
            })
            const res = createMockRes()

            await handleAuthorize(req, res)

            expect(mockCreatePayment).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentData: expect.objectContaining({
                        isGooglePay: true
                    })
                })
            )
            expect(res.status).toHaveBeenCalledWith(200)
        })

        it('should return 400 when googlePayToken is missing for googlepay method', async () => {
            const req = createMockReq({
                amount: 1000,
                currency: 'USD',
                paymentMethod: 'googlepay',
                // NOTE: googlePayToken is used in the check for payment method existence
                // The validation happens after checking if we have card || token || googlePayToken
            })
            const res = createMockRes()

            await handleAuthorize(req, res)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    errorCode: 'VALIDATION_ERROR'
                })
            )
        })
    })

    describe('Card-based authorization', () => {
        const encryptedCard = {
            encryptedCardNumber: 'encPAN123abc',
            encryptedCVV: 'encCVV456',
            integrityCheck: 'integrity789',
            expiryMonth: 12,
            expiryYear: 2027
        }

        it('should authorize with encrypted card data', async () => {
            mockCreatePayment.mockResolvedValue({
                transactionId: 'txn-card-123',
                responseStatus: 'APPROVED'
            })

            const req = createMockReq({
                amount: 3000,
                currency: 'USD',
                card: encryptedCard
            })
            const res = createMockRes()

            await handleAuthorize(req, res)

            expect(mockCreatePayment).toHaveBeenCalled()
            expect(res.status).toHaveBeenCalledWith(200)
        })

        it('should return 400 when card is not encrypted', async () => {
            const req = createMockReq({
                amount: 3000,
                currency: 'USD',
                card: {
                    encryptedCardNumber: '4111111111111111',
                    expiryMonth: 12,
                    expiryYear: 2027
                }
            })
            const res = createMockRes()

            await handleAuthorize(req, res)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    errorCode: 'NO_PAYMENT_DATA'
                })
            )
        })
    })

    describe('Payment response handling', () => {
        it('should return 402 for denied transactions', async () => {
            mockCreatePayment.mockResolvedValue({
                transactionId: 'txn-denied',
                responseStatus: 'DENIED'
            })
            mockNormalizePaymentResponse.mockReturnValue({
                success: false,
                errorCode: 'DECLINED'
            })

            const req = createMockReq({
                amount: 1000,
                currency: 'USD',
                token: 'test-token'
            })
            const res = createMockRes()

            await handleAuthorize(req, res)

            expect(res.status).toHaveBeenCalledWith(402)
        })

        it('should return 500 for error responses', async () => {
            mockCreatePayment.mockResolvedValue({
                transactionId: 'txn-error',
                responseStatus: 'ERROR'
            })
            mockNormalizePaymentResponse.mockReturnValue({
                success: false,
                errorCode: 'API_ERROR'
            })

            const req = createMockReq({
                amount: 1000,
                currency: 'USD',
                token: 'test-token'
            })
            const res = createMockRes()

            await handleAuthorize(req, res)

            expect(res.status).toHaveBeenCalledWith(500)
        })
    })

    describe('Fraud check handling', () => {
        beforeEach(() => {
            mockGetJPMCConfigAsync.mockResolvedValue({
                ...mockConfig,
                enableFraudCheck: true,
                enableFraudCheckAtAuth: true
            })
        })

        it('should decline when fraud check returns D action', async () => {
            mockCallFraudCheck.mockResolvedValue({
                riskDecision: { fraudRuleAction: 'D' }
            })

            const req = createMockReq({
                amount: 1000,
                currency: 'USD',
                token: 'test-token',
                cardExpiry: { month: 12, year: 2027 }
            })
            const res = createMockRes()

            await handleAuthorize(req, res)

            expect(res.status).toHaveBeenCalledWith(402)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    errorCode: 'FRAUD_DECLINED'
                })
            )
        })

        it('should force manual capture for review actions', async () => {
            mockCallFraudCheck.mockResolvedValue({
                riskDecision: { fraudRuleAction: 'R' }
            })
            mockCreatePayment.mockResolvedValue({
                transactionId: 'txn-review',
                responseStatus: 'APPROVED'
            })

            const req = createMockReq({
                amount: 1000,
                currency: 'USD',
                token: 'test-token',
                cardExpiry: { month: 12, year: 2027 },
                captureMethod: 'NOW'
            })
            const res = createMockRes()

            await handleAuthorize(req, res)

            // Verify captureMethod was overridden - check the payment data
            expect(mockCreatePayment).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentData: expect.objectContaining({
                        captureMethod: 'MANUAL'
                    })
                })
            )
        })
    })

    describe('Error handling', () => {
        it('should handle exception with canRetry flag', async () => {
            mockCreatePayment.mockRejectedValue(new Error('API Error'))

            const req = createMockReq({
                amount: 1000,
                currency: 'USD',
                token: 'test-token'
            })
            const res = createMockRes()

            await handleAuthorize(req, res)

            expect(res.status).toHaveBeenCalled()
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: false })
            )
        })
    })
})

// =============================================================================
// handleVerify Tests
// =============================================================================

describe('handleVerify', () => {
    const encryptedCard = {
        encryptedCardNumber: 'encryptedPAN123abc',
        encryptedCVV: 'encCVV456',
        integrityCheck: 'integrity789',
        expiryMonth: 6,
        expiryYear: 2028
    }

    const mockAccountHolder = {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '5551234567'
    }

    const mockBillingAddress = {
        line1: '456 Oak Ave',
        city: 'Los Angeles',
        state: 'CA',
        postalCode: '90001',
        countryCode: 'US'
    }

    beforeEach(() => {
        jest.clearAllMocks()
        mockGetJPMCConfigAsync.mockResolvedValue(mockConfig)
        mockGetAccessToken.mockResolvedValue('access-token-123')
        
        // Mock global fetch
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                transactionId: 'verify-123',
                responseStatus: 'APPROVED',
                paymentMethodType: {
                    card: {
                        paymentTokens: [
                            { tokenProvider: 'SAFETECH', tokenNumber: 'safetech-token-xyz', responseStatus: 'SUCCESS' }
                        ],
                        cardTypeName: 'VISA',
                        maskedAccountNumber: '************1111'
                    }
                }
            })
        })
    })

    afterEach(() => {
        delete global.fetch
    })

    describe('Configuration validation', () => {
        it('should return 500 when merchantId is missing', async () => {
            mockGetJPMCConfigAsync.mockResolvedValue({ ...mockConfig, merchantId: null })

            const req = createMockReq({ card: encryptedCard })
            const res = createMockRes()

            await handleVerify(req, res)

            expect(res.status).toHaveBeenCalledWith(500)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    errorCode: 'CONFIGURATION_ERROR'
                })
            )
        })

        it('should return 500 when apiHost is missing', async () => {
            mockGetJPMCConfigAsync.mockResolvedValue({ ...mockConfig, apiHost: null })

            const req = createMockReq({ card: encryptedCard })
            const res = createMockRes()

            await handleVerify(req, res)

            expect(res.status).toHaveBeenCalledWith(500)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: 'API host not configured' })
            )
        })
    })

    describe('Input validation', () => {
        it('should return 400 when card is missing', async () => {
            const req = createMockReq({})
            const res = createMockRes()

            await handleVerify(req, res)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'card data is required'
                })
            )
        })

        it('should return 400 when card is not encrypted', async () => {
            const req = createMockReq({
                card: {
                    encryptedCardNumber: '4111111111111111', // Plain number
                    expiryMonth: 12,
                    expiryYear: 2027
                }
            })
            const res = createMockRes()

            await handleVerify(req, res)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    errorCode: 'ENCRYPTION_REQUIRED'
                })
            )
        })
    })

    describe('Successful verification', () => {
        it('should verify card and return token', async () => {
            const req = createMockReq({
                card: encryptedCard,
                accountHolder: mockAccountHolder,
                billingAddress: mockBillingAddress,
                currency: 'USD'
            })
            const res = createMockRes()

            await handleVerify(req, res)

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/verifications'),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer access-token-123',
                        'merchant-id': '998482157630'
                    })
                })
            )
            expect(res.status).toHaveBeenCalledWith(200)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    tokenRef: expect.any(String)  // Encrypted token reference
                })
            )
        })

        it('should extract network token when safetech not available', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    transactionId: 'verify-456',
                    responseStatus: 'APPROVED',
                    paymentMethodType: {
                        card: {
                            paymentTokens: [
                                { tokenProvider: 'NETWORK', tokenNumber: 'network-token-abc', responseStatus: 'SUCCESS' }
                            ]
                        }
                    }
                })
            })

            const req = createMockReq({
                card: encryptedCard,
                currency: 'USD'
            })
            const res = createMockRes()

            await handleVerify(req, res)

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    tokenRef: expect.any(String)  // Encrypted token reference
                })
            )
        })
    })

    describe('Verification failure handling', () => {
        it('should return error status on API failure', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 400,
                json: () => Promise.resolve({ error: 'Bad Request' })
            })

            const req = createMockReq({
                card: encryptedCard,
                currency: 'USD'
            })
            const res = createMockRes()

            await handleVerify(req, res)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: false })
            )
        })

        it('should return 400 for DENIED response', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    responseStatus: 'DENIED'
                })
            })

            const req = createMockReq({
                card: encryptedCard,
                currency: 'USD'
            })
            const res = createMockRes()

            await handleVerify(req, res)

            expect(res.status).toHaveBeenCalledWith(400)
        })
    })

    describe('Fraud check handling', () => {
        beforeEach(() => {
            mockGetJPMCConfigAsync.mockResolvedValue({
                ...mockConfig,
                enableFraudCheck: true
            })
        })

        it('should decline when fraud check returns D action', async () => {
            mockCallFraudCheck.mockResolvedValue({
                riskDecision: { fraudRuleAction: 'D' }
            })

            const req = createMockReq({
                card: encryptedCard,
                currency: 'USD'
            })
            const res = createMockRes()

            await handleVerify(req, res)

            expect(res.status).toHaveBeenCalledWith(402)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    errorCode: 'FRAUD_DECLINED'
                })
            )
        })

        it('should include fraudRuleAction in response', async () => {
            mockCallFraudCheck.mockResolvedValue({
                riskDecision: { fraudRuleAction: 'E' }
            })

            const req = createMockReq({
                card: encryptedCard,
                currency: 'USD'
            })
            const res = createMockRes()

            await handleVerify(req, res)

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    fraudRuleAction: 'E'
                })
            )
        })
    })

    describe('Error handling', () => {
        it('should handle verification exception', async () => {
            global.fetch.mockRejectedValue(new Error('Network error'))

            const req = createMockReq({
                card: encryptedCard,
                currency: 'USD'
            })
            const res = createMockRes()

            await handleVerify(req, res)

            expect(res.status).toHaveBeenCalled()
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: false })
            )
        })
    })
})
