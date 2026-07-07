/**
 * 3D Secure Controller Tests
 * 
 * Tests for the server-side 3DS authentication handlers
 * 
 * @jest-environment node
 */

import { THREE_DS } from '../../../utils/constants.mjs'

// Mock dependencies - define before imports
const mockPatchOrder = jest.fn()
const mockPatchPaymentTransaction = jest.fn()
const mockUpdateOrderStatus = jest.fn()
const mockGetOrder = jest.fn()

jest.mock('../../api/order-api', () => ({
    OrderApiClient: jest.fn().mockImplementation(() => ({
        patchOrder: mockPatchOrder,
        patchPaymentTransaction: mockPatchPaymentTransaction,
        updateOrderStatus: mockUpdateOrderStatus,
        getOrder: mockGetOrder
    }))
}))

// Use jest.fn() inline for payment-api mock
jest.mock('../../../services/api/payment-api', () => ({
    getPaymentDetails: jest.fn()
}))

jest.mock('../../../services/api/helpers/threeds-helpers', () => {
    const actual = jest.requireActual('../../../services/api/helpers/threeds-helpers')
    return {
        ...actual,
        extract3DSValues: jest.fn(actual.extract3DSValues),
        build3DSOrderPatchPayload: jest.fn(actual.build3DSOrderPatchPayload)
    }
})

jest.mock('../../../utils/logger.js', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    },
    safeStringify: jest.fn(obj => JSON.stringify(obj))
}))

// Import after mocks are defined
import {
    configureThreeDSController,
    handle3DSCallback,
    handleFail3DSOrder,
    clearCallbackCache
} from '../threeds-controller'
import { getPaymentDetails } from '../../../services/api/payment-api'
import { extract3DSValues, build3DSOrderPatchPayload } from '../../../services/api/helpers/threeds-helpers'

// Helper to create mock request/response
const createMockReqRes = (overrides = {}) => {
    const req = {
        query: {},
        body: {},
        headers: {
            host: 'localhost:3000',
            'x-forwarded-proto': 'https'
        },
        ...overrides.req,
        headers: {
            host: 'localhost:3000',
            'x-forwarded-proto': 'https',
            ...(overrides.req && overrides.req.headers)
        }
    }
    
    // Mock response with header tracking
    const headers = {}
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        setHeader: jest.fn((key, value) => {
            headers[key] = value
            return res
        }),
        getHeader: jest.fn((key) => headers[key]),
        locals: { cspNonce: 'test-nonce' },
        ...overrides.res
    }
    
    return { req, res }
}

