/**
 * JPMC Checkout Provider
 * 
 * A React context provider that handles the complete JP Morgan payment flow.
 * This provider:
 * 1. Initializes PIE SDK for card encryption
 * 2. Stores card data between checkout steps
 * 3. Intercepts place order to authorize payment first
 * 4. Handles verification (when API available)
 * 
 * Usage:
 * ```jsx
 * import { JPMCCheckoutProvider } from '@jpmorgan/jpmorgan-salesforce-pwa/client'
 * 
 * <JPMCCheckoutProvider>
 *   <YourCheckoutComponent />
 * </JPMCCheckoutProvider>
 * ```
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/client/context
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import PropTypes from 'prop-types'
// Note: useCurrentBasket is imported from PWA Kit at runtime - must be passed as prop or use dynamic import
import { useJPMorganPayment } from '../../hooks/useJPMorganPayment'
import { useGooglePay } from '../../hooks/useGooglePay'
import { useApplePay } from '../../hooks/useApplePay'
import useKount from '../../hooks/useKount'
import { useThreeDS } from '../../hooks/useThreeDS'
import { collectBrowserInfo } from '../../utils/browser-info'
import ThreeDSModal from '../components/ThreeDSModal'
import { requires3DSAuthentication } from '../../services/api/helpers/threeds-helpers'

// Internal context hooks (extracted for modularity)
import { usePaymentMethods, usePaymentConfig, useOrderConfirm } from './hooks'

// Session storage utilities (extracted to separate module for reusability)
import {
    saveTokenToSession,
    getTokenFromSession,
    clearTokenFromSession,
    saveFraudRuleAction,
    clearFraudRuleAction,
    saveFraudCart,
    clearFraudCart,
    saveFraudShipTo,
    clearFraudShipTo,
    savePaymentError,
    saveCardTypeName,
    saveCardType
} from './utils/session-storage'

// Fraud check payload builders (extracted to separate module for reusability)
import { buildFraudShoppingCart, mapShipToForFraud } from './utils/fraud-helpers'

// Generic error message for all user-facing errors
import { GENERIC_API_ERROR_MESSAGE } from '../../utils/constants/error-constants'

// Request builder utilities (reduce code duplication in auth flows)
import {
    resolvePaymentToken,
    buildTokenAuthRequest,
    buildCardAuthRequest,
    isCardMasked
} from './utils/request-builders'

// Verification helper utilities (shared with useVerifyPayment hook)
import {
    encryptCardForVerification,
    buildVerifyRequest,
    callVerificationApi,
    processVerificationSuccess,
    persistFraudData,
    buildVerificationHeaders
} from './utils/verification-helpers'

// Basket helper utilities for checkout page Google Pay flows
import { prepareBasketForOrder } from './utils/basket-helpers'

// Basket utilities for display items (client-safe)
import { buildDisplayItemsFromBasket } from '../utils/display-items'

// Order patching is handled server-side via registerJPMCEndpoints

// =============================================================================
// Helper Functions (extracted to reduce cognitive complexity)
// =============================================================================

/**
 * Handle Google Pay authorization failure
 * @private
 */
const handleGooglePayAuthFailure = async ({ 
    orderNo, authResult, failOrderServerSide,
    failOrderWithReopenBasket, commerceConfig, refetchBasket
}) => {
    const errorCode = authResult.errorCode || 'AUTH_FAILED'
    
    // Try to reopen basket first
    if (failOrderWithReopenBasket && commerceConfig) {
        const { proxy, organizationId, siteId } = commerceConfig
        if (proxy && organizationId && siteId) {
            const reopenResult = await failOrderWithReopenBasket({
                orderNo,
                reasonCode: 'payment_auth_failure',
                proxy,
                organizationId,
                siteId
            })
            
            if (reopenResult.basketReopened) {
                await refetchBasket?.()
                return {
                    success: false,
                    step: 'authorization',
                    error: GENERIC_API_ERROR_MESSAGE,
                    orderNo: orderNo,
                    basketReopened: true,
                    basketId: reopenResult.basketId
                }
            }
        }
    }
    
    // Fallback: original behavior
    await failOrderServerSide(orderNo, authResult, GENERIC_API_ERROR_MESSAGE, errorCode)
    
    savePaymentError({
        message: GENERIC_API_ERROR_MESSAGE,
        orderNo: orderNo,
        step: 'authorization',
        code: errorCode
    })
    
    return {
        success: false,
        step: 'authorization',
        error: GENERIC_API_ERROR_MESSAGE,
        orderNo: orderNo
    }
}

/**
 * Build token failure result for Google Pay flow
 * @private
 */
const buildTokenFailureResult = (tokenResult) => {
    const wasCancelled = tokenResult.cancelled || tokenResult.error?.code === 'PAYMENT_CANCELLED'
    const errorMessage = wasCancelled ? null : GENERIC_API_ERROR_MESSAGE
    return { success: false, step: 'token_collection', error: errorMessage, cancelled: wasCancelled, wasCancelled, tokenResult }
}

/**
 * Update state after Google Pay authorization
 * @private
 */
const updateGooglePayAuthState = ({ authResult, mountedRef, setGooglePayResult, setAuthorizationResult, setAuthorizationError }) => {
    if (!mountedRef.current) return
    setGooglePayResult(authResult)
    if (authResult.success) {
        setAuthorizationResult(authResult)
    } else {
        setAuthorizationError(GENERIC_API_ERROR_MESSAGE)
    }
}

/**
 * Build authorization request based on available data (token or encrypted card)
 * @private
 */
async function buildAuthorizationRequest({
    tokenRef, paymentInstrument, encryptedCardData, encryptCardData,
    basket, billingAddress, currentCardData, paymentConfig, kountSessionId, options
}) {
    const hasUnmaskedCard = currentCardData && !isCardMasked(currentCardData)
    
    if (hasUnmaskedCard) {
        let cardDataToEncrypt = encryptedCardData
        if (!cardDataToEncrypt) {
            cardDataToEncrypt = await encryptCardData()
        }
        if (cardDataToEncrypt) {
            return buildCardAuthRequest({
                encryptedCardData: cardDataToEncrypt, basket, billingAddress,
                cardData: currentCardData, paymentConfig, kountSessionId, overrides: options
            })
        }
    }
    
    if (tokenRef) {
        return buildTokenAuthRequest({
            tokenRef, basket, billingAddress, cardData: currentCardData,
            paymentConfig, kountSessionId, overrides: options
        })
    }
    
    throw new Error(paymentInstrument 
        ? 'Saved payment found but token is missing. Please re-enter your card details.'
        : 'No card data available. Please enter your card details.')
}

/**
 * Extract payment data from Google Pay callback flow
 * @private
 */
function extractGooglePayCallbackData(paymentData, options) {
    const tokenString = paymentData.paymentMethodData?.tokenizationData?.token
    if (!tokenString) {
        return { success: false, step: 'token_extraction', error: 'Payment token not found in paymentData' }
    }
    
    const orderTotal = options.amount || options.orderTotal
    if (!orderTotal) {
        return { success: false, step: 'validation', error: 'Amount is required for callback flow - pass options.amount' }
    }
    
    const currencyCode = options.currencyCode || options.currency
    if (!currencyCode) {
        throw new Error('Currency could not be determined from options. Ensure currencyCode or currency is provided.')
    }

    return {
        success: true,
        googlePayToken: tokenString,
        billingAddress: paymentData.paymentMethodData?.info?.billingAddress,
        email: paymentData.email,
        orderTotal,
        currencyCode
    }
}

/**
 * Process Google Pay checkout flow (open sheet and collect token)
 * @private
 */
async function processGooglePayCheckoutFlow({
    basket, addPaymentInstrumentToBasket, removePaymentInstrumentFromBasket,
    updateBillingAddressForBasket, googlePayPaymentMethodId,
    initiateGooglePayPayment, options, mountedRef, setGooglePayResult, setAuthorizationError
}) {
    let addedPaymentInstrumentId = null
    
    // Step 1: Prepare basket for order creation
    if (basket && addPaymentInstrumentToBasket) {
        const prepResult = await prepareBasketForOrder({
            basket, addPaymentInstrumentToBasket, removePaymentInstrumentFromBasket,
            updateBillingAddressForBasket, googlePayPaymentMethodId
        }).catch(err => ({ error: GENERIC_API_ERROR_MESSAGE }))
        
        if (prepResult?.error) {
            return { success: false, step: 'basket_preparation', error: GENERIC_API_ERROR_MESSAGE }
        }
        addedPaymentInstrumentId = prepResult
    }
    
    // Step 2: Get Google Pay token
    const orderTotal = options.amount || basket?.orderTotal || basket?.productTotal
    const currencyCode = options.currencyCode || options.currency || basket?.currency
    
    const tokenResult = await initiateGooglePayPayment({
        amount: orderTotal, currencyCode, displayItems: buildDisplayItemsFromBasket(basket, currencyCode)
    })
    
    if (!tokenResult.success) {
        return await handleCheckoutFlowTokenFailure({
            tokenResult, addedPaymentInstrumentId,
            removePaymentInstrumentFromBasket, basket,
            mountedRef, setGooglePayResult, setAuthorizationError
        })
    }
    
    return {
        success: true,
        googlePayToken: tokenResult.token,
        billingAddress: tokenResult.billingAddress,
        email: tokenResult.email,
        orderTotal,
        currencyCode
    }
}

