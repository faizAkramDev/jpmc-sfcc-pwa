/**
 * useJPMCPlaceOrder Hook Unit Tests
 * 
 * Tests for the simplified place order hook
 */

import { renderHook, act } from '@testing-library/react'
import { useJPMCPlaceOrder } from '../useJPMCPlaceOrder'

// =============================================================================
// Mocks
// =============================================================================

// Mock the useJPMCCheckout hook
const mockAuthorizeAndPlaceOrder = jest.fn()
const mockClearCheckoutData = jest.fn()
const mockInitiateOrchestration = jest.fn()
const mockRegisterThreeDSCallbacks = jest.fn()
const mockFailOrderWithReopenBasket = jest.fn()
const mockRefetchBasket = jest.fn()

// Configurable mock state
let mockHasCardData = true
let mockIsGooglePayMethod = false
let mockIsApplePayMethod = false
let mockGooglePayResult = null
let mockCommerceConfig = { proxy: '/api', organizationId: 'org123', siteId: 'site1' }

const mockUseJPMCCheckout = jest.fn(() => ({
    authorizeAndPlaceOrder: mockAuthorizeAndPlaceOrder,
    hasCardData: mockHasCardData,
    clearCheckoutData: mockClearCheckoutData,
    isGooglePayMethod: mockIsGooglePayMethod,
    isApplePayMethod: mockIsApplePayMethod,
    googlePayResult: mockGooglePayResult,
    initiateOrchestration: mockInitiateOrchestration,
    registerThreeDSCallbacks: mockRegisterThreeDSCallbacks,
    failOrderWithReopenBasket: mockFailOrderWithReopenBasket,
    commerceConfig: mockCommerceConfig,
    refetchBasket: mockRefetchBasket
}))

jest.mock('../../client/context/JPMCCheckoutProvider', () => ({
    useJPMCCheckout: () => mockUseJPMCCheckout()
}))

// =============================================================================
// Test Setup
// =============================================================================

