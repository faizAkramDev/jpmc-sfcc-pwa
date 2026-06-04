/**
 * useApplePay Hook
 * 
 * A React hook that handles the complete Apple Pay payment flow:
 * 1. Checks if Apple Pay is available (Safari + cards in wallet)
 * 2. Creates ApplePaySession and handles merchant validation
 * 3. Processes payment authorization
 * 4. Calls server-side API for JPMC authorization
 * 5. Handles response and error recovery
 * 
 * This hook provides a plug-and-play Apple Pay integration
 * that works seamlessly with JP Morgan's payment processing.
 * 
 * @module useApplePay
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
    APPLE_PAY_API_VERSION,
    APPLE_PAY_MIN_VERSION,
    APPLE_PAY_ERROR_CODES,
    APPLE_PAY_DEFAULTS,
    getApplePayErrorMessage
} from '../utils/constants.mjs'
import { buildAuthHeaders } from '../utils/http/auth-headers.js'
import { GENERIC_API_ERROR_MESSAGE } from '../utils/constants/error-constants'

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_CONFIG = {
    apiBasePath: '/api/jpmorgan',
    sessionValidationEndpoint: '/applepay/session',
    authorizeEndpoint: '/applepay/authorize',
    sessionTimeout: 30000 // 30 seconds
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if Apple Pay is supported in the current browser
 * @returns {boolean} True if ApplePaySession API exists
 */
const isApplePaySessionSupported = () => {
    return typeof globalThis.window !== 'undefined' &&
           typeof globalThis.ApplePaySession !== 'undefined'
}

/**
 * Check if Apple Pay can make payments
 * @returns {Promise<boolean>} True if Apple Pay can make payments
 */
const canMakePayments = async () => {
    if (!isApplePaySessionSupported()) {
        return false
    }
    
    try {
        return globalThis.ApplePaySession.canMakePayments()
    } catch (err) {
        return false
    }
}

/**
 * Check if Apple Pay can make payments with active card
 * @param {string} merchantId - Apple Merchant ID
 * @returns {Promise<boolean>} True if user has active card
 */
const canMakePaymentsWithActiveCard = async (merchantId) => {
    if (!isApplePaySessionSupported() || !merchantId) {
        return false
    }
    
    try {
        return await globalThis.ApplePaySession.canMakePaymentsWithActiveCard(merchantId)
    } catch (err) {
        return false
    }
}

/**
 * Check if Apple Pay version is supported
 * @param {number} version - API version to check
 * @returns {boolean} True if version is supported
 */
const supportsVersion = (version = APPLE_PAY_API_VERSION) => {
    if (!isApplePaySessionSupported()) {
        return false
    }
    
    try {
        return globalThis.ApplePaySession.supportsVersion(version)
    } catch (err) {
        return false
    }
}

/**
 * Get the highest supported Apple Pay version
 * @returns {number} Highest supported version
 */
const getHighestSupportedVersion = () => {
    if (!isApplePaySessionSupported()) {
        return 0
    }
    
    for (let version = APPLE_PAY_API_VERSION; version >= APPLE_PAY_MIN_VERSION; version--) {
        if (supportsVersion(version)) {
            return version
        }
    }
    
    return 0
}

// =============================================================================
// Payment Authorization Helpers (extracted to reduce nesting depth)
// =============================================================================

/**
 * Create order using provided function
 * @private
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Result with orderNo or error
 */
async function createOrderForApplePay(createOrderFn, payment, merchantOrderNumber) {
    if (!createOrderFn) {
        return { success: true, orderNo: merchantOrderNumber, orderResult: null }
    }
    
    const orderResult = await createOrderFn({
        billingContact: payment.billingContact,
        shippingContact: payment.shippingContact
    })
    
    const orderNo = orderResult?.orderNo
    if (!orderNo) {
        return { success: false, error: { message: 'Order created but orderNo not returned' } }
    }
    
    return { success: true, orderNo, orderResult }
}

/**
 * Build success response for Apple Pay authorization
 * @private
 */
function buildApplePaySuccessResponse(authResult, orderNo, orderResult, payment) {
    return {
        success: true,
        data: authResult,
        orderNo,
        orderResult,
        billingContact: payment.billingContact,
        shippingContact: payment.shippingContact
    }
}

/**
 * Build failure response for Apple Pay authorization
 * @private
 */
