/**
 * Tests for useServerSideCreateOrder hook
 */

import { renderHook, act } from '@testing-library/react'
import { useServerSideCreateOrder } from '../useServerSideCreateOrder'

global.fetch = jest.fn()

describe('useServerSideCreateOrder', () => {
    const mockBasket = { basketId: 'basket-123' }
    const GENERIC_ERROR = 'An error occurred. Please try again.'

    beforeEach(() => {
        jest.clearAllMocks()
        global.fetch.mockClear()
    })

    describe('hook initialization', () => {
        it('should return createOrder function', () => {
            const { result } = renderHook(() => useServerSideCreateOrder())

            expect(result.current).toHaveProperty('createOrder')
            expect(typeof result.current.createOrder).toBe('function')
        })

        it('should accept options parameter', () => {
            const { result } = renderHook(() => 
                useServerSideCreateOrder({ locale: 'en-US' })
            )

            expect(result.current).toHaveProperty('createOrder')
        })

        it('should handle undefined options', () => {
            const { result } = renderHook(() => useServerSideCreateOrder(undefined))

            expect(result.current).toHaveProperty('createOrder')
        })

        it('should handle empty options object', () => {
            const { result } = renderHook(() => useServerSideCreateOrder({}))

            expect(result.current).toHaveProperty('createOrder')
        })
    })

    describe('createOrder validation', () => {
        it('should return error when basketId is missing', async () => {
            const { result } = renderHook(() => useServerSideCreateOrder())

            let response
            await act(async () => {
                response = await result.current.createOrder({})
            })

            expect(response).toEqual({
                success: false,
                error: 'basketId is required'
            })
        })

        it('should return error when body is missing', async () => {
            const { result } = renderHook(() => useServerSideCreateOrder())

            let response
            await act(async () => {
                response = await result.current.createOrder()
            })

            expect(response).toEqual({
                success: false,
                error: 'basketId is required'
            })
        })

        it('should return error when basketId is empty string', async () => {
            const { result } = renderHook(() => useServerSideCreateOrder())

            let response
            await act(async () => {
                response = await result.current.createOrder({ body: { basketId: '' } })
            })

            expect(response).toEqual({
                success: false,
                error: 'basketId is required'
            })
        })

        it('should return error when basketId is null', async () => {
            const { result } = renderHook(() => useServerSideCreateOrder())

            let response
            await act(async () => {
                response = await result.current.createOrder({ body: { basketId: null } })
            })

            expect(response).toEqual({
                success: false,
                error: 'basketId is required'
            })
        })
    })

    describe('API request', () => {
        it('should call fetch with correct URL and method', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true })
            })

            const { result } = renderHook(() => useServerSideCreateOrder())

            await act(async () => {
                await result.current.createOrder({ body: mockBasket })
            })

            expect(global.fetch).toHaveBeenCalledWith(
                '/api/jpmorgan/order/create',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json'
                    })
                })
            )
        })

        it('should include basketId in request body', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true })
            })

            const { result } = renderHook(() => useServerSideCreateOrder())

            await act(async () => {
                await result.current.createOrder({ body: mockBasket })
            })

            const callArgs = global.fetch.mock.calls[0]
            const body = JSON.parse(callArgs[1].body)
            expect(body.basketId).toBe('basket-123')
        })

        it('should include locale parameter when provided', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true })
            })

            const { result } = renderHook(() => 
                useServerSideCreateOrder({ locale: 'fr-FR' })
            )

            await act(async () => {
                await result.current.createOrder({ body: mockBasket })
            })

            const callArgs = global.fetch.mock.calls[0]
            expect(callArgs[0]).toContain('locale=fr-FR')
        })

        it('should encode locale parameter', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true })
            })

            const { result } = renderHook(() => 
                useServerSideCreateOrder({ locale: 'en-US' })
            )

            await act(async () => {
                await result.current.createOrder({ body: mockBasket })
            })

            const callArgs = global.fetch.mock.calls[0]
            expect(callArgs[0]).toContain('locale=en-US')
        })

        it('should not include locale parameter when not provided', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true })
            })

            const { result } = renderHook(() => useServerSideCreateOrder())

            await act(async () => {
                await result.current.createOrder({ body: mockBasket })
            })

            const callArgs = global.fetch.mock.calls[0]
            expect(callArgs[0]).toBe('/api/jpmorgan/order/create')
        })
    })

    describe('authorization', () => {
        it('should include Authorization header when getAccessToken provided', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true })
            })

            const mockGetAccessToken = jest.fn(() => Promise.resolve('token-123'))
            const { result } = renderHook(() => 
                useServerSideCreateOrder({ getAccessToken: mockGetAccessToken })
            )

            await act(async () => {
                await result.current.createOrder({ body: mockBasket })
            })

            expect(mockGetAccessToken).toHaveBeenCalled()
            const callArgs = global.fetch.mock.calls[0]
            expect(callArgs[1].headers['Authorization']).toBe('Bearer token-123')
        })

        it('should not include Authorization header when getAccessToken returns falsy', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true })
            })

            const mockGetAccessToken = jest.fn(() => Promise.resolve(null))
            const { result } = renderHook(() => 
                useServerSideCreateOrder({ getAccessToken: mockGetAccessToken })
            )

            await act(async () => {
                await result.current.createOrder({ body: mockBasket })
            })

            const callArgs = global.fetch.mock.calls[0]
            expect(callArgs[1].headers['Authorization']).toBeUndefined()
        })

        it('should handle getAccessToken error gracefully', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true })
            })

            const mockGetAccessToken = jest.fn(() => Promise.reject(new Error('Token error')))
            const { result } = renderHook(() => 
                useServerSideCreateOrder({ getAccessToken: mockGetAccessToken })
            )

            let response
            await act(async () => {
                response = await result.current.createOrder({ body: mockBasket })
            })

            // Should still succeed despite token error
            expect(response.success).toBe(true)
        })

        it('should not include Authorization header when getAccessToken not provided', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true })
            })

            const { result } = renderHook(() => useServerSideCreateOrder())

            await act(async () => {
                await result.current.createOrder({ body: mockBasket })
            })

            const callArgs = global.fetch.mock.calls[0]
            expect(callArgs[1].headers['Authorization']).toBeUndefined()
        })
    })

    describe('response handling', () => {
        it('should return response when fetch is successful', async () => {
            const mockResponse = { success: true, orderNo: 'order-123' }
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse)
            })

            const { result } = renderHook(() => useServerSideCreateOrder())

            let response
            await act(async () => {
                response = await result.current.createOrder({ body: mockBasket })
            })

            expect(response).toEqual(mockResponse)
        })

        it('should return error when fetch fails', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 400
            })

            const { result } = renderHook(() => useServerSideCreateOrder())

            let response
            await act(async () => {
                response = await result.current.createOrder({ body: mockBasket })
            })

            expect(response.success).toBe(false)
            expect(response.error).toBeDefined()
        })

        it('should return error when fetch throws', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'))

            const { result } = renderHook(() => useServerSideCreateOrder())

            let response
            await act(async () => {
                response = await result.current.createOrder({ body: mockBasket })
            })

            expect(response.success).toBe(false)
            expect(response.error).toBeDefined()
        })

        it('should handle 500 error from server', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 500
            })

            const { result } = renderHook(() => useServerSideCreateOrder())

            let response
            await act(async () => {
                response = await result.current.createOrder({ body: mockBasket })
            })

            expect(response.success).toBe(false)
            expect(response.error).toBeDefined()
        })

        it('should handle 404 error from server', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 404
            })

            const { result } = renderHook(() => useServerSideCreateOrder())

            let response
            await act(async () => {
                response = await result.current.createOrder({ body: mockBasket })
            })

            expect(response.success).toBe(false)
        })
    })

    describe('hook dependency tracking', () => {
        it('should update when locale changes', async () => {
            const { result, rerender } = renderHook(
                ({ locale }) => useServerSideCreateOrder({ locale }),
                { initialProps: { locale: 'en-US' } }
            )

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true })
            })

            await act(async () => {
                await result.current.createOrder({ body: mockBasket })
            })

            let firstCall = global.fetch.mock.calls[0][0]
            expect(firstCall).toContain('locale=en-US')

            global.fetch.mockClear()
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true })
            })

            rerender({ locale: 'fr-FR' })

            await act(async () => {
                await result.current.createOrder({ body: mockBasket })
            })

            let secondCall = global.fetch.mock.calls[0][0]
            expect(secondCall).toContain('locale=fr-FR')
        })

        it('should update when getAccessToken changes', async () => {
            const token1 = jest.fn(() => Promise.resolve('token-1'))
            const { result, rerender } = renderHook(
                ({ getAccessToken }) => useServerSideCreateOrder({ getAccessToken }),
                { initialProps: { getAccessToken: token1 } }
            )

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true })
            })

            await act(async () => {
                await result.current.createOrder({ body: mockBasket })
            })

            expect(token1).toHaveBeenCalled()

            global.fetch.mockClear()
            const token2 = jest.fn(() => Promise.resolve('token-2'))

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true })
            })

            rerender({ getAccessToken: token2 })

            await act(async () => {
                await result.current.createOrder({ body: mockBasket })
            })

            expect(token2).toHaveBeenCalled()
        })
    })

    describe('edge cases', () => {
        it('should handle extra fields in body', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true })
            })

            const { result } = renderHook(() => useServerSideCreateOrder())

            await act(async () => {
                await result.current.createOrder({ 
                    body: { 
                        basketId: 'basket-123',
                        extraField: 'should be ignored'
                    } 
                })
            })

            const callArgs = global.fetch.mock.calls[0]
            const body = JSON.parse(callArgs[1].body)
            expect(body.basketId).toBe('basket-123')
        })

        it('should handle special characters in basketId', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true })
            })

            const { result } = renderHook(() => useServerSideCreateOrder())

            const basketId = 'basket-123_ABC@!#'
            await act(async () => {
                await result.current.createOrder({ body: { basketId } })
            })

            const callArgs = global.fetch.mock.calls[0]
            const body = JSON.parse(callArgs[1].body)
            expect(body.basketId).toBe(basketId)
        })
    })
})
