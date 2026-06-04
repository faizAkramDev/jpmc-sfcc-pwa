/**
 * Unit Tests for useApplePay Hook
 *
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { useApplePay } from '../useApplePay'
import {
    APPLE_PAY_ERROR_CODES
} from '../../utils/constants.mjs'

// Mock ApplePaySession globally
const mockApplePaySession = {
    canMakePayments: jest.fn(),
    canMakePaymentsWithActiveCard: jest.fn(),
    supportsVersion: jest.fn(),
    STATUS_SUCCESS: 0,
    STATUS_FAILURE: 1
}

// Helper to mock HTTPS protocol (needed for ApplePaySession checks)
const mockHttpsProtocol = () => {
    Object.defineProperty(window, 'location', {
        value: { protocol: 'https:', href: 'https://localhost' },
        writable: true
    })
}

// Helper to mock HTTP protocol (localhost dev behavior)
const mockHttpProtocol = () => {
    Object.defineProperty(window, 'location', {
        value: { protocol: 'http:', href: 'http://localhost' },
        writable: true
    })
}

describe('useApplePay Hook', () => {
    const defaultProps = {
        merchantId: 'merchant.com.test',
        merchantName: 'Test Store',
        environment: 'sandbox'
    }

    beforeEach(() => {
        jest.clearAllMocks()
        
        // Default to HTTPS for tests that check ApplePaySession methods
        mockHttpsProtocol()
        
        // Setup window.ApplePaySession
        global.window.ApplePaySession = mockApplePaySession
        
        // Default mocks - Apple Pay is available
        mockApplePaySession.canMakePayments.mockReturnValue(true)
        mockApplePaySession.canMakePaymentsWithActiveCard.mockResolvedValue(true)
        mockApplePaySession.supportsVersion.mockReturnValue(true)
        
        // Mock fetch for API calls
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ 
                    success: true, 
                    transactionId: 'txn-123',
                    responseStatus: 'SUCCESS',
                    transactionState: 'AUTHORIZED'
                })
            })
        )
    })

    afterEach(() => {
        jest.restoreAllMocks()
        delete global.window.ApplePaySession
    })

    describe('Initialization', () => {
        it('should initialize with correct default state', () => {
            const { result } = renderHook(() => useApplePay(defaultProps))
            
            expect(result.current.isLoading).toBe(true)
            expect(result.current.isReady).toBe(false)
            expect(result.current.isAvailable).toBe(false)
            expect(result.current.isProcessing).toBe(false)
            expect(result.current.error).toBeNull()
        })

        it('should detect Apple Pay availability on Safari (HTTPS)', async () => {
            const { result } = renderHook(() => useApplePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
                expect(result.current.isAvailable).toBe(true)
            })
        })

        it('should detect when Apple Pay is not available (no ApplePaySession)', async () => {
            delete global.window.ApplePaySession
            
            const { result } = renderHook(() => useApplePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
                expect(result.current.isAvailable).toBe(false)
            })
        })

        it('should detect when user has no cards in wallet (HTTPS)', async () => {
            mockApplePaySession.canMakePaymentsWithActiveCard.mockResolvedValue(false)
            
            const { result } = renderHook(() => useApplePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
                expect(result.current.isAvailable).toBe(false)
            })
        })

        it('should call onReady callback when Apple Pay is available', async () => {
            const onReady = jest.fn()
            
            renderHook(() => useApplePay({ ...defaultProps, onReady }))
            
            await waitFor(() => {
                expect(onReady).toHaveBeenCalled()
            })
        })

        it('should not initialize without merchantId', async () => {
            const { result } = renderHook(() => useApplePay({ merchantName: 'Test' }))
            
            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
                expect(result.current.isReady).toBe(false)
            })
        })
        
        it('should skip ApplePaySession checks on HTTP and mark as available for development', async () => {
            // On HTTP (localhost dev), the hook skips HTTPS-only checks
            mockHttpProtocol()
            
            const { result } = renderHook(() => useApplePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
                expect(result.current.isAvailable).toBe(true)
            })
            
            // supportsVersion should NOT be called on HTTP
            expect(mockApplePaySession.supportsVersion).not.toHaveBeenCalled()
        })
    })

    describe('Version Support', () => {
        it('should check API version support on HTTPS', async () => {
            renderHook(() => useApplePay(defaultProps))
            
            await waitFor(() => {
                expect(mockApplePaySession.supportsVersion).toHaveBeenCalled()
            })
        })

        it('should handle unsupported API version', async () => {
            mockApplePaySession.supportsVersion.mockReturnValue(false)
            
            const { result } = renderHook(() => useApplePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isAvailable).toBe(false)
            })
        })
    })

    describe('initiatePayment', () => {
        it('should return error when amount is not provided', async () => {
            const onError = jest.fn()
            const { result } = renderHook(() => useApplePay({ ...defaultProps, onError }))
            
            await waitFor(() => {
                expect(result.current.isAvailable).toBe(true)
            })

            let paymentResult
            await act(async () => {
                paymentResult = await result.current.initiatePayment({})
            })

            expect(paymentResult.success).toBe(false)
            expect(paymentResult.error.code).toBe(APPLE_PAY_ERROR_CODES.INVALID_CONFIG)
            expect(onError).toHaveBeenCalled()
        })

        it('should return error when Apple Pay is not available', async () => {
            delete global.window.ApplePaySession
            
            const onError = jest.fn()
            const { result } = renderHook(() => useApplePay({ ...defaultProps, onError }))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            let paymentResult
            await act(async () => {
                paymentResult = await result.current.initiatePayment({ amount: 99.99 })
            })

            expect(paymentResult.success).toBe(false)
            expect(paymentResult.error.code).toBe(APPLE_PAY_ERROR_CODES.NOT_AVAILABLE)
        })
    })

    describe('Error Handling', () => {
        it('should handle canMakePayments error gracefully', async () => {
            mockApplePaySession.canMakePayments.mockImplementation(() => {
                throw new Error('Browser not supported')
            })
            
            const { result } = renderHook(() => useApplePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isAvailable).toBe(false)
            })
        })

        it('should handle canMakePaymentsWithActiveCard rejection', async () => {
            mockApplePaySession.canMakePaymentsWithActiveCard.mockRejectedValue(
                new Error('Network error')
            )
            
            const { result } = renderHook(() => useApplePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isAvailable).toBe(false)
            })
        })
    })

    describe('Utility Methods', () => {
        it('should provide resetError method', async () => {
            const { result } = renderHook(() => useApplePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            // Set an error
            await act(async () => {
                await result.current.initiatePayment({})
            })
            
            expect(result.current.error).not.toBeNull()

            // Reset error
            act(() => {
                result.current.resetError()
            })
            
            expect(result.current.error).toBeNull()
        })

        it('should provide reset method', async () => {
            const { result } = renderHook(() => useApplePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            act(() => {
                result.current.reset()
            })
            
            expect(result.current.error).toBeNull()
            expect(result.current.paymentResult).toBeNull()
            expect(result.current.isProcessing).toBe(false)
        })

        it('should provide abort method', async () => {
            const { result } = renderHook(() => useApplePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            // Abort should not throw
            act(() => {
                result.current.abort()
            })
            
            expect(result.current.isProcessing).toBe(false)
        })

        it('should expose canMakePayments helper', async () => {
            const { result } = renderHook(() => useApplePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.canMakePayments).toBe(true)
            })
        })

        it('should expose isSupported helper', () => {
            const { result } = renderHook(() => useApplePay(defaultProps))
            
            expect(result.current.isSupported).toBe(true)
        })
    })

    describe('Unmounting', () => {
        it('should not update state after unmount', async () => {
            const { unmount } = renderHook(() => useApplePay(defaultProps))
            
            unmount()
            
            // Should not throw
            await new Promise(resolve => setTimeout(resolve, 100))
        })
    })

    describe('Configuration Options', () => {
        it('should use custom country code', async () => {
            const { result } = renderHook(() => 
                useApplePay({ ...defaultProps, countryCode: 'GB' })
            )
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
        })

        it('should use custom currency code', async () => {
            const { result } = renderHook(() => 
                useApplePay({ ...defaultProps, currencyCode: 'EUR' })
            )
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
        })

        it('should handle billing address requirement', async () => {
            const { result } = renderHook(() => 
                useApplePay({ ...defaultProps, billingAddressRequired: true })
            )
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
        })

        it('should handle shipping address requirement', async () => {
            const { result } = renderHook(() => 
                useApplePay({ ...defaultProps, shippingAddressRequired: true })
            )
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
        })
    })
})