function buildApplePayFailureResponse(authResult, orderNo, orderResult) {
    return {
        success: false,
        error: {
            code: authResult.error?.code || APPLE_PAY_ERROR_CODES.AUTHORIZATION_FAILED,
            message: GENERIC_API_ERROR_MESSAGE
        },
        orderNo,
        orderResult,
        step: 'authorization'
    }
}

/**
 * Validate shipping country against allowed countries list
 * @private
 * @param {Object} contact - Shipping contact
 * @param {string[]} allowedCountries - List of allowed country codes
 * @returns {Object|null} Error update object if country not allowed, null otherwise
 */
function validateShippingCountry(contact, allowedCountries, fallbackUpdate) {
    if (!allowedCountries?.length || !contact.countryCode) {
        return null
    }
    const selectedCountry = contact.countryCode.toUpperCase()
    const isAllowed = allowedCountries.some(c => c.toUpperCase() === selectedCountry)
    if (isAllowed) {
        return null
    }
    return {
        ...fallbackUpdate,
        errors: [
            new globalThis.ApplePayError(
                'addressUnserviceable',
                'countryCode',
                'Shipping is only available within the United States'
            )
        ]
    }
}

/**
 * Handle shipping contact selection callback
 * @private
 */
async function processShippingContactCallback(contact, callbackRef, fallbackUpdate) {
    if (!callbackRef.current) {
        return fallbackUpdate
    }
    try {
        return await callbackRef.current(contact)
    } catch (_err) {
        return fallbackUpdate
    }
}

/**
 * Handle order creation failure
 * @private
 */
function handleOrderCreationFailure(session, error, setError, setIsProcessing, onErrorRef, resolve) {
    session.completePayment({ status: globalThis.ApplePaySession.STATUS_FAILURE })
    setError(error)
    setIsProcessing(false)
    onErrorRef.current?.(error)
    resolve({ success: false, error, step: 'order_creation' })
}

/**
 * Handle missing authorization amount
 * @private
 */
function handleMissingAuthAmount(session, setError, setIsProcessing, onErrorRef, resolve) {
    const err = { code: APPLE_PAY_ERROR_CODES.PAYMENT_FAILED, message: 'Cannot determine authorize amount' }
    session.completePayment({ status: globalThis.ApplePaySession.STATUS_FAILURE })
    setError(err)
    setIsProcessing(false)
    onErrorRef.current?.(err)
    resolve({ success: false, error: err })
}

/**
 * Create order creation error object
 * Extracted to reduce nesting depth in async handlers
 * @private
 */
const createOrderCreationError = (err) => ({
    success: false,
    error: { code: APPLE_PAY_ERROR_CODES.PAYMENT_FAILED, message: GENERIC_API_ERROR_MESSAGE }
})

/**
 * Create authorization error object
 * Extracted to reduce nesting depth in async handlers
 * @private
 */
const createAuthError = (err) => ({
    success: false,
    error: { code: err.code || APPLE_PAY_ERROR_CODES.PAYMENT_FAILED, message: GENERIC_API_ERROR_MESSAGE }
})

/**
 * Handle successful payment authorization
 * @private
 * @param {Object} options - Authorization success options
 */
function handleAuthorizationSuccess({ session, authResult, resolvedOrderNo, orderResult, payment, setPaymentResult, setIsProcessing, onSuccessRef, resolve }) {
    session.completePayment({ status: globalThis.ApplePaySession.STATUS_SUCCESS })
    setPaymentResult(authResult)
    setIsProcessing(false)
    onSuccessRef.current?.(authResult)
    resolve(buildApplePaySuccessResponse(authResult, resolvedOrderNo, orderResult, payment))
}

/**
 * Handle failed payment authorization
 * @private
 * @param {Object} options - Authorization failure options
 */