describe('useJPMCPlaceOrder', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        // Reset mock state to defaults
        mockHasCardData = true
        mockIsGooglePayMethod = false
        mockIsApplePayMethod = false
        mockGooglePayResult = null
        mockCommerceConfig = { proxy: '/api', organizationId: 'org123', siteId: 'site1' }
    })

    // =========================================================================
    // Basic Functionality Tests
    // =========================================================================

    describe('basic functionality', () => {
        it('should return submitOrder, isLoading, error, and resetError', () => {
            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            expect(result.current.submitOrder).toBeDefined()
            expect(typeof result.current.submitOrder).toBe('function')
            expect(result.current.isLoading).toBe(false)
            expect(result.current.error).toBeNull()
            expect(result.current.resetError).toBeDefined()
            expect(typeof result.current.resetError).toBe('function')
        })

        it('should have isLoading false initially', () => {
            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            expect(result.current.isLoading).toBe(false)
        })

        it('should have error null initially', () => {
            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            expect(result.current.error).toBeNull()
        })
    })

    // =========================================================================
    // Successful Place Order Tests
    // =========================================================================

    describe('successful place order', () => {
        it('should call authorizeAndPlaceOrder with createOrderFn', async () => {
            const mockCreateOrderFn = jest.fn()
            const mockOrder = { orderNo: '00001234' }
            
            mockAuthorizeAndPlaceOrder.mockResolvedValueOnce({
                success: true,
                order: mockOrder,
                transactionId: 'txn123'
            })

            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: mockCreateOrderFn,
                    onSuccess: jest.fn()
                })
            )

            await act(async () => {
                await result.current.submitOrder()
            })

            // Verify authorizeAndPlaceOrder was called with createOrderFn and browserInfo
            expect(mockAuthorizeAndPlaceOrder).toHaveBeenCalledWith(
                mockCreateOrderFn,
                expect.objectContaining({
                    browserInfo: expect.objectContaining({
                        browserLanguage: expect.any(String),
                        browserUserAgent: expect.any(String),
                        javaEnabled: expect.any(String),
                        javaScriptEnabled: 'true'
                    })
                })
            )
        })

        it('should call onSuccess with order on success', async () => {
            const mockOnSuccess = jest.fn()
            const mockOrder = { orderNo: '00001234' }
            
            mockAuthorizeAndPlaceOrder.mockResolvedValueOnce({
                success: true,
                order: mockOrder,
                transactionId: 'txn123'
            })

            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: mockOnSuccess
                })
            )

            await act(async () => {
                await result.current.submitOrder()
            })

            expect(mockOnSuccess).toHaveBeenCalledWith(mockOrder)
        })

        it('should call clearCheckoutData on success', async () => {
            mockAuthorizeAndPlaceOrder.mockResolvedValueOnce({
                success: true,
                order: { orderNo: '00001234' },
                transactionId: 'txn123'
            })

            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            await act(async () => {
                await result.current.submitOrder()
            })

            expect(mockClearCheckoutData).toHaveBeenCalled()
        })

        it('should return success result with order and transactionId', async () => {
            const mockOrder = { orderNo: '00001234' }
            
            mockAuthorizeAndPlaceOrder.mockResolvedValueOnce({
                success: true,
                order: mockOrder,
                transactionId: 'txn123'
            })

            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            let submitResult
            await act(async () => {
                submitResult = await result.current.submitOrder()
            })

            expect(submitResult.success).toBe(true)
            expect(submitResult.order).toEqual(mockOrder)
            // Note: transactionId no longer exposed to client for security
        })

        it('should set isLoading to false after success', async () => {
            mockAuthorizeAndPlaceOrder.mockResolvedValueOnce({
                success: true,
                order: { orderNo: '00001234' }
            })

            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            await act(async () => {
                await result.current.submitOrder()
            })

            expect(result.current.isLoading).toBe(false)
        })
    })

    // =========================================================================
    // Failed Place Order Tests
    // =========================================================================

    describe('failed place order', () => {
        it('should set error on authorization failure', async () => {
            mockAuthorizeAndPlaceOrder.mockResolvedValueOnce({
                success: false,
                error: 'Payment authorization failed',
                step: 'authorization'
            })

            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            await act(async () => {
                await result.current.submitOrder()
            })

            expect(result.current.error).not.toBeNull()
            expect(result.current.error.message).toBe('Payment authorization failed')
            expect(result.current.error.step).toBe('authorization')
        })

        it('should call onError callback on failure', async () => {
            const mockOnError = jest.fn()
            
            mockAuthorizeAndPlaceOrder.mockResolvedValueOnce({
                success: false,
                error: 'Payment authorization failed'
            })

            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn(),
                    onError: mockOnError
                })
            )

            await act(async () => {
                await result.current.submitOrder()
            })

            expect(mockOnError).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Payment authorization failed' })
            )
        })

        it('should use default error message when none provided', async () => {
            mockAuthorizeAndPlaceOrder.mockResolvedValueOnce({
                success: false
            })

            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            await act(async () => {
                await result.current.submitOrder()
            })

            expect(result.current.error.message).toBe("Payment couldn't be processed. Please try again later.")
        })

        it('should not call clearCheckoutData on failure', async () => {
            mockAuthorizeAndPlaceOrder.mockResolvedValueOnce({
                success: false,
                error: 'Failed'
            })

            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            await act(async () => {
                await result.current.submitOrder()
            })

            expect(mockClearCheckoutData).not.toHaveBeenCalled()
        })

        it('should not call onSuccess on failure', async () => {
            const mockOnSuccess = jest.fn()
            
            mockAuthorizeAndPlaceOrder.mockResolvedValueOnce({
                success: false,
                error: 'Failed'
            })

            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: mockOnSuccess
                })
            )

            await act(async () => {
                await result.current.submitOrder()
            })

            expect(mockOnSuccess).not.toHaveBeenCalled()
        })

        it('should return error result on failure', async () => {
            mockAuthorizeAndPlaceOrder.mockResolvedValueOnce({
                success: false,
                error: 'Payment failed'
            })

            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            let submitResult
            await act(async () => {
                submitResult = await result.current.submitOrder()
            })

            expect(submitResult.success).toBe(false)
            expect(submitResult.error.message).toBe('Payment failed')
        })
    })

    // =========================================================================
    // Exception Handling Tests
    // =========================================================================

    describe('exception handling', () => {
        it('should handle thrown errors', async () => {
            mockAuthorizeAndPlaceOrder.mockRejectedValueOnce(new Error('Network error'))

            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            await act(async () => {
                await result.current.submitOrder()
            })

            expect(result.current.error).not.toBeNull()
            expect(result.current.error.message).toBe("Payment couldn't be processed. Please try again later.")
        })

        it('should set isLoading to false after exception', async () => {
            mockAuthorizeAndPlaceOrder.mockRejectedValueOnce(new Error('Network error'))

            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            await act(async () => {
                await result.current.submitOrder()
            })

            expect(result.current.isLoading).toBe(false)
        })
    })

    // =========================================================================
    // Reset Error Tests
    // =========================================================================

    describe('resetError', () => {
        it('should clear error when called', async () => {
            mockAuthorizeAndPlaceOrder.mockResolvedValueOnce({
                success: false,
                error: 'Payment failed'
            })

            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            await act(async () => {
                await result.current.submitOrder()
            })

            expect(result.current.error).not.toBeNull()

            act(() => {
                result.current.resetError()
            })

            expect(result.current.error).toBeNull()
        })
    })

    // =========================================================================
    // Loading State Tests
    // =========================================================================

    describe('loading state', () => {
        it('should set isLoading to true while processing', async () => {
            let resolvePromise
            const pendingPromise = new Promise(resolve => {
                resolvePromise = resolve
            })
            
            mockAuthorizeAndPlaceOrder.mockReturnValueOnce(pendingPromise)

            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            // Start submitOrder but don't await it
            act(() => {
                result.current.submitOrder()
            })

            // Check loading state
            expect(result.current.isLoading).toBe(true)

            // Resolve the promise
            await act(async () => {
                resolvePromise({ success: true, order: {} })
            })

            expect(result.current.isLoading).toBe(false)
        })
    })
})

