/**
 * Unit Tests for useJPMorganPayment Hook
 *
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { useJPMorganPayment } from '../useJPMorganPayment'
import * as pieEncryption from '../../services/pie-encryption'

// Mock the PIE encryption service
jest.mock('../../services/pie-encryption', () => ({
    loadPIESDK: jest.fn(),
    isPIEReady: jest.fn(),
    encryptCardData: jest.fn(),
    getPIEState: jest.fn()
}))

// =============================================================================
// Test Data
// =============================================================================

const mockMerchantId = '996642629285'
const mockConfig = {
    merchantId: mockMerchantId,
    environment: 'sandbox',
    pieUrls: {
        encryption: 'https://test.com/encryption.js',
        getKey: 'https://test.com/getkey.js'
    }
}

const mockCardData = {
    cardNumber: '4111111111111111',
    cvv: '123',
    expiryMonth: 12,
    expiryYear: 2027,
    holder: 'John Doe'
}

const mockPaymentData = {
    card: mockCardData,
    amount: 10000,
    currency: 'USD',
    merchantOrderNumber: 'ORDER-00001234',
    billingAddress: {
        line1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        countryCode: 'USA'
    }
}

const mockEncryptedData = {
    encryptedCardNumber: 'encrypted_pan',
    encryptedCVV: 'encrypted_cvv',
    integrityCheck: 'hash123',
    keyId: 'key-123',
    phase: '1'
}

const mockSuccessResponse = {
    success: true,
    transactionId: 'TXN-123456789',
    approvalCode: 'ABC123',
    state: 'AUTHORIZED'
}

const mockErrorResponse = {
    success: false,
    errorCode: 'PAYMENT_DECLINED',
    message: 'Card was declined'
}

// =============================================================================
// Setup & Teardown
// =============================================================================

describe('useJPMorganPayment Hook', () => {
    let originalFetch

    beforeEach(() => {
        jest.clearAllMocks()
        
        // Save original fetch
        originalFetch = global.fetch

        // Default mock implementations
        pieEncryption.loadPIESDK.mockResolvedValue(true)
        pieEncryption.isPIEReady.mockReturnValue(true)
        pieEncryption.encryptCardData.mockReturnValue(mockEncryptedData)
        pieEncryption.getPIEState.mockReturnValue({
            isLoaded: true,
            isLoading: false,
            error: null,
            merchantId: mockMerchantId,
            environment: 'sandbox'
        })

        // Mock fetch for config endpoint
        global.fetch = jest.fn().mockImplementation((url) => {
            if (url.includes('/config')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockConfig)
                })
            }
            if (url.includes('/authorize')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockSuccessResponse)
                })
            }
            return Promise.resolve({
                ok: false,
                json: () => Promise.resolve({ error: 'Unknown endpoint' })
            })
        })
    })

    afterEach(() => {
        global.fetch = originalFetch
    })

    // =========================================================================
    // Initialization Tests
    // =========================================================================

    describe('Initialization', () => {
        it('should initialize with loading state', () => {
            const { result } = renderHook(() => useJPMorganPayment())

            expect(result.current.isLoading).toBe(true)
            expect(result.current.isReady).toBe(false)
        })

        it('should fetch config on mount', async () => {
            renderHook(() => useJPMorganPayment())

            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringContaining('/config'),
                    expect.any(Object)
                )
            })
        })

        it('should load PIE SDK after fetching config', async () => {
            const { result } = renderHook(() => useJPMorganPayment())

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })

            expect(pieEncryption.loadPIESDK).toHaveBeenCalled()
        })

        it('should set isReady when PIE SDK loads successfully', async () => {
            const { result } = renderHook(() => useJPMorganPayment())

            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            expect(result.current.isLoading).toBe(false)
            expect(result.current.error).toBeNull()
        })

        it('should set error when config fetch fails', async () => {
            global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

            const { result } = renderHook(() => useJPMorganPayment())

            await waitFor(() => {
                expect(result.current.error).not.toBeNull()
            })

            expect(result.current.error.code).toBe('INITIALIZATION_ERROR')
        })

        it('should use provided merchantId instead of fetching', async () => {
            const { result } = renderHook(() => 
                useJPMorganPayment({ merchantId: 'provided-merchant-id' })
            )

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })

            expect(pieEncryption.loadPIESDK).toHaveBeenCalledWith(
                expect.objectContaining({
                    merchantId: 'provided-merchant-id'
                })
            )
        })

        it('should fail if PIE SDK fails to load', async () => {
            pieEncryption.loadPIESDK.mockResolvedValue(false)

            global.fetch = jest.fn().mockImplementation((url) => {
                if (url.includes('/config')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockConfig)
                    })
                }
                return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
            })

            const { result } = renderHook(() => useJPMorganPayment())

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })

            expect(result.current.isReady).toBe(false)
            expect(result.current.error).toBeDefined()
            expect(result.current.error.code).toBe('PIE_LOAD_ERROR')
        })
    })

    // =========================================================================
    // authorize Tests
    // =========================================================================

    describe('authorize', () => {
        it('should return error if not ready', async () => {
            pieEncryption.loadPIESDK.mockResolvedValue(false)
            pieEncryption.isPIEReady.mockReturnValue(false)

            const { result } = renderHook(() => useJPMorganPayment())

            // Don't wait for ready, call authorize immediately
            let authResult
            await act(async () => {
                authResult = await result.current.authorize(mockPaymentData)
            })

            expect(authResult.success).toBe(false)
            expect(authResult.code).toBe('NOT_READY')
        })

        it('should encrypt card data and call API', async () => {
            const { result } = renderHook(() => useJPMorganPayment())

            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            let authResult
            await act(async () => {
                authResult = await result.current.authorize(mockPaymentData)
            })

            expect(pieEncryption.encryptCardData).toHaveBeenCalledWith(
                mockCardData.cardNumber,
                mockCardData.cvv
            )
            expect(authResult.success).toBe(true)
            expect(authResult.transactionId).toBe('TXN-123456789')
        })

        it('should set isProcessing during authorization', async () => {
            // Make fetch take some time
            global.fetch = jest.fn().mockImplementation((url) => {
                if (url.includes('/config')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockConfig)
                    })
                }
                if (url.includes('/authorize')) {
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            resolve({
                                ok: true,
                                json: () => Promise.resolve(mockSuccessResponse)
                            })
                        }, 100)
                    })
                }
                return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
            })

            const { result } = renderHook(() => useJPMorganPayment())

            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            // Start authorize without waiting
            act(() => {
                result.current.authorize(mockPaymentData)
            })

            expect(result.current.isProcessing).toBe(true)
        })

        it('should call onSuccess callback on successful payment', async () => {
            const onSuccess = jest.fn()
            const { result } = renderHook(() => 
                useJPMorganPayment({ onSuccess })
            )

            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            await act(async () => {
                await result.current.authorize(mockPaymentData)
            })

            expect(onSuccess).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    transactionId: 'TXN-123456789'
                })
            )
        })

        it('should call onError callback on payment failure', async () => {
            global.fetch = jest.fn().mockImplementation((url) => {
                if (url.includes('/config')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockConfig)
                    })
                }
                if (url.includes('/authorize')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockErrorResponse)
                    })
                }
                return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
            })

            const onError = jest.fn()
            const { result } = renderHook(() => 
                useJPMorganPayment({ onError })
            )

            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            await act(async () => {
                await result.current.authorize(mockPaymentData)
            })

            expect(onError).toHaveBeenCalled()
            expect(result.current.error).toBeDefined()
        })

        it('should handle network errors gracefully', async () => {
            global.fetch = jest.fn().mockImplementation((url) => {
                if (url.includes('/config')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockConfig)
                    })
                }
                if (url.includes('/authorize')) {
                    return Promise.reject(new Error('Network error'))
                }
                return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
            })

            const { result } = renderHook(() => useJPMorganPayment())

            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            let authResult
            await act(async () => {
                authResult = await result.current.authorize(mockPaymentData)
            })

            expect(authResult.success).toBe(false)
            expect(authResult.canRetry).toBe(true)
        })

        it('should fail when encryption fails', async () => {
            pieEncryption.encryptCardData.mockReturnValue(null)
            pieEncryption.isPIEReady.mockReturnValue(true)

            const { result } = renderHook(() => useJPMorganPayment())

            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            let authResult
            await act(async () => {
                authResult = await result.current.authorize(mockPaymentData)
            })

            // Should fail because encryption is required
            expect(authResult.success).toBe(false)
            expect(authResult.canRetry).toBe(true)
        })

        it('should include billing address in request', async () => {
            const { result } = renderHook(() => useJPMorganPayment())

            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            await act(async () => {
                await result.current.authorize(mockPaymentData)
            })

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/authorize'),
                expect.objectContaining({
                    body: expect.stringContaining('billingAddress')
                })
            )
        })
    })

    // =========================================================================
    // retry Tests
    // =========================================================================

    describe('retry', () => {
        it('should increment retry count', async () => {
            global.fetch = jest.fn().mockImplementation((url) => {
                if (url.includes('/config')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockConfig)
                    })
                }
                if (url.includes('/authorize')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockErrorResponse)
                    })
                }
                return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
            })

            const { result } = renderHook(() => useJPMorganPayment())

            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            expect(result.current.retryCount).toBe(0)

            await act(async () => {
                await result.current.retry(mockPaymentData)
            })

            expect(result.current.retryCount).toBe(1)
        })

        it('should fail when max retries exceeded', async () => {
            const { result } = renderHook(() => 
                useJPMorganPayment({ maxRetries: 0 }) // Set to 0 so first retry fails
            )

            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            // First retry should fail immediately with max retries = 0
            let retryResult
            await act(async () => {
                retryResult = await result.current.retry(mockPaymentData)
            })

            expect(retryResult.success).toBe(false)
            expect(retryResult.code).toBe('MAX_RETRIES_EXCEEDED')
        })

        it('should track canRetry state', async () => {
            // Use maxRetries: 0 so the first retry immediately fails due to max retries
            const { result } = renderHook(() => 
                useJPMorganPayment({ maxRetries: 0 })
            )

            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            // With maxRetries 0, canRetry should immediately be false
            expect(result.current.canRetry).toBe(false)
        })
    })

    // =========================================================================
    // resetError Tests
    // =========================================================================

    describe('resetError', () => {
        it('should clear error state', async () => {
            global.fetch = jest.fn().mockImplementation((url) => {
                if (url.includes('/config')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockConfig)
                    })
                }
                if (url.includes('/authorize')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockErrorResponse)
                    })
                }
                return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
            })

            const { result } = renderHook(() => useJPMorganPayment())

            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            // Trigger an error
            await act(async () => {
                await result.current.authorize(mockPaymentData)
            })

            expect(result.current.error).toBeDefined()

            // Reset error
            act(() => {
                result.current.resetError()
            })

            expect(result.current.error).toBeNull()
        })
    })

    // =========================================================================
    // resetRetries Tests
    // =========================================================================

    describe('resetRetries', () => {
        it('should reset retry count to zero', async () => {
            const { result } = renderHook(() => useJPMorganPayment({ maxRetries: 5 }))

            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            // Initial state
            expect(result.current.retryCount).toBe(0)

            // Call resetRetries (should keep it at 0)
            act(() => {
                result.current.resetRetries()
            })

            expect(result.current.retryCount).toBe(0)
        })
    })

    // =========================================================================
    // encryptCard Tests
    // =========================================================================

    describe('encryptCard', () => {
        it('should call PIE encryption', async () => {
            const { result } = renderHook(() => useJPMorganPayment())

            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            const encrypted = result.current.encryptCard(mockCardData)

            expect(pieEncryption.encryptCardData).toHaveBeenCalledWith(
                mockCardData.cardNumber,
                mockCardData.cvv
            )
            expect(encrypted).toEqual(mockEncryptedData)
        })

        it('should return null when PIE not ready', async () => {
            pieEncryption.isPIEReady.mockReturnValue(false)

            const { result } = renderHook(() => useJPMorganPayment())

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })

            const encrypted = result.current.encryptCard(mockCardData)

            expect(encrypted).toBeNull()
        })
    })

    // =========================================================================
    // reinitialize Tests
    // =========================================================================

    describe('reinitialize', () => {
        it('should reload PIE SDK', async () => {
            const { result } = renderHook(() => useJPMorganPayment())

            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })

            pieEncryption.loadPIESDK.mockClear()

            await act(async () => {
                await result.current.reinitialize()
            })

            expect(pieEncryption.loadPIESDK).toHaveBeenCalled()
        })
    })
})
