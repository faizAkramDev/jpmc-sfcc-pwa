/**
 * JPMCCheckoutProvider Tests
 * 
 * Comprehensive tests for the main JPMC Checkout Provider component
 */

import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { JPMCCheckoutProvider, useJPMCCheckout } from '../JPMCCheckoutProvider'

// Mock fetch globally
global.fetch = jest.fn()

// Mock the hooks that JPMCCheckoutProvider uses
jest.mock('../../../hooks/useJPMorganPayment', () => ({
    useJPMorganPayment: jest.fn()
}))

jest.mock('../../../hooks/useGooglePay', () => ({
    useGooglePay: jest.fn()
}))

jest.mock('../../../hooks/useApplePay', () => ({
    useApplePay: jest.fn()
}))

jest.mock('../../../hooks/useKount', () => ({
    __esModule: true,
    default: jest.fn()
}))

jest.mock('../hooks', () => ({
    usePaymentMethods: jest.fn(),
    usePaymentConfig: jest.fn(),
    useOrderConfirm: jest.fn()
}))

jest.mock('../utils/session-storage', () => ({
    saveTokenToSession: jest.fn(),
    getTokenFromSession: jest.fn(),
    clearTokenFromSession: jest.fn(),
    saveFraudRuleAction: jest.fn(),
    clearFraudRuleAction: jest.fn(),
    saveFraudCart: jest.fn(),
    clearFraudCart: jest.fn(),
    saveFraudShipTo: jest.fn(),
    clearFraudShipTo: jest.fn(),
    savePaymentError: jest.fn(),
    getPaymentError: jest.fn(),
    clearPaymentError: jest.fn(),
    hasPaymentError: jest.fn(),
    saveCardTypeName: jest.fn(),
    saveCardType: jest.fn()
}))

jest.mock('../utils/fraud-helpers', () => ({
    buildFraudShoppingCart: jest.fn(),
    mapShipToForFraud: jest.fn()
}))

jest.mock('../utils/request-builders', () => ({
    resolvePaymentToken: jest.fn(),
    buildTokenAuthRequest: jest.fn(),
    buildCardAuthRequest: jest.fn(),
    isCardMasked: jest.fn().mockReturnValue(false)
}))

jest.mock('../../utils/display-items', () => ({
    buildDisplayItemsFromBasket: jest.fn(() => [])
}))

// Get mock references
import { useJPMorganPayment } from '../../../hooks/useJPMorganPayment'
import { useGooglePay } from '../../../hooks/useGooglePay'
import { useApplePay } from '../../../hooks/useApplePay'
import useKount from '../../../hooks/useKount'
import { usePaymentMethods, usePaymentConfig, useOrderConfirm } from '../hooks'
import { saveTokenToSession, clearTokenFromSession, saveFraudRuleAction, clearFraudRuleAction, saveFraudCart, clearFraudCart, saveFraudShipTo, clearFraudShipTo, savePaymentError, getTokenFromSession, saveCardTypeName, saveCardType } from '../utils/session-storage'
import { buildFraudShoppingCart, mapShipToForFraud } from '../utils/fraud-helpers'
import { resolvePaymentToken, buildTokenAuthRequest, buildCardAuthRequest } from '../utils/request-builders'

// Default mock implementations
const defaultPaymentHook = {
    isReady: true,
    isLoading: false,
    isProcessing: false,
    error: null,
    authorize: jest.fn().mockResolvedValue({ success: true, transactionId: 'txn123' }),
    encryptCard: jest.fn().mockReturnValue({
        encryptedCardNumber: 'enc123',
        encryptedCVV: 'enc456',
        integrityCheck: 'check789'
    }),
    resetError: jest.fn(),
    config: { captureMethod: 'NOW' }
}

const defaultGooglePayHook = {
    isReady: true,
    isAvailable: true,
    isLoading: false,
    isProcessing: false,
    error: null,
    getPaymentToken: jest.fn(),
    reset: jest.fn(),
    resetError: jest.fn()
}

const defaultApplePayHook = {
    isAvailable: true,
    isProcessing: false,
    error: null,
    initiatePayment: jest.fn(),
    reset: jest.fn(),
    resetError: jest.fn()
}

const defaultKountHook = {
    kountSessionId: 'kount-session-123',
    isCollectionComplete: true,
    refreshKount: jest.fn().mockResolvedValue('new-kount-session')
}

const defaultPaymentMethodsHook = {
    activePaymentMethods: ['CREDIT_CARD', 'DW_GOOGLEPAY', 'DW_APPLE_PAY'],
    googlePayPaymentMethodId: 'DW_GOOGLEPAY',
    creditCardPaymentMethodId: 'CREDIT_CARD',
    applePayPaymentMethodId: 'DW_APPLE_PAY',
    isCreditCardEnabled: true,
    isGooglePayEnabled: true,
    isApplePayEnabled: true
}

const defaultPaymentConfigHook = {
    fraudConfig: { enableFraudCheck: false, kountClientId: null, kountEnvironment: 'sandbox' },
    kountEnabled: false,
    googlePayConfig: { gatewayMerchantId: 'test-merchant' },
    applePayConfig: { merchantId: 'merchant.test', merchantName: 'Test Store', countryCode: 'US', supportedNetworks: ['visa', 'masterCard'], merchantCapabilities: ['supports3DS'] },
    isLoadingGooglePayConfig: false
}