// =============================================================================
// Tests with hasCardData = false
// =============================================================================

describe('useJPMCPlaceOrder - missing card data', () => {
    it('should return error when hasCardData is false', async () => {
        // Override mock state for this test
        mockHasCardData = false

        const { result } = renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: jest.fn(),
                onSuccess: jest.fn()
            })
        )

        await act(async () => {
            await result.current.submitOrder()
        })

        expect(result.current.error).not.toBeNull()
        expect(result.current.error.message).toBe('Please enter payment information.')
    })
})

// =============================================================================
// Tests with missing createOrderFn
// =============================================================================

describe('useJPMCPlaceOrder - missing createOrderFn', () => {
    beforeEach(() => {
        // Ensure card data is valid for these tests
        mockHasCardData = true
        mockIsGooglePayMethod = false
        mockGooglePayResult = null
    })

    it('should return error when createOrderFn is not provided', async () => {
        const mockOnError = jest.fn()

        const { result } = renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: null,
                onSuccess: jest.fn(),
                onError: mockOnError
            })
        )

        await act(async () => {
            await result.current.submitOrder()
        })

        expect(result.current.error).not.toBeNull()
        expect(result.current.error.message).toBe('Order creation function is required')
        expect(mockOnError).toHaveBeenCalledWith(expect.objectContaining({
            message: 'Order creation function is required'
        }))
    })

    it('should return error when createOrderFn is not a function', async () => {
        const { result } = renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: 'not a function',
                onSuccess: jest.fn()
            })
        )

        await act(async () => {
            await result.current.submitOrder()
        })

        expect(result.current.error).not.toBeNull()
        expect(result.current.error.message).toBe('Order creation function is required')
    })
})

// =============================================================================
// Tests for Google Pay flow
// =============================================================================

