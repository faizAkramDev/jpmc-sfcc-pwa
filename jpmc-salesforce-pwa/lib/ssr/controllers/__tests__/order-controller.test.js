/**
 * Order Controller Tests
 * 
 * Tests for the server-side order management handlers
 */

import {
    configureOrderController,
    handleConfirmOrder,
    handleFailOrder,
    handleUpdateOrderStatus,
    handlePatchPaymentInstrument,
    handleGetOrder
} from '../order-controller'

// Mock dependencies
jest.mock('../../api/order-api', () => ({
    OrderApiClient: jest.fn().mockImplementation(() => ({
        updateOrderStatus: jest.fn().mockResolvedValue({ success: true }),
        updateOrderPaymentStatus: jest.fn().mockResolvedValue({ success: true }),
        updateOrderConfirmationStatus: jest.fn().mockResolvedValue({ success: true }),
        updateOrderExportStatus: jest.fn().mockResolvedValue({ success: true }),
        patchPaymentInstrument: jest.fn().mockResolvedValue({ success: true }),
        patchPaymentTransaction: jest.fn().mockResolvedValue({ success: true }),
        getOrder: jest.fn().mockResolvedValue({
            orderNo: 'ORDER123',
            status: 'new',
            paymentStatus: 'not_paid',
            paymentInstruments: [{
                paymentInstrumentId: 'pi123',
                paymentMethodId: 'CREDIT_CARD',
                amount: 99.99
            }]
        })
    }))
}))

jest.mock('../../api/attribute-mapping', () => ({
    mapJPMCResponseToAttributes: jest.fn(() => ({
        c_jpmcTransactionId: 'txn123',
        c_jpmcResponseCode: 'APPROVED'
    })),
    mapPaymentTransactionAttributes: jest.fn(() => ({
        c_jpmcAuthCode: 'AUTH123'
    }))
}))

jest.mock('../../../utils/logger.js', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    },
    safeStringify: jest.fn(obj => JSON.stringify(obj))
}))

jest.mock('../../../utils/validation/input-validation', () => ({
    validateOrderNumber: jest.fn((orderNo) => {
        if (!orderNo || orderNo.includes('../') || orderNo.includes('..\\')) {
            return { valid: false, error: 'Invalid order number', code: 'INVALID_ORDER_NUMBER' }
        }
        return { valid: true }
    })
}))

import { OrderApiClient } from '../../api/order-api'
import { mapJPMCResponseToAttributes, mapPaymentTransactionAttributes } from '../../api/attribute-mapping'
import { validateOrderNumber } from '../../../utils/validation/input-validation'

// Helper to create mock request/response
const createMockReqRes = (overrides = {}) => {
    const req = {
        params: {},
        body: {},
        ...overrides.req
    }
    
    const res = {
        locals: {},
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        ...overrides.res
    }
    
    const next = jest.fn()
    
    return { req, res, next }
}