const defaultOrderConfirmHook = {
    orderConfirmResult: null,
    isConfirmingOrder: false,
    confirmOrderServerSide: jest.fn().mockResolvedValue({ success: true }),
    failOrderServerSide: jest.fn().mockResolvedValue({ success: true }),
    resetOrderConfirm: jest.fn(),
    isOrderConfirmed: false
}

// Setup default mocks
const setupMocks = (overrides = {}) => {
    useJPMorganPayment.mockReturnValue({
        ...defaultPaymentHook,
        ...overrides.payment
    })
    useGooglePay.mockReturnValue({
        ...defaultGooglePayHook,
        ...overrides.googlePay
    })
    useApplePay.mockReturnValue({
        ...defaultApplePayHook,
        ...overrides.applePay
    })
    useKount.mockReturnValue({
        ...defaultKountHook,
        ...overrides.kount
    })
    usePaymentMethods.mockReturnValue({
        ...defaultPaymentMethodsHook,
        ...overrides.paymentMethods
    })
    usePaymentConfig.mockReturnValue({
        ...defaultPaymentConfigHook,
        ...overrides.paymentConfig
    })
    useOrderConfirm.mockReturnValue({
        ...defaultOrderConfirmHook,
        ...overrides.orderConfirm
    })
    
    // Reset other mocks
    global.fetch.mockReset()
    resolvePaymentToken.mockReturnValue({ token: null, paymentInstrument: null })
    buildTokenAuthRequest.mockReturnValue({ amount: 10000 })
    buildCardAuthRequest.mockReturnValue({ amount: 10000 })
    buildFraudShoppingCart.mockReturnValue(null)
    mapShipToForFraud.mockReturnValue(null)
}

// Wrapper component
const createWrapper = (props = {}) => {
    const Wrapper = ({ children }) => (
        <JPMCCheckoutProvider {...props}>
            {children}
        </JPMCCheckoutProvider>
    )
    return Wrapper
}