/**
 * Handle token collection failure in checkout flow
 * @private
 */
async function handleCheckoutFlowTokenFailure({
    tokenResult, addedPaymentInstrumentId,
    removePaymentInstrumentFromBasket, basket,
    mountedRef, setGooglePayResult, setAuthorizationError
}) {
    const failureResult = buildTokenFailureResult(tokenResult)
    
    // Cleanup payment instrument if user cancelled
    if (failureResult.cancelled && addedPaymentInstrumentId && removePaymentInstrumentFromBasket) {
        try {
            await removePaymentInstrumentFromBasket({
                parameters: { basketId: basket.basketId, paymentInstrumentId: addedPaymentInstrumentId }
            })
        } catch (cleanupErr) {
            console.warn('[JPMC] Failed to cleanup payment instrument after cancel:', cleanupErr)
        }
    }
    
    if (mountedRef.current) {
        setGooglePayResult(tokenResult)
        if (!failureResult.wasCancelled && tokenResult.error) {
            setAuthorizationError(GENERIC_API_ERROR_MESSAGE)
        }
    }
    
    return { success: false, step: 'token_collection', error: failureResult.error, cancelled: failureResult.cancelled }
}

/**
 * Handle Apple Pay authorization failure with basket reopen
 * @private
 */
async function handleApplePayAuthFailure({
    orderNo, error, failedStep, failOrderWithReopenBasket,
    commerceConfig, refetchBasket, failOrderServerSide, authResult
}) {
    // Try to reopen basket first
    if (failOrderWithReopenBasket && commerceConfig) {
        const { proxy, organizationId, siteId } = commerceConfig
        if (proxy && organizationId && siteId) {
            const reopenResult = await failOrderWithReopenBasket({
                orderNo,
                reasonCode: 'payment_auth_failure',
                proxy,
                organizationId,
                siteId
            })
            
            if (reopenResult.basketReopened) {
                await refetchBasket?.()
                return { 
                    success: false, 
                    step: failedStep, 
                    error, 
                    orderNo,
                    basketReopened: true,
                    basketId: reopenResult.basketId
                }
            }
        }
    }
    
    // Fallback: original behavior
    await failOrderServerSide(
        orderNo,
        authResult || {},
        GENERIC_API_ERROR_MESSAGE,
        error?.code || 'AUTH_FAILED'
    )
    savePaymentError({
        message: GENERIC_API_ERROR_MESSAGE,
        orderNo,
        step: failedStep || 'authorization',
        code: error?.code || 'AUTH_FAILED'
    })
    return { success: false, step: failedStep, error: GENERIC_API_ERROR_MESSAGE, orderNo }
}

// =============================================================================
// Context
// =============================================================================

const JPMCCheckoutContext = createContext(null)

// =============================================================================
// Provider
// =============================================================================

/**
 * JPMC Checkout Provider
 * 
 * Wraps checkout to provide JPMC payment state and methods.
 * 
 * @param {object} props
 * @param {React.ReactNode} props.children - Child components
 * @param {object} props.config - Optional configuration overrides
 * @param {object} props.config.googlePay - Google Pay configuration (gatewayMerchantId, merchantName, etc.)
 * @param {function} props.useBasketHook - Hook function to get current basket (from @salesforce/retail-react-app)
 * @param {function} props.useAccessToken - Hook to get SLAS access token (from @salesforce/commerce-sdk-react)
 * @param {object} props.basket - Alternatively, pass basket data directly
 * @param {string} props.locale - Locale ID for multi-MID support (e.g., 'en_CA', 'fr_FR'). Auto-detected from PWA Kit useMultiSite().
 * @param {object} props.commerceConfig - Commerce SDK config for SCAPI calls { proxy, organizationId, siteId }
 */