describe('order-controller', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        // Configure controller with default settings
        configureOrderController({
            commerceConfig: {
                organizationId: 'test-org',
                shortCode: 'test-short',
                siteId: 'test-site'
            },
            debug: false,
            attributeMapping: {}
        })
    })

    describe('configureOrderController', () => {
        it('accepts configuration', () => {
            expect(() => {
                configureOrderController({
                    commerceConfig: { organizationId: 'new-org' },
                    debug: true
                })
            }).not.toThrow()
        })
    })

    describe('handleConfirmOrder', () => {
        it('confirms order successfully', async () => {
            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: {
                        jpmcResponse: { transactionId: 'txn123', responseStatus: 'APPROVED' },
                        paymentInstrumentId: 'pi123',
                        captureMethod: 'NOW',
                        paymentAmount: 99.99
                    }
                }
            })

            await handleConfirmOrder(req, res, next)

            expect(next).toHaveBeenCalled()
            expect(res.locals.response).toEqual(expect.objectContaining({
                success: true,
                orderNo: 'ORDER123'
            }))
        })

        it('returns 400 for invalid order number', async () => {
            validateOrderNumber.mockReturnValueOnce({
                valid: false,
                error: 'Invalid order number',
                code: 'INVALID_ORDER_NUMBER'
            })

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: '../../../etc/passwd' },
                    body: {}
                }
            })

            await handleConfirmOrder(req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                errorCode: 'INVALID_ORDER_NUMBER'
            }))
        })

        it('returns 400 for missing orderNo', async () => {
            validateOrderNumber.mockReturnValueOnce({ valid: true })

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: '' },
                    body: {}
                }
            })

            await handleConfirmOrder(req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: 'orderNo is required'
            }))
        })

        it('updates order status to new', async () => {
            const mockUpdateStatus = jest.fn().mockResolvedValue({ success: true })
            OrderApiClient.mockImplementation(() => ({
                updateOrderStatus: mockUpdateStatus,
                patchPaymentInstrument: jest.fn().mockResolvedValue({ success: true }),
                patchPaymentTransaction: jest.fn().mockResolvedValue({ success: true })
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: {
                        jpmcResponse: { transactionId: 'txn123' },
                        paymentInstrumentId: 'pi123',
                        paymentAmount: 99.99
                    }
                }
            })

            await handleConfirmOrder(req, res, next)

            expect(mockUpdateStatus).toHaveBeenCalledWith('ORDER123', 'new')
        })

        it('patches payment instrument with JPMC data', async () => {
            const mockPatchPI = jest.fn().mockResolvedValue({ success: true })
            OrderApiClient.mockImplementation(() => ({
                updateOrderStatus: jest.fn().mockResolvedValue({ success: true }),
                patchPaymentInstrument: mockPatchPI,
                patchPaymentTransaction: jest.fn().mockResolvedValue({ success: true })
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: {
                        jpmcResponse: { transactionId: 'txn123' },
                        paymentInstrumentId: 'pi123',
                        paymentAmount: 99.99
                    }
                }
            })

            await handleConfirmOrder(req, res, next)

            expect(mapJPMCResponseToAttributes).toHaveBeenCalled()
            expect(mockPatchPI).toHaveBeenCalledWith(
                'ORDER123',
                'pi123',
                expect.any(Object)
            )
        })

        it('patches payment transaction with capture data', async () => {
            const mockPatchTx = jest.fn().mockResolvedValue({ success: true })
            OrderApiClient.mockImplementation(() => ({
                updateOrderStatus: jest.fn().mockResolvedValue({ success: true }),
                patchPaymentInstrument: jest.fn().mockResolvedValue({ success: true }),
                patchPaymentTransaction: mockPatchTx
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: {
                        jpmcResponse: { transactionId: 'txn123' },
                        paymentInstrumentId: 'pi123',
                        captureMethod: 'NOW',
                        paymentAmount: 99.99
                    }
                }
            })

            await handleConfirmOrder(req, res, next)

            expect(mapPaymentTransactionAttributes).toHaveBeenCalledWith(
                { transactionId: 'txn123' },
                99.99,
                'NOW',
                expect.any(Object)
            )
            expect(mockPatchTx).toHaveBeenCalled()
        })

        it('calls custom success handler if provided', async () => {
            const onAuthorizationSuccess = jest.fn().mockResolvedValue(undefined)
            
            configureOrderController({
                commerceConfig: {},
                onAuthorizationSuccess
            })

            OrderApiClient.mockImplementation(() => ({
                updateOrderStatus: jest.fn().mockResolvedValue({ success: true }),
                patchPaymentInstrument: jest.fn().mockResolvedValue({ success: true }),
                patchPaymentTransaction: jest.fn().mockResolvedValue({ success: true })
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: {
                        jpmcResponse: { transactionId: 'txn123' },
                        paymentInstrumentId: 'pi123',
                        paymentAmount: 99.99
                    }
                }
            })

            await handleConfirmOrder(req, res, next)

            expect(onAuthorizationSuccess).toHaveBeenCalledWith('ORDER123', { transactionId: 'txn123' }, req)
        })

        it('continues if custom success handler fails', async () => {
            const onAuthorizationSuccess = jest.fn().mockRejectedValue(new Error('Hook failed'))
            
            configureOrderController({
                commerceConfig: {},
                onAuthorizationSuccess
            })

            OrderApiClient.mockImplementation(() => ({
                updateOrderStatus: jest.fn().mockResolvedValue({ success: true }),
                patchPaymentInstrument: jest.fn().mockResolvedValue({ success: true }),
                patchPaymentTransaction: jest.fn().mockResolvedValue({ success: true })
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: {
                        jpmcResponse: { transactionId: 'txn123' },
                        paymentInstrumentId: 'pi123',
                        paymentAmount: 99.99
                    }
                }
            })

            await handleConfirmOrder(req, res, next)

            expect(next).toHaveBeenCalled()
            expect(res.locals.response.success).toBe(true)
        })

        it('handles status update failure gracefully', async () => {
            OrderApiClient.mockImplementation(() => ({
                updateOrderStatus: jest.fn().mockRejectedValue(new Error('Status update failed')),
                patchPaymentInstrument: jest.fn().mockResolvedValue({ success: true }),
                patchPaymentTransaction: jest.fn().mockResolvedValue({ success: true })
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: {
                        jpmcResponse: { transactionId: 'txn123' },
                        paymentInstrumentId: 'pi123',
                        paymentAmount: 99.99
                    }
                }
            })

            await handleConfirmOrder(req, res, next)

            // Should still continue despite status update failure
            expect(next).toHaveBeenCalled()
        })

        it('handles payment instrument patch failure gracefully', async () => {
            OrderApiClient.mockImplementation(() => ({
                updateOrderStatus: jest.fn().mockResolvedValue({ success: true }),
                patchPaymentInstrument: jest.fn().mockRejectedValue(new Error('Patch failed')),
                patchPaymentTransaction: jest.fn().mockResolvedValue({ success: true })
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: {
                        jpmcResponse: { transactionId: 'txn123' },
                        paymentInstrumentId: 'pi123',
                        paymentAmount: 99.99
                    }
                }
            })

            await handleConfirmOrder(req, res, next)

            expect(next).toHaveBeenCalled()
            expect(res.locals.response.success).toBe(true)
        })

        it('skips PI/TX patch when jpmcResponse is missing', async () => {
            const mockPatchPI = jest.fn()
            OrderApiClient.mockImplementation(() => ({
                updateOrderStatus: jest.fn().mockResolvedValue({ success: true }),
                patchPaymentInstrument: mockPatchPI
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: {}
                }
            })

            await handleConfirmOrder(req, res, next)

            expect(mockPatchPI).not.toHaveBeenCalled()
            expect(next).toHaveBeenCalled()
        })
    })

    describe('handleFailOrder', () => {
        it('fails order successfully', async () => {
            OrderApiClient.mockImplementation(() => ({
                updateOrderStatus: jest.fn().mockResolvedValue({ success: true })
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: {
                        jpmcResponse: { errorCode: 'DECLINED' },
                        reason: 'Card declined',
                        errorCode: 'DECLINED'
                    }
                }
            })

            await handleFailOrder(req, res, next)

            expect(next).toHaveBeenCalled()
            expect(res.locals.response).toEqual(expect.objectContaining({
                success: true,
                orderNo: 'ORDER123',
                statusUpdated: true
            }))
        })

        it('returns 400 for invalid order number', async () => {
            validateOrderNumber.mockReturnValueOnce({
                valid: false,
                error: 'Invalid order number',
                code: 'INVALID_ORDER_NUMBER'
            })

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: '../bad' },
                    body: {}
                }
            })

            await handleFailOrder(req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
        })

        it('updates order status to failed', async () => {
            const mockUpdateStatus = jest.fn().mockResolvedValue({ success: true })
            OrderApiClient.mockImplementation(() => ({
                updateOrderStatus: mockUpdateStatus
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: { reason: 'Payment failed' }
                }
            })

            await handleFailOrder(req, res, next)

            expect(mockUpdateStatus).toHaveBeenCalledWith('ORDER123', 'failed')
        })

        it('calls custom failure handler if provided', async () => {
            const onAuthorizationFailure = jest.fn().mockResolvedValue(undefined)
            
            configureOrderController({
                commerceConfig: {},
                onAuthorizationFailure
            })

            OrderApiClient.mockImplementation(() => ({
                updateOrderStatus: jest.fn().mockResolvedValue({ success: true })
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: {
                        jpmcResponse: { errorCode: 'DECLINED' },
                        reason: 'Card declined'
                    }
                }
            })

            await handleFailOrder(req, res, next)

            expect(onAuthorizationFailure).toHaveBeenCalledWith(
                'ORDER123',
                { errorCode: 'DECLINED' },
                'Card declined',
                req
            )
        })

        it('handles status update failure gracefully', async () => {
            OrderApiClient.mockImplementation(() => ({
                updateOrderStatus: jest.fn().mockRejectedValue(new Error('Update failed'))
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: { reason: 'Payment failed' }
                }
            })

            await handleFailOrder(req, res, next)

            expect(next).toHaveBeenCalled()
            expect(res.locals.response.statusUpdated).toBe(false)
        })
    })

    describe('handleUpdateOrderStatus', () => {
        it('updates order status', async () => {
            const mockUpdateStatus = jest.fn().mockResolvedValue({ success: true })
            OrderApiClient.mockImplementation(() => ({
                updateOrderStatus: mockUpdateStatus
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: { status: 'completed' }
                }
            })

            await handleUpdateOrderStatus(req, res, next)

            expect(mockUpdateStatus).toHaveBeenCalledWith('ORDER123', 'completed')
            expect(res.locals.response.updated).toContain('status')
        })

        it('updates payment status', async () => {
            const mockUpdatePaymentStatus = jest.fn().mockResolvedValue({ success: true })
            OrderApiClient.mockImplementation(() => ({
                updateOrderPaymentStatus: mockUpdatePaymentStatus
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: { paymentStatus: 'paid' }
                }
            })

            await handleUpdateOrderStatus(req, res, next)

            expect(mockUpdatePaymentStatus).toHaveBeenCalledWith('ORDER123', 'paid')
            expect(res.locals.response.updated).toContain('paymentStatus')
        })

        it('updates confirmation status', async () => {
            const mockUpdateConfirmationStatus = jest.fn().mockResolvedValue({ success: true })
            OrderApiClient.mockImplementation(() => ({
                updateOrderConfirmationStatus: mockUpdateConfirmationStatus
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: { confirmationStatus: 'confirmed' }
                }
            })

            await handleUpdateOrderStatus(req, res, next)

            expect(mockUpdateConfirmationStatus).toHaveBeenCalledWith('ORDER123', 'confirmed')
        })

        it('updates export status', async () => {
            const mockUpdateExportStatus = jest.fn().mockResolvedValue({ success: true })
            OrderApiClient.mockImplementation(() => ({
                updateOrderExportStatus: mockUpdateExportStatus
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: { exportStatus: 'exported' }
                }
            })

            await handleUpdateOrderStatus(req, res, next)

            expect(mockUpdateExportStatus).toHaveBeenCalledWith('ORDER123', 'exported')
        })

        it('returns 400 for invalid order number', async () => {
            validateOrderNumber.mockReturnValueOnce({
                valid: false,
                error: 'Invalid order number',
                code: 'INVALID_ORDER_NUMBER'
            })

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: '../bad' },
                    body: { status: 'new' }
                }
            })

            await handleUpdateOrderStatus(req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
        })

        it('handles errors', async () => {
            OrderApiClient.mockImplementation(() => ({
                updateOrderStatus: jest.fn().mockRejectedValue(new Error('Update failed'))
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: { status: 'new' }
                }
            })

            await handleUpdateOrderStatus(req, res, next)

            expect(next).toHaveBeenCalledWith(expect.any(Error))
        })
    })

    describe('handlePatchPaymentInstrument', () => {
        it('patches payment instrument successfully', async () => {
            const mockGetOrder = jest.fn().mockResolvedValue({
                orderNo: 'ORDER123',
                paymentInstruments: [{
                    paymentInstrumentId: 'pi123',
                    paymentMethodId: 'CREDIT_CARD',
                    paymentCard: { cardType: 'visa', maskedNumber: '************1111' }
                }]
            })
            const mockPatchPI = jest.fn().mockResolvedValue({ success: true })
            
            OrderApiClient.mockImplementation(() => ({
                getOrder: mockGetOrder,
                patchPaymentInstrument: mockPatchPI
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123', paymentInstrumentId: 'pi123' },
                    body: {
                        jpmcResponse: { transactionId: 'txn123' }
                    }
                }
            })

            await handlePatchPaymentInstrument(req, res, next)

            expect(mockPatchPI).toHaveBeenCalledWith(
                'ORDER123',
                'pi123',
                expect.objectContaining({
                    paymentMethodId: 'CREDIT_CARD',
                    paymentCard: expect.any(Object)
                })
            )
            expect(res.locals.response.success).toBe(true)
        })

        it('uses custom attributes if provided', async () => {
            OrderApiClient.mockImplementation(() => ({
                getOrder: jest.fn().mockResolvedValue({
                    paymentInstruments: [{ paymentInstrumentId: 'pi123', paymentMethodId: 'CC' }]
                }),
                patchPaymentInstrument: jest.fn().mockResolvedValue({ success: true })
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123', paymentInstrumentId: 'pi123' },
                    body: {
                        customAttributes: { c_custom: 'value' }
                    }
                }
            })

            await handlePatchPaymentInstrument(req, res, next)

            expect(mapJPMCResponseToAttributes).not.toHaveBeenCalled()
        })

        it('returns 400 for invalid order number', async () => {
            validateOrderNumber.mockReturnValueOnce({
                valid: false,
                error: 'Invalid order number',
                code: 'INVALID_ORDER_NUMBER'
            })

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: '../bad', paymentInstrumentId: 'pi123' },
                    body: {}
                }
            })

            await handlePatchPaymentInstrument(req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
        })

        it('returns 400 when paymentInstrumentId is missing', async () => {
            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' },
                    body: {}
                }
            })

            await handlePatchPaymentInstrument(req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'orderNo and paymentInstrumentId are required'
            }))
        })

        it('returns 404 when payment instrument not found', async () => {
            OrderApiClient.mockImplementation(() => ({
                getOrder: jest.fn().mockResolvedValue({
                    paymentInstruments: [{ paymentInstrumentId: 'other-pi' }]
                })
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123', paymentInstrumentId: 'pi123' },
                    body: { jpmcResponse: {} }
                }
            })

            await handlePatchPaymentInstrument(req, res, next)

            expect(res.status).toHaveBeenCalledWith(404)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'Payment instrument not found'
            }))
        })
    })

    describe('handleGetOrder', () => {
        it('returns order details', async () => {
            OrderApiClient.mockImplementation(() => ({
                getOrder: jest.fn().mockResolvedValue({
                    orderNo: 'ORDER123',
                    status: 'new',
                    paymentStatus: 'paid',
                    confirmationStatus: 'confirmed',
                    exportStatus: 'not_exported',
                    paymentInstruments: [{
                        paymentInstrumentId: 'pi123',
                        paymentMethodId: 'CREDIT_CARD',
                        amount: 99.99
                    }]
                })
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' }
                }
            })

            await handleGetOrder(req, res, next)

            expect(res.locals.response).toEqual({
                success: true,
                order: expect.objectContaining({
                    orderNo: 'ORDER123',
                    status: 'new',
                    paymentInstruments: expect.arrayContaining([
                        expect.objectContaining({
                            paymentInstrumentId: 'pi123',
                            amount: 99.99
                        })
                    ])
                })
            })
        })

        it('returns 400 for invalid order number', async () => {
            validateOrderNumber.mockReturnValueOnce({
                valid: false,
                error: 'Invalid order number',
                code: 'INVALID_ORDER_NUMBER'
            })

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: '../etc/passwd' }
                }
            })

            await handleGetOrder(req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
        })

        it('returns 400 for missing orderNo', async () => {
            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: '' }
                }
            })

            await handleGetOrder(req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
        })

        it('handles API errors', async () => {
            OrderApiClient.mockImplementation(() => ({
                getOrder: jest.fn().mockRejectedValue(new Error('Order not found'))
            }))

            const { req, res, next } = createMockReqRes({
                req: {
                    params: { orderNo: 'ORDER123' }
                }
            })

            await handleGetOrder(req, res, next)

            expect(next).toHaveBeenCalledWith(expect.any(Error))
        })
    })
})