describe('useJPMCPlaceOrder - Google Pay flow', () => {
    beforeEach(() => {
        mockHasCardData = false // No card data
        mockIsGooglePayMethod = true // Google Pay method selected
        mockGooglePayResult = { success: true } // Google Pay completed
    })

    it('should allow place order with successful Google Pay result', async () => {
        const mockOrder = { orderNo: '00001234' }
        mockAuthorizeAndPlaceOrder.mockResolvedValue({
            success: true,
            order: mockOrder,
            transactionId: 'gpay-txn-123'
        })

        const mockOnSuccess = jest.fn()

        const { result } = renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: jest.fn(),
                onSuccess: mockOnSuccess
            })
        )

        await act(async () => {
            await result.current.submitOrder()
        })

        expect(result.current.error).toBeNull()
        expect(mockOnSuccess).toHaveBeenCalledWith(mockOrder)
    })

    it('should fail when Google Pay result is not successful', async () => {
        mockGooglePayResult = { success: false }

        const { result } = renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: jest.fn(),
                onSuccess: jest.fn()
            })
        )

        await act(async () => {
            await result.current.submitOrder()
        })

        expect(result.current.error).not.toBeNull()
        expect(result.current.error.message).toBe('Please enter payment information.')
    })

    it('should fail when Google Pay result is null', async () => {
        mockGooglePayResult = null

        const { result } = renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: jest.fn(),
                onSuccess: jest.fn()
            })
        )

        await act(async () => {
            await result.current.submitOrder()
        })

        expect(result.current.error).not.toBeNull()
        expect(result.current.error.message).toBe('Please enter payment information.')
    })
})

// =============================================================================
// 3D Secure Flow Tests
// =============================================================================

describe('useJPMCPlaceOrder - 3D Secure flow', () => {
    beforeEach(() => {
        mockHasCardData = true
        mockIsGooglePayMethod = false
        mockGooglePayResult = null
    })

    it('should pass browserInfo to authorizeAndPlaceOrder', async () => {
        const mockOrder = { orderNo: '00001234' }
        mockAuthorizeAndPlaceOrder.mockResolvedValue({
            success: true,
            order: mockOrder,
            transactionId: 'txn-123'
        })

        const { result } = renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: jest.fn(),
                onSuccess: jest.fn()
            })
        )

        await act(async () => {
            await result.current.submitOrder()
        })

        expect(mockAuthorizeAndPlaceOrder).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
                browserInfo: expect.objectContaining({
                    browserLanguage: expect.any(String),
                    browserUserAgent: expect.any(String),
                    javaEnabled: expect.any(String),
                    javaScriptEnabled: 'true',
                    challengeWindowSize: 'FULL_SCREEN'
                })
            })
        )
    })

    it('should include browser accept header in browserInfo', async () => {
        const mockOrder = { orderNo: '00001234' }
        mockAuthorizeAndPlaceOrder.mockResolvedValue({
            success: true,
            order: mockOrder
        })

        const { result } = renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: jest.fn(),
                onSuccess: jest.fn()
            })
        )

        await act(async () => {
            await result.current.submitOrder()
        })

        expect(mockAuthorizeAndPlaceOrder).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
                browserInfo: expect.objectContaining({
                    browserAcceptHeader: 'application/json'
                })
            })
        )
    })

    it('should include browserColorDepth in browserInfo', async () => {
        mockAuthorizeAndPlaceOrder.mockResolvedValue({
            success: true,
            order: { orderNo: '00001234' }
        })

        const { result } = renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: jest.fn(),
                onSuccess: jest.fn()
            })
        )

        await act(async () => {
            await result.current.submitOrder()
        })

        expect(mockAuthorizeAndPlaceOrder).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
                browserInfo: expect.objectContaining({
                    browserColorDepth: expect.any(String)
                })
            })
        )
    })

    it('should include screen dimensions in browserInfo', async () => {
        mockAuthorizeAndPlaceOrder.mockResolvedValue({
            success: true,
            order: { orderNo: '00001234' }
        })

        const { result } = renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: jest.fn(),
                onSuccess: jest.fn()
            })
        )

        await act(async () => {
            await result.current.submitOrder()
        })

        expect(mockAuthorizeAndPlaceOrder).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
                browserInfo: expect.objectContaining({
                    browserScreenHeight: expect.any(String),
                    browserScreenWidth: expect.any(String)
                })
            })
        )
    })

    it('should include timezone in browserInfo', async () => {
        mockAuthorizeAndPlaceOrder.mockResolvedValue({
            success: true,
            order: { orderNo: '00001234' }
        })

        const { result } = renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: jest.fn(),
                onSuccess: jest.fn()
            })
        )

        await act(async () => {
            await result.current.submitOrder()
        })

        expect(mockAuthorizeAndPlaceOrder).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
                browserInfo: expect.objectContaining({
                    deviceLocalTimeZone: expect.any(String)
                })
            })
        )
    })

    it('should return isThreeDSRequired as false for normal success', async () => {
        mockAuthorizeAndPlaceOrder.mockResolvedValue({
            success: true,
            order: { orderNo: '00001234' },
            transactionId: 'txn-123'
        })

        const { result } = renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: jest.fn(),
                onSuccess: jest.fn()
            })
        )

        await act(async () => {
            await result.current.submitOrder()
        })

        expect(result.current.isThreeDSRequired).toBe(false)
    })

    it('should return isThreeDSRequired state', () => {
        const { result } = renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: jest.fn(),
                onSuccess: jest.fn()
            })
        )

        // 3DS modal is now rendered by JPMCCheckoutProvider
        // Hook only returns isThreeDSRequired state
        expect(result.current.isThreeDSRequired).toBeDefined()
        expect(result.current.isThreeDSRequired).toBe(false)
    })

    it('should have isThreeDSRequired as false initially', () => {
        const { result } = renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: jest.fn(),
                onSuccess: jest.fn()
            })
        )

        expect(result.current.isThreeDSRequired).toBe(false)
    })

    it('should register 3DS callbacks with provider on mount', () => {
        renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: jest.fn(),
                onSuccess: jest.fn()
            })
        )

        expect(mockRegisterThreeDSCallbacks).toHaveBeenCalled()
    })
})

