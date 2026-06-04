/**
 * Order Handlers Tests
 *
 * @jest-environment node
 *
 * Tests for order confirmation and payment instrument patching
 */

import {
    handleConfirmOrder,
    handlePatchOrderPaymentInstrument
} from '../order-handlers'

// Mock logger
jest.mock('../../../../utils/logger', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }
}))

// Mock locale-extractor
jest.mock('../../../../utils/locale-extractor', () => ({
    extractSlasToken: jest.fn()
}))

import { extractSlasToken } from '../../../../utils/locale-extractor'

// Mock global fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('Order Handlers', () => {
    // Mock request and response
    let mockReq
    let mockRes

    beforeEach(() => {
        jest.clearAllMocks()

        // Set environment variables
        process.env.SFCC_SHORT_CODE = 'test-short-code'
        process.env.SFCC_ORG_ID = 'test-org-id'
        process.env.SFCC_SITE_ID = 'RefArch'

        // Default mock implementations
        extractSlasToken.mockReturnValue('slas-token-123')
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ success: true }),
            text: async () => ''
        })

        // Create mock request
        mockReq = {
            params: {},
            body: {},
            query: {},
            headers: {
                authorization: 'Bearer slas-token-123'
            }
        }

        // Create mock response
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        }
    })

    afterEach(() => {
        delete process.env.SFCC_SHORT_CODE
        delete process.env.SFCC_ORG_ID
        delete process.env.SFCC_SITE_ID
    })

    describe('handleConfirmOrder', () => {
        it('should return 400 when orderNo is missing', async () => {
            mockReq.params = {}
            mockReq.body = {
                jpmcResponse: { transactionId: 'txn-123' }
            }

            await handleConfirmOrder(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(400)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'INVALID_REQUEST',
                    message: 'Missing required parameter: orderNo'
                })
            )
        })

        it('should return 400 when jpmcResponse is missing', async () => {
            mockReq.params = { orderNo: 'order-123' }
            mockReq.body = {}

            await handleConfirmOrder(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(400)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'INVALID_REQUEST',
                    message: 'Missing required jpmcResponse with transactionId'
                })
            )
        })

        it('should return 400 when transactionId is missing', async () => {
            mockReq.params = { orderNo: 'order-123' }
            mockReq.body = {
                jpmcResponse: {}
            }

            await handleConfirmOrder(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(400)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'INVALID_REQUEST',
                    message: 'Missing required jpmcResponse with transactionId'
                })
            )
        })

        it('should return 401 when SLAS token is missing', async () => {
            extractSlasToken.mockReturnValue(null)

            mockReq.params = { orderNo: 'order-123' }
            mockReq.body = {
                jpmcResponse: { transactionId: 'txn-123' }
            }

            await handleConfirmOrder(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(401)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'UNAUTHORIZED',
                    message: expect.stringContaining('Missing or invalid Authorization header')
                })
            )
        })

        it('should return 500 when SFCC configuration is missing', async () => {
            delete process.env.SFCC_SHORT_CODE
            delete process.env.SFCC_ORG_ID

            mockReq.params = { orderNo: 'order-123' }
            mockReq.body = {
                jpmcResponse: { transactionId: 'txn-123' }
            }

            await handleConfirmOrder(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(500)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'CONFIGURATION_ERROR'
                })
            )
        })

        it('should patch payment instrument when paymentInstrumentId provided', async () => {
            mockReq.params = { orderNo: 'order-123' }
            mockReq.body = {
                jpmcResponse: { transactionId: 'txn-123' },
                paymentInstrumentId: 'pi-456'
            }

            await handleConfirmOrder(mockReq, mockRes)

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/orders/order-123/payment-instruments/pi-456'),
                expect.objectContaining({
                    method: 'PATCH',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer slas-token-123',
                        'Content-Type': 'application/json'
                    }),
                    body: expect.stringContaining('c_jpmcTransactionId')
                })
            )
        })

        it('should return success even if patch fails', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: async () => 'Patch failed'
            })

            mockReq.params = { orderNo: 'order-123' }
            mockReq.body = {
                jpmcResponse: { transactionId: 'txn-123' },
                paymentInstrumentId: 'pi-456'
            }

            await handleConfirmOrder(mockReq, mockRes)

            // Should still succeed (patch failure is non-blocking)
            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    orderNo: 'order-123',
                    transactionId: 'txn-123'
                })
            )
        })

        it('should return success on successful confirmation', async () => {
            mockReq.params = { orderNo: 'order-123' }
            mockReq.body = {
                jpmcResponse: { transactionId: 'txn-123' },
                paymentInstrumentId: 'pi-456',
                captureMethod: 'NOW'
            }

            await handleConfirmOrder(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    orderNo: 'order-123',
                    transactionId: 'txn-123',
                    message: 'Order confirmed and patched with JPMC data'
                })
            )
        })

        it('should skip patching when paymentInstrumentId is not provided', async () => {
            mockReq.params = { orderNo: 'order-123' }
            mockReq.body = {
                jpmcResponse: { transactionId: 'txn-123' }
            }

            await handleConfirmOrder(mockReq, mockRes)

            expect(mockFetch).not.toHaveBeenCalled()
            expect(mockRes.status).toHaveBeenCalledWith(200)
        })

        it('should handle exception during confirmation', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'))

            mockReq.params = { orderNo: 'order-123' }
            mockReq.body = {
                jpmcResponse: { transactionId: 'txn-123' },
                paymentInstrumentId: 'pi-456'
            }

            await handleConfirmOrder(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(500)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'CONFIRM_ERROR'
                })
            )
        })

        it('should use COMMERCE_API env variables as fallback', async () => {
            delete process.env.SFCC_SHORT_CODE
            delete process.env.SFCC_ORG_ID
            process.env.COMMERCE_API_SHORT_CODE = 'commerce-short-code'
            process.env.COMMERCE_API_ORG_ID = 'commerce-org-id'

            mockReq.params = { orderNo: 'order-123' }
            mockReq.body = {
                jpmcResponse: { transactionId: 'txn-123' },
                paymentInstrumentId: 'pi-456'
            }

            await handleConfirmOrder(mockReq, mockRes)

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('commerce-short-code'),
                expect.any(Object)
            )

            delete process.env.COMMERCE_API_SHORT_CODE
            delete process.env.COMMERCE_API_ORG_ID
        })

        it('should build correct API URL', async () => {
            mockReq.params = { orderNo: 'order-123' }
            mockReq.body = {
                jpmcResponse: { transactionId: 'txn-123' },
                paymentInstrumentId: 'pi-456'
            }

            await handleConfirmOrder(mockReq, mockRes)

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringMatching(/https:\/\/test-short-code\.api\.commercecloud\.salesforce\.com\/checkout\/shopper-orders\/v1\/organizations\/test-org-id\/orders\/order-123\/payment-instruments\/pi-456\?siteId=RefArch/),
                expect.any(Object)
            )
        })
    })

    describe('handlePatchOrderPaymentInstrument', () => {
        it('should return 400 when orderNo is missing', async () => {
            mockReq.params = {}
            mockReq.body = { c_jpmcTransactionId: 'txn-123' }

            await handlePatchOrderPaymentInstrument(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(400)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'INVALID_REQUEST',
                    message: 'Missing required parameter: orderNo'
                })
            )
        })

        it('should return 400 when paymentInstrumentId is missing', async () => {
            mockReq.params = { orderNo: 'order-123' }
            mockReq.body = { c_jpmcTransactionId: 'txn-123' }

            await handlePatchOrderPaymentInstrument(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(400)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'INVALID_REQUEST',
                    message: 'Missing required parameter: paymentInstrumentId'
                })
            )
        })

        it('should return 400 when body is empty', async () => {
            mockReq.params = { orderNo: 'order-123', paymentInstrumentId: 'pi-456' }
            mockReq.body = {}

            await handlePatchOrderPaymentInstrument(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(400)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'INVALID_REQUEST',
                    message: 'Request body must contain custom attributes to patch'
                })
            )
        })

        it('should return 401 when SLAS token is missing', async () => {
            extractSlasToken.mockReturnValue(null)

            mockReq.params = { orderNo: 'order-123', paymentInstrumentId: 'pi-456' }
            mockReq.body = { c_jpmcTransactionId: 'txn-123' }

            await handlePatchOrderPaymentInstrument(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(401)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'UNAUTHORIZED'
                })
            )
        })

        it('should return 500 when SFCC configuration is missing', async () => {
            delete process.env.SFCC_SHORT_CODE
            delete process.env.SFCC_ORG_ID

            mockReq.params = { orderNo: 'order-123', paymentInstrumentId: 'pi-456' }
            mockReq.body = { c_jpmcTransactionId: 'txn-123' }

            await handlePatchOrderPaymentInstrument(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(500)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'CONFIGURATION_ERROR'
                })
            )
        })

        it('should call Shopper Orders API with correct parameters', async () => {
            mockReq.params = { orderNo: 'order-123', paymentInstrumentId: 'pi-456' }
            mockReq.body = { c_jpmcTransactionId: 'txn-123' }

            await handlePatchOrderPaymentInstrument(mockReq, mockRes)

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/orders/order-123/payment-instruments/pi-456'),
                expect.objectContaining({
                    method: 'PATCH',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer slas-token-123',
                        'Content-Type': 'application/json'
                    }),
                    body: JSON.stringify({ c_jpmcTransactionId: 'txn-123' })
                })
            )
        })

        it('should return API error status on fetch failure', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
                text: async () => 'Order not found'
            })

            mockReq.params = { orderNo: 'order-123', paymentInstrumentId: 'pi-456' }
            mockReq.body = { c_jpmcTransactionId: 'txn-123' }

            await handlePatchOrderPaymentInstrument(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(404)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'HTTP_404',
                    details: 'Order not found'
                })
            )
        })

        it('should return success on successful patch', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ patched: true })
            })

            mockReq.params = { orderNo: 'order-123', paymentInstrumentId: 'pi-456' }
            mockReq.body = { c_jpmcTransactionId: 'txn-123' }

            await handlePatchOrderPaymentInstrument(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    orderNo: 'order-123',
                    paymentInstrumentId: 'pi-456',
                    patchedAttributes: ['c_jpmcTransactionId'],
                    response: { patched: true }
                })
            )
        })

        it('should handle exception during patching', async () => {
            mockFetch.mockRejectedValue(new Error('Connection refused'))

            mockReq.params = { orderNo: 'order-123', paymentInstrumentId: 'pi-456' }
            mockReq.body = { c_jpmcTransactionId: 'txn-123' }

            await handlePatchOrderPaymentInstrument(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(500)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'PATCH_ERROR'
                })
            )
        })

        it('should handle exception without message', async () => {
            mockFetch.mockRejectedValue(new Error())

            mockReq.params = { orderNo: 'order-123', paymentInstrumentId: 'pi-456' }
            mockReq.body = { c_jpmcTransactionId: 'txn-123' }

            await handlePatchOrderPaymentInstrument(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'PATCH_ERROR'
                })
            )
        })
    })
})
