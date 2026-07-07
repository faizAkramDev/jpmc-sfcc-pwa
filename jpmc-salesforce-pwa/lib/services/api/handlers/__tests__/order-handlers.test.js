/**
 * Tests for order-handlers
 */

import { handleConfirmOrder, handlePatchOrderPaymentInstrument } from '../order-handlers'
import * as localeExtractor from '../../../../utils/locale-extractor'
import * as inputValidation from '../../../../utils/validation/input-validation'
import logger from '../../../../utils/logger'

jest.mock('../../../../utils/logger', () => ({
    error: jest.fn(),
    warn: jest.fn()
}))

jest.mock('../../../../utils/locale-extractor')
jest.mock('../../../../utils/validation/input-validation')

global.fetch = jest.fn()

describe('order-handlers', () => {
    const mockReq = {
        params: { orderNo: 'order-123' },
        body: { 
            jpmcResponse: { transactionId: 'txn-123' },
            paymentInstrumentId: 'pi-123'
        },
        headers: { authorization: 'Bearer token123' }
    }

    const mockRes = {
        status: jest.fn(function() { return this }),
        json: jest.fn(function(data) { 
            this.statusCode = this.status.mock.calls[this.status.mock.calls.length - 1][0]
            this.data = data
            return this 
        })
    }

    beforeEach(() => {
        jest.clearAllMocks()
        global.fetch.mockClear()
        localeExtractor.extractSlasToken.mockReturnValue('token123')
        inputValidation.validateOrderNumber.mockReturnValue({ valid: true })
        process.env.SFCC_SHORT_CODE = 'staging'
        process.env.SFCC_ORG_ID = 'org123'
        process.env.SFCC_SITE_ID = 'site123'
    })

    describe('handleConfirmOrder', () => {
        it('should return 400 when orderNo is missing', async () => {
            const req = { ...mockReq, params: {} }
            
            await handleConfirmOrder(req, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(400)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'INVALID_REQUEST',
                    message: expect.stringContaining('orderNo')
                })
            )
        })

        it('should return 400 when jpmcResponse.transactionId is missing', async () => {
            const req = { ...mockReq, body: { jpmcResponse: {} } }
            
            await handleConfirmOrder(req, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(400)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'INVALID_REQUEST',
                    message: expect.stringContaining('transactionId')
                })
            )
        })

        it('should return 400 when jpmcResponse is missing entirely', async () => {
            const req = { ...mockReq, body: {} }
            
            await handleConfirmOrder(req, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(400)
        })

        it('should return 401 when SLAS token is missing', async () => {
            localeExtractor.extractSlasToken.mockReturnValue(null)
            
            await handleConfirmOrder(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(401)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    errorCode: 'UNAUTHORIZED',
                    message: expect.stringContaining('SLAS token')
                })
            )
        })

        it('should return 500 when shortCode is missing', async () => {
            process.env.SFCC_SHORT_CODE = ''
            
            await handleConfirmOrder(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(500)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    errorCode: 'CONFIGURATION_ERROR'
                })
            )
        })

        it('should return 500 when organizationId is missing', async () => {
            process.env.SFCC_ORG_ID = ''
            
            await handleConfirmOrder(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(500)
        })

        it('should send PATCH request when paymentInstrumentId provided', async () => {
            global.fetch.mockResolvedValueOnce({ ok: true })
            
            await handleConfirmOrder(mockReq, mockRes)

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('payment-instruments'),
                expect.objectContaining({
                    method: 'PATCH'
                })
            )
        })

        it('should return 200 on successful confirmation', async () => {
            global.fetch.mockResolvedValueOnce({ ok: true })
            
            await handleConfirmOrder(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    orderNo: 'order-123',
                    transactionId: 'txn-123'
                })
            )
        })

        it('should handle payment instrument PATCH failure gracefully', async () => {
            global.fetch.mockResolvedValueOnce({ ok: false, status: 400, text: () => Promise.resolve('error') })
            
            await handleConfirmOrder(mockReq, mockRes)

            // Should still succeed despite PATCH failure
            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(logger.warn).toHaveBeenCalled()
        })

        it('should handle thrown errors', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'))
            
            await handleConfirmOrder(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(500)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'CONFIRM_ERROR'
                })
            )
        })

        it('should not send PATCH request when paymentInstrumentId missing', async () => {
            const req = { ...mockReq, body: { jpmcResponse: { transactionId: 'txn-123' } } }
            
            await handleConfirmOrder(req, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
        })
    })

    describe('handlePatchOrderPaymentInstrument', () => {
        const patchReq = {
            params: { orderNo: 'order-123', paymentInstrumentId: 'pi-123' },
            body: { c_jpmcTransactionId: 'txn-123' },
            headers: { authorization: 'Bearer token123' }
        }

        it('should return 400 when orderNo is invalid', async () => {
            inputValidation.validateOrderNumber.mockReturnValue({ valid: false, error: 'Invalid' })
            
            await handlePatchOrderPaymentInstrument(patchReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(400)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'INVALID_REQUEST'
                })
            )
        })

        it('should return 400 when paymentInstrumentId is missing', async () => {
            const req = { ...patchReq, params: { orderNo: 'order-123' } }
            
            await handlePatchOrderPaymentInstrument(req, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(400)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('paymentInstrumentId')
                })
            )
        })

        it('should return 400 when paymentInstrumentId has invalid format', async () => {
            const req = { ...patchReq, params: { orderNo: 'order-123', paymentInstrumentId: '!!!invalid!!!' } }
            
            await handlePatchOrderPaymentInstrument(req, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(400)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Invalid paymentInstrumentId format')
                })
            )
        })

        it('should return 400 when request body is empty', async () => {
            const req = { ...patchReq, body: {} }
            
            await handlePatchOrderPaymentInstrument(req, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(400)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Request body must contain')
                })
            )
        })

        it('should return 400 when request body is null', async () => {
            const req = { ...patchReq, body: null }
            
            await handlePatchOrderPaymentInstrument(req, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(400)
        })

        it('should reject attributes not in allowlist', async () => {
            const req = { ...patchReq, body: { c_jpmcTransactionId: 'txn-123', c_invalidField: 'value' } }
            global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
            
            await handlePatchOrderPaymentInstrument(req, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
        })

        it('should return 400 when no allowed attributes remain after filtering', async () => {
            const req = { ...patchReq, body: { c_invalidField: 'value' } }
            
            await handlePatchOrderPaymentInstrument(req, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(400)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('allowed attribute')
                })
            )
        })

        it('should return 401 when SLAS token is missing', async () => {
            localeExtractor.extractSlasToken.mockReturnValue(null)
            
            await handlePatchOrderPaymentInstrument(patchReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(401)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    errorCode: 'UNAUTHORIZED'
                })
            )
        })

        it('should return 500 when shortCode is missing', async () => {
            process.env.SFCC_SHORT_CODE = ''
            
            await handlePatchOrderPaymentInstrument(patchReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(500)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    errorCode: 'CONFIGURATION_ERROR'
                })
            )
        })

        it('should send PATCH request to Shopper Orders API', async () => {
            global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
            
            await handlePatchOrderPaymentInstrument(patchReq, mockRes)

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('shopper-orders'),
                expect.objectContaining({
                    method: 'PATCH',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer token123'
                    })
                })
            )
        })

        it('should return 200 on successful patch', async () => {
            global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
            
            await handlePatchOrderPaymentInstrument(patchReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    orderNo: 'order-123',
                    paymentInstrumentId: 'pi-123'
                })
            )
        })

        it('should handle API errors correctly', async () => {
            global.fetch.mockResolvedValueOnce({ ok: false, status: 400, text: () => Promise.resolve('error body') })
            
            await handlePatchOrderPaymentInstrument(patchReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(400)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'HTTP_400'
                })
            )
        })

        it('should handle thrown errors', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'))
            
            await handlePatchOrderPaymentInstrument(patchReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(500)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'PATCH_ERROR'
                })
            )
        })

        it('should filter request body to only allowed attributes', async () => {
            const req = { ...patchReq, body: { c_jpmcTransactionId: 'txn-123', c_invalidField: 'value' } }
            global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
            
            await handlePatchOrderPaymentInstrument(req, mockRes)

            const callArgs = global.fetch.mock.calls[0]
            const bodyStr = callArgs[1].body
            const body = JSON.parse(bodyStr)
            
            expect(body).toHaveProperty('c_jpmcTransactionId')
            expect(body).not.toHaveProperty('c_invalidField')
        })

        it('should include rejectedAttributes in response when present', async () => {
            const req = { ...patchReq, body: { c_jpmcTransactionId: 'txn-123', c_invalidField: 'value' } }
            global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
            
            await handlePatchOrderPaymentInstrument(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    rejectedAttributes: expect.arrayContaining(['c_invalidField'])
                })
            )
        })

        it('should accept valid paymentInstrumentIds with alphanumeric and special characters', async () => {
            const req = { ...patchReq, params: { orderNo: 'order-123', paymentInstrumentId: 'pi-123_abc-def' } }
            global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
            
            await handlePatchOrderPaymentInstrument(req, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
        })
    })
})
