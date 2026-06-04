/**
 * usePaymentMethods Hook Tests
 * 
 * Tests for payment methods fetching and management
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { usePaymentMethods } from '../usePaymentMethods.js'

// Mock fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('usePaymentMethods', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockFetch.mockReset()
    })

    // ==========================================================================
    // Initial State Tests
    // ==========================================================================
    
    describe('Initial State', () => {
        it('should return initial loading state', () => {
            const { result } = renderHook(() => usePaymentMethods({
                basketId: 'basket-123'
            }))
            
            expect(result.current.isLoading).toBe(true)
            expect(result.current.activePaymentMethods.isLoading).toBe(true)
        })

        it('should return default payment method IDs', () => {
            const { result } = renderHook(() => usePaymentMethods({
                basketId: 'basket-123'
            }))
            
            expect(result.current.googlePayPaymentMethodId).toBe('JPMC_GOOGLE_PAY')
            expect(result.current.creditCardPaymentMethodId).toBe('CREDIT_CARD')
            expect(result.current.applePayPaymentMethodId).toBe('DW_APPLE_PAY')
        })

        it('should not fetch if basketId is missing', () => {
            renderHook(() => usePaymentMethods({}))
            
            expect(mockFetch).not.toHaveBeenCalled()
        })
    })

    // ==========================================================================
    // Fetch Payment Methods Tests
    // ==========================================================================
    
    describe('Fetch Payment Methods', () => {
        it('should fetch payment methods on mount', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    isCreditCardActive: true,
                    isGooglePayActive: true,
                    isApplePayActive: false,
                    creditCardPaymentMethodId: 'JPMC_CC',
                    googlePayPaymentMethodId: 'JPMC_GPAY'
                })
            })
            
            const { result } = renderHook(() => usePaymentMethods({
                basketId: 'basket-123'
            }))
            
            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })
            
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/jpmorgan/available-payment-methods?basketId=basket-123',
                expect.objectContaining({
                    headers: { 'Content-Type': 'application/json' }
                })
            )
        })

        it('should include locale in fetch URL', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({})
            })
            
            renderHook(() => usePaymentMethods({
                basketId: 'basket-123',
                locale: 'en_CA'
            }))
            
            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalled()
            })
            
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/jpmorgan/available-payment-methods?basketId=basket-123&locale=en_CA',
                expect.any(Object)
            )
        })

        it('should include Authorization header when getAccessToken is provided', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({})
            })
            
            const getAccessToken = jest.fn().mockResolvedValue('test-token')
            
            renderHook(() => usePaymentMethods({
                basketId: 'basket-123',
                getAccessToken
            }))
            
            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalled()
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
                ok: true,
                json: () => Promise.resolve({})
            })
            
            const getAccessToken = jest.fn().mockRejectedValue(new Error('Token error'))
            
            renderHook(() => usePaymentMethods({
                basketId: 'basket-123',
                getAccessToken
            }))
            
            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalled()
            })
            
            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: { 'Content-Type': 'application/json' }
                })
            )
        })

        it('should update state with fetched payment methods', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    isCreditCardActive: true,
                    isGooglePayActive: true,
                    isApplePayActive: true,
                    creditCardPaymentMethodId: 'JPMC_CREDIT_CARD',
                    googlePayPaymentMethodId: 'JPMC_GOOGLE_PAY'
                })
            })
            
            const { result } = renderHook(() => usePaymentMethods({
                basketId: 'basket-123'
            }))
            
            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })
            
            expect(result.current.activePaymentMethods.isCreditCardActive).toBe(true)
            expect(result.current.activePaymentMethods.isGooglePayActive).toBe(true)
            expect(result.current.activePaymentMethods.isApplePayActive).toBe(true)
        })

        it('should handle non-ok response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500
            })
            
            const { result } = renderHook(() => usePaymentMethods({
                basketId: 'basket-123'
            }))
            
            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })
            
            // Should keep defaults
            expect(result.current.activePaymentMethods.isCreditCardActive).toBe(false)
        })

        it('should handle fetch error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'))
            
            const { result } = renderHook(() => usePaymentMethods({
                basketId: 'basket-123'
            }))
            
            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })
        })

        it('should not re-fetch for same basketId and locale', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({})
            })
            
            const { rerender } = renderHook(
                ({ basketId, locale }) => usePaymentMethods({ basketId, locale }),
                { initialProps: { basketId: 'basket-123', locale: 'en_US' } }
            )
            
            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalledTimes(1)
            })
            
            // Re-render with same props
            rerender({ basketId: 'basket-123', locale: 'en_US' })
            
            // Should not fetch again
            expect(mockFetch).toHaveBeenCalledTimes(1)
        })

        it('should re-fetch when locale changes', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({})
            })
            
            const { rerender } = renderHook(
                ({ basketId, locale }) => usePaymentMethods({ basketId, locale }),
                { initialProps: { basketId: 'basket-123', locale: 'en_US' } }
            )
            
            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalledTimes(1)
            })
            
            // Change locale
            rerender({ basketId: 'basket-123', locale: 'fr_CA' })
            
            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalledTimes(2)
            })
        })
    })

    // ==========================================================================
    // Enabled Flags Tests
    // ==========================================================================
    
    describe('Enabled Flags', () => {
        it('should enable credit card while loading', () => {
            const { result } = renderHook(() => usePaymentMethods({
                basketId: 'basket-123'
            }))
            
            expect(result.current.isCreditCardEnabled).toBe(true)
        })

        it('should enable Google Pay only when SDK is ready and available', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    isGooglePayActive: true
                })
            })
            
            const { result, rerender } = renderHook(
                (props) => usePaymentMethods(props),
                {
                    initialProps: {
                        basketId: 'basket-123',
                        isGooglePayReady: false,
                        isGooglePayAvailable: false
                    }
                }
            )
            
            // Not ready, not available
            expect(result.current.isGooglePayEnabled).toBe(false)
            
            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })
            
            // Update to ready and available
            rerender({
                basketId: 'basket-123',
                isGooglePayReady: true,
                isGooglePayAvailable: true
            })
            
            expect(result.current.isGooglePayEnabled).toBe(true)
        })

        it('should enable Apple Pay only when available', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    isApplePayActive: true
                })
            })
            
            const { result } = renderHook(() => usePaymentMethods({
                basketId: 'basket-123',
                isApplePayAvailable: true
            }))
            
            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })
            
            expect(result.current.isApplePayEnabled).toBe(true)
        })

        it('should disable Apple Pay when BM reports inactive', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    isApplePayActive: false
                })
            })
            
            const { result } = renderHook(() => usePaymentMethods({
                basketId: 'basket-123',
                isApplePayAvailable: true
            }))
            
            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })
            
            expect(result.current.isApplePayEnabled).toBe(false)
        })
    })

    // ==========================================================================
    // Payment Method IDs Tests
    // ==========================================================================
    
    describe('Payment Method IDs', () => {
        it('should return fetched payment method IDs', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    creditCardPaymentMethodId: 'BM_CREDIT_CARD',
                    googlePayPaymentMethodId: 'BM_GOOGLE_PAY',
                    applePayPaymentMethodId: 'BM_APPLE_PAY'
                })
            })
            
            const { result } = renderHook(() => usePaymentMethods({
                basketId: 'basket-123'
            }))
            
            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })
            
            expect(result.current.creditCardPaymentMethodId).toBe('BM_CREDIT_CARD')
            expect(result.current.googlePayPaymentMethodId).toBe('BM_GOOGLE_PAY')
            expect(result.current.applePayPaymentMethodId).toBe('BM_APPLE_PAY')
        })

        it('should use defaults when fetched IDs are null', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    creditCardPaymentMethodId: null,
                    googlePayPaymentMethodId: null,
                    applePayPaymentMethodId: null
                })
            })
            
            const { result } = renderHook(() => usePaymentMethods({
                basketId: 'basket-123'
            }))
            
            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })
            
            expect(result.current.creditCardPaymentMethodId).toBe('CREDIT_CARD')
            expect(result.current.googlePayPaymentMethodId).toBe('JPMC_GOOGLE_PAY')
            expect(result.current.applePayPaymentMethodId).toBe('DW_APPLE_PAY')
        })
    })
})