describe('threeds-controller', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        clearCallbackCache()
        
        // Set allowed origins for security validation (SEC-1 fix)
        process.env.JPMC_STOREFRONT_ALLOWED_ORIGINS = 'https://localhost:3000,https://storefront.example.com'
        
        // Configure controller with default settings
        configureThreeDSController({
            jpmcConfig: {
                environment: 'sandbox',
                merchantId: 'TEST_MERCHANT'
            },
            debug: false
        })

        // Default mock implementations
        mockPatchOrder.mockResolvedValue({ success: true })
        mockPatchPaymentTransaction.mockResolvedValue({ success: true })
        mockUpdateOrderStatus.mockResolvedValue({ success: true })
        mockGetOrder.mockResolvedValue({
            orderNo: 'ORDER123',
            c_pending3DSAuthentication: true,
            paymentInstruments: [
                { paymentInstrumentId: 'pi-123' }
            ]
        })
        
        getPaymentDetails.mockResolvedValue({
            success: true,
            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS,
            paymentAuthenticationResult: {
                authenticationId: 'auth-123',
                authenticationValue: 'CAVV-xyz',
                threeDomainSecureCompletion: {
                    threeDSDirectoryServerTransactionId: 'dsTransId-456',
                    threeDSTransactionStatus: 'Y',
                    electronicCommerceIndicator: '05'
                }
            }
        })
    })

    afterEach(() => {
        // Clean up environment variable
        delete process.env.JPMC_STOREFRONT_ALLOWED_ORIGINS
    })

    // =========================================================================
    // configureThreeDSController Tests
    // =========================================================================

    describe('configureThreeDSController', () => {
        it('should configure controller with JPMC config', () => {
            expect(() => {
                configureThreeDSController({
                    jpmcConfig: { environment: 'sandbox' },
                    debug: true
                })
            }).not.toThrow()
        })

        it('should configure controller with minimal config', () => {
            expect(() => {
                configureThreeDSController({})
            }).not.toThrow()
        })
    })

    // =========================================================================
    // handle3DSCallback Tests
    // =========================================================================

    describe('handle3DSCallback', () => {
        describe('Successful 3DS Authentication', () => {
            it('should handle successful 3DS callback', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                expect(getPaymentDetails).toHaveBeenCalledWith({
                    config: expect.any(Object),
                    transactionId: 'payment-req-123'
                })
                expect(mockPatchOrder).toHaveBeenCalledWith('ORDER123', expect.any(Object))
                expect(mockUpdateOrderStatus).toHaveBeenCalledWith('ORDER123', 'new')
                expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html')
                expect(res.send).toHaveBeenCalled()
            })

            it('should include continueUrl in postMessage for success', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                // Verify HTML contains continueUrl
                const htmlResponse = res.send.mock.calls[0][0]
                expect(htmlResponse).toContain('continueUrl')
                expect(htmlResponse).toContain('/checkout/confirmation/ORDER123')
            })

            it('should extract 3DS values from payment details', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                expect(extract3DSValues).toHaveBeenCalled()
            })
        })

        describe('Failed/Denied 3DS Authentication', () => {
            it('should handle denied 3DS response', async () => {
                getPaymentDetails.mockResolvedValue({
                    responseStatus: THREE_DS.RESPONSE_STATUS.DENIED,
                    paymentAuthenticationResult: {
                        threeDomainSecureCompletion: {
                            threeDSTransactionStatus: 'N'
                        }
                    }
                })

                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.DENIED
                        }
                    }
                })

                await handle3DSCallback(req, res)

                expect(mockUpdateOrderStatus).toHaveBeenCalledWith('ORDER123', 'failed')
            })

            it('should not include continueUrl for failed authentication', async () => {
                getPaymentDetails.mockResolvedValue({
                    responseStatus: THREE_DS.RESPONSE_STATUS.ERROR,
                    paymentAuthenticationResult: {}
                })

                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.ERROR
                        }
                    }
                })

                await handle3DSCallback(req, res)

                const htmlResponse = res.send.mock.calls[0][0]
                expect(htmlResponse).not.toContain('"continueUrl":')
            })
        })

        describe('Validation Errors', () => {
            it('should return 400 when orderNo is missing', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderToken: 'TOKEN456' },
                        body: { paymentRequestId: 'payment-req-123' }
                    }
                })

                await handle3DSCallback(req, res)

                expect(res.status).toHaveBeenCalledWith(400)
                expect(res.send).toHaveBeenCalled()
            })

            it('should return 400 when orderToken is missing', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123' },
                        body: { paymentRequestId: 'payment-req-123' }
                    }
                })

                await handle3DSCallback(req, res)

                expect(res.status).toHaveBeenCalledWith(400)
            })

            it('should return 400 when paymentRequestId is missing', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {}
                    }
                })

                await handle3DSCallback(req, res)

                expect(res.status).toHaveBeenCalledWith(400)
            })
        })

        describe('Error Handling', () => {
            it('should continue if getPaymentDetails fails', async () => {
                getPaymentDetails.mockRejectedValue(new Error('API Error'))

                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                // Should still send response
                expect(res.send).toHaveBeenCalled()
            })

            it('should handle patchOrder failure gracefully', async () => {
                mockPatchOrder.mockRejectedValue(new Error('Patch failed'))

                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                // Should still return HTML response
                expect(res.send).toHaveBeenCalled()
                expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html')
            })

            it('should handle missing JPMC config', async () => {
                configureThreeDSController({
                    jpmcConfig: null,
                    debug: false
                })

                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                // Should still process with defaults
                expect(res.send).toHaveBeenCalled()
            })
        })

        describe('PostMessage HTML Response', () => {
            it('should return valid HTML with postMessage script', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                const htmlResponse = res.send.mock.calls[0][0]
                
                expect(htmlResponse).toContain('<!DOCTYPE html>')
                expect(htmlResponse).toContain('postMessage')
                expect(htmlResponse).toContain(THREE_DS.POSTMESSAGE_TYPE)
            })

            it('should include cspNonce from res.locals in script and style tags', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                const htmlResponse = res.send.mock.calls[0][0]

                expect(htmlResponse).toContain('nonce="test-nonce"')
            })

            it('should escape special characters in HTML response', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER<123>', orderToken: 'TOKEN&456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                const htmlResponse = res.send.mock.calls[0][0]
                
                // Should escape < > & characters
                expect(htmlResponse).not.toContain('"ORDER<123>"')
                expect(htmlResponse).not.toContain('"TOKEN&456"')
            })
        })

        describe('Debug Mode', () => {
            beforeEach(() => {
                configureThreeDSController({
                    jpmcConfig: { environment: 'sandbox' },
                    debug: true
                })
            })

            it('should log additional info when debug is enabled', async () => {
                const logger = require('../../../utils/logger.js').default

                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                // Debug should log query params and body
                expect(logger.info).toHaveBeenCalled()
            })
        })

        describe('Duplicate Callback Handling', () => {
            it('should return cached result for duplicate completed callback', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER-DUP', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-dup-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                const { req: req2, res: res2 } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER-DUP', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-dup-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req2, res2)

                expect(res2.send).toHaveBeenCalled()
                expect(mockPatchOrder).toHaveBeenCalledTimes(1)
            })
        })

        describe('Payment Transaction Patching', () => {
            it('should patch payment transaction with auth details', async () => {
                getPaymentDetails.mockResolvedValue({
                    success: true,
                    responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS,
                    transactionId: 'txn-123',
                    amount: 10000,
                    captureMethod: 'NOW',
                    timestamp: '2024-01-01T00:00:00Z',
                    paymentAuthenticationResult: {
                        authenticationId: 'auth-123',
                        authenticationValue: 'CAVV-xyz',
                        threeDomainSecureCompletion: {
                            threeDSDirectoryServerTransactionId: 'dsTransId-456',
                            threeDSTransactionStatus: 'Y',
                            electronicCommerceIndicator: '05'
                        }
                    }
                })

                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                expect(mockPatchPaymentTransaction).toHaveBeenCalledWith(
                    'ORDER123',
                    'pi-123',
                    expect.objectContaining({
                        c_jpmcAuthorizationId: 'txn-123',
                        c_jpmcCaptureMethod: 'NOW',
                        c_jpmcPaymentStatus: 'AC'
                    })
                )
            })

            it('should set correct payment status for MANUAL capture', async () => {
                getPaymentDetails.mockResolvedValue({
                    success: true,
                    responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS,
                    transactionId: 'txn-123',
                    amount: 10000,
                    captureMethod: 'MANUAL',
                    paymentAuthenticationResult: {}
                })

                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                expect(mockPatchPaymentTransaction).toHaveBeenCalledWith(
                    'ORDER123',
                    'pi-123',
                    expect.objectContaining({
                        c_jpmcPaymentStatus: 'A',
                        c_jpmcCapturedAmount: 0,
                        c_jpmcRemainingAuthAmount: 100
                    })
                )
            })

            it('should handle missing payment instrument gracefully', async () => {
                mockGetOrder.mockResolvedValue({
                    orderNo: 'ORDER123',
                    c_pending3DSAuthentication: true,
                    paymentInstruments: []
                })

                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                expect(res.send).toHaveBeenCalled()
            })
        })

        describe('Merchant ID Handling', () => {
            it('should use merchantId from query param when provided', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        query: { 
                            orderNo: 'ORDER123', 
                            orderToken: 'TOKEN456',
                            merchantId: 'QUERY_MERCHANT_123'
                        },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                expect(getPaymentDetails).toHaveBeenCalledWith({
                    config: expect.objectContaining({
                        merchantId: 'QUERY_MERCHANT_123'
                    }),
                    transactionId: 'payment-req-123'
                })
            })
        })

        describe('Origin Validation (SEC-1 Security Fix)', () => {
            it('should reject callback when JPMC_STOREFRONT_ALLOWED_ORIGINS is not configured', async () => {
                // Clear the allowed origins config
                delete process.env.JPMC_STOREFRONT_ALLOWED_ORIGINS
                
                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                // Should return 403 Forbidden
                expect(res.status).toHaveBeenCalledWith(403)
                expect(res.send).toHaveBeenCalled()
                
                // Should NOT proceed to payment details fetch
                expect(getPaymentDetails).not.toHaveBeenCalled()
            })

            it('should reject callback when origin is not in allowlist', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        },
                        headers: {
                            'x-forwarded-proto': 'https',
                            'x-forwarded-host': 'evil.attacker.com'
                        }
                    }
                })

                await handle3DSCallback(req, res)

                // Should return 403 Forbidden
                expect(res.status).toHaveBeenCalledWith(403)
                expect(res.send).toHaveBeenCalled()
                
                // Should NOT proceed to payment details fetch
                expect(getPaymentDetails).not.toHaveBeenCalled()
            })

            it('should set CSP frame-ancestors to none when allowlist is not configured', async () => {
                // Clear the allowed origins config
                delete process.env.JPMC_STOREFRONT_ALLOWED_ORIGINS
                
                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                // Should set CSP with frame-ancestors 'none'
                expect(res.setHeader).toHaveBeenCalledWith(
                    'Content-Security-Policy',
                    expect.stringContaining("frame-ancestors 'none'")
                )
            })

            it('should set CSP frame-ancestors to allowed origins when configured', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }
                })

                await handle3DSCallback(req, res)

                // Should set CSP with frame-ancestors containing allowed origins
                expect(res.setHeader).toHaveBeenCalledWith(
                    'Content-Security-Policy',
                    expect.stringContaining('frame-ancestors https://localhost:3000')
                )
            })

            it('should allow callback from origin in allowlist', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        query: { orderNo: 'ORDER123', orderToken: 'TOKEN456' },
                        body: {
                            paymentRequestId: 'payment-req-123',
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        },
                        headers: {
                            'x-forwarded-proto': 'https',
                            'x-forwarded-host': 'localhost:3000'
                        }
                    }
                })

                await handle3DSCallback(req, res)

                // Should proceed normally (not 403)
                expect(res.status).not.toHaveBeenCalledWith(403)
                
                // Should proceed to payment details fetch
                expect(getPaymentDetails).toHaveBeenCalled()
            })
        })
    })

    // =========================================================================
    // handleFail3DSOrder Tests
    // =========================================================================

    describe('handleFail3DSOrder', () => {
        describe('Successful Failure (Cancel/Timeout)', () => {
            it('should fail order on user cancellation', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        body: {
                            orderNo: 'ORDER123',
                            orderToken: 'TOKEN456',
                            failureReason: THREE_DS.FAILURE_REASON.USER_CANCELLED
                        }
                    }
                })

                await handleFail3DSOrder(req, res)

                expect(mockGetOrder).toHaveBeenCalledWith('ORDER123')
                expect(mockPatchOrder).toHaveBeenCalledWith('ORDER123', {
                    c_pending3DSAuthentication: false,
                    c_threeDSTransactionStatus: THREE_DS.TRANSACTION_STATUS.UNAVAILABLE,
                    c_threeDSFailureReason: THREE_DS.FAILURE_REASON.USER_CANCELLED
                })
                expect(mockUpdateOrderStatus).toHaveBeenCalledWith('ORDER123', 'failed')
                expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
            })

            it('should fail order on timeout', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        body: {
                            orderNo: 'ORDER123',
                            orderToken: 'TOKEN456',
                            failureReason: THREE_DS.FAILURE_REASON.TIMEOUT
                        }
                    }
                })

                await handleFail3DSOrder(req, res)

                expect(mockPatchOrder).toHaveBeenCalledWith('ORDER123', expect.objectContaining({
                    c_threeDSFailureReason: THREE_DS.FAILURE_REASON.TIMEOUT
                }))
            })

            it('should use TIMEOUT as default when no failureReason provided (per SFRA whitelist)', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        body: {
                            orderNo: 'ORDER123',
                            orderToken: 'TOKEN456'
                        }
                    }
                })

                await handleFail3DSOrder(req, res)

                // Invalid reason defaults to TIMEOUT
                expect(mockPatchOrder).toHaveBeenCalledWith('ORDER123', expect.objectContaining({
                    c_threeDSFailureReason: THREE_DS.FAILURE_REASON.TIMEOUT
                }))
            })

            it('should default to TIMEOUT when invalid failureReason provided (whitelist validation)', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        body: {
                            orderNo: 'ORDER123',
                            orderToken: 'TOKEN456',
                            failureReason: 'INVALID_REASON'
                        }
                    }
                })

                await handleFail3DSOrder(req, res)

                // Invalid reason defaults to TIMEOUT
                expect(mockPatchOrder).toHaveBeenCalledWith('ORDER123', expect.objectContaining({
                    c_threeDSFailureReason: THREE_DS.FAILURE_REASON.TIMEOUT
                }))
            })
        })

        describe('Validation Errors', () => {
            it('should return 400 when orderNo is missing', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        body: {
                            orderToken: 'TOKEN456',
                            failureReason: 'USER_CANCELLED'
                        }
                    }
                })

                await handleFail3DSOrder(req, res)

                expect(res.status).toHaveBeenCalledWith(400)
                expect(res.json).toHaveBeenCalledWith({
                    success: false,
                    error: 'Missing orderNo or orderToken'
                })
            })

            it('should return 400 when orderToken is missing', async () => {
                const { req, res } = createMockReqRes({
                    req: {
                        body: {
                            orderNo: 'ORDER123',
                            failureReason: 'USER_CANCELLED'
                        }
                    }
                })

                await handleFail3DSOrder(req, res)

                expect(res.status).toHaveBeenCalledWith(400)
            })

            it('should return 400 when order is not pending 3DS', async () => {
                mockGetOrder.mockResolvedValue({
                    orderNo: 'ORDER123',
                    c_pending3DSAuthentication: false
                })

                const { req, res } = createMockReqRes({
                    req: {
                        body: {
                            orderNo: 'ORDER123',
                            orderToken: 'TOKEN456',
                            failureReason: 'USER_CANCELLED'
                        }
                    }
                })

                await handleFail3DSOrder(req, res)

                expect(res.status).toHaveBeenCalledWith(400)
                expect(res.json).toHaveBeenCalledWith({
                    success: false,
                    error: 'Order is not pending 3DS authentication'
                })
            })
        })

        describe('Error Handling', () => {
            it('should return 500 on unexpected error', async () => {
                mockGetOrder.mockRejectedValue(new Error('Database error'))

                const { req, res } = createMockReqRes({
                    req: {
                        body: {
                            orderNo: 'ORDER123',
                            orderToken: 'TOKEN456',
                            failureReason: 'USER_CANCELLED'
                        }
                    }
                })

                await handleFail3DSOrder(req, res)

                expect(res.status).toHaveBeenCalledWith(500)
                expect(res.json).toHaveBeenCalledWith({
                    success: false,
                    error: 'Failed to fail order'
                })
            })
        })
    })

    // =========================================================================
    // Default Export Tests
    // =========================================================================

    describe('Default Export', () => {
        it('should export default object with all functions', () => {
            const defaultExport = require('../threeds-controller').default

            expect(defaultExport).toHaveProperty('configureThreeDSController')
            expect(defaultExport).toHaveProperty('handle3DSCallback')
            expect(defaultExport).toHaveProperty('handleFail3DSOrder')
        })
    })
})
