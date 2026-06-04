/**
 * useGooglePay Hook
 * 
 * A React hook that handles Google Pay integration for checkout, cart, and PDP:
 * 1. Loads Google Pay JavaScript library
 * 2. Checks if Google Pay is available
 * 3. Creates PaymentsClient with context-aware callbacks
 * 4. Opens Google Pay modal and handles payment flow
 * 
 * Supports three contexts:
 * - checkout: Standard payment flow (token collection only)
 * - cart: Full payment flow with shipping callbacks from cart page
 * - pdp: Full payment flow with shipping callbacks from product detail page
 * 
 * For cart/pdp contexts, the hook manages shipping address/option callbacks
 * and payment authorization via onPaymentDataChanged and onPaymentAuthorized.
 * 
 * @module useGooglePay
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
    loadGooglePayScript,
    createPaymentsClient,
    preloadGooglePayScript,
    buildGooglePayConfig,
    parseGooglePayResponse,
    validateGooglePayConfig
} from '../services/googlepay'
import {
    GOOGLE_PAY_ERROR_CODES,
    GOOGLE_PAY_CONTEXT,
    GOOGLE_PAY_CALLBACK_TRIGGERS,
    getGooglePayErrorMessage
} from '../utils/constants.mjs'
import { GENERIC_API_ERROR_MESSAGE } from '../utils/constants/error-constants'

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_CONFIG = {
    scriptLoadTimeout: 10000
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for handling Google Pay integration
 * 
 * @param {Object} options - Hook options
 * @param {string} options.gatewayMerchantId - JP Morgan Merchant ID
 * @param {string} options.merchantName - Merchant display name
 * @param {string} [options.merchantId] - Google Merchant ID (required for production)
 * @param {string} [options.environment] - 'sandbox' or 'production'
 * @param {string} [options.context] - Flow context: 'checkout' (default), 'cart', or 'pdp'
 * @param {string} [options.countryCode] - Country code (default: 'US')
 * @param {string[]} [options.allowedCountryCodes] - Allowed shipping countries (cart/pdp)
 * @param {boolean} [options.phoneNumberRequired] - Require phone number (cart/pdp)
 * @param {boolean} [options.billingAddressRequired] - Require billing address
 * @param {boolean} [options.emailRequired] - Require email address
 * @param {boolean} [options.shippingAddressRequired] - Require shipping address
 * @param {Function} [options.onReady] - Callback when Google Pay is ready
 * @param {Function} [options.onCancel] - Callback on user cancellation
 * @param {Function} [options.onError] - Callback on error
 * @param {Function} [options.onPaymentDataChanged] - Callback for shipping address/option changes (cart/pdp)
 * @param {Function} [options.onPaymentAuthorized] - Callback for payment authorization (cart/pdp)
 * @returns {Object} Hook state and methods
 * 
 * @example
 * // Checkout context (default) - token collection only
 * const { getPaymentToken } = useGooglePay({
 *   gatewayMerchantId: 'your-jpmc-merchant-id',
 *   merchantName: 'Your Store'
 * })
 * 
 * @example
 * // Cart context - full payment flow with shipping
 * const { loadPaymentData } = useGooglePay({
 *   gatewayMerchantId: 'your-jpmc-merchant-id',
 *   merchantName: 'Your Store',
 *   context: 'cart',
 *   allowedCountryCodes: ['US', 'CA'],
 *   onPaymentDataChanged: async (data) => {
 *     // Handle INITIALIZE, SHIPPING_ADDRESS, SHIPPING_OPTION
 *     return { newTransactionInfo, newShippingOptionParameters }
 *   },
 *   onPaymentAuthorized: async (paymentData) => {
 *     // Process payment and create order
 *     return { transactionState: 'SUCCESS' }
 *   }
 * })
 */
