/**
 * useServerConfig Hook Tests
 * 
 * Tests for the Google Pay server config fetching hook
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import { useServerConfig } from '../useServerConfig'

// Mock fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('useServerConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns initial state when autoFetchConfig is false', () => {
        const { result } = renderHook(() => useServerConfig({
            autoFetchConfig: false,
            apiBasePath: '/api/jpmorgan'
        }))

        expect(result.current.serverConfig).toBeNull()
        expect(result.current.configLoading).toBe(false)
        expect(result.current.configError).toBeNull()
    })

    it('skips fetch when contextGooglePayConfig has gatewayMerchantId', () => {
        const { result } = renderHook(() => useServerConfig({
            autoFetchConfig: true,
            apiBasePath: '/api/jpmorgan',
            contextGooglePayConfig: { gatewayMerchantId: 'existing-merchant' }
        }))

        expect(result.current.configLoading).toBe(false)
        expect(mockFetch).not.toHaveBeenCalled()
    })

    it('fetches config when autoFetchConfig is true and no context config', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                gatewayMerchantId: 'test-merchant',
                merchantName: 'Test Store'
            })
        })

        const { result } = renderHook(() => useServerConfig({
            autoFetchConfig: true,
            apiBasePath: '/api/jpmorgan',
            contextGooglePayConfig: null
        }))

        expect(result.current.configLoading).toBe(true)

        await waitFor(() => {
            expect(result.current.configLoading).toBe(false)
        })

        expect(result.current.serverConfig).toEqual({
            gatewayMerchantId: 'test-merchant',
            merchantName: 'Test Store'
        })
        expect(mockFetch).toHaveBeenCalledWith(
            '/api/jpmorgan/googlepay/config',
            expect.any(Object)
        )
    })

    it('includes locale query param when provided', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ gatewayMerchantId: 'test' })
        })

        renderHook(() => useServerConfig({
            autoFetchConfig: true,
            apiBasePath: '/api/jpmorgan',
            contextGooglePayConfig: null,
            locale: 'en-US'
        }))

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalled()
        })

        expect(mockFetch).toHaveBeenCalledWith(
            '/api/jpmorgan/googlepay/config?locale=en-US',
            expect.any(Object)
        )
    })

    it('includes Authorization header when getAccessToken provided', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ gatewayMerchantId: 'test' })
        })

        const getAccessToken = jest.fn().mockResolvedValue('test-slas-token')

        renderHook(() => useServerConfig({
            autoFetchConfig: true,
            apiBasePath: '/api/jpmorgan',
            contextGooglePayConfig: null,
            getAccessToken
        }))

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalled()
        })

        expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'Bearer test-slas-token'
                })
            })
        )
    })

    it('proceeds without token when getAccessToken fails', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ gatewayMerchantId: 'test' })
        })

        const getAccessToken = jest.fn().mockRejectedValue(new Error('Token error'))

        renderHook(() => useServerConfig({
            autoFetchConfig: true,
            apiBasePath: '/api/jpmorgan',
            contextGooglePayConfig: null,
            getAccessToken
        }))

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalled()
        })

        // Should still make the fetch, just without auth header
        expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ headers: {} })
        )
    })

    it('proceeds without token when getAccessToken returns null', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ gatewayMerchantId: 'test' })
        })

        const getAccessToken = jest.fn().mockResolvedValue(null)

        renderHook(() => useServerConfig({
            autoFetchConfig: true,
            apiBasePath: '/api/jpmorgan',
            contextGooglePayConfig: null,
            getAccessToken
        }))

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalled()
        })

        expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ headers: {} })
        )
    })

    it('sets configError when fetch fails', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            json: () => Promise.resolve({ message: 'Server error' })
        })

        const { result } = renderHook(() => useServerConfig({
            autoFetchConfig: true,
            apiBasePath: '/api/jpmorgan',
            contextGooglePayConfig: null
        }))

        await waitFor(() => {
            expect(result.current.configLoading).toBe(false)
        })

        expect(result.current.configError).toBeTruthy()
        expect(result.current.configError.message).toBe("Payment couldn't be processed. Please try again later.")
    })

    it('sets configError with default message when no message in response', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            json: () => Promise.resolve({})
        })

        const { result } = renderHook(() => useServerConfig({
            autoFetchConfig: true,
            apiBasePath: '/api/jpmorgan',
            contextGooglePayConfig: null
        }))

        await waitFor(() => {
            expect(result.current.configLoading).toBe(false)
        })

        expect(result.current.configError.message).toBe("Payment couldn't be processed. Please try again later.")
    })

    it('does not refetch on re-render if already fetched', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ gatewayMerchantId: 'test' })
        })

        const { rerender } = renderHook(() => useServerConfig({
            autoFetchConfig: true,
            apiBasePath: '/api/jpmorgan',
            contextGooglePayConfig: null
        }))

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledTimes(1)
        })

        // Re-render
        rerender()

        // Should still only have 1 call
        expect(mockFetch).toHaveBeenCalledTimes(1)
    })
})