function handleAuthorizationFailure({ session, authResult, resolvedOrderNo, orderResult, setError, setIsProcessing, onErrorRef, resolve }) {
    session.completePayment({ status: globalThis.ApplePaySession.STATUS_FAILURE })
    const failureResponse = buildApplePayFailureResponse(authResult, resolvedOrderNo, orderResult)
    setError(failureResponse.error)
    setIsProcessing(false)
    onErrorRef.current?.(failureResponse.error)
    resolve(failureResponse)
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for handling Apple Pay payments with JP Morgan
 * 
 * @param {Object} options - Hook options
 * @param {string} options.merchantId - Apple Pay Merchant ID (e.g., 'merchant.com.yourcompany')
 * @param {string} options.merchantName - Merchant display name
 * @param {string} [options.environment] - 'sandbox' or 'production'
 * @param {string} [options.countryCode] - Country code (default: 'US')
 * @param {string} [options.currencyCode] - Currency code (default: 'USD')
 * @param {string[]} [options.supportedNetworks] - Supported card networks
 * @param {string[]} [options.merchantCapabilities] - Merchant capabilities
 * @param {boolean} [options.billingAddressRequired] - Require billing address
 * @param {boolean} [options.shippingAddressRequired] - Require shipping address
 * @param {boolean} [options.emailRequired] - Require email
 * @param {boolean} [options.phoneRequired] - Require phone
 * @param {string} [options.locale] - Locale for multi-MID support (e.g., 'en-CA')
 * @param {Function} [options.getAccessToken] - Async function to get SLAS access token for multi-MID CO lookup
 * @param {Function} [options.onSuccess] - Callback on successful payment
 * @param {Function} [options.onError] - Callback on payment error
 * @param {Function} [options.onCancel] - Callback on user cancellation
 * @param {Function} [options.onReady] - Callback when Apple Pay is ready
 * @param {Function} [options.onShippingMethodSelected] - Callback when shipping method selected
 * @param {Function} [options.onShippingContactSelected] - Callback when shipping contact selected
 * @param {string[]} [options.allowedShippingCountries] - ISO 3166-1 alpha-2 country codes allowed for
 *   shipping (e.g. ['US']). Defaults to ['US']. If the customer selects an address whose country is
 *   not in this list, an error is shown inline in the Apple Pay sheet and the sheet stays open.
 *   Pass an empty array ([]) to disable country restriction.
 * @returns {Object} Hook state and methods
 * 
 * @example
 * const {
 *   isReady,
 *   isAvailable,
 *   isProcessing,
 *   error,
 *   initiatePayment,
 *   resetError
 * } = useApplePay({
 *   merchantId: 'merchant.com.yourcompany',
 *   merchantName: 'Your Store',
 *   environment: 'sandbox',
 *   onSuccess: (result) => console.log('Payment successful', result),
 *   onError: (error) => console.error('Payment failed', error)
 * })
 */
export const useApplePay = (options = {}) => {
    const {
        merchantId,
        merchantName,
        countryCode = APPLE_PAY_DEFAULTS.countryCode,
        currencyCode = APPLE_PAY_DEFAULTS.currencyCode,
        supportedNetworks = APPLE_PAY_DEFAULTS.supportedNetworks,
        merchantCapabilities = APPLE_PAY_DEFAULTS.merchantCapabilities,
        billingAddressRequired = true,
        shippingAddressRequired = false,
        emailRequired = true,
        phoneRequired = false,
        locale,
        getAccessToken,
        onSuccess,
        onError,
        onCancel,
        onReady,
        onShippingMethodSelected,
        onShippingContactSelected,
        onPaymentMethodSelected,
        allowedShippingCountries = ['US'],
        apiBasePath = DEFAULT_CONFIG.apiBasePath,
        sessionValidationEndpoint = DEFAULT_CONFIG.sessionValidationEndpoint,
        authorizeEndpoint = DEFAULT_CONFIG.authorizeEndpoint
    } = options

    // State
    const [isReady, setIsReady] = useState(false)
    const [isAvailable, setIsAvailable] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isProcessing, setIsProcessing] = useState(false)
    const [error, setError] = useState(null)
    const [paymentResult, setPaymentResult] = useState(null)
    const [supportedVersion, setSupportedVersion] = useState(0)

    // Refs
    const mountedRef = useRef(true)
    const sessionRef = useRef(null)
    const initializedRef = useRef(false)
    
    // Callback refs to prevent unnecessary re-initialization
    const onReadyRef = useRef(onReady)
    const onErrorRef = useRef(onError)
    const onSuccessRef = useRef(onSuccess)
    const onCancelRef = useRef(onCancel)
    const onShippingMethodSelectedRef = useRef(onShippingMethodSelected)
    const onShippingContactSelectedRef = useRef(onShippingContactSelected)
    const onPaymentMethodSelectedRef = useRef(onPaymentMethodSelected)
    const allowedShippingCountriesRef = useRef(allowedShippingCountries)
    const getAccessTokenRef = useRef(getAccessToken)
    
    // Update callback refs when they change
    useEffect(() => {
        onReadyRef.current = onReady
        onErrorRef.current = onError
        onSuccessRef.current = onSuccess
        onCancelRef.current = onCancel
        onShippingMethodSelectedRef.current = onShippingMethodSelected
        onShippingContactSelectedRef.current = onShippingContactSelected
        onPaymentMethodSelectedRef.current = onPaymentMethodSelected
        allowedShippingCountriesRef.current = allowedShippingCountries
        getAccessTokenRef.current = getAccessToken
    }, [onReady, onError, onSuccess, onCancel, onShippingMethodSelected, onShippingContactSelected, onPaymentMethodSelected, allowedShippingCountries, getAccessToken])

    // =============================================================================
    // Build Payment Request
    // =============================================================================

    /**
     * Build Apple Pay payment request object
     * @param {Object} paymentDetails - Payment details
     * @returns {Object} Apple Pay payment request
     */
    const buildPaymentRequest = useCallback((paymentDetails = {}) => {
        const {
            amount,
            label = merchantName || 'Total',
            lineItems = [],
            shippingMethods = [],
            shippingType = APPLE_PAY_DEFAULTS.shippingType
        } = paymentDetails

        // Build required contact fields
        const requiredBillingContactFields = billingAddressRequired 
            ? [...APPLE_PAY_DEFAULTS.requiredBillingContactFields]
            : []
        
        const requiredShippingContactFields = []
        if (shippingAddressRequired) {
            requiredShippingContactFields.push('postalAddress', 'name')
        }
        if (emailRequired) {
            requiredShippingContactFields.push('email')
        }
        if (phoneRequired) {
            requiredShippingContactFields.push('phone')
        }

        const paymentRequest = {
            countryCode,
            currencyCode,
            merchantCapabilities,
            supportedNetworks,
            total: {
                label,
                amount: String(amount),
                type: 'final'
            }
        }

        // Add line items if provided
        if (lineItems.length > 0) {
            paymentRequest.lineItems = lineItems.map(item => ({
                label: item.label,
                amount: String(item.amount),
                type: item.type || 'final'
            }))
        }

        // Add billing contact fields
        if (requiredBillingContactFields.length > 0) {
            paymentRequest.requiredBillingContactFields = requiredBillingContactFields
        }

        // Add shipping contact fields
        if (requiredShippingContactFields.length > 0) {
            paymentRequest.requiredShippingContactFields = requiredShippingContactFields
        }

        // Add shipping methods if provided
        if (shippingMethods.length > 0) {
            paymentRequest.shippingMethods = shippingMethods
            paymentRequest.shippingType = shippingType
        }

        // Pre-populate shipping contact from storefront-collected data
        // Apple Pay will pre-select this in the sheet, user can still change it.
        // shippingContact fields: givenName, familyName, emailAddress, phoneNumber,
        //   addressLines, locality, administrativeArea, postalCode, countryCode (lowercase)
        if (paymentDetails.shippingContact) {
            paymentRequest.shippingContact = paymentDetails.shippingContact
        }

        return paymentRequest
    }, [
        merchantName,
        countryCode,
        currencyCode,
        merchantCapabilities,
        supportedNetworks,
        billingAddressRequired,
        shippingAddressRequired,
        emailRequired,
        phoneRequired
    ])

    // =============================================================================
    // Initialization
    // =============================================================================

    /**
     * Initialize Apple Pay
     * - Check if Apple Pay is supported
     * - Check if user has cards in wallet
     */
    const initialize = useCallback(async () => {
        if (typeof window === 'undefined') {
            setIsLoading(false)
            return
        }

        if (initializedRef.current) {
            setIsLoading(false)
            return
        }

        if (!merchantId) {
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        setError(null)

        try {
            if (!isApplePaySessionSupported()) {
                setIsAvailable(false)
                setIsReady(true)
                initializedRef.current = true
                setIsLoading(false)
                return
            }

            // supportsVersion(), canMakePayments(), and canMakePaymentsWithActiveCard()
            // all require HTTPS. On HTTP (localhost dev), skip all three checks and
            // mark as available so the button renders for development testing.
            if (globalThis.location.protocol !== 'https:') {
                setIsAvailable(true)
                setIsReady(true)
                initializedRef.current = true
                setIsLoading(false)
                onReadyRef.current?.()
                return
            }

            const version = getHighestSupportedVersion()
            setSupportedVersion(version)

            if (version < APPLE_PAY_MIN_VERSION) {
                setIsAvailable(false)
                setIsReady(true)
                initializedRef.current = true
                setIsLoading(false)
                return
            }

            const canPay = await canMakePayments()

            if (!mountedRef.current) return

            if (!canPay) {
                setIsAvailable(false)
                setIsReady(true)
                initializedRef.current = true
                setIsLoading(false)
                return
            }

            const hasActiveCard = await canMakePaymentsWithActiveCard(merchantId)

            if (!mountedRef.current) return

            setIsAvailable(hasActiveCard)
            setIsReady(true)
            initializedRef.current = true

            if (hasActiveCard) {
                onReadyRef.current?.()
            }

        } catch (err) {
            if (!mountedRef.current) return

            const errorDetails = {
                code: APPLE_PAY_ERROR_CODES.SESSION_ERROR,
                message: GENERIC_API_ERROR_MESSAGE
            }
            
            setError(errorDetails)
            setIsAvailable(false)
            setIsReady(true)
            onErrorRef.current?.(errorDetails)
        } finally {
            if (mountedRef.current) {
                setIsLoading(false)
            }
        }
    }, [merchantId])

    // =============================================================================
    // Merchant Validation
    // =============================================================================

    /**
     * Validate merchant with Apple Pay servers via our SSR endpoint
     * @param {string} validationURL - Apple's validation URL
     * @returns {Promise<Object>} Merchant session from Apple
     */
    const validateMerchant = useCallback(async (validationURL) => {
        const localeParam = locale ? `?locale=${encodeURIComponent(locale)}` : ''
        
        // Build headers with optional Authorization for multi-MID CO lookup
        const headers = await buildAuthHeaders({ getAccessToken: getAccessTokenRef.current })
        
        const response = await fetch(`${apiBasePath}${sessionValidationEndpoint}${localeParam}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                validationURL,
                merchantId,
                merchantName,
                domain: globalThis.location.hostname
            })
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new ApplePayError(
                APPLE_PAY_ERROR_CODES.MERCHANT_VALIDATION_FAILED,
                GENERIC_API_ERROR_MESSAGE
            )
        }

        return await response.json()
    }, [apiBasePath, sessionValidationEndpoint, merchantId, merchantName, locale])

    // =============================================================================
    // Payment Authorization
    // =============================================================================

    /**
     * Authorize payment with JP Morgan API
     * @param {Object} params - Authorization parameters
     * @returns {Promise<Object>} Authorization result
     */
    const authorizePayment = useCallback(async (params) => {
        const {
            applePayToken,
            amount,
            currencyCode: currency,
            merchantOrderNumber,
            billingContact,
            shippingContact
        } = params

        const localeParam = locale ? `?locale=${encodeURIComponent(locale)}` : ''
        
        // Build headers with optional Authorization for multi-MID CO lookup
        const headers = await buildAuthHeaders({ getAccessToken: getAccessTokenRef.current })
        
        const response = await fetch(`${apiBasePath}${authorizeEndpoint}${localeParam}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                paymentMethod: 'applepay',
                applePayToken,
                amount,
                currency,
                merchantOrderNumber,
                billingContact,
                shippingContact
            })
        })

        const data = await response.json()

        if (!response.ok) {
            return {
                success: false,
                error: {
                    code: data.error?.code || APPLE_PAY_ERROR_CODES.AUTHORIZATION_FAILED,
                    message: GENERIC_API_ERROR_MESSAGE
                }
            }
        }

        return {
            success: true,
            ...data
        }
    }, [apiBasePath, authorizeEndpoint, locale])

    // =============================================================================
    // Payment Flow
    // =============================================================================

    /**
     * Initiate Apple Pay payment
     * 
     * CRITICAL: This function should be called directly from a user gesture (click event)
     * to ensure the Apple Pay sheet can be displayed.
     * 
     * @param {Object} paymentDetails - Payment details
     * @param {string|number} paymentDetails.amount - Payment amount
     * @param {string} [paymentDetails.label] - Total label (default: merchantName)
     * @param {Array} [paymentDetails.lineItems] - Line items
     * @param {Array} [paymentDetails.shippingMethods] - Shipping methods
     * @param {string} [paymentDetails.merchantOrderNumber] - Merchant order reference
     * @returns {Promise<Object>} Payment result
     * 
     * @example
     * initiatePayment({
     *   amount: '99.99',
     *   label: 'Your Store',
     *   merchantOrderNumber: 'ORDER-12345'
     * })
     */
    const initiatePayment = useCallback((paymentDetails = {}) => {
        return new Promise((resolve) => {
            const { amount, merchantOrderNumber, createOrderFn } = paymentDetails

            // Validation
            if (!amount) {
                const err = {
                    code: APPLE_PAY_ERROR_CODES.INVALID_CONFIG,
                    message: 'Payment amount is required'
                }
                setError(err)
                onErrorRef.current?.(err)
                resolve({ success: false, error: err })
                return
            }

            if (!isAvailable) {
                const err = {
                    code: APPLE_PAY_ERROR_CODES.NOT_AVAILABLE,
                    message: getApplePayErrorMessage(APPLE_PAY_ERROR_CODES.NOT_AVAILABLE)
                }
                setError(err)
                onErrorRef.current?.(err)
                resolve({ success: false, error: err })
                return
            }

            // Build payment request
            const paymentRequest = buildPaymentRequest(paymentDetails)

            // Create Apple Pay session
            const version = supportedVersion || APPLE_PAY_API_VERSION
            let session

            try {
                session = new globalThis.ApplePaySession(version, paymentRequest)
                sessionRef.current = session
            } catch (err) {
                const errorDetails = {
                    code: APPLE_PAY_ERROR_CODES.SESSION_ERROR,
                    message: GENERIC_API_ERROR_MESSAGE
                }
                setError(errorDetails)
                onErrorRef.current?.(errorDetails)
                resolve({ success: false, error: errorDetails })
                return
            }

            setIsProcessing(true)
            setError(null)
            setPaymentResult(null)

            // Handle merchant validation
            session.onvalidatemerchant = async (event) => {
                try {
                    const merchantSession = await validateMerchant(event.validationURL)
                    session.completeMerchantValidation(merchantSession)
                } catch (err) {
                    const errorDetails = {
                        code: APPLE_PAY_ERROR_CODES.MERCHANT_VALIDATION_FAILED,
                        message: GENERIC_API_ERROR_MESSAGE
                    }
                    setError(errorDetails)
                    setIsProcessing(false)
                    onErrorRef.current?.(errorDetails)
                    session.abort()
                    resolve({ success: false, error: errorDetails })
                }
            }

            session.onpaymentmethodselected = async (event) => {
                if (onPaymentMethodSelectedRef.current) {
                    try {
                        const update = await onPaymentMethodSelectedRef.current(event.paymentMethod)
                        session.completePaymentMethodSelection(update || {
                            newTotal: paymentRequest.total,
                            newLineItems: paymentRequest.lineItems || []
                        })
                    } catch (_err) {
                        session.completePaymentMethodSelection({
                            newTotal: paymentRequest.total,
                            newLineItems: paymentRequest.lineItems || []
                        })
                    }
                } else {
                    session.completePaymentMethodSelection({
                        newTotal: paymentRequest.total,
                        newLineItems: paymentRequest.lineItems || []
                    })
                }
            }

            session.onshippingmethodselected = async (event) => {
                if (onShippingMethodSelectedRef.current) {
                    try {
                        const update = await onShippingMethodSelectedRef.current(event.shippingMethod)
                        session.completeShippingMethodSelection(update)
                    } catch (_err) {
                        session.completeShippingMethodSelection({
                            newTotal: paymentRequest.total,
                            newLineItems: paymentRequest.lineItems || []
                        })
                    }
                } else {
                    session.completeShippingMethodSelection({
                        newTotal: paymentRequest.total,
                        newLineItems: paymentRequest.lineItems || []
                    })
                }
            }

            session.onshippingcontactselected = async (event) => {
                const contact = event.shippingContact
                const hasShippingMethods = paymentRequest.shippingMethods?.length > 0
                const fallbackUpdate = {
                    newTotal: paymentRequest.total,
                    newLineItems: paymentRequest.lineItems || [],
                    ...(hasShippingMethods ? {newShippingMethods: paymentRequest.shippingMethods} : {})
                }

                // Use helper to validate country
                const countryError = validateShippingCountry(contact, allowedShippingCountriesRef.current, fallbackUpdate)
                if (countryError) {
                    session.completeShippingContactSelection(countryError)
                    return
                }

                // Use helper to process callback
                const update = await processShippingContactCallback(contact, onShippingContactSelectedRef, fallbackUpdate)
                session.completeShippingContactSelection(update)
            }

            session.onpaymentauthorized = async (event) => {
                const payment = event.payment
                
                // Step 1: Create order if createOrderFn provided
                const orderCreation = await createOrderForApplePay(createOrderFn, payment, merchantOrderNumber)
                    .catch(createOrderCreationError)
                
                if (!orderCreation.success) {
                    handleOrderCreationFailure(session, orderCreation.error, setError, setIsProcessing, onErrorRef, resolve)
                    return
                }
                
                const { orderNo: resolvedOrderNo, orderResult } = orderCreation
                
                // Step 2: Determine authorization amount
                const authAmount = orderResult?.basketTotal ?? orderResult?.orderTotal
                if (!authAmount) {
                    handleMissingAuthAmount(session, setError, setIsProcessing, onErrorRef, resolve)
                    return
                }
                
                // Step 3: Authorize payment
                const authResult = await authorizePayment({
                    applePayToken: payment.token,
                    amount: authAmount,
                    currencyCode,
                    merchantOrderNumber: resolvedOrderNo,
                    billingContact: payment.billingContact,
                    shippingContact: payment.shippingContact
                }).catch(createAuthError)

                if (!mountedRef.current) {
                    session.completePayment({ status: globalThis.ApplePaySession.STATUS_FAILURE })
                    resolve({ success: false, error: { code: 'UNMOUNTED', message: 'Component unmounted' } })
                    return
                }

                // Step 4: Handle authorization result
                if (authResult.success) {
                    handleAuthorizationSuccess({ session, authResult, resolvedOrderNo, orderResult, payment, setPaymentResult, setIsProcessing, onSuccessRef, resolve })
                    return
                }
                
                // Authorization failed
                handleAuthorizationFailure({ session, authResult, resolvedOrderNo, orderResult, setError, setIsProcessing, onErrorRef, resolve })
            }

            // Handle cancellation
            session.oncancel = () => {
                if (!mountedRef.current) {
                    resolve({ success: false, error: { code: 'CANCELLED', message: 'Payment cancelled' }, cancelled: true })
                    return
                }

                setIsProcessing(false)
                onCancelRef.current?.()
                resolve({ success: false, cancelled: true })
            }

            // Start the session
            try {
                session.begin()
            } catch (err) {
                const errorDetails = {
                    code: APPLE_PAY_ERROR_CODES.SESSION_ERROR,
                    message: GENERIC_API_ERROR_MESSAGE
                }
                setError(errorDetails)
                setIsProcessing(false)
                onErrorRef.current?.(errorDetails)
                resolve({ success: false, error: errorDetails })
            }
        })
    }, [
        isAvailable,
        supportedVersion,
        currencyCode,
        buildPaymentRequest,
        validateMerchant,
        authorizePayment
    ])

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
        setPaymentResult(null)
        setIsProcessing(false)
    }, [])

    /**
     * Abort current session if in progress
     */
    const abort = useCallback(() => {
        if (sessionRef.current) {
            try {
                sessionRef.current.abort()
            } catch (err) {
                // Session may already be complete
            }
            sessionRef.current = null
        }
        setIsProcessing(false)
    }, [])

    // =============================================================================
    // Effects
    // =============================================================================

    // Track mount/unmount separately from initialize.
    // CRITICAL: must use [] — not [initialize] — so mountedRef.current only flips on
    // actual component unmount, not on merchantId changes which recreate `initialize`
    // and would cause the cleanup to set mountedRef.current = false mid-payment.
    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    // Initialize (and re-initialize) when merchantId changes
    useEffect(() => {
        initialize()

        return () => {
            // Abort any in-progress session when re-initializing or unmounting
            if (sessionRef.current) {
                try {
                    sessionRef.current.abort()
                } catch (err) {
                    // Ignore
                }
            }
        }
    }, [initialize])

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
        paymentResult,
        supportedVersion,

        // Methods
        initiatePayment,
        resetError,
        reset,
        abort,

        // Helpers
        canMakePayments: isAvailable,
        isSupported: isApplePaySessionSupported()
    }
}

// =============================================================================
// Error Class
// =============================================================================

/**
 * Apple Pay Error
 * Custom error class for Apple Pay operations
 */
class ApplePayError extends Error {
    constructor(code, message, cause = null) {
        super(message)
        this.name = 'ApplePayError'
        this.code = code
        this.cause = cause
        
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ApplePayError)
        }
    }
}

// Named export
export { ApplePayError }

// Default export
export default useApplePay