// =============================================================================
// 3DS Callback Tests
// =============================================================================

describe('useJPMCPlaceOrder - 3DS callbacks', () => {
    let capturedCallbacks
    const mockFetch = jest.fn()

    beforeEach(() => {
        capturedCallbacks = null
        mockRegisterThreeDSCallbacks.mockImplementation((callbacks) => {
            capturedCallbacks = callbacks
        })
        global.fetch = mockFetch
        mockFetch.mockReset()
        mockHasCardData = true
        mockIsGooglePayMethod = false
        mockGooglePayResult = null
    })

    describe('onSuccess callback', () => {
        it('should clear checkout data and call onSuccess with order', () => {
            const mockOnSuccess = jest.fn()
            
            renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: mockOnSuccess
                })
            )

            act(() => {
                capturedCallbacks.onSuccess({
                    orderID: 'ORD-3DS-123',
                    continueUrl: '/checkout/confirmation/ORD-3DS-123'
                })
            })

            expect(mockClearCheckoutData).toHaveBeenCalled()
            expect(mockOnSuccess).toHaveBeenCalledWith({
                orderNo: 'ORD-3DS-123',
                continueUrl: '/checkout/confirmation/ORD-3DS-123'
            })
        })
    })

    describe('onDenied callback', () => {
        it('should set error and call onError with denied message', () => {
            const mockOnError = jest.fn()
            
            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn(),
                    onError: mockOnError
                })
            )

            act(() => {
                capturedCallbacks.onDenied({ orderID: 'ORD-DENIED' })
            })

            expect(result.current.error).toEqual(
                expect.objectContaining({
                    message: 'Your card issuer denied authentication. Please try another payment method.',
                    code: 'THREE_DS_DENIED',
                    orderNo: 'ORD-DENIED'
                })
            )
            expect(mockOnError).toHaveBeenCalled()
        })
    })

    describe('onError callback', () => {
        it('should set error with timeout message when error is TIMEOUT', () => {
            const mockOnError = jest.fn()
            
            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn(),
                    onError: mockOnError
                })
            )

            act(() => {
                capturedCallbacks.onError({ error: 'TIMEOUT' })
            })

            expect(result.current.error.message).toBe('Authentication timed out. Please try again.')
        })

        it('should set error with generic message for other errors', () => {
            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            act(() => {
                capturedCallbacks.onError({ error: 'UNKNOWN' })
            })

            expect(result.current.error.message).toBe('An error occurred during authentication. Please try again.')
        })
    })

    describe('onCancel callback', () => {
        it('should set error with cancelled message', () => {
            const mockOnError = jest.fn()
            
            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn(),
                    onError: mockOnError
                })
            )

            act(() => {
                capturedCallbacks.onCancel()
            })

            expect(result.current.error).toEqual(
                expect.objectContaining({
                    message: 'Authentication was cancelled.',
                    code: 'THREE_DS_CANCELLED'
                })
            )
            expect(mockOnError).toHaveBeenCalled()
        })
    })

    describe('onTimeout callback', () => {
        it('should set error with timeout message', () => {
            const mockOnError = jest.fn()
            
            const { result } = renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn(),
                    onError: mockOnError
                })
            )

            act(() => {
                capturedCallbacks.onTimeout()
            })

            expect(result.current.error).toEqual(
                expect.objectContaining({
                    message: 'Authentication timed out. Please try again.',
                    code: 'THREE_DS_TIMEOUT'
                })
            )
            expect(mockOnError).toHaveBeenCalled()
        })
    })

    describe('fail3DSOrderFn callback', () => {
        it('should call failOrderWithReopenBasket when available', async () => {
            mockFailOrderWithReopenBasket.mockResolvedValueOnce({
                basketReopened: true,
                basketId: 'basket-123'
            })

            renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            await act(async () => {
                await capturedCallbacks.fail3DSOrderFn('ORD-FAIL', 'token', 'failure_reason')
            })

            expect(mockFailOrderWithReopenBasket).toHaveBeenCalledWith({
                orderNo: 'ORD-FAIL',
                reasonCode: 'payment_auth_failure',
                proxy: '/api',
                organizationId: 'org123',
                siteId: 'site1'
            })
            expect(mockRefetchBasket).toHaveBeenCalled()
        })

        it('should fallback to /api/jpmorgan/3ds/fail when failOrderWithReopenBasket fails', async () => {
            mockFailOrderWithReopenBasket.mockRejectedValueOnce(new Error('Failed'))
            mockFetch.mockResolvedValueOnce({ ok: true })

            renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            await act(async () => {
                await capturedCallbacks.fail3DSOrderFn('ORD-FAIL', 'token', 'failure_reason')
            })

            expect(mockFetch).toHaveBeenCalledWith('/api/jpmorgan/3ds/fail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderNo: 'ORD-FAIL',
                    orderToken: 'token',
                    failureReason: 'failure_reason',
                    commerceConfig: {
                        proxy: '/api',
                        organizationId: 'org123',
                        siteId: 'site1'
                    }
                })
            })
        })

        it('should fallback when basket not reopened', async () => {
            mockFailOrderWithReopenBasket.mockResolvedValueOnce({
                basketReopened: false
            })
            mockFetch.mockResolvedValueOnce({ ok: true })

            renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            await act(async () => {
                await capturedCallbacks.fail3DSOrderFn('ORD-FAIL', 'token', 'reason')
            })

            expect(mockFetch).toHaveBeenCalledWith('/api/jpmorgan/3ds/fail', expect.any(Object))
        })

        it('should handle fetch failure silently', async () => {
            mockFailOrderWithReopenBasket.mockRejectedValueOnce(new Error('Failed'))
            mockFetch.mockRejectedValueOnce(new Error('Network error'))

            renderHook(() => 
                useJPMCPlaceOrder({
                    createOrderFn: jest.fn(),
                    onSuccess: jest.fn()
                })
            )

            await act(async () => {
                await capturedCallbacks.fail3DSOrderFn('ORD-FAIL', 'token', 'reason')
            })
        })
    })
})