export function JPMCCheckoutProvider({ children, config = {}, useBasketHook, useAccessToken, basket: basketProp, locale, defaultLocale, currency: currencyProp, commerceConfig }) {
    
    // ==========================================================================
    // SLAS Token Access - For API calls that need shopper authentication
    // ==========================================================================
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const accessTokenHook = useAccessToken ? useAccessToken() : null
    const getAccessToken = accessTokenHook?.getTokenWhenReady
    
    // ==========================================================================
    // Payment Config (auto-fetched via extracted hook)
    // ==========================================================================
    
    const {
        fraudConfig,
        kountEnabled,
        googlePayConfig,
        applePayConfig,
        isLoadingGooglePayConfig: _isLoadingGooglePayConfig // eslint-disable-line no-unused-vars
    } = usePaymentConfig({
        googlePayConfigFromProps: config.googlePay,
        locale,
        getAccessToken
    })
    
    // ==========================================================================
    // Basket Mutations (for Google Pay flow)
    // ==========================================================================
    
    // These are passed from the checkout page to handle basket preparation
    // before order creation (add payment instrument, set billing address)
    const addPaymentInstrumentToBasket = config.addPaymentInstrumentToBasket
    const updateBillingAddressForBasket = config.updateBillingAddressForBasket
    const removePaymentInstrumentFromBasket = config.removePaymentInstrumentFromBasket

    // ==========================================================================
    // Apple Pay Shipping Config
    // ==========================================================================

    // Optional callbacks for Apple Pay express checkout shipping:
    // - onApplePayShippingContactSelected(shippingContact) → Promise<{ newTotal, newLineItems?, newShippingMethods? }>
    // - onApplePayShippingMethodSelected(shippingMethod)   → Promise<{ newTotal, newLineItems? }>
    // - applePayShippingMethods: initial list of ApplePayShippingMethod objects for the payment sheet
    const onApplePayShippingContactSelected = config.onApplePayShippingContactSelected
    const onApplePayShippingMethodSelected = config.onApplePayShippingMethodSelected
    const applePayShippingMethods = config.applePayShippingMethods || []
    const onApplePayPaymentMethodSelectedFromConfig = config.onApplePayPaymentMethodSelected
    // When false (cart express checkout), do NOT pre-populate the Apple Pay sheet from basket data —
    // Apple Pay will use contacts from the user's wallet instead.
    // When true (checkout page), pre-populate from the shipping address already entered in the form.
    const applePayPrePopulateContactFromBasket = config.applePayPrePopulateContactFromBasket !== false
    // When false (checkout page), suppress the shipping address section in the Apple Pay sheet.
    // The address was already collected on the storefront — no need to ask again.
    // When true (cart express checkout), show the section so the user picks from their wallet.
    const applePayShippingAddressRequired = config.applePayShippingAddressRequired !== false

    // Stores the billing contact captured from onpaymentmethodselected (fires before Touch ID).
    // Used in prepareBasketAndCreateOrder so the basket has the correct billing address
    // before SFCC order creation — avoiding the "set billing = shipping" placeholder fallback.
    const applePayBillingContactRef = useRef(null)

    // ==========================================================================
    // Helpers
    // ==========================================================================

    /**
     * Convert an SFCC shipping address + customer email to Apple Pay contact format.
     * Used to pre-populate the Apple Pay payment sheet with data already entered on
     * the storefront, so the user doesn't have to re-enter it.
     *
     * Apple Pay countryCode must be lowercase alpha-2 (e.g. 'us', 'gb').
     * SFCC uses uppercase ('US', 'GB') — converted here.
     */
    const mapSFCCToApplePayContact = (address, email) => {
        if (!address) return undefined
        const contact = {}
        if (address.firstName) contact.givenName = address.firstName
        if (address.lastName) contact.familyName = address.lastName
        const lines = [address.address1, address.address2].filter(Boolean)
        if (lines.length > 0) contact.addressLines = lines
        if (address.city) contact.locality = address.city
        if (address.stateCode) contact.administrativeArea = address.stateCode
        if (address.postalCode) contact.postalCode = address.postalCode
        if (address.countryCode) contact.countryCode = address.countryCode.toLowerCase()
        if (address.phone) contact.phoneNumber = address.phone
        if (email) contact.emailAddress = email
        // Return undefined if we only got an empty object (no address at all)
        return Object.keys(contact).length > 0 ? contact : undefined
    }

    /**
     * Build Apple Pay line items array from an SFCC basket.
     * Returns [Subtotal, Shipping, Tax] so the payment sheet shows a full breakdown.
     * Any field that is null/undefined is omitted so the sheet stays clean when
     * shipping hasn't been selected yet.
     */
    const buildApplePayLineItems = (b) => {
        if (!b) return []
        const items = []
        const subtotal = b.productSubTotal ?? b.productTotal
        if (subtotal != null) items.push({ label: 'Subtotal', amount: String(subtotal), type: 'final' })
        if (b.shippingTotal != null) items.push({ label: 'Shipping', amount: String(b.shippingTotal), type: 'final' })
        if (b.taxTotal != null) items.push({ label: 'Tax', amount: String(b.taxTotal), type: 'final' })
        if (b.orderPriceAdjustments && b.orderPriceAdjustments.length > 0) {
            const totalDiscount = b.orderPriceAdjustments.reduce((sum, adj) => sum + (adj.price ?? 0), 0)
            if (totalDiscount !== 0) items.push({ label: 'Discounts', amount: String(totalDiscount), type: 'final' })
        }
        return items
    }

    // ==========================================================================
    // Hooks
    // ==========================================================================
    
    // Get basket from hook result or prop
    // Note: useBasketHook should return the hook result, not be a hook itself
    // The parent passes: useBasketHook={() => useCurrentBasket()}
    // So useBasketHook is just a function, not a hook - it's called like a function
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const basketHookResult = useBasketHook ? useBasketHook() : null
    const basket = basketProp || basketHookResult?.data || basketHookResult
    const refetchBasket = basketHookResult?.refetch // For re-fetching basket after reopen
    
    
    // JPMC Payment hook - handles PIE SDK and authorization
    const {
        isReady: isPIEReady,
        isLoading: isPIELoading,
        isProcessing,
        error: pieError,
        authorize,
        encryptCard: pieEncrypt,
        resetError,
        config: paymentConfig // Contains captureMethod from BM
    } = useJPMorganPayment({ locale, getAccessToken })
    
    // Google Pay hook - handles Google Pay integration
    // Only initializes if config is provided, otherwise stays in non-ready state
    const {
        isReady: isGooglePayReady,
        isAvailable: isGooglePayAvailable,
        isLoading: isGooglePayLoading,
        isProcessing: isGooglePayProcessing,
        error: googlePayError,
        getPaymentToken: initiateGooglePayPayment,
        reset: resetGooglePay,
        resetError: resetGooglePayError
    } = useGooglePay(googlePayConfig.gatewayMerchantId ? googlePayConfig : {})

    // ==========================================================================
    // Apple Pay Hook
    // ==========================================================================

    // Derive allowed shipping countries from the current locale (e.g. 'en-CA' → ['CA']).
    // This ensures Canadian customers are not blocked by the default ['US'] restriction
    // even when both locales share the same Apple Pay config in Site Preferences.
    const applePayAllowedShippingCountries = (() => {
        if (locale) {
            const parts = locale.split(/[-_]/)
            const country = parts[1]?.toUpperCase()
            if (country) return [country]
        }
        return [applePayConfig.countryCode || 'US']
    })()

    const {
        isAvailable: isApplePayAvailable,
        isProcessing: isApplePayProcessing,
        error: applePayError,
        initiatePayment: initiateApplePayPayment,
        reset: resetApplePay,
        resetError: resetApplePayError
    } = useApplePay({
        merchantId: applePayConfig.merchantId,
        merchantName: applePayConfig.merchantName,
        countryCode: applePayConfig.countryCode || 'US',
        currencyCode: currencyProp || basket?.currency,
        supportedNetworks: applePayConfig.supportedNetworks,
        merchantCapabilities: applePayConfig.merchantCapabilities,
        billingAddressRequired: true,
        shippingAddressRequired: applePayShippingAddressRequired,
        emailRequired: true,
        phoneRequired: true,
        allowedShippingCountries: applePayAllowedShippingCountries,
        locale,
        getAccessToken,
        onShippingContactSelected: onApplePayShippingContactSelected,
        onShippingMethodSelected: onApplePayShippingMethodSelected,
        // onpaymentmethodselected fires when the user selects/changes their card — BEFORE Touch ID.
        // We capture billingContact from the card and update the SFCC basket billing address here
        // so it is correct before order creation runs inside onpaymentauthorized.
        onPaymentMethodSelected: async (paymentMethod) => {
            const billingContact = paymentMethod?.billingContact
            if (billingContact) {
                // Cache for use in prepareBasketAndCreateOrder
                applePayBillingContactRef.current = billingContact

                // Eagerly update SFCC basket billing address so taxes/totals are accurate
                if (updateBillingAddressForBasket && basket?.basketId) {
                    try {
                        await updateBillingAddressForBasket({
                            parameters: { basketId: basket.basketId },
                            body: {
                                firstName: billingContact.givenName || '',
                                lastName: billingContact.familyName || '',
                                address1: billingContact.addressLines?.[0] || '',
                                address2: billingContact.addressLines?.[1] || '',
                                city: billingContact.locality || '',
                                stateCode: billingContact.administrativeArea || '',
                                postalCode: billingContact.postalCode || '',
                                countryCode: (billingContact.countryCode || '').toUpperCase(),
                                phone: billingContact.phoneNumber || ''
                            }
                        })
                    } catch (_err) {
                        // best-effort: billing address update is non-blocking
                    }
                }
            }

            // Allow caller to override with their own handler
            if (onApplePayPaymentMethodSelectedFromConfig) {
                return onApplePayPaymentMethodSelectedFromConfig(paymentMethod)
            }

            // Default: return current basket total so the sheet stays accurate after
            // onshippingcontactselected / onshippingmethodselected have already
            // updated the total. Without this, the sheet reverts to the original
            // pre-shipping total from paymentRequest.total when the user changes card.
            if (basket?.orderTotal) {
                return {
                    newTotal: {
                        label: 'Total',
                        amount: String(basket.orderTotal),
                        type: 'final'
                    },
                    newLineItems: buildApplePayLineItems(basket)
                }
            }

            return undefined // useApplePay falls back to paymentRequest.total when undefined
        }
    })


    const { kountSessionId, isCollectionComplete: isKountCollectionComplete, refreshKount } = useKount({
        clientId: fraudConfig.kountClientId,
        environment: fraudConfig.kountEnvironment,
        enabled: kountEnabled
    })


    // Ref that always reflects the latest kountSessionId regardless of closure age.
    // verifyAndSavePayment / authorizePayment are useCallbacks with limited dep arrays,
    // so reading from a ref avoids the stale-closure issue where kountSessionId is null.
    // (kountSessionId is the Safetech Fraud device fingerprinting session ID)
    const kountSessionIdRef = useRef(kountSessionId)
    kountSessionIdRef.current = kountSessionId

    // ==========================================================================
    // Payment Methods (auto-fetched via extracted hook)
    // ==========================================================================
    
    const {
        activePaymentMethods,
        googlePayPaymentMethodId,
        creditCardPaymentMethodId,
        applePayPaymentMethodId,
        isCreditCardEnabled,
        isGooglePayEnabled,
        isApplePayEnabled,
        isLoading: isLoadingPaymentMethods
    } = usePaymentMethods({
        basketId: basket?.basketId,
        getAccessToken,
        isGooglePayReady,
        isGooglePayAvailable,
        isApplePayAvailable,
        locale,
        defaultLocale
    })

    // ==========================================================================
    // Order Confirmation (extracted hook)
    // ==========================================================================
    
    const {
        orderConfirmResult,
        isConfirmingOrder,
        confirmOrderServerSide,
        failOrderServerSide,
        failOrderWithReopenBasket,
        resetOrderConfirm,
        isOrderConfirmed
    } = useOrderConfirm({ locale, getAccessToken })

    
    // ==========================================================================
    // State
    // ==========================================================================
    
    // Card form data (plain text from payment form)
    const [cardFormData, setCardFormData] = useState(null)
    
    // Encrypted card data (after PIE encryption)
    const [encryptedCardData, setEncryptedCardData] = useState(null)
    
    // Billing address for authorization
    const [billingAddress, setBillingAddress] = useState(null)
    
    // Authorization result
    const [authorizationResult, setAuthorizationResult] = useState(null)
    const [isAuthorizing, setIsAuthorizing] = useState(false)
    const [authorizationError, setAuthorizationError] = useState(null)
    
    // Verification (placeholder for future)
    const [verificationResult, setVerificationResult] = useState(null)
    const [isVerifying, setIsVerifying] = useState(false)
    const [verificationError, setVerificationError] = useState(null)
    
    // Google Pay result
    const [googlePayResult, setGooglePayResult] = useState(null)
    
    // Payment instrument ID - stored when addPaymentInstrumentToBasket returns
    const [_savedPaymentInstrumentId, setSavedPaymentInstrumentId] = useState(null)
    const savedPaymentInstrumentIdRef = useRef(null)
    
    // Selected payment method (CREDIT_CARD, GOOGLE_PAY, etc.)
    const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState('CREDIT_CARD')
    
    // 3DS callback refs - will be set by useJPMCPlaceOrder via context
    const threeDSCallbacksRef = useRef({
        onSuccess: null,
        onDenied: null,
        onError: null,
        onCancel: null,
        onTimeout: null,
        fail3DSOrderFn: null
    })
    
    // 3DS hook - manages modal state and orchestration
    // Callbacks are routed through refs so useJPMCPlaceOrder can set them
    const {
        isModalOpen: isThreeDSModalOpen,
        isModalVisible: isThreeDSModalVisible,
        iframeName: threeDSIframeName,
        initiateOrchestration,
        handleCancel: threeDSHandleCancel,
        setIframeRef: setThreeDSIframeRef
    } = useThreeDS({
        onSuccess: (data) => threeDSCallbacksRef.current.onSuccess?.(data),
        onDenied: (data) => threeDSCallbacksRef.current.onDenied?.(data),
        onError: (data) => threeDSCallbacksRef.current.onError?.(data),
        onCancel: () => threeDSCallbacksRef.current.onCancel?.(),
        onTimeout: (data) => threeDSCallbacksRef.current.onTimeout?.(data),
        fail3DSOrderFn: (...args) => threeDSCallbacksRef.current.fail3DSOrderFn?.(...args)
    })
    
    // Function to register 3DS callbacks from useJPMCPlaceOrder
    const registerThreeDSCallbacks = useCallback((callbacks) => {
        threeDSCallbacksRef.current = callbacks
    }, [])
    
    // Refs
    const mountedRef = useRef(true)
    
    // Cleanup on unmount
    useEffect(() => {
        return () => {
            mountedRef.current = false
        }
    }, [])
    
    // ==========================================================================
    // Card Data Methods
    // ==========================================================================
    
    // Ref to store card data for immediate access (avoids state timing issues)
    const cardFormDataRef = useRef(null)
    
    /**
     * Store card form data from payment step
     * Called when user submits payment form
     * 
     * @param {object} formData - { cardNumber, cvv, expiryMonth, expiryYear, holder, cardType }
     * @returns {object} The stored form data (for immediate use)
     */
    const storeCardFormData = useCallback((formData) => {
        cardFormDataRef.current = formData  // Ref for immediate access
        setCardFormData(formData)           // State for React updates
        // Clear previous encrypted/auth data when card changes
        setEncryptedCardData(null)
        setAuthorizationResult(null)
        setVerificationResult(null)
        setVerificationError(null)
        // Clear any previous token and fraud state from sessionStorage to ensure fresh verification
        clearTokenFromSession()
        clearFraudRuleAction()
        clearFraudCart()
        clearFraudShipTo()
        // Refresh Safetech Fraud so device data is collected under a fresh session ID.
        if (fraudConfig.enableFraudCheck && !!fraudConfig.kountClientId) {
            refreshKount().then((_newSessionId) => {
                // Session ID captured in hook state
            }).catch(() => { /* Refresh failure is non-blocking */ })
        }
        return formData  // Return for immediate use
    }, [fraudConfig.enableFraudCheck, fraudConfig.kountClientId, refreshKount])
    
    /**
     * Encrypt card data using PIE SDK
     * Should be called on Review step before Place Order
     * 
     * @returns {object|null} Encrypted card data or null on error
     */
    const encryptCardData = useCallback(async () => {
        
        // Use ref for immediate access (state may not be updated yet)
        const currentCardData = cardFormDataRef.current || cardFormData
        
        if (!currentCardData) {
            return null
        }
        
        
        if (!isPIEReady) {
            // Return plain card data for mock/test environments
            return {
                cardNumber: currentCardData.cardNumber,
                cvv: currentCardData.cvv,
                expiryMonth: currentCardData.expiryMonth,
                expiryYear: currentCardData.expiryYear,
                isPlain: true
            }
        }
        
        try {
            const encrypted = pieEncrypt({
                cardNumber: currentCardData.cardNumber,
                cvv: currentCardData.cvv
            })
            
            if (encrypted) {
                const encryptedData = {
                    encryptedCardNumber: encrypted.encryptedCardNumber,
                    encryptedCVV: encrypted.encryptedCVV,
                    integrityCheck: encrypted.integrityCheck,
                    expiryMonth: currentCardData.expiryMonth,
                    expiryYear: currentCardData.expiryYear,
                    isEncrypted: true
                }
                setEncryptedCardData(encryptedData)
                return encryptedData
            }
            // Encryption returned null - fall through to return null
        } catch (_error) {
            // Encryption failed - fall through to return null
        }
        
        return null
    }, [cardFormData, isPIEReady, pieEncrypt])
    
    // ==========================================================================
    // Verify and Save Payment (Main method for Review Order)
    // ==========================================================================
    
    /**
     * Verify card and save payment instrument with token to basket
     * 
     * This is the main method called when user clicks "Review Order".
     * It performs:
     * 1. Encrypts card data with PIE SDK
     * 2. Calls JPMC Verification API to get token
     * 3. Adds payment instrument to basket with token
     * 
     * @param {function} addPaymentInstrumentFn - Function to add payment instrument to basket
     * @param {object} cardData - Card data from form (REQUIRED - always pass fresh form data)
     * @returns {Promise<object>} { success, token, message }
     */
    const verifyAndSavePayment = useCallback(async (addPaymentInstrumentFn, cardData) => {
        setIsVerifying(true)
        setVerificationError(null)
        
        try {
            // Validate required inputs
            if (!cardData) throw new Error('No card data provided. Please enter card details.')
            if (!addPaymentInstrumentFn) throw new Error('addPaymentInstrumentFn is required')
            
            // Step 1: Encrypt card data
            const encryptedData = encryptCardForVerification({ cardData, isPIEReady, pieEncrypt })

            // Step 2: Persist fraud data for authorization stage
            const fraudCart = buildFraudShoppingCart(basket?.productItems, basket?.currency) || undefined
            const fraudShipTo = mapShipToForFraud(basket) || undefined
            persistFraudData({ fraudCart, fraudShipTo, saveFraudCart, saveFraudShipTo })
            
            // Step 3: Build headers and verification request
            const headers = await buildVerificationHeaders(getAccessToken)
            const verifyRequest = buildVerifyRequest({
                encryptedData, cardData, basket, billingAddress,
                kountSessionId: kountSessionIdRef.current, fraudCart, fraudShipTo
            })
            
            const result = await callVerificationApi({ verifyRequest, locale, headers })
            
            // Handle verification failure
            if (!result.success) {
                const errorResult = { success: false, message: GENERIC_API_ERROR_MESSAGE }
                if (mountedRef.current) setVerificationError(errorResult)
                return errorResult
            }
            
            // Step 4: Process success - store card data and add payment instrument
            cardFormDataRef.current = cardData
            setCardFormData(cardData)
            
            const processed = await processVerificationSuccess({
                result, cardData, basket, creditCardPaymentMethodId, addPaymentInstrumentFn
            })
            
            // Update state and persist token
            if (processed.paymentInstrumentId) {
                setSavedPaymentInstrumentId(processed.paymentInstrumentId)
                savedPaymentInstrumentIdRef.current = processed.paymentInstrumentId
            }
            setVerificationResult(processed.result)
            saveTokenToSession(processed.tokenRef, basket?.basketId)
            if (result.fraudRuleAction) saveFraudRuleAction(result.fraudRuleAction)
            if (result.cardTypeName) saveCardTypeName(result.cardTypeName)
            if (result.cardType) saveCardType(result.cardType)
            
            return { success: true, tokenRef: processed.tokenRef, paymentInstrumentId: processed.paymentInstrumentId, message: 'Card verified and saved successfully' }
            
        } catch (error) {
            const errorResult = { success: false, message: GENERIC_API_ERROR_MESSAGE }
            if (mountedRef.current) setVerificationError(errorResult)
            return errorResult
        } finally {
            if (mountedRef.current) setIsVerifying(false)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPIEReady, pieEncrypt, billingAddress, basket])
    
    // ==========================================================================
    // Authorization
    // ==========================================================================
    
    /**
     * Authorize payment with JP Morgan
     * This should be called when user clicks "Place Order"
     * 
     * Uses the token from basket.paymentInstruments (saved during verifyAndSavePayment)
     * 
     * @param {object} options - Optional overrides for amount, currency, etc.
     * @returns {Promise<object>} Authorization result
     */
    const authorizePayment = useCallback(async (options = {}) => {
        setIsAuthorizing(true)
        setAuthorizationError(null)
        
        try {
            // Resolve encrypted token ref from multiple sources using request builder utility
            const tokenInfo = resolvePaymentToken({ basket, verificationResult })
            const currentCardData = cardFormDataRef.current || cardFormData
            
            // Build authorization request (tokenRef or encrypted card)
            const authRequest = await buildAuthorizationRequest({
                tokenRef: tokenInfo.tokenRef,
                paymentInstrument: tokenInfo.paymentInstrument,
                encryptedCardData,
                encryptCardData,
                basket,
                billingAddress,
                currentCardData,
                paymentConfig,
                kountSessionId: kountSessionIdRef.current,
                options
            })
            
            // Call authorization
            const result = await authorize(authRequest)
            
            if (mountedRef.current) {
                if (result.success) {
                    setAuthorizationResult(result)
                } else {
                    setAuthorizationError({ code: result.errorCode, message: GENERIC_API_ERROR_MESSAGE })
                }
            }
            
            return result
        } catch (error) {
            const errorResult = { success: false, errorCode: 'AUTHORIZATION_ERROR', message: GENERIC_API_ERROR_MESSAGE }
            if (mountedRef.current) setAuthorizationError(errorResult)
            return errorResult
        } finally {
            if (mountedRef.current) setIsAuthorizing(false)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [encryptedCardData, encryptCardData, basket, billingAddress, cardFormData, authorize, verificationResult])
    
    // ==========================================================================
    // Place Order Wrapper
    // ==========================================================================
    
    // ==========================================================================
    // Google Pay Methods
    // ==========================================================================
    
    /**
     * Authorize payment using Google Pay
     * 
     * IMPORTANT: This function is called AFTER order creation (order-first flow).
     * The merchantOrderNumber must be the SFCC orderNo, not basketId.
     * 
     * @param {object} options - Google Pay payment options
     * @param {string|number} options.amount - Payment amount
     * @param {string} options.currencyCode - Currency code (default: USD)
     * @param {string} options.merchantOrderNumber - SFCC orderNo (REQUIRED)
     * @returns {Promise<object>} Payment result
     */
    const authorizeGooglePay = useCallback(async (options = {}) => {
        // Clear any previous errors to prevent flash during transition
        setAuthorizationError(null)
        setVerificationError(null)
        
        const orderTotal = options.amount || basket?.orderTotal || basket?.productTotal
        const currencyCode = options.currencyCode || options.currency || basket?.currency
        const merchantOrderNumber = options.merchantOrderNumber
        
        // Validate merchantOrderNumber is provided (required after order creation)
        if (!merchantOrderNumber) {
            const errorResult = {
                success: false,
                error: 'merchantOrderNumber (orderNo) is required for Google Pay authorization'
            }
            if (mountedRef.current) {
                setGooglePayResult(errorResult)
                setAuthorizationError(errorResult.error)
            }
            return errorResult
        }
        
        try {
            const result = await initiateGooglePayPayment({
                amount: orderTotal,
                currencyCode, 
                merchantOrderNumber,
                displayItems: buildDisplayItemsFromBasket(basket, currencyCode),
                ...options
            })
            
            if (mountedRef.current) {
                setGooglePayResult(result)
                
                if (result.success) {
                    // Store as authorization result as well for unified flow
                    setAuthorizationResult(result)
                } else {
                    setAuthorizationError(GENERIC_API_ERROR_MESSAGE)
                }
            }
            
            return result
        } catch (error) {
            
            if (mountedRef.current) {
                const errorResult = {
                    success: false,
                    error: GENERIC_API_ERROR_MESSAGE
                }
                setGooglePayResult(errorResult)
                setAuthorizationError(errorResult.error)
            }
            
            return {
                success: false,
                error: GENERIC_API_ERROR_MESSAGE
            }
        }
    }, [basket, initiateGooglePayPayment])

    /**
     * Authorize with Google Pay and place order
     * 
     * Supports two flows:
     * 
     * **Flow A: Checkout page (no paymentData provided)**
     * 1. Prepare basket for order creation (add payment instrument)
     * 2. Open Google Pay modal and get payment token (user confirms payment)
     * 3. If user cancels, return early - basket still exists
     * 4. Create SFCC order (only after user confirms in Google Pay modal)
     * 5. Authorize payment with JPMC using Google Pay token
     * 6. Confirm order via server-side API
     * 
     * **Flow B: Callback-based (paymentData provided - like Apple Pay)**
     * Used when integrator handles the Google Pay sheet via callbacks (PDP/Cart express checkout).
     * In this flow, the sheet is already open and paymentData comes from onPaymentAuthorized callback.
     * 1. Skips basket preparation (integrator already did this in shipping callbacks)
     * 2. Skips token collection (uses token from paymentData)
     * 3. Creates SFCC order via createOrderFn
     * 4. Authorizes payment with JPMC
     * 5. Confirms order via server-side API
     * 
     * @param {function} createOrderFn - Function to create SFCC order
     * @param {object} [paymentData] - Google Pay payment data from onPaymentAuthorized callback (for callback flow)
     * @param {object} [options] - Google Pay options (amount, currencyCode, captureMethod)
     * @returns {Promise<object>} Order result { success, order, authorization, transactionId, confirmResult }
     */
    const authorizeGooglePayAndPlaceOrder = useCallback(async (createOrderFn, paymentData = null, options = {}) => {
        // Determine which flow to use based on whether paymentData is provided
        const isCallbackFlow = paymentData && paymentData.paymentMethodData
        
        let flowResult
        
        if (isCallbackFlow) {
            // CALLBACK FLOW: paymentData provided from onPaymentAuthorized
            flowResult = extractGooglePayCallbackData(paymentData, options)
        } else {
            // CHECKOUT FLOW: Open sheet and collect token
            flowResult = await processGooglePayCheckoutFlow({
                basket, addPaymentInstrumentToBasket, removePaymentInstrumentFromBasket,
                updateBillingAddressForBasket, googlePayPaymentMethodId,
                initiateGooglePayPayment, options, mountedRef, setGooglePayResult, setAuthorizationError
            })
        }
        
        if (!flowResult.success) {
            return flowResult
        }
        
        const { googlePayToken, billingAddress, email, orderTotal, currencyCode } = flowResult
        
        // COMMON: Create order, authorize, confirm
        
        // Step 3: Create SFCC order
        const orderResult = await createOrderFn().catch(err => ({ error: GENERIC_API_ERROR_MESSAGE }))
        if (orderResult.error || !orderResult?.orderNo) {
            return { success: false, step: 'order_creation', error: GENERIC_API_ERROR_MESSAGE }
        }
        
        // Extract payment instrument info for server-side order patching
        const paymentInstrument = orderResult?.paymentInstruments?.[0]
        const paymentInstrumentId = paymentInstrument?.paymentInstrumentId
        // Use actual order total (reflects promo codes applied on review page) instead of payment instrument amount
        const paymentAmount = orderResult?.orderTotal || paymentInstrument?.amount

        refetchBasket?.()

        // Step 4: Authorize with JPMC (server patches order when paymentInstrumentId provided)
        const authResult = await authorize({
            amount: orderTotal, currency: currencyCode, merchantOrderNumber: orderResult.orderNo,
            googlePayToken, paymentMethod: 'googlepay',
            billingAddress,
            accountHolder: { email, fullName: billingAddress?.name },
            captureMethod: options.captureMethod || paymentConfig?.captureMethod,
            paymentInstrumentId,  // For server-side order patching
            paymentAmount  // For server-side order patching
        })
        
        updateGooglePayAuthState({ authResult, mountedRef, setGooglePayResult, setAuthorizationResult, setAuthorizationError })
        
        if (!authResult.success) {
            return await handleGooglePayAuthFailure({ 
                orderNo: orderResult.orderNo, 
                authResult, 
                failOrderServerSide,
                failOrderWithReopenBasket,
                commerceConfig,
                refetchBasket
            })
        }
        
        // Step 5: Confirm order (only if server didn't patch)
        // Use authorized amount from response (in minor units), fallback to payment instrument amount
        const confirmedPaymentAmount = authResult.amount ? authResult.amount / 100 : paymentAmount
        let confirmResult = null
        if (!authResult.orderPatched) {
            confirmResult = await confirmOrderServerSide(
                orderResult.orderNo, { ...authResult, paymentMethod: googlePayPaymentMethodId },
                paymentInstrumentId,
                { captureMethod: options.captureMethod || paymentConfig?.captureMethod, paymentAmount: confirmedPaymentAmount }
            )
        }
        
        return { success: true, order: orderResult, authorization: authResult, confirmResult }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authorize, initiateGooglePayPayment, confirmOrderServerSide, googlePayPaymentMethodId, basket, addPaymentInstrumentToBasket, updateBillingAddressForBasket, removePaymentInstrumentFromBasket, paymentConfig?.captureMethod])

    // ==========================================================================
    // Apple Pay Methods
    // ==========================================================================

    /**
     * Authorize with Apple Pay and place order (Order First — matches credit card + SFRA behavior)
     *
     * Flow:
     * 1. Prepare basket (remove existing PIs, set billing addr, add DW_APPLE_PAY PI)
     * 2. Open Apple Pay sheet — merchant validation happens automatically
     * 3. User authorizes with Face ID / Touch ID
     * 4. Inside onpaymentauthorized: create SFCC order → JPMC authorize → session.completePayment
     * 5. After sheet closes: confirm or fail order server-side → navigate
     *
     * @param {function} createOrderFn - Function to create SFCC order (basket must be ready)
     * @param {object} options
     * @returns {Promise<object>} { success, order, authorization, transactionId, confirmResult }
     */
    const authorizeApplePayAndPlaceOrder = useCallback(async (createOrderFn, options = {}) => {

        // CRITICAL: new ApplePaySession() and session.begin() run synchronously inside
        // initiateApplePayPayment's Promise executor. Any `await` before that call loses
        // the user-gesture context and Apple Pay will silently refuse to open the sheet.
        //
        // Basket prep is therefore wrapped inside createOrderFn so it runs inside
        // session.onpaymentauthorized — async is permitted there.
        const prepareBasketAndCreateOrder = async (paymentData) => {
            if (basket?.basketId && addPaymentInstrumentToBasket) {
                // 1a: Remove any existing payment instruments — SFCC allows only one
                if (removePaymentInstrumentFromBasket && basket.paymentInstruments?.length > 0) {
                    for (const pi of basket.paymentInstruments) {
                        await removePaymentInstrumentFromBasket({
                            parameters: { basketId: basket.basketId, paymentInstrumentId: pi.paymentInstrumentId }
                        })
                    }
                }

                // 1b: Set billing address from the Apple Pay wallet.
                // Priority: billingContact from the onpaymentauthorized event (always present,
                // full data) → billingContact cached from onpaymentmethodselected (fires before
                // Touch ID but may not fire for the default card on some devices).
                // Never fall back to shipping address — billing must come from the wallet card.
                if (updateBillingAddressForBasket) {
                    const billingContact = paymentData?.billingContact || applePayBillingContactRef.current
                    if (billingContact) {
                        const billingBody = {
                            firstName: billingContact.givenName || '',
                            lastName: billingContact.familyName || '',
                            address1: billingContact.addressLines?.[0] || '',
                            address2: billingContact.addressLines?.[1] || '',
                            city: billingContact.locality || '',
                            stateCode: billingContact.administrativeArea || '',
                            postalCode: billingContact.postalCode || '',
                            countryCode: (billingContact.countryCode || '').toUpperCase(),
                            phone: billingContact.phoneNumber || ''
                        }
                        await updateBillingAddressForBasket({
                            parameters: { basketId: basket.basketId },
                            body: billingBody
                        })
                    }
                }

                // 1c: Add Apple Pay payment instrument so basket is ready for order creation
                await addPaymentInstrumentToBasket({
                    parameters: { basketId: basket.basketId },
                    body: { amount: basket.orderTotal, paymentMethodId: applePayPaymentMethodId }
                })
            }

            return createOrderFn(paymentData)
        }

        // Pre-populate shipping contact from storefront basket data only when the caller opts in
        // (checkout page with shippingAddressRequired=true, where user already entered an address).
        // For cart express checkout, leave undefined so Apple Pay uses the wallet address.
        // When shippingAddressRequired is false the field is irrelevant — omit it.
        const shippingAddress = basket?.shipments?.[0]?.shippingAddress
        const customerEmail = basket?.customerInfo?.email
        const preSelectedContact = (applePayPrePopulateContactFromBasket && applePayShippingAddressRequired)
            ? mapSFCCToApplePayContact(shippingAddress, customerEmail)
            : undefined

        // Step 1: Open Apple Pay sheet — MUST be the first async call.
        // initiateApplePayPayment returns a Promise whose executor runs synchronously,
        // creating new ApplePaySession() and calling session.begin() while still inside
        // the user gesture stack.
        const orderTotal = options.amount || basket?.orderTotal
        const currencyCode = options.currencyCode || basket?.currency

        const applePayResult = await initiateApplePayPayment({
            amount: orderTotal,
            currencyCode,
            shippingContact: preSelectedContact,
            shippingMethods: options.shippingMethods || applePayShippingMethods,
            lineItems: buildApplePayLineItems(basket),
            createOrderFn: prepareBasketAndCreateOrder
        })

        // Step 3: Handle failure
        if (!applePayResult.success) {
            const { orderNo, step: failedStep, cancelled, error } = applePayResult

            if (cancelled) {
                return { success: false, cancelled: true }
            }

            // If order was created but auth failed, handle failure
            if (orderNo) {
                return await handleApplePayAuthFailure({
                    orderNo, error, failedStep, 
                    failOrderWithReopenBasket, commerceConfig, refetchBasket,
                    failOrderServerSide, authResult: applePayResult
                })
            }

            return { success: false, step: failedStep, error, orderNo }
        }

        refetchBasket?.()

        // Step 4: Confirm order server-side (only if server didn't patch)
        const { orderNo, orderResult, data: authResult } = applePayResult
        const paymentInstrument = orderResult?.paymentInstruments?.[0]
        const paymentInstrumentId = paymentInstrument?.paymentInstrumentId
        // Use actual order total (reflects promo codes applied on review page) instead of payment instrument amount
        const paymentAmount = orderResult?.orderTotal || paymentInstrument?.amount
        const captureMethod = options.captureMethod || paymentConfig?.captureMethod
        // Use authorized amount from response (in minor units), fallback to payment instrument amount
        const confirmedPaymentAmount = authResult?.amount ? authResult.amount / 100 : paymentAmount

        let confirmResult = null
        if (!authResult?.orderPatched) {
            confirmResult = await confirmOrderServerSide(
                orderNo,
                { ...authResult, paymentMethod: applePayPaymentMethodId },
                paymentInstrumentId,
                { captureMethod, paymentAmount: confirmedPaymentAmount }
            )
        }

        return {
            success: true,
            order: orderResult,
            authorization: authResult,
            confirmResult
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initiateApplePayPayment, confirmOrderServerSide, failOrderServerSide, applePayPaymentMethodId, basket, addPaymentInstrumentToBasket, updateBillingAddressForBasket, removePaymentInstrumentFromBasket, paymentConfig?.captureMethod])
    
    /**
     * Authorize and place order (Credit Card flow)
     * This wraps the SFCC order creation + JPMC authorization + server-side order confirmation
     * 
     * Flow (ORDER FIRST - required to get orderNo for merchantOrderNumber):
     * 1. Create SFCC order (basket consumed, get orderNo)
     * 2. Authorize payment with JPMC (using orderNo as merchantOrderNumber)
     * 3. Confirm order via server-side API (updates statuses + patches payment data)
     * 
     * If authorization fails after order creation, the order will be in a failed state
     * and the user will be redirected to the order-failed page.
     * 
     * NOTE: For Google Pay, use authorizeGooglePayAndPlaceOrder instead.
     * 
     * @param {function} createOrderFn - Function to create SFCC order
     * @param {object} options - Authorization options
     * @returns {Promise<object>} Order result
     */
    const authorizeAndPlaceOrder = useCallback(async (createOrderFn, options = {}) => {
        // Step 0: Update payment instrument amount to match current basket total
        // SFCC doesn't support updating PI amounts via PATCH - must remove and re-add
        if (basket?.paymentInstruments?.length > 0 && removePaymentInstrumentFromBasket && addPaymentInstrumentToBasket) {
            try {
                const currentPI = basket.paymentInstruments[0]
                
                // Only update if amount has changed (e.g., promo code applied on review page)
                if (currentPI.amount !== basket.orderTotal) {
                    // Remove old payment instrument
                    await removePaymentInstrumentFromBasket({
                        parameters: {
                            basketId: basket.basketId,
                            paymentInstrumentId: currentPI.paymentInstrumentId
                        }
                    })
                    
                    // Add new payment instrument with correct amount
                    const newPIBody = {
                        amount: basket.orderTotal,
                        paymentMethodId: currentPI.paymentMethodId
                    }
                    
                    // Preserve payment card metadata (SCAPI-compliant fields only)
                    if (currentPI.paymentCard) {
                        const apiPaymentCard = {}
                        
                        if (currentPI.paymentCard.cardType) apiPaymentCard.cardType = currentPI.paymentCard.cardType
                        if (currentPI.paymentCard.expirationMonth) apiPaymentCard.expirationMonth = currentPI.paymentCard.expirationMonth
                        if (currentPI.paymentCard.expirationYear) apiPaymentCard.expirationYear = currentPI.paymentCard.expirationYear
                        if (currentPI.paymentCard.holder) apiPaymentCard.holder = currentPI.paymentCard.holder
                        if (currentPI.paymentCard.maskedNumber) apiPaymentCard.maskedNumber = currentPI.paymentCard.maskedNumber
                        if (currentPI.paymentCard.validFromMonth) apiPaymentCard.validFromMonth = currentPI.paymentCard.validFromMonth
                        if (currentPI.paymentCard.validFromYear) apiPaymentCard.validFromYear = currentPI.paymentCard.validFromYear
                        if (currentPI.paymentCard.issueNumber) apiPaymentCard.issueNumber = currentPI.paymentCard.issueNumber
                        
                        newPIBody.paymentCard = apiPaymentCard
                    }
                    
                    await addPaymentInstrumentToBasket({
                        parameters: {
                            basketId: basket.basketId
                        },
                        body: newPIBody
                    })
                }
            } catch (updateError) {
                // Prevent order creation if PI update fails
                return {
                    success: false,
                    step: 'payment_update',
                    error: GENERIC_API_ERROR_MESSAGE
                }
            }
        }
        
        // Step 1: Create SFCC order FIRST (basket is consumed, we get orderNo)
        let orderResult
        try {
            orderResult = await createOrderFn()
        } catch (error) {
            return {
                success: false,
                step: 'order_creation',
                error: GENERIC_API_ERROR_MESSAGE
            }
        }
        
        const orderNo = orderResult?.orderNo
        if (!orderNo) {
            return {
                success: false,
                step: 'order_creation',
                error: GENERIC_API_ERROR_MESSAGE
            }
        }
        
        // Extract payment instrument info for server-side order patching
        const paymentInstrument = orderResult?.paymentInstruments?.[0]
        const paymentInstrumentId = paymentInstrument?.paymentInstrumentId
        // Use actual order total (reflects promo codes applied on review page) instead of payment instrument amount
        const paymentAmount = orderResult?.orderTotal || paymentInstrument?.amount

        refetchBasket?.()

        // Step 2: Authorize payment with JPMC (now we have orderNo for merchantOrderNumber)
        // Collect browser fingerprint data for 3DS authentication
        const browserInfo = collectBrowserInfo()
        
        // Pass orderNo, browserInfo, and payment instrument info so server can patch order
        const authResult = await authorizePayment({
            ...options,
            merchantOrderNumber: orderNo,  // CRITICAL: Use orderNo instead of basketId
            browserInfo,  // 3DS browser fingerprint data
            paymentInstrumentId,  // For server-side order patching
            paymentAmount  // For server-side order patching
        })
        
        if (!authResult.success) {
            // Authorization failed AFTER order was created
            
            // Try to reopen basket first
            if (failOrderWithReopenBasket && commerceConfig) {
                const { proxy, organizationId, siteId } = commerceConfig
                if (proxy && organizationId && siteId) {
                    const reopenResult = await failOrderWithReopenBasket({
                        orderNo,
                        reasonCode: 'payment_auth_failure',
                        proxy,
                        organizationId,
                        siteId
                    })
                    
                    if (reopenResult.basketReopened) {
                        await refetchBasket?.()
                        return {
                            success: false,
                            step: 'authorization',
                            error: GENERIC_API_ERROR_MESSAGE,
                            errorCode: authResult.errorCode || 'AUTH_FAILED',
                            orderNo: orderNo,
                            basketReopened: true,
                            basketId: reopenResult.basketId
                        }
                    }
                }
            }
            
            // Fallback: Mark order as failed in SFCC via server-side API
            await failOrderServerSide(
                orderNo,
                authResult,
                GENERIC_API_ERROR_MESSAGE,
                authResult.errorCode || 'AUTH_FAILED'
            )
            
            // Save error to sessionStorage for order-failed page
            savePaymentError({
                message: GENERIC_API_ERROR_MESSAGE,
                orderNo: orderNo,
                step: 'authorization',
                code: authResult.errorCode || 'AUTH_FAILED'
            })
            
            // Return orderNo so UI can redirect to error page
            return {
                success: false,
                step: 'authorization',
                error: GENERIC_API_ERROR_MESSAGE,
                orderNo: orderNo
            }
        }
        
        // Check if 3DS authentication is required
        // If so, return early - the caller (useJPMCPlaceOrder) will handle the 3DS flow
        // Server already patched order with 3DS pending status
        if (requires3DSAuthentication(authResult)) {
            return {
                success: true,
                requires3DS: true,
                order: orderResult,
                authorization: authResult
            }
        }
        
        // Step 3: Confirm order via server-side API (only if not already patched)
        // Server patches order in /authorize when paymentInstrumentId is provided
        let confirmResult = null
        const captureMethod = options.captureMethod || paymentConfig?.captureMethod
        // Use authorized amount from response (in minor units), fallback to payment instrument amount
        const confirmedPaymentAmount = authResult.amount ? authResult.amount / 100 : paymentAmount
        
        if (!authResult.orderPatched) {
            // Fallback: server didn't patch, call confirm endpoint
            confirmResult = await confirmOrderServerSide(
                orderNo,
                { ...authResult, paymentMethod: selectedPaymentMethodId },
                paymentInstrumentId,
                { captureMethod, paymentAmount: confirmedPaymentAmount }
            )
        }
        
        return {
            success: true,
            order: orderResult,
            authorization: authResult,
            confirmResult
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authorizePayment, confirmOrderServerSide, selectedPaymentMethodId, paymentConfig?.captureMethod, basket, removePaymentInstrumentFromBasket, addPaymentInstrumentToBasket])
    
    // ==========================================================================
    // Utilities
    // ==========================================================================
    
    /**
     * Clear all JPMC checkout data
     */
    const clearCheckoutData = useCallback(() => {
        cardFormDataRef.current = null
        savedPaymentInstrumentIdRef.current = null
        setCardFormData(null)
        setEncryptedCardData(null)
        setBillingAddress(null)
        setAuthorizationResult(null)
        setAuthorizationError(null)
        setVerificationResult(null)
        setVerificationError(null)
        setGooglePayResult(null)
        resetOrderConfirm()
        setSavedPaymentInstrumentId(null)
        clearTokenFromSession()
        clearFraudRuleAction()
        clearFraudCart()
        clearFraudShipTo()
        resetError()
        resetGooglePay()
        resetApplePay()
    }, [resetError, resetGooglePay, resetApplePay, resetOrderConfirm])
    
    /**
     * Reset all payment-related errors (without clearing checkout data)
     * Use this before attempting a new payment to clear previous error state
     */
    const resetPaymentError = useCallback(() => {
        setAuthorizationError(null)
        setVerificationError(null)
        resetError() // PIE SDK error
        resetGooglePayError() // Google Pay error
        resetApplePayError() // Apple Pay error
    }, [resetError, resetGooglePayError, resetApplePayError])
    
    /**
     * Check if ready for place order
     */
    // ==========================================================================
    // Helper: Check for saved payment with token
    // ==========================================================================
    
    /**
     * Check if basket has a saved payment instrument with a JPMC token
     * This is used when user returns to checkout after previously saving payment
     */
    const hasSavedPaymentWithToken = useCallback(() => {
        const paymentInstrument = basket?.paymentInstruments?.[0]
        if (!paymentInstrument) return false
        
        // Check for JPMC token in various locations (including sessionStorage)
        const sessionToken = getTokenFromSession(basket?.basketId)
        const hasToken = !!(
            paymentInstrument?.paymentCard?.creditCardToken ||
            paymentInstrument?.c_jpmcToken ||
            paymentInstrument?.c_jpmcVerificationToken ||
            sessionToken
        )
        
        // Also check that it's a credit card payment method
        const isCreditCard = paymentInstrument?.paymentMethodId === 'CREDIT_CARD'
        
        return hasToken && isCreditCard
    }, [basket?.paymentInstruments, basket?.basketId])
    
    const isReadyForPlaceOrder = useCallback(() => {
        // Ready if we have card data in memory OR a saved payment with token in basket
        return !!(cardFormDataRef.current || cardFormData || encryptedCardData || hasSavedPaymentWithToken())
    }, [cardFormData, encryptedCardData, hasSavedPaymentWithToken])
    
    // ==========================================================================
    // Context Value
    // ==========================================================================
    
    const contextValue = useMemo(() => ({
        // Locale for multi-MID support
        locale,
        
        // SLAS token access for multi-MID (GooglePayButton needs these for autoFetchConfig)
        getAccessToken,
        slasToken: accessTokenHook?.token,
        
        // PIE SDK state (with aliases for cleaner API)
        isPIEReady,
        isPIELoading,
        pieError,
        // Aliases
        isReady: isPIEReady,
        isLoading: isPIELoading || isLoadingPaymentMethods,
        error: pieError || authorizationError || verificationError || googlePayError || applePayError,
        // Payment error aliases (for payment.jsx compatibility)
        paymentError: authorizationError || verificationError || googlePayError || applePayError,
        resetPaymentError,
        
        // Card data
        cardFormData,
        encryptedCardData,
        storeCardFormData,
        encryptCardData,
        hasStoredCardData: !!cardFormData,
        
        // Billing
        billingAddress,
        setBillingAddress,
        
        // Payment method
        selectedPaymentMethodId,
        setSelectedPaymentMethodId,
        
        // Verification
        verificationResult,
        isVerifying,
        verificationError,
        verifyAndSavePayment,  // Main method for Review Order click
        
        // Authorization (card-based)
        authorizationResult,
        isAuthorizing,
        authorizationError,
        authorizePayment,
        
        // Google Pay
        isGooglePayReady,
        isGooglePayAvailable,
        isGooglePayLoading,
        isGooglePayProcessing,
        googlePayError,
        googlePayResult,
        authorizeGooglePay,
        authorizeGooglePayAndPlaceOrder,
        resetGooglePay,
        resetGooglePayError,
        
        // Server-side Order Confirmation
        orderConfirmResult,
        isConfirmingOrder,
        confirmOrderServerSide,
        
        // Core authorize function (for GooglePayButton cart/pdp flows)
        authorize,
        
        // Payment config from BM (for GooglePayButton)
        paymentConfig,
        
        // Google Pay config from BM (for GooglePayButton autoFetchConfig skip)
        googlePayConfig,
        
        // Place order wrapper (card-based)
        authorizeAndPlaceOrder,

        // Apple Pay
        isApplePayAvailable,
        isApplePayProcessing,
        applePayError,
        authorizeApplePayAndPlaceOrder,
        resetApplePay,
        resetApplePayError,
        applePayMerchantId: applePayConfig.merchantId,
        applePayPaymentMethodId,
        
        // Utilities
        clearCheckoutData,
        isReadyForPlaceOrder,
        hasSavedPaymentWithToken,
        resetError,
        // Kount - expose refreshKount so consumers can call it when navigating back
        // to the payment step
        refreshKount,
        isKountCollectionComplete,
        kountSessionId,
        
        // Processing state (PIE, auth, Google Pay, Apple Pay, or order confirmation)
        isProcessing: isPIELoading || isProcessing || isAuthorizing || isVerifying || isGooglePayProcessing || isApplePayProcessing || isConfirmingOrder,
        
        // Computed - include saved payment with token check
        hasCardData: !!(cardFormData || encryptedCardData || hasSavedPaymentWithToken()),
        isCardEncrypted: !!encryptedCardData,
        isAuthorized: authorizationResult?.success || googlePayResult?.success || false,
        isVerified: verificationResult?.success || false,
        hasSavedToken: hasSavedPaymentWithToken(),
        isOrderConfirmed,
        
        // Payment method availability from SFCC BM (auto-fetched, plug-and-play)
        activePaymentMethods,
        
        // Computed *Enabled flags - simplified button visibility control
        isCreditCardEnabled,
        isGooglePayEnabled,
        isApplePayEnabled,
        isDropInEnabled: (() => {
            // Drop-in is enabled when checkoutMode === 'DROP_IN' (from JPMCCheckoutMode BM preference)
            const dropInEnabled = paymentConfig?.checkoutMode === 'DROP_IN'
            
            return dropInEnabled
        })(),
        
        // Payment method IDs (for GooglePayButton cart flow)
        googlePayPaymentMethodId,
        creditCardPaymentMethodId,
        
        // Basket mutations (passed via config, exposed for GooglePayButton cart flow)
        addPaymentInstrumentToBasket,
        removePaymentInstrumentFromBasket,
        updateBillingAddressForBasket,
        
        // Server-side order failure (for GooglePayButton error handling)
        failOrderServerSide,
        
        // Client-side order failure with basket reopen (for 3DS error handling)
        failOrderWithReopenBasket,
        commerceConfig,
        refetchBasket,
        
        // Payment method helpers
        isGooglePayMethod: !!googlePayResult?.success,
        isCreditCardMethod: !googlePayResult?.success && !!cardFormData,
        
        // 3DS - orchestration and modal control (rendered by provider, controlled by useJPMCPlaceOrder)
        isThreeDSModalOpen,
        threeDSIframeName,
        initiateOrchestration,
        threeDSHandleCancel,
        setThreeDSIframeRef,
        registerThreeDSCallbacks
    }), [
        locale, getAccessToken, accessTokenHook?.token, isPIEReady, isPIELoading, pieError,
        isLoadingPaymentMethods,
        authorizationError, verificationError, googlePayError, applePayError, resetPaymentError,
        cardFormData, encryptedCardData, storeCardFormData, encryptCardData,
        billingAddress, setBillingAddress, selectedPaymentMethodId, setSelectedPaymentMethodId,
        verificationResult, isVerifying, verifyAndSavePayment, authorizationResult, isAuthorizing, authorizePayment,
        isGooglePayReady, isGooglePayAvailable, isGooglePayLoading, isGooglePayProcessing,
        googlePayResult, authorizeGooglePay, authorizeGooglePayAndPlaceOrder, resetGooglePay, resetGooglePayError,
        orderConfirmResult, isConfirmingOrder, confirmOrderServerSide, authorize, paymentConfig, googlePayConfig,
        authorizeAndPlaceOrder, isApplePayAvailable, isApplePayProcessing,
        authorizeApplePayAndPlaceOrder, resetApplePay, resetApplePayError, applePayConfig.merchantId,
        applePayPaymentMethodId, clearCheckoutData, isReadyForPlaceOrder, hasSavedPaymentWithToken, resetError,
        refreshKount, isKountCollectionComplete, kountSessionId, isProcessing,
        activePaymentMethods, isCreditCardEnabled, isGooglePayEnabled, isApplePayEnabled,
        googlePayPaymentMethodId, creditCardPaymentMethodId, addPaymentInstrumentToBasket,
        removePaymentInstrumentFromBasket, updateBillingAddressForBasket, failOrderServerSide,
        failOrderWithReopenBasket, commerceConfig, refetchBasket,
        isOrderConfirmed, isThreeDSModalOpen, threeDSIframeName, initiateOrchestration,
        threeDSHandleCancel, setThreeDSIframeRef, registerThreeDSCallbacks
    ])
    
    return (
        <JPMCCheckoutContext.Provider value={contextValue}>
            {children}
            {/* 3DS Modal - rendered at provider level so it doesn't unmount when basket is consumed */}
            {/* isVisible delays showing spinner for frictionless flows */}
            <ThreeDSModal
                isOpen={isThreeDSModalOpen}
                isVisible={isThreeDSModalVisible}
                onCancel={threeDSHandleCancel}
                iframeName={threeDSIframeName}
                onIframeRef={setThreeDSIframeRef}
                title="Card Verification"
                cancelText="Cancel"
            />
        </JPMCCheckoutContext.Provider>
    )
}

JPMCCheckoutProvider.propTypes = {
    children: PropTypes.node.isRequired,
    config: PropTypes.object,
    useBasketHook: PropTypes.func,
    useAccessToken: PropTypes.func,
    basket: PropTypes.object,
    locale: PropTypes.string,
    currency: PropTypes.string,
    defaultLocale: PropTypes.string,
    commerceConfig: PropTypes.shape({
        proxy: PropTypes.string,
        organizationId: PropTypes.string,
        siteId: PropTypes.string
    })
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access JPMC checkout context
 * 
 * @returns {object} JPMC checkout context
 * @throws {Error} If used outside of JPMCCheckoutProvider
 * 
 * @example
 * ```jsx
 * const {
 *   storeCardFormData,
 *   authorizeAndPlaceOrder,
 *   isProcessing,
 *   authorizationError
 * } = useJPMCCheckout()
 * ```
 */
export function useJPMCCheckout() {
    const context = useContext(JPMCCheckoutContext)
    
    if (!context) {
        throw new Error('useJPMCCheckout must be used within a JPMCCheckoutProvider')
    }
    
    return context
}

// =============================================================================
// Exports
// =============================================================================

export default JPMCCheckoutProvider

// Re-export session storage utilities for error page
export {
    savePaymentError,
    getPaymentError,
    clearPaymentError,
    hasPaymentError
} from './utils/session-storage'
