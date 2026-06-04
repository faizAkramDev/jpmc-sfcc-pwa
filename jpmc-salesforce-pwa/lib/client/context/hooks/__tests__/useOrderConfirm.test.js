/**
 * useOrderConfirm Hook Tests
 * 
 * Tests for server-side order confirmation handling
 */

import { renderHook, act } from '@testing-library/react'
import { useOrderConfirm } from '../useOrderConfirm.js'

// Mock fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('useOrderConfirm', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockFetch.mockReset()
    })

    // ==========================================================================
    // Initial State Tests
    // ==========================================================================
    
    describe('Initial State', () => {
        it('should return initial state', () => {
            const { result } = renderHook(() => useOrderConfirm())
            
            expect(result.current.orderConfirmResult).toBeNull()
            expect(result.current.isConfirmingOrder).toBe(false)
            expect(result.current.isOrderConfirmed).toBe(false)
        })

        it('should return confirm, fail and reset methods', () => {
            const { result } = renderHook(() => useOrderConfirm())
            
            expect(typeof result.current.confirmOrderServerSide).toBe('function')
            expect(typeof result.current.failOrderServerSide).toBe('function')
            expect(typeof result.current.resetOrderConfirm).toBe('function')
        })
    })

    // ==========================================================================
    // confirmOrderServerSide Tests
    // ==========================================================================
    
    describe('confirmOrderServerSide', () => {
        const mockJpmcResponse = {
            transactionId: 'TXN-123',
            approvalCode: 'ABC123',
            responseStatus: 'SUCCESS'
        }

        it('should return error if orderNo is not provided', async () => {
            const { result } = renderHook(() => useOrderConfirm())
            
            let confirmResult
            await act(async () => {
                confirmResult = await result.current.confirmOrderServerSide(null, mockJpmcResponse, 'pi-123')
            })
            
            expect(confirmResult.success).toBe(false)
            expect(confirmResult.error).toBe('orderNo is required')
        })

        it('should call confirm API with correct parameters', async () => {
            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve({ success: true })
            })
            
            const { result } = renderHook(() => useOrderConfirm())
            
            await act(async () => {
                await result.current.confirmOrderServerSide('ORD-123', mockJpmcResponse, 'pi-456', {
                    captureMethod: 'NOW',
                    paymentAmount: 99.99
                })
            })
            
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/jpmorgan/order/ORD-123/confirm',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jpmcResponse: mockJpmcResponse,
                        paymentInstrumentId: 'pi-456',
                        captureMethod: 'NOW',
                        paymentAmount: 99.99
                    })
                })
            )
        })

        it('should include locale parameter when provided', async () => {
            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve({ success: true })
            })
            
            const { result } = renderHook(() => useOrderConfirm({ locale: 'en_CA' }))
            
            await act(async () => {
                await result.current.confirmOrderServerSide('ORD-123', mockJpmcResponse, 'pi-456')
            })
            
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/jpmorgan/order/ORD-123/confirm?locale=en_CA',
                expect.any(Object)
            )
        })

        it('should include Authorization header when getAccessToken is provided', async () => {
            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve({ success: true })
            })
            
            const getAccessToken = jest.fn().mockResolvedValue('test-token')
            const { result } = renderHook(() => useOrderConfirm({ getAccessToken }))
            
            await act(async () => {
                await result.current.confirmOrderServerSide('ORD-123', mockJpmcResponse, 'pi-456')
            })
            
            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer test-token'
                    }
                })
            )
        })

        it('should continue without Authorization if getAccessToken throws', async () => {
            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve({ success: true })
            })
            
            const getAccessToken = jest.fn().mockRejectedValue(new Error('Token error'))
            const { result } = renderHook(() => useOrderConfirm({ getAccessToken }))
            
            await act(async () => {
                await result.current.confirmOrderServerSide('ORD-123', mockJpmcResponse, 'pi-456')
            })
            
            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: { 'Content-Type': 'application/json' }
                })
            )
        })

        it('should update state with result on success', async () => {
            const successResult = { success: true, orderNo: 'ORD-123' }
            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve(successResult)
            })
            
            const { result } = renderHook(() => useOrderConfirm())
            
            await act(async () => {
                await result.current.confirmOrderServerSide('ORD-123', mockJpmcResponse, 'pi-456')
            })
            
            expect(result.current.orderConfirmResult).toEqual(successResult)
            expect(result.current.isOrderConfirmed).toBe(true)
        })

        it('should set isConfirmingOrder during request', async () => {
            let resolvePromise
            mockFetch.mockReturnValueOnce(new Promise(resolve => {
                resolvePromise = () => resolve({
                    json: () => Promise.resolve({ success: true })
                })
            }))
            
            const { result } = renderHook(() => useOrderConfirm())
            
            let confirmPromise
            act(() => {
                confirmPromise = result.current.confirmOrderServerSide('ORD-123', mockJpmcResponse, 'pi-456')
            })
            
            // Should be confirming
            expect(result.current.isConfirmingOrder).toBe(true)
            
            // Resolve the fetch
            await act(async () => {
                resolvePromise()
                await confirmPromise
            })
            
            // Should no longer be confirming
            expect(result.current.isConfirmingOrder).toBe(false)
        })

        it('should handle fetch error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'))
            
            const { result } = renderHook(() => useOrderConfirm())
            
            let confirmResult
            await act(async () => {
                confirmResult = await result.current.confirmOrderServerSide('ORD-123', mockJpmcResponse, 'pi-456')
            })
            
            expect(confirmResult.success).toBe(false)
            expect(confirmResult.error).toBe("Payment couldn't be processed. Please try again later.")
        })

        it('should use MANUAL as default captureMethod', async () => {
            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve({ success: true })
            })
            
            const { result } = renderHook(() => useOrderConfirm())
            
            await act(async () => {
                await result.current.confirmOrderServerSide('ORD-123', mockJpmcResponse, 'pi-456')
            })
            
            const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
            expect(callBody.captureMethod).toBe('MANUAL')
        })
    })

    // ==========================================================================
    // failOrderServerSide Tests
    // ==========================================================================
    
    describe('failOrderServerSide', () => {
        const mockJpmcResponse = {
            responseStatus: 'FAILED',
            responseCode: 'DECLINED'
        }

        it('should return error if orderNo is not provided', async () => {
            const { result } = renderHook(() => useOrderConfirm())
            
            let failResult
            await act(async () => {
                failResult = await result.current.failOrderServerSide(null, mockJpmcResponse, 'reason')
            })
            
            expect(failResult.success).toBe(false)
            expect(failResult.error).toBe('orderNo is required')
        })

        it('should call fail API with correct parameters', async () => {
            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve({ success: true })
            })
            
            const { result } = renderHook(() => useOrderConfirm())
            
            await act(async () => {
                await result.current.failOrderServerSide('ORD-123', mockJpmcResponse, 'Payment declined', 'DECLINED')
            })
            
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/jpmorgan/order/ORD-123/fail',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({
                        jpmcResponse: mockJpmcResponse,
                        reason: 'Payment declined',
                        errorCode: 'DECLINED'
                    })
                })
            )
        })

        it('should include locale parameter when provided', async () => {
            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve({ success: true })
            })
            
            const { result } = renderHook(() => useOrderConfirm({ locale: 'fr_CA' }))
            
            await act(async () => {
                await result.current.failOrderServerSide('ORD-123', mockJpmcResponse, 'Failed')
            })
            
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/jpmorgan/order/ORD-123/fail?locale=fr_CA',
                expect.any(Object)
            )
        })

        it('should handle fetch error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'))
            
            const { result } = renderHook(() => useOrderConfirm())
            
            let failResult
            await act(async () => {
                failResult = await result.current.failOrderServerSide('ORD-123', mockJpmcResponse, 'Failed')
            })
            
            expect(failResult.success).toBe(false)
            expect(failResult.error).toBe("Payment couldn't be processed. Please try again later.")
        })
    })

    // ==========================================================================
    // resetOrderConfirm Tests
    // ==========================================================================
    
    describe('resetOrderConfirm', () => {
        it('should reset all state', async () => {
            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve({ success: true, orderNo: 'ORD-123' })
            })
            
            const { result } = renderHook(() => useOrderConfirm())
            
            // First confirm an order
            await act(async () => {
                await result.current.confirmOrderServerSide('ORD-123', {}, 'pi-456')
            })
            
            expect(result.current.orderConfirmResult).not.toBeNull()
            expect(result.current.isOrderConfirmed).toBe(true)
            
            // Reset
            act(() => {
                result.current.resetOrderConfirm()
            })
            
            expect(result.current.orderConfirmResult).toBeNull()
            expect(result.current.isConfirmingOrder).toBe(false)
            expect(result.current.isOrderConfirmed).toBe(false)
        })
    })

    // ==========================================================================
    // failOrderWithReopenBasket Tests
    // ==========================================================================
    
    describe('failOrderWithReopenBasket', () => {
        const validParams = {
            orderNo: 'ORD-123',
            reasonCode: 'payment_auth_failure',
            proxy: '/api',
            organizationId: 'org123',
            siteId: 'site1'
        }

        it('should return error if required parameters are missing', async () => {
            const { result } = renderHook(() => useOrderConfirm())
            
            let failResult
            await act(async () => {
                failResult = await result.current.failOrderWithReopenBasket({})
            })
            
            expect(failResult.success).toBe(false)
            expect(failResult.error).toBe('Missing required parameters')
        })

        it('should return error if orderNo is missing', async () => {
            const { result } = renderHook(() => useOrderConfirm())
            
            let failResult
            await act(async () => {
                failResult = await result.current.failOrderWithReopenBasket({
                    ...validParams,
                    orderNo: null
                })
            })
            
            expect(failResult.success).toBe(false)
        })

        it('should return error if no access token available', async () => {
            const { result } = renderHook(() => useOrderConfirm())
            
            let failResult
            await act(async () => {
                failResult = await result.current.failOrderWithReopenBasket(validParams)
            })
            
            expect(failResult.success).toBe(false)
            expect(failResult.error).toBe('No access token available')
        })

        it('should return error if getAccessToken throws', async () => {
            const getAccessToken = jest.fn().mockRejectedValue(new Error('Token error'))
            const { result } = renderHook(() => useOrderConfirm({ getAccessToken }))
            
            let failResult
            await act(async () => {
                failResult = await result.current.failOrderWithReopenBasket(validParams)
            })
            
            expect(failResult.success).toBe(false)
            expect(failResult.error).toBe('Failed to get access token')
        })

        it('should call SCAPI with correct URL and headers', async () => {
            const getAccessToken = jest.fn().mockResolvedValue('test-token')
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: new Headers({ 'Location': '/baskets/basket-456' })
            })
            
            const { result } = renderHook(() => useOrderConfirm({ getAccessToken }))
            
            await act(async () => {
                await result.current.failOrderWithReopenBasket(validParams)
            })
            
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/checkout/shopper-orders/v1/organizations/org123/orders/ORD-123/actions/fail?siteId=site1&reopenBasket=true',
                expect.objectContaining({
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer test-token'
                    },
                    body: JSON.stringify({ reasonCode: 'payment_auth_failure' })
                })
            )
        })

        it('should return basketReopened true with basketId from Location header', async () => {
            const getAccessToken = jest.fn().mockResolvedValue('test-token')
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: new Headers({ 'Location': '/baskets/basket-789' })
            })
            
            const { result } = renderHook(() => useOrderConfirm({ getAccessToken }))
            
            let failResult
            await act(async () => {
                failResult = await result.current.failOrderWithReopenBasket(validParams)
            })
            
            expect(failResult.success).toBe(true)
            expect(failResult.basketReopened).toBe(true)
            expect(failResult.basketId).toBe('basket-789')
        })

        it('should return basketReopened false if no Location header', async () => {
            const getAccessToken = jest.fn().mockResolvedValue('test-token')
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: new Headers({})
            })
            
            const { result } = renderHook(() => useOrderConfirm({ getAccessToken }))
            
            let failResult
            await act(async () => {
                failResult = await result.current.failOrderWithReopenBasket(validParams)
            })
            
            expect(failResult.success).toBe(true)
            expect(failResult.basketReopened).toBe(false)
            expect(failResult.basketId).toBeNull()
        })

        it('should handle 409 conflict error', async () => {
            const getAccessToken = jest.fn().mockResolvedValue('test-token')
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 409,
                headers: new Headers({})
            })
            
            const { result } = renderHook(() => useOrderConfirm({ getAccessToken }))
            
            let failResult
            await act(async () => {
                failResult = await result.current.failOrderWithReopenBasket(validParams)
            })
            
            expect(failResult.success).toBe(false)
            expect(failResult.conflictError).toBe(true)
        })

        it('should handle non-ok response', async () => {
            const getAccessToken = jest.fn().mockResolvedValue('test-token')
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: () => Promise.resolve('Server error'),
                headers: new Headers({})
            })
            
            const { result } = renderHook(() => useOrderConfirm({ getAccessToken }))
            
            let failResult
            await act(async () => {
                failResult = await result.current.failOrderWithReopenBasket(validParams)
            })
            
            expect(failResult.success).toBe(false)
            expect(failResult.error).toContain('500')
        })

        it('should handle fetch error', async () => {
            const getAccessToken = jest.fn().mockResolvedValue('test-token')
            mockFetch.mockRejectedValueOnce(new Error('Network error'))
            
            const { result } = renderHook(() => useOrderConfirm({ getAccessToken }))
            
            let failResult
            await act(async () => {
                failResult = await result.current.failOrderWithReopenBasket(validParams)
            })
            
            expect(failResult.success).toBe(false)
            expect(failResult.error).toBe("Payment couldn't be processed. Please try again later.")
        })
    })

    // ==========================================================================
    // Unmount Safety Tests
    // ==========================================================================
    
    describe('Unmount Safety', () => {
        it('should not update state after unmount', async () => {
            let resolvePromise
            mockFetch.mockReturnValueOnce(new Promise(resolve => {
                resolvePromise = () => resolve({
                    json: () => Promise.resolve({ success: true })
                })
            }))
            
            const { result, unmount } = renderHook(() => useOrderConfirm())
            
            // Start confirm
            let confirmPromise
            act(() => {
                confirmPromise = result.current.confirmOrderServerSide('ORD-123', {}, 'pi-456')
            })
            
            // Unmount before fetch resolves
            unmount()
            
            // Resolve fetch after unmount - should not throw
            await act(async () => {
                resolvePromise()
                await confirmPromise
            })
        })
    })
})