// =============================================================================
// 3DS Initiation Flow Tests (requires3DSAuthentication path)
// =============================================================================

// Mock 3DS helpers
jest.mock('../../services/api/helpers/threeds-helpers', () => ({
    requires3DSAuthentication: jest.fn(),
    get3DSOrchestrationUrl: jest.fn()
}))

describe('useJPMCPlaceOrder - 3DS initiation flow', () => {
    const { requires3DSAuthentication, get3DSOrchestrationUrl } = require('../../services/api/helpers/threeds-helpers')
    const mockFetch = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
        global.fetch = mockFetch
        mockFetch.mockReset()
        mockHasCardData = true
        mockIsGooglePayMethod = false
        mockGooglePayResult = null
        requires3DSAuthentication.mockReturnValue(false)
        get3DSOrchestrationUrl.mockReturnValue(null)
    })

    it('should initiate 3DS when requires3DSAuthentication returns true', async () => {
        const mockOrder = { orderNo: 'ORD-3DS', orderToken: 'token-3ds' }
        const orchestrationUrl = 'https://jpmc.com/3ds/orchestrate?id=abc123'
        
        mockAuthorizeAndPlaceOrder.mockResolvedValueOnce({
            success: false,
            order: mockOrder,
            authorization: {
                paymentAuthenticationResult: {
                    authenticationId: 'auth-123'
                },
                transactionId: 'txn-123',
                merchant: { merchantId: 'merchant-123' }
            }
        })
        requires3DSAuthentication.mockReturnValue(true)
        get3DSOrchestrationUrl.mockReturnValue(orchestrationUrl)
        mockFetch.mockResolvedValueOnce({ ok: true })

        const { result } = renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: jest.fn(),
                onSuccess: jest.fn()
            })
        )

        let submitResult
        await act(async () => {
            submitResult = await result.current.submitOrder()
        })

        expect(submitResult).toEqual({
            success: false,
            pending3DS: true,
            orderNo: 'ORD-3DS'
        })
        expect(result.current.isThreeDSRequired).toBe(true)
        expect(mockInitiateOrchestration).toHaveBeenCalledWith(
            orchestrationUrl,
            'ORD-3DS',
            'token-3ds'
        )
    })

    it('should return error when orchestrationUrl is not provided', async () => {
        const mockOrder = { orderNo: 'ORD-3DS-NO-URL' }
        const mockOnError = jest.fn()
        
        mockAuthorizeAndPlaceOrder.mockResolvedValueOnce({
            success: false,
            order: mockOrder,
            authorization: {}
        })
        requires3DSAuthentication.mockReturnValue(true)
        get3DSOrchestrationUrl.mockReturnValue(null)

        const { result } = renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: jest.fn(),
                onSuccess: jest.fn(),
                onError: mockOnError
            })
        )

        let submitResult
        await act(async () => {
            submitResult = await result.current.submitOrder()
        })

        expect(submitResult.success).toBe(false)
        expect(submitResult.error.code).toBe('THREE_DS_NO_URL')
        expect(result.current.error.message).toBe('Authentication required but URL not provided')
        expect(mockOnError).toHaveBeenCalled()
    })

    it('should use orderNo as orderToken fallback', async () => {
        const mockOrder = { orderNo: 'ORD-NO-TOKEN' } // No orderToken
        
        mockAuthorizeAndPlaceOrder.mockResolvedValueOnce({
            success: false,
            order: mockOrder,
            authorization: {}
        })
        requires3DSAuthentication.mockReturnValue(true)
        get3DSOrchestrationUrl.mockReturnValue('https://3ds.url')
        mockFetch.mockResolvedValueOnce({ ok: true })

        const { result } = renderHook(() => 
            useJPMCPlaceOrder({
                createOrderFn: jest.fn(),
                onSuccess: jest.fn()
            })
        )

        await act(async () => {
            await result.current.submitOrder()
        })

        expect(mockInitiateOrchestration).toHaveBeenCalledWith(
            'https://3ds.url',
            'ORD-NO-TOKEN',
            'ORD-NO-TOKEN' // Falls back to orderNo
        )
    })
})
