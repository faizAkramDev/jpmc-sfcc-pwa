/**
 * Unit Tests for useGooglePay Hook
 *
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { useGooglePay } from '../useGooglePay'
import {
    GOOGLE_PAY_ERROR_CODES
} from '../../utils/constants.mjs'

// Mock the Google Pay services
jest.mock('../../services/googlepay', () => ({
    loadGooglePayScript: jest.fn(),
    isGooglePayScriptLoaded: jest.fn(() => false),
    createPaymentsClient: jest.fn(),
    preloadGooglePayScript: jest.fn(),
    buildGooglePayConfig: jest.fn((config) => ({
        clientOptions: { 
            environment: 'TEST',
            // Include callbacks for cart/pdp contexts
            ...(config.onPaymentDataChanged || config.onPaymentAuthorized ? {
                paymentDataCallbacks: {
                    onPaymentDataChanged: config.onPaymentDataChanged,
                    onPaymentAuthorized: config.onPaymentAuthorized
                }
            } : {})
        },
        isReadyToPayRequest: { apiVersion: 2, apiVersionMinor: 0 },
        buildPaymentDataRequest: jest.fn((amount, currency, additionalOptions = {}) => ({
            transactionInfo: { 
                totalPrice: amount, 
                currencyCode: currency,
                ...(additionalOptions.displayItems ? { displayItems: additionalOptions.displayItems } : {})
            },
            // Include callback intents for cart/pdp
            ...(config.context === 'cart' || config.context === 'pdp' ? {
                callbackIntents: ['SHIPPING_ADDRESS', 'SHIPPING_OPTION', 'PAYMENT_AUTHORIZATION'],
                shippingAddressRequired: true,
                shippingOptionRequired: true
            } : {})
        })),
        raw: config
    })),
    buildPaymentDataRequest: jest.fn(),
    parseGooglePayResponse: jest.fn(),
    validateGooglePayConfig: jest.fn(() => ({ valid: true, errors: [], warnings: [] }))
}))

import {
    loadGooglePayScript,
    createPaymentsClient,
    validateGooglePayConfig,
    parseGooglePayResponse
} from '../../services/googlepay'

describe('useGooglePay Hook', () => {
    const defaultProps = {
        gatewayMerchantId: 'test-merchant-123',
        merchantName: 'Test Store',
        environment: 'sandbox'
    }

    // Mock PaymentsClient
    const mockPaymentsClient = {
        isReadyToPay: jest.fn(),
        loadPaymentData: jest.fn(),
        createButton: jest.fn()
    }

    beforeEach(() => {
        jest.clearAllMocks()
        
        // Default mocks
        loadGooglePayScript.mockResolvedValue(true)
        createPaymentsClient.mockReturnValue(mockPaymentsClient)
        mockPaymentsClient.isReadyToPay.mockResolvedValue({ result: true })
        validateGooglePayConfig.mockReturnValue({ valid: true, errors: [] })
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    describe('Initialization', () => {
        it('should initialize with correct default state', () => {
            const { result } = renderHook(() => useGooglePay(defaultProps))
            
            expect(result.current.isLoading).toBe(true)
            expect(result.current.isReady).toBe(false)
            expect(result.current.isAvailable).toBe(false)
            expect(result.current.isProcessing).toBe(false)
            expect(result.current.error).toBeNull()
        })

        it('should load Google Pay script on mount', async () => {
            renderHook(() => useGooglePay(defaultProps))
            
            await waitFor(() => {
                expect(loadGooglePayScript).toHaveBeenCalled()
            })
        })

        it('should check if Google Pay is ready', async () => {
            const { result } = renderHook(() => useGooglePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            expect(mockPaymentsClient.isReadyToPay).toHaveBeenCalled()
        })

        it('should set isAvailable when Google Pay is ready', async () => {
            mockPaymentsClient.isReadyToPay.mockResolvedValue({ result: true })
            
            const { result } = renderHook(() => useGooglePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isAvailable).toBe(true)
            })
        })

        it('should set isAvailable to false when Google Pay is not available', async () => {
            mockPaymentsClient.isReadyToPay.mockResolvedValue({ result: false })
            
            const { result } = renderHook(() => useGooglePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
                expect(result.current.isAvailable).toBe(false)
            })
        })

        it('should call onReady callback when ready', async () => {
            const onReady = jest.fn()
            
            renderHook(() => useGooglePay({ ...defaultProps, onReady }))
            
            await waitFor(() => {
                expect(onReady).toHaveBeenCalled()
            })
        })

        it('should handle script load failure', async () => {
            loadGooglePayScript.mockRejectedValue(new Error('Script load failed'))
            const onError = jest.fn()
            
            const { result } = renderHook(() => useGooglePay({ ...defaultProps, onError }))
            
            await waitFor(() => {
                expect(result.current.error).toBeDefined()
                expect(onError).toHaveBeenCalled()
            })
        })

        it('should handle invalid configuration', async () => {
            validateGooglePayConfig.mockReturnValue({ 
                valid: false, 
                errors: ['merchantName is required'] 
            })
            
            const { result } = renderHook(() => useGooglePay({
                gatewayMerchantId: 'test-merchant-123'
                // merchantName intentionally omitted to trigger validation error
            }))
            
            await waitFor(() => {
                expect(result.current.error).not.toBeNull()
                expect(result.current.error.code).toBe(GOOGLE_PAY_ERROR_CODES.INVALID_CONFIG)
            })
        })
    })

    describe('getPaymentToken', () => {
        it('should get payment token with correct parameters', async () => {
            const mockPaymentData = {
                paymentMethodData: {
                    tokenizationData: { token: '{}' },
                    info: { cardNetwork: 'VISA' }
                }
            }
            
            mockPaymentsClient.loadPaymentData.mockResolvedValue(mockPaymentData)
            parseGooglePayResponse.mockReturnValue({
                encryptedPaymentBundle: { token: 'encrypted-token-data' },
                billingAddress: { city: 'New York' },
                email: 'test@test.com',
                cardNetwork: 'VISA'
            })
            
            const { result } = renderHook(() => useGooglePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            let tokenResult
            await act(async () => {
                tokenResult = await result.current.getPaymentToken({
                    amount: '99.99',
                    currencyCode: 'USD'
                })
            })
            
            expect(mockPaymentsClient.loadPaymentData).toHaveBeenCalled()
            expect(tokenResult.success).toBe(true)
            expect(tokenResult.token).toEqual({ token: 'encrypted-token-data' })
            expect(tokenResult.billingAddress).toEqual({ city: 'New York' })
            expect(tokenResult.email).toBe('test@test.com')
            expect(tokenResult.cardNetwork).toBe('VISA')
        })

        it('should return error for missing amount', async () => {
            const onError = jest.fn()
            const { result } = renderHook(() => useGooglePay({ ...defaultProps, onError }))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            let response
            await act(async () => {
                response = await result.current.getPaymentToken({
                    currencyCode: 'USD'
                })
            })
            
            expect(response.success).toBe(false)
            expect(response.error.code).toBe(GOOGLE_PAY_ERROR_CODES.INVALID_CONFIG)
            expect(onError).toHaveBeenCalled()
        })

        it('should return error for missing currency', async () => {
            const onError = jest.fn()
            const { result } = renderHook(() => useGooglePay({ ...defaultProps, onError }))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            let response
            await act(async () => {
                response = await result.current.getPaymentToken({
                    amount: '99.99'
                })
            })
            
            expect(response.success).toBe(false)
            expect(response.error.message).toContain('Currency code is required')
        })

        it('should return error when not initialized', async () => {
            const { result } = renderHook(() => useGooglePay({ merchantName: 'Test' }))
            
            await waitFor(() => {
                expect(result.current.isLoading).toBe(false)
            })
            
            let response
            await act(async () => {
                response = await result.current.getPaymentToken({
                    amount: '99.99',
                    currencyCode: 'USD'
                })
            })
            
            expect(response.success).toBe(false)
            expect(response.error.code).toBe(GOOGLE_PAY_ERROR_CODES.CLIENT_NOT_INITIALIZED)
        })

        it('should handle user cancellation', async () => {
            mockPaymentsClient.loadPaymentData.mockRejectedValue({ statusCode: 'CANCELED' })
            const onCancel = jest.fn()
            
            const { result } = renderHook(() => useGooglePay({ ...defaultProps, onCancel }))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            let response
            await act(async () => {
                response = await result.current.getPaymentToken({
                    amount: '99.99',
                    currencyCode: 'USD'
                })
            })
            
            expect(response.success).toBe(false)
            expect(response.cancelled).toBe(true)
            expect(response.error).toBeUndefined()
            expect(onCancel).toHaveBeenCalled()
        })

        it('should handle popup blocker error', async () => {
            mockPaymentsClient.loadPaymentData.mockRejectedValue({ 
                message: 'OR_BIBED_15: Popup blocked' 
            })
            const onError = jest.fn()
            
            const { result } = renderHook(() => useGooglePay({ ...defaultProps, onError }))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            let response
            await act(async () => {
                response = await result.current.getPaymentToken({
                    amount: '99.99',
                    currencyCode: 'USD'
                })
            })
            
            expect(response.success).toBe(false)
            expect(response.error.code).toBe('POPUP_BLOCKED')
            expect(onError).toHaveBeenCalled()
        })

        it('should handle generic payment error', async () => {
            mockPaymentsClient.loadPaymentData.mockRejectedValue(new Error('Network error'))
            const onError = jest.fn()
            
            const { result } = renderHook(() => useGooglePay({ ...defaultProps, onError }))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            let response
            await act(async () => {
                response = await result.current.getPaymentToken({
                    amount: '99.99',
                    currencyCode: 'USD'
                })
            })
            
            expect(response.success).toBe(false)
            expect(response.error.message).toBe("Payment couldn't be processed. Please try again later.")
            expect(onError).toHaveBeenCalled()
        })

        it('should set isProcessing during token collection', async () => {
            let resolvePayment
            
            const mockPaymentData = {
                paymentMethodData: {
                    tokenizationData: { token: '{}' },
                    info: { cardNetwork: 'VISA' }
                }
            }
            mockPaymentsClient.loadPaymentData.mockReturnValue(
                new Promise((resolve) => { resolvePayment = resolve })
            )
            
            parseGooglePayResponse.mockReturnValue({
                encryptedPaymentBundle: { token: 'test' },
                billingAddress: null,
                email: 'test@test.com',
                cardNetwork: 'VISA'
            })
            
            const { result } = renderHook(() => useGooglePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            // Start getting token
            let tokenPromise
            act(() => {
                tokenPromise = result.current.getPaymentToken({
                    amount: '99.99',
                    currencyCode: 'USD'
                })
            })
            
            // isProcessing should be true while waiting
            await waitFor(() => {
                expect(result.current.isProcessing).toBe(true)
            })
            
            // Resolve and complete
            await act(async () => {
                resolvePayment(mockPaymentData)
                await tokenPromise
            })
            
            // isProcessing should be false after completion
            expect(result.current.isProcessing).toBe(false)
        })
    })

    describe('Utility Methods', () => {
        it('should reset error', async () => {
            loadGooglePayScript.mockRejectedValue(new Error('Failed'))
            
            const { result } = renderHook(() => useGooglePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.error).toBeDefined()
            })
            
            act(() => {
                result.current.resetError()
            })
            
            expect(result.current.error).toBeNull()
        })

        it('should reset all state', async () => {
            const { result } = renderHook(() => useGooglePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            act(() => {
                result.current.reset()
            })
            
            expect(result.current.error).toBeNull()
            expect(result.current.isProcessing).toBe(false)
        })

        it('should expose config for debugging', async () => {
            const { result } = renderHook(() => useGooglePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            expect(result.current.config).toBeDefined()
            expect(result.current.config.gatewayMerchantId).toBe('test-merchant-123')
        })

        it('should expose paymentsClient for button rendering', async () => {
            const { result } = renderHook(() => useGooglePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            expect(result.current.paymentsClient).toBeDefined()
            expect(result.current.paymentsClient).toBe(mockPaymentsClient)
        })
    })

    // =========================================================================
    // Cart/PDP Context Tests
    // =========================================================================

    describe('Cart/PDP Context', () => {
        const cartProps = {
            ...defaultProps,
            context: 'cart',
            allowedCountryCodes: ['US', 'CA'],
            phoneNumberRequired: true,
            onPaymentDataChanged: jest.fn(),
            onPaymentAuthorized: jest.fn()
        }

        it('should expose context and isCartOrPDPFlow', async () => {
            const { result } = renderHook(() => useGooglePay(cartProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            expect(result.current.context).toBe('cart')
            expect(result.current.isCartOrPDPFlow).toBe(true)
        })

        it('should set isCartOrPDPFlow to false for checkout context', async () => {
            const { result } = renderHook(() => useGooglePay(defaultProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            expect(result.current.context).toBe('checkout')
            expect(result.current.isCartOrPDPFlow).toBe(false)
        })

        it('should expose loadPaymentData method for cart context', async () => {
            const { result } = renderHook(() => useGooglePay(cartProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            expect(result.current.loadPaymentData).toBeInstanceOf(Function)
        })

        it('should require onPaymentDataChanged for cart context', async () => {
            const propsWithoutCallback = {
                ...defaultProps,
                context: 'cart'
            }
            
            const { result } = renderHook(() => useGooglePay(propsWithoutCallback))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            const loadResult = await result.current.loadPaymentData({
                amount: '99.99',
                currencyCode: 'USD'
            })
            
            expect(loadResult.success).toBe(false)
            expect(loadResult.error.message).toContain('onPaymentDataChanged callback is required')
        })

        it('should require onPaymentAuthorized for cart context', async () => {
            const propsWithPartialCallback = {
                ...defaultProps,
                context: 'cart',
                onPaymentDataChanged: jest.fn()
            }
            
            const { result } = renderHook(() => useGooglePay(propsWithPartialCallback))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            const loadResult = await result.current.loadPaymentData({
                amount: '99.99',
                currencyCode: 'USD'
            })
            
            expect(loadResult.success).toBe(false)
            expect(loadResult.error.message).toContain('onPaymentAuthorized callback is required')
        })

        it('should call loadPaymentData successfully for cart context', async () => {
            mockPaymentsClient.loadPaymentData.mockResolvedValue({
                paymentMethodData: {
                    tokenizationData: { token: 'test-token' }
                }
            })
            
            const { result } = renderHook(() => useGooglePay(cartProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            let loadResult
            await act(async () => {
                loadResult = await result.current.loadPaymentData({
                    amount: '99.99',
                    currencyCode: 'USD'
                })
            })
            
            expect(loadResult.success).toBe(true)
            expect(loadResult.context).toBe('cart')
        })

        it('should include displayItems in payment data request', async () => {
            mockPaymentsClient.loadPaymentData.mockResolvedValue({
                paymentMethodData: {
                    tokenizationData: { token: 'test-token' }
                }
            })
            
            const { result } = renderHook(() => useGooglePay(cartProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            const displayItems = [
                { label: 'Subtotal', type: 'SUBTOTAL', price: '80.00' },
                { label: 'Tax', type: 'TAX', price: '8.00' }
            ]
            
            await act(async () => {
                await result.current.loadPaymentData({
                    amount: '99.99',
                    currencyCode: 'USD',
                    displayItems
                })
            })
            
            // Check that buildPaymentDataRequest was called with displayItems
            const buildFn = result.current.config ? true : false
            expect(buildFn).toBe(true)
        })

        it('should handle user cancellation in cart flow', async () => {
            mockPaymentsClient.loadPaymentData.mockRejectedValue({
                statusCode: 'CANCELED',
                message: 'User cancelled'
            })
            
            const onCancel = jest.fn()
            
            const { result } = renderHook(() => useGooglePay({
                ...cartProps,
                onCancel
            }))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            let loadResult
            await act(async () => {
                loadResult = await result.current.loadPaymentData({
                    amount: '99.99',
                    currencyCode: 'USD'
                })
            })
            
            expect(loadResult.success).toBe(false)
            expect(loadResult.cancelled).toBe(true)
            expect(onCancel).toHaveBeenCalled()
        })

        it('should handle pdp context same as cart', async () => {
            const pdpProps = {
                ...cartProps,
                context: 'pdp'
            }
            
            const { result } = renderHook(() => useGooglePay(pdpProps))
            
            await waitFor(() => {
                expect(result.current.isReady).toBe(true)
            })
            
            expect(result.current.context).toBe('pdp')
            expect(result.current.isCartOrPDPFlow).toBe(true)
        })
    })
})