describe('JPMCCheckoutProvider', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        setupMocks()
    })

    describe('Context basics', () => {
        it('provides context to children', () => {
            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            expect(result.current).toBeDefined()
            expect(result.current.isPIEReady).toBe(true)
            expect(result.current.isGooglePayAvailable).toBe(true)
            expect(result.current.isApplePayAvailable).toBe(true)
        })

        it('throws error when used outside provider', () => {
            const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
            
            expect(() => {
                renderHook(() => useJPMCCheckout())
            }).toThrow('useJPMCCheckout must be used within a JPMCCheckoutProvider')
            
            consoleError.mockRestore()
        })

        it('passes locale to hooks', () => {
            renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ locale: 'en_CA' })
            })

            expect(useJPMorganPayment).toHaveBeenCalledWith(
                expect.objectContaining({ locale: 'en_CA' })
            )
        })

        it('passes config.googlePay to usePaymentConfig', () => {
            const googlePayConfig = { gatewayMerchantId: 'custom-merchant' }
            renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ config: { googlePay: googlePayConfig } })
            })

            expect(usePaymentConfig).toHaveBeenCalledWith(
                expect.objectContaining({ googlePayConfigFromProps: googlePayConfig })
            )
        })

        it('uses useAccessToken hook when provided', () => {
            const mockGetTokenWhenReady = jest.fn().mockResolvedValue('token123')
            const mockUseAccessToken = jest.fn().mockReturnValue({
                getTokenWhenReady: mockGetTokenWhenReady,
                token: 'existing-token'
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ useAccessToken: mockUseAccessToken })
            })

            expect(mockUseAccessToken).toHaveBeenCalled()
            expect(result.current.slasToken).toBe('existing-token')
        })

        it('uses useBasketHook when provided', () => {
            const mockBasket = { basketId: 'basket123', orderTotal: 99.99 }
            const mockUseBasketHook = jest.fn().mockReturnValue({ data: mockBasket })

            renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ useBasketHook: mockUseBasketHook })
            })

            expect(mockUseBasketHook).toHaveBeenCalled()
        })

        it('uses basket prop directly when provided', () => {
            const mockBasket = { basketId: 'basket123', orderTotal: 99.99 }

            renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            // The provider should not call useBasketHook
            // and should use the basket prop
            expect(usePaymentMethods).toHaveBeenCalledWith(
                expect.objectContaining({ basketId: 'basket123' })
            )
        })
    })

    describe('storeCardFormData', () => {
        it('stores card form data and clears previous state', () => {
            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            const cardData = {
                cardNumber: '4111111111111111',
                cvv: '123',
                expiryMonth: '12',
                expiryYear: '2025',
                holder: 'John Doe',
                cardType: 'visa'
            }

            act(() => {
                result.current.storeCardFormData(cardData)
            })

            expect(result.current.cardFormData).toEqual(cardData)
            expect(result.current.hasStoredCardData).toBe(true)
            expect(clearTokenFromSession).toHaveBeenCalled()
            expect(clearFraudRuleAction).toHaveBeenCalled()
            expect(clearFraudCart).toHaveBeenCalled()
            expect(clearFraudShipTo).toHaveBeenCalled()
        })

        it('refreshes Kount when fraud check is enabled', async () => {
            const mockRefreshKount = jest.fn().mockResolvedValue('new-session')
            setupMocks({
                kount: { ...defaultKountHook, refreshKount: mockRefreshKount },
                paymentConfig: {
                    ...defaultPaymentConfigHook,
                    fraudConfig: { enableFraudCheck: true, kountClientId: 'kount123', kountEnvironment: 'sandbox' }
                }
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            act(() => {
                result.current.storeCardFormData({ cardNumber: '4111111111111111' })
            })

            await waitFor(() => {
                expect(mockRefreshKount).toHaveBeenCalled()
            })
        })

        it('returns the stored form data', () => {
            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            const cardData = { cardNumber: '4111111111111111' }
            let returnedData

            act(() => {
                returnedData = result.current.storeCardFormData(cardData)
            })

            expect(returnedData).toEqual(cardData)
        })
    })

    describe('encryptCardData', () => {
        it('encrypts card data when PIE is ready', async () => {
            const mockEncrypt = jest.fn().mockReturnValue({
                encryptedCardNumber: 'enc123',
                encryptedCVV: 'enc456',
                integrityCheck: 'check789'
            })
            
            setupMocks({
                payment: { ...defaultPaymentHook, encryptCard: mockEncrypt }
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            // Store card data first
            act(() => {
                result.current.storeCardFormData({
                    cardNumber: '4111111111111111',
                    cvv: '123',
                    expiryMonth: '12',
                    expiryYear: '2025'
                })
            })

            let encryptedData
            await act(async () => {
                encryptedData = await result.current.encryptCardData()
            })

            expect(mockEncrypt).toHaveBeenCalledWith({
                cardNumber: '4111111111111111',
                cvv: '123'
            })
            expect(encryptedData.isEncrypted).toBe(true)
            expect(encryptedData.encryptedCardNumber).toBe('enc123')
        })

        it('returns plain card data when PIE is not ready', async () => {
            setupMocks({
                payment: { ...defaultPaymentHook, isReady: false }
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            act(() => {
                result.current.storeCardFormData({
                    cardNumber: '4111111111111111',
                    cvv: '123',
                    expiryMonth: '12',
                    expiryYear: '2025'
                })
            })

            let encryptedData
            await act(async () => {
                encryptedData = await result.current.encryptCardData()
            })

            expect(encryptedData.isPlain).toBe(true)
            expect(encryptedData.cardNumber).toBe('4111111111111111')
        })

        it('returns null when no card data is stored', async () => {
            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            let encryptedData
            await act(async () => {
                encryptedData = await result.current.encryptCardData()
            })

            expect(encryptedData).toBeNull()
        })

        it('returns null when encryption fails', async () => {
            setupMocks({
                payment: { ...defaultPaymentHook, encryptCard: jest.fn().mockReturnValue(null) }
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            act(() => {
                result.current.storeCardFormData({
                    cardNumber: '4111111111111111',
                    cvv: '123',
                    expiryMonth: '12',
                    expiryYear: '2025'
                })
            })

            let encryptedData
            await act(async () => {
                encryptedData = await result.current.encryptCardData()
            })

            expect(encryptedData).toBeNull()
        })
    })

    describe('verifyAndSavePayment', () => {
        const mockBasket = {
            basketId: 'basket123',
            orderTotal: 99.99,
            currency: 'USD',
            productItems: [{ name: 'Product 1', price: 99.99 }]
        }

        const cardData = {
            cardNumber: '4111111111111111',
            cvv: '123',
            expiryMonth: '12',
            expiryYear: '2025',
            holder: 'John Doe',
            billingAddress: {
                address1: '123 Main St',
                city: 'New York',
                stateCode: 'NY',
                postalCode: '10001',
                countryCode: 'US'
            }
        }

        it('successfully verifies and saves payment', async () => {
            global.fetch.mockResolvedValue({
                json: () => Promise.resolve({
                    success: true,
                    tokenRef: 'tokenRef123'
                })
            })

            const addPaymentFn = jest.fn().mockResolvedValue({
                paymentInstruments: [{ paymentInstrumentId: 'pi123' }]
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            let verifyResult
            await act(async () => {
                verifyResult = await result.current.verifyAndSavePayment(addPaymentFn, cardData)
            })

            expect(verifyResult.success).toBe(true)
            expect(verifyResult.tokenRef).toBe('tokenRef123')
            expect(saveTokenToSession).toHaveBeenCalledWith('tokenRef123', 'basket123')
            expect(addPaymentFn).toHaveBeenCalled()
        })

        it('returns error when no card data provided', async () => {
            const addPaymentFn = jest.fn()

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            let verifyResult
            await act(async () => {
                verifyResult = await result.current.verifyAndSavePayment(addPaymentFn, null)
            })

            expect(verifyResult.success).toBe(false)
            expect(verifyResult.message).toBe("Payment couldn't be processed. Please try again later.")
        })

        it('returns error when addPaymentInstrumentFn is not provided', async () => {
            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            let verifyResult
            await act(async () => {
                verifyResult = await result.current.verifyAndSavePayment(null, cardData)
            })

            expect(verifyResult.success).toBe(false)
            expect(verifyResult.message).toBe("Payment couldn't be processed. Please try again later.")
        })

        it('handles verification API failure', async () => {
            global.fetch.mockResolvedValue({
                json: () => Promise.resolve({
                    success: false,
                    hostMessage: 'Card declined'
                })
            })

            const addPaymentFn = jest.fn()

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            let verifyResult
            await act(async () => {
                verifyResult = await result.current.verifyAndSavePayment(addPaymentFn, cardData)
            })

            expect(verifyResult.success).toBe(false)
            expect(verifyResult.message).toBe("Payment couldn't be processed. Please try again later.")
            expect(addPaymentFn).not.toHaveBeenCalled()
        })

        it('includes Authorization header when getAccessToken available', async () => {
            global.fetch.mockResolvedValue({
                json: () => Promise.resolve({ success: true, token: 'token123' })
            })

            const mockGetTokenWhenReady = jest.fn().mockResolvedValue('bearer-token')
            const mockUseAccessToken = jest.fn().mockReturnValue({
                getTokenWhenReady: mockGetTokenWhenReady
            })

            const addPaymentFn = jest.fn().mockResolvedValue({
                paymentInstruments: [{ paymentInstrumentId: 'pi123' }]
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket, useAccessToken: mockUseAccessToken })
            })

            await act(async () => {
                await result.current.verifyAndSavePayment(addPaymentFn, cardData)
            })

            expect(global.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer bearer-token'
                    })
                })
            )
        })

        it('saves fraud rule action when returned from verify', async () => {
            global.fetch.mockResolvedValue({
                json: () => Promise.resolve({
                    success: true,
                    token: 'token123',
                    fraudRuleAction: 'REVIEW'
                })
            })

            const addPaymentFn = jest.fn().mockResolvedValue({
                paymentInstruments: [{ paymentInstrumentId: 'pi123' }]
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            await act(async () => {
                await result.current.verifyAndSavePayment(addPaymentFn, cardData)
            })

            expect(saveFraudRuleAction).toHaveBeenCalledWith('REVIEW')
        })

        it('persists fraud cart and shipTo data', async () => {
            buildFraudShoppingCart.mockReturnValue([{ name: 'Product', qty: 1 }])
            mapShipToForFraud.mockReturnValue({ city: 'New York' })

            global.fetch.mockResolvedValue({
                json: () => Promise.resolve({ success: true, token: 'token123' })
            })

            const addPaymentFn = jest.fn().mockResolvedValue({
                paymentInstruments: [{ paymentInstrumentId: 'pi123' }]
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            await act(async () => {
                await result.current.verifyAndSavePayment(addPaymentFn, cardData)
            })

            expect(saveFraudCart).toHaveBeenCalled()
            expect(saveFraudShipTo).toHaveBeenCalled()
        })
    })

    describe('authorizePayment', () => {
        const mockBasket = {
            basketId: 'basket123',
            orderTotal: 99.99,
            currency: 'USD'
        }

        it('authorizes with token when available', async () => {
            const mockAuthorize = jest.fn().mockResolvedValue({ success: true })
            
            setupMocks({
                payment: { ...defaultPaymentHook, authorize: mockAuthorize }
            })

            resolvePaymentToken.mockReturnValue({ tokenRef: 'tokenRef123', paymentInstrument: {} })
            buildTokenAuthRequest.mockReturnValue({ tokenRef: 'tokenRef123', amount: 9999 })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            let authResult
            await act(async () => {
                authResult = await result.current.authorizePayment()
            })

            expect(authResult.success).toBe(true)
            expect(buildTokenAuthRequest).toHaveBeenCalled()
            expect(mockAuthorize).toHaveBeenCalled()
        })

        it('encrypts card when no token available', async () => {
            const mockAuthorize = jest.fn().mockResolvedValue({ success: true, transactionId: 'txn123' })
            const mockEncrypt = jest.fn().mockReturnValue({
                encryptedCardNumber: 'enc123',
                encryptedCVV: 'enc456',
                integrityCheck: 'check789'
            })
            
            setupMocks({
                payment: { ...defaultPaymentHook, authorize: mockAuthorize, encryptCard: mockEncrypt }
            })

            resolvePaymentToken.mockReturnValue({ token: null, paymentInstrument: null })
            buildCardAuthRequest.mockReturnValue({ card: { encryptedCardNumber: 'enc123' } })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            // Store card data first
            act(() => {
                result.current.storeCardFormData({
                    cardNumber: '4111111111111111',
                    cvv: '123',
                    expiryMonth: '12',
                    expiryYear: '2025'
                })
            })

            let authResult
            await act(async () => {
                authResult = await result.current.authorizePayment()
            })

            expect(authResult.success).toBe(true)
            expect(buildCardAuthRequest).toHaveBeenCalled()
        })

        it('handles authorization failure', async () => {
            const mockAuthorize = jest.fn().mockResolvedValue({
                success: false,
                errorCode: 'DECLINED',
                message: 'Card declined'
            })
            
            setupMocks({
                payment: { ...defaultPaymentHook, authorize: mockAuthorize }
            })

            resolvePaymentToken.mockReturnValue({ tokenRef: 'tokenRef123', paymentInstrument: {} })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            let authResult
            await act(async () => {
                authResult = await result.current.authorizePayment()
            })

            expect(authResult.success).toBe(false)
            expect(result.current.authorizationError).toEqual({
                code: 'DECLINED',
                message: "Payment couldn't be processed. Please try again later."
            })
        })

        it('throws error when no card data and has saved payment without token', async () => {
            resolvePaymentToken.mockReturnValue({ tokenRef: null, paymentInstrument: { id: 'pi123' } })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            let authResult
            await act(async () => {
                authResult = await result.current.authorizePayment()
            })

            expect(authResult.success).toBe(false)
            expect(authResult.message).toBe("Payment couldn't be processed. Please try again later.")
        })
    })

    describe('authorizeAndPlaceOrder', () => {
        const mockBasket = {
            basketId: 'basket123',
            orderTotal: 99.99,
            currency: 'USD',
            paymentInstruments: [{ paymentInstrumentId: 'pi123', amount: 99.99 }]
        }

        it('creates order then authorizes payment', async () => {
            const mockAuthorize = jest.fn().mockResolvedValue({ success: true })
            const mockConfirm = jest.fn().mockResolvedValue({ success: true })
            
            setupMocks({
                payment: { ...defaultPaymentHook, authorize: mockAuthorize },
                orderConfirm: { ...defaultOrderConfirmHook, confirmOrderServerSide: mockConfirm }
            })

            resolvePaymentToken.mockReturnValue({ tokenRef: 'tokenRef123', paymentInstrument: {} })
            // Make the builder include merchantOrderNumber in its return
            buildTokenAuthRequest.mockReturnValue({ tokenRef: 'tokenRef123', amount: 9999, merchantOrderNumber: 'ORDER123' })

            const createOrderFn = jest.fn().mockResolvedValue({
                orderNo: 'ORDER123',
                paymentInstruments: [{ paymentInstrumentId: 'pi123', amount: 99.99 }]
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            let orderResult
            await act(async () => {
                orderResult = await result.current.authorizeAndPlaceOrder(createOrderFn)
            })

            expect(orderResult.success).toBe(true)
            expect(orderResult.order.orderNo).toBe('ORDER123')
            expect(createOrderFn).toHaveBeenCalled()
            // The buildTokenAuthRequest is called with merchantOrderNumber; verify it was used
            expect(buildTokenAuthRequest).toHaveBeenCalledWith(
                expect.objectContaining({ overrides: expect.objectContaining({ merchantOrderNumber: 'ORDER123' }) })
            )
            expect(mockAuthorize).toHaveBeenCalled()
            expect(mockConfirm).toHaveBeenCalled()
        })

        it('handles order creation failure', async () => {
            const createOrderFn = jest.fn().mockRejectedValue(new Error('Basket empty'))

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            let orderResult
            await act(async () => {
                orderResult = await result.current.authorizeAndPlaceOrder(createOrderFn)
            })

            expect(orderResult.success).toBe(false)
            expect(orderResult.step).toBe('order_creation')
            expect(orderResult.error).toBe("Payment couldn't be processed. Please try again later.")
        })

        it('handles order creation returning no orderNo', async () => {
            const createOrderFn = jest.fn().mockResolvedValue({})

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            let orderResult
            await act(async () => {
                orderResult = await result.current.authorizeAndPlaceOrder(createOrderFn)
            })

            expect(orderResult.success).toBe(false)
            expect(orderResult.step).toBe('order_creation')
            expect(orderResult.error).toBe("Payment couldn't be processed. Please try again later.")
        })

        it('marks order as failed when authorization fails', async () => {
            const mockAuthorize = jest.fn().mockResolvedValue({
                success: false,
                message: "Payment couldn't be processed. Please try again later.",
                errorCode: 'AUTHORIZATION_ERROR'
            })
            const mockFailOrder = jest.fn().mockResolvedValue({ success: true })
            
            setupMocks({
                payment: { ...defaultPaymentHook, authorize: mockAuthorize },
                orderConfirm: { ...defaultOrderConfirmHook, failOrderServerSide: mockFailOrder }
            })

            resolvePaymentToken.mockReturnValue({ tokenRef: 'tokenRef123', paymentInstrument: {} })

            const createOrderFn = jest.fn().mockResolvedValue({ orderNo: 'ORDER123' })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            let orderResult
            await act(async () => {
                orderResult = await result.current.authorizeAndPlaceOrder(createOrderFn)
            })

            expect(orderResult.success).toBe(false)
            expect(orderResult.step).toBe('authorization')
            expect(orderResult.orderNo).toBe('ORDER123')
            expect(mockFailOrder).toHaveBeenCalledWith(
                'ORDER123',
                expect.anything(),
                "Payment couldn't be processed. Please try again later.",
                'AUTHORIZATION_ERROR'
            )
            expect(savePaymentError).toHaveBeenCalled()
        })
    })

    describe('authorizeGooglePay', () => {
        const mockBasket = {
            basketId: 'basket123',
            orderTotal: 99.99,
            currency: 'USD'
        }

        it('requires merchantOrderNumber', async () => {
            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            let gpayResult
            await act(async () => {
                gpayResult = await result.current.authorizeGooglePay({ amount: 99.99 })
            })

            expect(gpayResult.success).toBe(false)
            expect(gpayResult.error).toContain('merchantOrderNumber')
        })

        it('calls initiateGooglePayPayment with correct params', async () => {
            const mockGetPaymentToken = jest.fn().mockResolvedValue({
                success: true,
                token: 'gpay-token'
            })
            
            setupMocks({
                googlePay: { ...defaultGooglePayHook, getPaymentToken: mockGetPaymentToken }
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            await act(async () => {
                await result.current.authorizeGooglePay({
                    amount: 99.99,
                    merchantOrderNumber: 'ORDER123'
                })
            })

            expect(mockGetPaymentToken).toHaveBeenCalledWith(
                expect.objectContaining({
                    amount: 99.99,
                    merchantOrderNumber: 'ORDER123'
                })
            )
        })
    })

    describe('authorizeGooglePayAndPlaceOrder', () => {
        const mockBasket = {
            basketId: 'basket123',
            orderTotal: 99.99,
            currency: 'USD',
            shipments: [{ shippingAddress: { firstName: 'John', city: 'NYC' } }],
            paymentInstruments: [{ paymentInstrumentId: 'pi123' }]
        }

        it('handles full Google Pay flow', async () => {
            const mockGetPaymentToken = jest.fn().mockResolvedValue({
                success: true,
                token: 'gpay-token',
                billingAddress: { name: 'John Doe' },
                email: 'john@example.com'
            })
            const mockAuthorize = jest.fn().mockResolvedValue({
                success: true,
                transactionId: 'txn123'
            })
            const mockConfirm = jest.fn().mockResolvedValue({ success: true })
            
            setupMocks({
                googlePay: { ...defaultGooglePayHook, getPaymentToken: mockGetPaymentToken },
                payment: { ...defaultPaymentHook, authorize: mockAuthorize },
                orderConfirm: { ...defaultOrderConfirmHook, confirmOrderServerSide: mockConfirm }
            })

            const createOrderFn = jest.fn().mockResolvedValue({
                orderNo: 'ORDER123',
                paymentInstruments: [{ paymentInstrumentId: 'pi123', amount: 99.99 }]
            })
            const addPaymentInstrument = jest.fn().mockResolvedValue({})
            const updateBillingAddress = jest.fn().mockResolvedValue({})
            const removePaymentInstrument = jest.fn().mockResolvedValue({})

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({
                    basket: mockBasket,
                    config: {
                        addPaymentInstrumentToBasket: addPaymentInstrument,
                        updateBillingAddressForBasket: updateBillingAddress,
                        removePaymentInstrumentFromBasket: removePaymentInstrument
                    }
                })
            })

            let orderResult
            await act(async () => {
                orderResult = await result.current.authorizeGooglePayAndPlaceOrder(createOrderFn)
            })

            expect(orderResult.success).toBe(true)
            expect(removePaymentInstrument).toHaveBeenCalled()
            expect(addPaymentInstrument).toHaveBeenCalled()
            expect(mockGetPaymentToken).toHaveBeenCalled()
            expect(createOrderFn).toHaveBeenCalled()
            expect(mockAuthorize).toHaveBeenCalledWith(
                expect.objectContaining({
                    googlePayToken: 'gpay-token',
                    paymentMethod: 'googlepay'
                })
            )
        })

        it('handles user cancellation', async () => {
            const mockGetPaymentToken = jest.fn().mockResolvedValue({
                success: false,
                cancelled: true
            })
            
            setupMocks({
                googlePay: { ...defaultGooglePayHook, getPaymentToken: mockGetPaymentToken }
            })

            const createOrderFn = jest.fn()

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            let orderResult
            await act(async () => {
                orderResult = await result.current.authorizeGooglePayAndPlaceOrder(createOrderFn)
            })

            expect(orderResult.success).toBe(false)
            expect(orderResult.cancelled).toBe(true)
            expect(createOrderFn).not.toHaveBeenCalled() // Order not created on cancel
        })

        it('handles callback flow with paymentData (like Apple Pay pattern)', async () => {
            const mockAuthorize = jest.fn().mockResolvedValue({
                success: true,
                transactionId: 'txn123'
            })
            const mockConfirm = jest.fn().mockResolvedValue({ success: true })
            const mockGetPaymentToken = jest.fn()
            
            setupMocks({
                googlePay: { ...defaultGooglePayHook, getPaymentToken: mockGetPaymentToken },
                payment: { ...defaultPaymentHook, authorize: mockAuthorize },
                orderConfirm: { ...defaultOrderConfirmHook, confirmOrderServerSide: mockConfirm }
            })

            const createOrderFn = jest.fn().mockResolvedValue({
                orderNo: 'ORDER456',
                paymentInstruments: [{ paymentInstrumentId: 'pi456', amount: 149.99 }]
            })

            // Simulate paymentData from onPaymentAuthorized callback
            const paymentData = {
                paymentMethodData: {
                    tokenizationData: {
                        token: '{"encryptedMessage":"xyz","ephemeralPublicKey":"abc"}'
                    },
                    info: {
                        billingAddress: {
                            name: 'Jane Doe',
                            address1: '123 Main St',
                            locality: 'San Francisco',
                            administrativeArea: 'CA',
                            postalCode: '94105',
                            countryCode: 'US'
                        }
                    }
                },
                email: 'jane@example.com'
            }

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({})
            })

            let orderResult
            await act(async () => {
                // Call with paymentData (callback flow)
                orderResult = await result.current.authorizeGooglePayAndPlaceOrder(
                    createOrderFn, 
                    paymentData, 
                    { amount: 149.99, currencyCode: 'USD' }
                )
            })

            expect(orderResult.success).toBe(true)
            // Should NOT call getPaymentToken in callback flow (sheet already open)
            expect(mockGetPaymentToken).not.toHaveBeenCalled()
            // Should call createOrderFn
            expect(createOrderFn).toHaveBeenCalled()
            // Should authorize with token from paymentData
            expect(mockAuthorize).toHaveBeenCalledWith(
                expect.objectContaining({
                    googlePayToken: '{"encryptedMessage":"xyz","ephemeralPublicKey":"abc"}',
                    paymentMethod: 'googlepay',
                    amount: 149.99,
                    currency: 'USD',
                    merchantOrderNumber: 'ORDER456'
                })
            )
            // Should confirm order
            expect(mockConfirm).toHaveBeenCalled()
        })

        it('returns error when paymentData missing token', async () => {
            const createOrderFn = jest.fn()
            
            setupMocks({})

            // paymentData without token
            const paymentData = {
                paymentMethodData: {
                    tokenizationData: {}
                },
                email: 'test@example.com'
            }

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({})
            })

            let orderResult
            await act(async () => {
                orderResult = await result.current.authorizeGooglePayAndPlaceOrder(
                    createOrderFn, 
                    paymentData, 
                    { amount: 99.99 }
                )
            })

            expect(orderResult.success).toBe(false)
            expect(orderResult.step).toBe('token_extraction')
            expect(createOrderFn).not.toHaveBeenCalled()
        })

        it('returns error when callback flow missing amount', async () => {
            const createOrderFn = jest.fn()
            
            setupMocks({})

            const paymentData = {
                paymentMethodData: {
                    tokenizationData: {
                        token: '{"test":"token"}'
                    }
                }
            }

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({})
            })

            let orderResult
            await act(async () => {
                // No amount provided in callback flow
                orderResult = await result.current.authorizeGooglePayAndPlaceOrder(
                    createOrderFn, 
                    paymentData, 
                    {} // no amount
                )
            })

            expect(orderResult.success).toBe(false)
            expect(orderResult.step).toBe('validation')
            expect(createOrderFn).not.toHaveBeenCalled()
        })
    })

    describe('authorizeApplePayAndPlaceOrder', () => {
        const mockBasket = {
            basketId: 'basket123',
            orderTotal: 99.99,
            currency: 'USD',
            shipments: [{ shippingAddress: { firstName: 'John', city: 'NYC' } }],
            customerInfo: { email: 'john@example.com' },
            paymentInstruments: [{ paymentInstrumentId: 'pi123' }]
        }

        it('handles user cancellation', async () => {
            const mockInitiatePayment = jest.fn().mockResolvedValue({
                success: false,
                cancelled: true
            })
            
            setupMocks({
                applePay: { ...defaultApplePayHook, initiatePayment: mockInitiatePayment }
            })

            const createOrderFn = jest.fn()

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            let orderResult
            await act(async () => {
                orderResult = await result.current.authorizeApplePayAndPlaceOrder(createOrderFn)
            })

            expect(orderResult.success).toBe(false)
            expect(orderResult.cancelled).toBe(true)
        })

        it('marks order as failed when Apple Pay auth fails', async () => {
            const mockInitiatePayment = jest.fn().mockResolvedValue({
                success: false,
                orderNo: 'ORDER123',
                step: 'authorization',
                error: { message: 'Touch ID failed', code: 'AUTH_FAILED' }
            })
            const mockFailOrder = jest.fn().mockResolvedValue({ success: true })
            
            setupMocks({
                applePay: { ...defaultApplePayHook, initiatePayment: mockInitiatePayment },
                orderConfirm: { ...defaultOrderConfirmHook, failOrderServerSide: mockFailOrder }
            })

            const createOrderFn = jest.fn()

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            await act(async () => {
                await result.current.authorizeApplePayAndPlaceOrder(createOrderFn)
            })

            expect(mockFailOrder).toHaveBeenCalledWith(
                'ORDER123',
                expect.anything(),
                "Payment couldn't be processed. Please try again later.",
                'AUTH_FAILED'
            )
            expect(savePaymentError).toHaveBeenCalled()
        })

        it('confirms order on success', async () => {
            const mockInitiatePayment = jest.fn().mockResolvedValue({
                success: true,
                orderNo: 'ORDER123',
                orderResult: {
                    orderNo: 'ORDER123',
                    paymentInstruments: [{ paymentInstrumentId: 'pi123', amount: 99.99 }]
                },
                data: { transactionId: 'txn123' }
            })
            const mockConfirm = jest.fn().mockResolvedValue({ success: true })
            
            setupMocks({
                applePay: { ...defaultApplePayHook, initiatePayment: mockInitiatePayment },
                orderConfirm: { ...defaultOrderConfirmHook, confirmOrderServerSide: mockConfirm }
            })

            const createOrderFn = jest.fn()

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            let orderResult
            await act(async () => {
                orderResult = await result.current.authorizeApplePayAndPlaceOrder(createOrderFn)
            })

            expect(orderResult.success).toBe(true)
            expect(mockConfirm).toHaveBeenCalled()
        })
    })

    describe('clearCheckoutData', () => {
        it('clears all checkout state', () => {
            const mockResetError = jest.fn()
            const mockResetGooglePay = jest.fn()
            const mockResetApplePay = jest.fn()
            const mockResetOrderConfirm = jest.fn()
            
            setupMocks({
                payment: { ...defaultPaymentHook, resetError: mockResetError },
                googlePay: { ...defaultGooglePayHook, reset: mockResetGooglePay },
                applePay: { ...defaultApplePayHook, reset: mockResetApplePay },
                orderConfirm: { ...defaultOrderConfirmHook, resetOrderConfirm: mockResetOrderConfirm }
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            // Store some data first
            act(() => {
                result.current.storeCardFormData({ cardNumber: '4111111111111111' })
            })

            expect(result.current.cardFormData).toBeTruthy()

            // Clear everything
            act(() => {
                result.current.clearCheckoutData()
            })

            expect(result.current.cardFormData).toBeNull()
            expect(clearTokenFromSession).toHaveBeenCalled()
            expect(clearFraudRuleAction).toHaveBeenCalled()
            expect(mockResetError).toHaveBeenCalled()
            expect(mockResetGooglePay).toHaveBeenCalled()
            expect(mockResetApplePay).toHaveBeenCalled()
            expect(mockResetOrderConfirm).toHaveBeenCalled()
        })
    })

    describe('resetPaymentError', () => {
        it('resets all payment errors', () => {
            const mockResetError = jest.fn()
            const mockResetGooglePayError = jest.fn()
            const mockResetApplePayError = jest.fn()
            
            setupMocks({
                payment: { ...defaultPaymentHook, resetError: mockResetError },
                googlePay: { ...defaultGooglePayHook, resetError: mockResetGooglePayError },
                applePay: { ...defaultApplePayHook, resetError: mockResetApplePayError }
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            act(() => {
                result.current.resetPaymentError()
            })

            expect(mockResetError).toHaveBeenCalled()
            expect(mockResetGooglePayError).toHaveBeenCalled()
            expect(mockResetApplePayError).toHaveBeenCalled()
        })
    })

    describe('hasSavedPaymentWithToken', () => {
        it('returns false when no payment instrument', () => {
            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: { basketId: 'basket123' } })
            })

            expect(result.current.hasSavedPaymentWithToken()).toBe(false)
        })

        it('returns true when payment instrument has token', () => {
            const mockBasket = {
                basketId: 'basket123',
                paymentInstruments: [{
                    paymentMethodId: 'CREDIT_CARD',
                    paymentCard: { creditCardToken: 'token123' }
                }]
            }

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            expect(result.current.hasSavedPaymentWithToken()).toBe(true)
        })

        it('returns true when token in session storage', () => {
            getTokenFromSession.mockReturnValue('session-token')

            const mockBasket = {
                basketId: 'basket123',
                paymentInstruments: [{ paymentMethodId: 'CREDIT_CARD' }]
            }

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({ basket: mockBasket })
            })

            expect(result.current.hasSavedPaymentWithToken()).toBe(true)
        })
    })

    describe('isReadyForPlaceOrder', () => {
        it('returns true when card data is stored', () => {
            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            act(() => {
                result.current.storeCardFormData({ cardNumber: '4111111111111111' })
            })

            expect(result.current.isReadyForPlaceOrder()).toBe(true)
        })

        it('returns false when no card data', () => {
            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            expect(result.current.isReadyForPlaceOrder()).toBe(false)
        })
    })

    describe('computed properties', () => {
        it('aggregates processing state', () => {
            setupMocks({
                payment: { ...defaultPaymentHook, isProcessing: true }
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            expect(result.current.isProcessing).toBe(true)
        })

        it('aggregates errors', () => {
            setupMocks({
                googlePay: { ...defaultGooglePayHook, error: 'Google Pay failed' }
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            expect(result.current.error).toBe('Google Pay failed')
            expect(result.current.paymentError).toBe('Google Pay failed')
        })

        it('exposes payment method flags', () => {
            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            expect(result.current.isCreditCardEnabled).toBe(true)
            expect(result.current.isGooglePayEnabled).toBe(true)
            expect(result.current.isApplePayEnabled).toBe(true)
        })

        it('exposes payment method IDs', () => {
            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            expect(result.current.googlePayPaymentMethodId).toBe('DW_GOOGLEPAY')
            expect(result.current.creditCardPaymentMethodId).toBe('CREDIT_CARD')
            expect(result.current.applePayPaymentMethodId).toBe('DW_APPLE_PAY')
        })
    })

    describe('billingAddress', () => {
        it('can set and get billing address', () => {
            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            act(() => {
                result.current.setBillingAddress({
                    address1: '123 Main St',
                    city: 'New York',
                    stateCode: 'NY'
                })
            })

            expect(result.current.billingAddress).toEqual({
                address1: '123 Main St',
                city: 'New York',
                stateCode: 'NY'
            })
        })
    })

    describe('selectedPaymentMethodId', () => {
        it('defaults to CREDIT_CARD', () => {
            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            expect(result.current.selectedPaymentMethodId).toBe('CREDIT_CARD')
        })

        it('can be changed', () => {
            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            act(() => {
                result.current.setSelectedPaymentMethodId('DW_GOOGLEPAY')
            })

            expect(result.current.selectedPaymentMethodId).toBe('DW_GOOGLEPAY')
        })
    })

    describe('Kount integration', () => {
        it('exposes Kount session ID', () => {
            setupMocks({
                kount: { ...defaultKountHook, kountSessionId: 'kount-123' }
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            expect(result.current.kountSessionId).toBe('kount-123')
        })

        it('exposes refreshKount', () => {
            const mockRefreshKount = jest.fn().mockResolvedValue('new-session')
            setupMocks({
                kount: { ...defaultKountHook, refreshKount: mockRefreshKount }
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            expect(result.current.refreshKount).toBe(mockRefreshKount)
        })

        it('exposes isKountCollectionComplete', () => {
            setupMocks({
                kount: { ...defaultKountHook, isCollectionComplete: true }
            })

            const { result } = renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper()
            })

            expect(result.current.isKountCollectionComplete).toBe(true)
        })
    })

    describe('Apple Pay config passthrough', () => {
        it('passes Apple Pay shipping callbacks to useApplePay', () => {
            const onShippingContactSelected = jest.fn()
            const onShippingMethodSelected = jest.fn()
            const shippingMethods = [{ label: 'Standard', amount: '5.00' }]

            renderHook(() => useJPMCCheckout(), {
                wrapper: createWrapper({
                    config: {
                        onApplePayShippingContactSelected: onShippingContactSelected,
                        onApplePayShippingMethodSelected: onShippingMethodSelected,
                        applePayShippingMethods: shippingMethods
                    }
                })
            })

            expect(useApplePay).toHaveBeenCalledWith(
                expect.objectContaining({
                    onShippingContactSelected,
                    onShippingMethodSelected
                })
            )
        })
    })
})