export const useGooglePay = (options = {}) => {
    const {
        gatewayMerchantId,
        merchantName,
        merchantId,
        environment = 'sandbox',
        context = GOOGLE_PAY_CONTEXT.CHECKOUT,
        countryCode = 'US',
        gateway,
        allowedNetworks,
        allowedAuthMethods,
        billingAddressRequired = true,
        billingAddressFormat = 'FULL',
        emailRequired = true,
        shippingAddressRequired = false,
        // Cart/PDP specific options
        allowedCountryCodes,
        phoneNumberRequired = false,
        // Callbacks
        onReady,
        onCancel,
        onError,
        onPaymentDataChanged,
        onPaymentAuthorized,
        scriptLoadTimeout = DEFAULT_CONFIG.scriptLoadTimeout
    } = options

    // Determine if this requires shipping callbacks (cart/pdp context OR direct callbacks provided)
    const hasDirectCallbacks = !!(onPaymentDataChanged && onPaymentAuthorized)
    const isCartOrPDPFlow = context === GOOGLE_PAY_CONTEXT.CART || context === GOOGLE_PAY_CONTEXT.PDP
    const requiresCallbacks = isCartOrPDPFlow || hasDirectCallbacks

    // State
    const [isReady, setIsReady] = useState(false)
    const [isAvailable, setIsAvailable] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isProcessing, setIsProcessing] = useState(false)
    const [error, setError] = useState(null)
    const [paymentsClient, setPaymentsClient] = useState(null)

    // Refs
    const mountedRef = useRef(true)
    const paymentsClientRef = useRef(null)
    const configRef = useRef(null)
    const initializedRef = useRef(false)
    const initializingRef = useRef(false)  // Lock to prevent concurrent initialization
    const initializedWithCallbacksRef = useRef(false)  // Track if client was created with callbacks
    
    // Callback refs to prevent unnecessary reinitializations
    const onReadyRef = useRef(onReady)
    const onCancelRef = useRef(onCancel)
    const onErrorRef = useRef(onError)
    const onPaymentDataChangedRef = useRef(onPaymentDataChanged)
    const onPaymentAuthorizedRef = useRef(onPaymentAuthorized)
    
    // Update callback refs when they change
    useEffect(() => {
        onReadyRef.current = onReady
        onCancelRef.current = onCancel
        onErrorRef.current = onError
        onPaymentDataChangedRef.current = onPaymentDataChanged
        onPaymentAuthorizedRef.current = onPaymentAuthorized
    }, [onReady, onCancel, onError, onPaymentDataChanged, onPaymentAuthorized])

    // =============================================================================
    // Callback Handlers for Cart/PDP Flows
    // =============================================================================

    /**
     * Internal handler for onPaymentDataChanged callback
     * Dispatches to the appropriate handler based on callback trigger
     * 
     * @param {Object} intermediatePaymentData - Payment data from Google Pay
     * @returns {Promise<Object>} Response for Google Pay sheet
     */
    const handlePaymentDataChanged = useCallback(async (intermediatePaymentData) => {
        const trigger = intermediatePaymentData.callbackTrigger
        
        // Delegate to the user-provided callback
        if (onPaymentDataChangedRef.current) {
            try {
                const result = await onPaymentDataChangedRef.current(intermediatePaymentData)
                return result || {}
            } catch (error) {
                // Return appropriate error based on trigger
                if (trigger === GOOGLE_PAY_CALLBACK_TRIGGERS.SHIPPING_ADDRESS ||
                    trigger === GOOGLE_PAY_CALLBACK_TRIGGERS.INITIALIZE) {
                    return {
                        error: {
                            reason: 'SHIPPING_ADDRESS_UNSERVICEABLE',
                            message: GENERIC_API_ERROR_MESSAGE,
                            intent: 'SHIPPING_ADDRESS'
                        }
                    }
                } else if (trigger === GOOGLE_PAY_CALLBACK_TRIGGERS.SHIPPING_OPTION) {
                    return {
                        error: {
                            reason: 'SHIPPING_OPTION_INVALID',
                            message: GENERIC_API_ERROR_MESSAGE,
                            intent: 'SHIPPING_OPTION'
                        }
                    }
                }
                return {}
            }
        }
        
        // If no callback provided, return empty (let Google Pay proceed)
        return {}
    }, [])

    /**
     * Internal handler for onPaymentAuthorized callback
     * 
     * @param {Object} paymentData - Full payment data from Google Pay
     * @returns {Promise<Object>} Authorization response
     */
    const handlePaymentAuthorized = useCallback(async (paymentData) => {
        // Delegate to the user-provided callback
        if (onPaymentAuthorizedRef.current) {
            try {
                const result = await onPaymentAuthorizedRef.current(paymentData)
                return result
            } catch (error) {
                return {
                    transactionState: 'ERROR',
                    error: {
                        intent: 'PAYMENT_AUTHORIZATION',
                        message: GENERIC_API_ERROR_MESSAGE,
                        reason: 'PAYMENT_DATA_INVALID'
                    }
                }
            }
        }
        
        // If no callback provided for flows requiring authorization, return error
        if (requiresCallbacks) {
            return {
                transactionState: 'ERROR',
                error: {
                    intent: 'PAYMENT_AUTHORIZATION',
                    message: 'Payment handler not configured',
                    reason: 'PAYMENT_DATA_INVALID'
                }
            }
        }
        
        // Checkout context: Return success to close the sheet
        // Token will be handled separately via getPaymentToken
        return { transactionState: 'SUCCESS' }
    }, [requiresCallbacks])

    // Memoized configuration
    const googlePayConfig = useMemo(() => {
        if (!gatewayMerchantId || !merchantName) {
            return null
        }

        const config = buildGooglePayConfig({
            gatewayMerchantId,
            merchantName,
            merchantId,
            environment,
            countryCode,
            gateway,
            allowedNetworks,
            allowedAuthMethods,
            billingAddressRequired,
            billingAddressFormat,
            emailRequired,
            shippingAddressRequired: requiresCallbacks || shippingAddressRequired,
            // Cart/PDP specific options
            context,
            allowedCountryCodes,
            phoneNumberRequired,
            // Callbacks for PaymentsClient - pass when callbacks are required
            onPaymentDataChanged: requiresCallbacks ? handlePaymentDataChanged : undefined,
            onPaymentAuthorized: requiresCallbacks ? handlePaymentAuthorized : undefined
        })

        return config
    }, [
        gatewayMerchantId,
        merchantName,
        merchantId,
        environment,
        countryCode,
        gateway,
        allowedNetworks,
        allowedAuthMethods,
        billingAddressRequired,
        billingAddressFormat,
        emailRequired,
        shippingAddressRequired,
        context,
        allowedCountryCodes,
        phoneNumberRequired,
        requiresCallbacks,
        handlePaymentDataChanged,
        handlePaymentAuthorized
    ])

    // =============================================================================
    // Initialization
    // =============================================================================
    
    /**
     * Check if initialization should be skipped
     * Returns true if initialization should be skipped
     */
    const shouldSkipInitialization = useCallback(() => {
        if (initializingRef.current) return true
        
        // If PaymentsClient exists, check if it needs to be recreated
        if (paymentsClientRef.current) {
            // If callbacks are now required but client was created without them,
            // recreate the client to pick up callback support — do not skip
            if (requiresCallbacks && !initializedWithCallbacksRef.current) {
                // Clear the existing client to force reinitialization
                paymentsClientRef.current = null
                setPaymentsClient(null)
                initializedRef.current = false
                return false  // Don't skip - reinitialize with callbacks
            }
            setIsLoading(false)
            return true
        }
        return false
    }, [requiresCallbacks])

    /**
     * Check preconditions for initialization
     * Returns error details if preconditions not met, null otherwise
     */
    const checkPreconditions = useCallback(() => {
        if (typeof window === 'undefined') return { skip: true }
        if (initializedRef.current && paymentsClientRef.current) return { skip: true }
        if (!gatewayMerchantId) return { skip: true }
        
        const validation = validateGooglePayConfig({ gatewayMerchantId, merchantName, merchantId, environment })
        if (!validation.valid) {
            return { 
                error: { code: GOOGLE_PAY_ERROR_CODES.INVALID_CONFIG, message: validation.errors.join(', ') }
            }
        }
        return null
    }, [gatewayMerchantId, merchantName, merchantId, environment])

    /**
     * Initialize Google Pay
     */
    const initialize = useCallback(async () => {
        if (shouldSkipInitialization()) {
            return
        }
        
        initializingRef.current = true
        
        const preconditionResult = checkPreconditions()
        if (preconditionResult?.skip) {
            initializingRef.current = false
            setIsLoading(false)
            return
        }
        if (preconditionResult?.error) {
            initializingRef.current = false
            setIsLoading(false)
            setError(preconditionResult.error)
            return
        }

        setIsLoading(true)
        setError(null)

        try {
            const scriptLoaded = await loadGooglePayScript({ timeout: scriptLoadTimeout })
            
            if (!scriptLoaded) {
                throw new GooglePayError(GOOGLE_PAY_ERROR_CODES.SCRIPT_LOAD_FAILED, 'Failed to load Google Pay script')
            }

            if (!mountedRef.current) return

            const client = createPaymentsClient(googlePayConfig.clientOptions)
            if (!client) {
                throw new GooglePayError(GOOGLE_PAY_ERROR_CODES.CLIENT_NOT_INITIALIZED, 'Failed to create Google Pay client')
            }

            paymentsClientRef.current = client
            setPaymentsClient(client)
            configRef.current = googlePayConfig
            // Track whether this client was initialized with callbacks
            initializedWithCallbacksRef.current = requiresCallbacks

            const response = await client.isReadyToPay(googlePayConfig.isReadyToPayRequest)

            if (!mountedRef.current) return

            if (response.result) {
                initializedRef.current = true
                setIsAvailable(true)
                setIsReady(true)
                onReadyRef.current?.()
            } else {
                setIsAvailable(false)
                setIsReady(true)
            }
        } catch (err) {
            if (!mountedRef.current) return
            initializingRef.current = false
            const errorDetails = {
                code: err.code || GOOGLE_PAY_ERROR_CODES.SCRIPT_LOAD_FAILED,
                message: GENERIC_API_ERROR_MESSAGE
            }
            setError(errorDetails)
            setIsAvailable(false)
            onErrorRef.current?.(errorDetails)
        } finally {
            if (mountedRef.current) setIsLoading(false)
        }
    }, [
        gatewayMerchantId,
        merchantName,
        merchantId,
        environment,
        googlePayConfig,
        scriptLoadTimeout,
        requiresCallbacks,
        shouldSkipInitialization,
        checkPreconditions
    ])

    // =============================================================================
    // Token Collection
    // =============================================================================

    /**
     * Get Google Pay payment token
     * 
     * Opens the Google Pay modal and returns the encrypted payment token.
     * Does NOT authorize the payment - that happens separately via server-side API.
     * 
     * CRITICAL: This function uses synchronous promise chaining to maintain
     * user gesture context for the popup. Do not convert to async/await.
     * 
     * @param {Object} paymentDetails - Payment details
     * @param {string|number} paymentDetails.amount - Payment amount (in dollars)
     * @param {string} paymentDetails.currencyCode - Currency code (e.g., 'USD')
     * @param {Array} [paymentDetails.displayItems] - Line items to display (subtotal, shipping, tax)
     * @returns {Promise<Object>} Token result
     * 
     * @example
     * const result = await getPaymentToken({
     *   amount: '99.99',
     *   currencyCode: 'USD',
     *   displayItems: [
     *     { label: 'Subtotal', type: 'SUBTOTAL', price: '85.00' },
     *     { label: 'Shipping', type: 'LINE_ITEM', price: '5.99' },
     *     { label: 'Tax', type: 'TAX', price: '8.00' }
     *   ]
     * })
     * // result = {
     * //   success: true,
     * //   token: { encryptedPaymentBundle, ... },
     * //   billingAddress: { ... },
     * //   email: 'user@example.com',
     * //   cardNetwork: 'VISA'
     * // }
     */
    const getPaymentToken = useCallback((paymentDetails = {}) => {
        const { amount, currencyCode, displayItems } = paymentDetails

        // Validation - synchronous checks
        if (!amount) {
            const err = {
                code: GOOGLE_PAY_ERROR_CODES.INVALID_CONFIG,
                message: 'Payment amount is required'
            }
            setError(err)
            onErrorRef.current?.(err)
            return Promise.resolve({ success: false, error: err })
        }

        if (!currencyCode) {
            const err = {
                code: GOOGLE_PAY_ERROR_CODES.INVALID_CONFIG,
                message: 'Currency code is required'
            }
            setError(err)
            onErrorRef.current?.(err)
            return Promise.resolve({ success: false, error: err })
        }

        if (!paymentsClientRef.current || !configRef.current) {
            const err = {
                code: GOOGLE_PAY_ERROR_CODES.CLIENT_NOT_INITIALIZED,
                message: 'Google Pay is not initialized'
            }
            setError(err)
            onErrorRef.current?.(err)
            return Promise.resolve({ success: false, error: err })
        }

        // Build payment data request synchronously
        const paymentDataRequest = configRef.current.buildPaymentDataRequest(
            String(amount),
            currencyCode,
            displayItems ? { displayItems } : {}
        )

        // Set processing state
        setIsProcessing(true)
        setError(null)

        // Call loadPaymentData - opens Google Pay popup
        // MUST use .then() not async/await to preserve user gesture context
        return paymentsClientRef.current.loadPaymentData(paymentDataRequest)
            .then((paymentData) => {
                if (!mountedRef.current) {
                    return { success: false, error: { code: 'UNMOUNTED', message: 'Component unmounted' } }
                }

                // Parse the response
                const parsedPayment = parseGooglePayResponse(paymentData)

                setIsProcessing(false)

                // Return token data for authorization later
                return {
                    success: true,
                    token: parsedPayment.encryptedPaymentBundle,
                    billingAddress: parsedPayment.billingAddress,
                    email: parsedPayment.email,
                    cardNetwork: parsedPayment.cardNetwork,
                    _raw: paymentData
                }
            })
            .catch((err) => {
                if (!mountedRef.current) {
                    return { success: false, error: { code: 'UNMOUNTED', message: 'Component unmounted' } }
                }

                setIsProcessing(false)

                // Handle user cancellation
                if (err.statusCode === 'CANCELED' || err.message?.includes('cancel')) {
                    onCancelRef.current?.()
                    return { success: false, cancelled: true }
                }
                
                // Handle popup blocker
                if (err.message?.includes('OR_BIBED_15') || err.message?.includes('pop-up')) {
                    const popupError = {
                        code: 'POPUP_BLOCKED',
                        message: 'Google Pay popup was blocked. Please allow popups and try again.'
                    }
                    setError(popupError)
                    onErrorRef.current?.(popupError)
                    return { success: false, error: popupError }
                }

                // Handle other errors
                const errorDetails = {
                    code: err.code || GOOGLE_PAY_ERROR_CODES.PAYMENT_FAILED,
                    message: GENERIC_API_ERROR_MESSAGE
                }
                setError(errorDetails)
                onErrorRef.current?.(errorDetails)
                return { success: false, error: errorDetails }
            })
    }, [])

    // =============================================================================
    // Cart/PDP Payment Flow
    // =============================================================================

    /**
     * Load Google Pay payment data for cart/pdp flows
     * 
     * Opens the Google Pay modal and handles the full payment flow via callbacks.
     * For cart/pdp contexts, the onPaymentDataChanged and onPaymentAuthorized
     * callbacks handle shipping and payment authorization.
     * 
     * CRITICAL: This function uses synchronous promise chaining to maintain
     * user gesture context for the popup. Do not convert to async/await.
     * 
     * @param {Object} paymentDetails - Payment details
     * @param {string|number} paymentDetails.amount - Payment amount (in dollars)
     * @param {string} paymentDetails.currencyCode - Currency code (e.g., 'USD')
     * @param {Array} [paymentDetails.displayItems] - Line items to display
     * @returns {Promise<Object>} Result from onPaymentAuthorized
     * 
     * @example
     * // Cart flow - callbacks handle everything
     * const result = await loadPaymentData({
     *   amount: '99.99',
     *   currencyCode: 'USD',
     *   displayItems: [
     *     { label: 'Subtotal', type: 'SUBTOTAL', price: '85.00' },
     *     { label: 'Shipping', type: 'LINE_ITEM', price: '5.99' },
     *     { label: 'Tax', type: 'TAX', price: '8.00' }
     *   ]
     * })
     */
    const loadPaymentData = useCallback((paymentDetails = {}) => {
        const { amount, currencyCode, displayItems } = paymentDetails

        // Validation - synchronous checks
        if (!amount) {
            const err = {
                code: GOOGLE_PAY_ERROR_CODES.INVALID_CONFIG,
                message: 'Payment amount is required'
            }
            setError(err)
            onErrorRef.current?.(err)
            return Promise.resolve({ success: false, error: err })
        }

        if (!currencyCode) {
            const err = {
                code: GOOGLE_PAY_ERROR_CODES.INVALID_CONFIG,
                message: 'Currency code is required'
            }
            setError(err)
            onErrorRef.current?.(err)
            return Promise.resolve({ success: false, error: err })
        }

        if (!paymentsClientRef.current || !configRef.current) {
            const err = {
                code: GOOGLE_PAY_ERROR_CODES.CLIENT_NOT_INITIALIZED,
                message: 'Google Pay is not initialized'
            }
            setError(err)
            onErrorRef.current?.(err)
            return Promise.resolve({ success: false, error: err })
        }

        // Validate callbacks when they are required (cart/pdp context OR direct callbacks flow)
        if (requiresCallbacks && !onPaymentDataChangedRef.current) {
            const err = {
                code: GOOGLE_PAY_ERROR_CODES.INVALID_CONFIG,
                message: 'onPaymentDataChanged callback is required for shipping flow'
            }
            setError(err)
            onErrorRef.current?.(err)
            return Promise.resolve({ success: false, error: err })
        }

        if (requiresCallbacks && !onPaymentAuthorizedRef.current) {
            const err = {
                code: GOOGLE_PAY_ERROR_CODES.INVALID_CONFIG,
                message: 'onPaymentAuthorized callback is required for shipping flow'
            }
            setError(err)
            onErrorRef.current?.(err)
            return Promise.resolve({ success: false, error: err })
        }

        // Build payment data request options
        const requestOptions = displayItems ? { displayItems } : {}
        
        // When callbacks are required, ensure callback intents are set for shipping flow
        // Use string literals to avoid any import/minification issues
        if (requiresCallbacks) {
            requestOptions.callbackIntents = [
                'SHIPPING_ADDRESS',
                'SHIPPING_OPTION',
                'PAYMENT_AUTHORIZATION'
            ]
            requestOptions.shippingOptionRequired = true
        }

        // Build payment data request
        const paymentDataRequest = configRef.current.buildPaymentDataRequest(
            String(amount),
            currencyCode,
            requestOptions
        )

        // Set processing state
        setIsProcessing(true)
        setError(null)

        // Call loadPaymentData - opens Google Pay popup
        // For cart/pdp, callbacks handle shipping and payment
        // MUST use .then() not async/await to preserve user gesture context
        return paymentsClientRef.current.loadPaymentData(paymentDataRequest)
            .then((paymentData) => {
                if (!mountedRef.current) {
                    return { success: false, error: { code: 'UNMOUNTED', message: 'Component unmounted' } }
                }

                setIsProcessing(false)

                // For cart/pdp, the onPaymentAuthorized callback already handled everything
                // Return success with the payment data
                return {
                    success: true,
                    paymentData,
                    context
                }
            })
            .catch((err) => {
                if (!mountedRef.current) {
                    return { success: false, error: { code: 'UNMOUNTED', message: 'Component unmounted' } }
                }

                setIsProcessing(false)

                // Handle user cancellation
                if (err.statusCode === 'CANCELED' || err.message?.includes('cancel')) {
                    onCancelRef.current?.()
                    return { success: false, cancelled: true }
                }
                
                // Handle popup blocker
                if (err.message?.includes('OR_BIBED_15') || err.message?.includes('pop-up')) {
                    const popupError = {
                        code: 'POPUP_BLOCKED',
                        message: 'Google Pay popup was blocked. Please allow popups and try again.'
                    }
                    setError(popupError)
                    onErrorRef.current?.(popupError)
                    return { success: false, error: popupError }
                }

                // Handle other errors
                const errorDetails = {
                    code: err.code || GOOGLE_PAY_ERROR_CODES.PAYMENT_FAILED,
                    message: GENERIC_API_ERROR_MESSAGE
                }
                setError(errorDetails)
                onErrorRef.current?.(errorDetails)
                return { success: false, error: errorDetails }
            })
    }, [context, isCartOrPDPFlow])

    // =============================================================================
    // Utility Methods
    // =============================================================================

    /**
     * Reset error state
     */
    const resetError = useCallback(() => {
        setError(null)
    }, [])

    /**
     * Reset all state
     */
    const reset = useCallback(() => {
        setError(null)
        setIsProcessing(false)
    }, [])

    // =============================================================================
    // Effects
    // =============================================================================

    // Initialize on mount
    useEffect(() => {
        mountedRef.current = true
        initialize()

        return () => {
            mountedRef.current = false
        }
    }, [initialize])

    // Preload script on mount for performance
    useEffect(() => {
        preloadGooglePayScript()
    }, [])

    // =============================================================================
    // Return
    // =============================================================================

    return {
        // State
        isReady,
        isAvailable,
        isLoading,
        isProcessing,
        error,

        // Methods - checkout context
        getPaymentToken,
        
        // Methods - cart/pdp context
        loadPaymentData,
        
        // Utility methods
        resetError,
        reset,

        // Context information
        context,
        isCartOrPDPFlow,

        // Configuration
        config: googlePayConfig?.raw || null,
        
        // PaymentsClient instance (needed for button rendering)
        paymentsClient
    }
}

// =============================================================================
// Error Class
// =============================================================================

/**
 * Google Pay Error
 */
class GooglePayError extends Error {
    constructor(code, message, cause = null) {
        super(message)
        this.name = 'GooglePayError'
        this.code = code
        this.cause = cause
        
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, GooglePayError)
        }
    }
}

// Default export
export default useGooglePay
