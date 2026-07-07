/**
 * useJPMorganPayment Hook
 * 
 * A React hook that handles the complete JPMC payment flow:
 * 1. Loads PIE encryption SDK (client-side)
 * 2. Encrypts card data before submission
 * 3. Calls server-side API for authorization
 * 4. Handles response and retry logic
 * 
 * This hook is designed to work with PWA Kit's standard PaymentForm.
 * 
 * @module useJPMorganPayment
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { loadPIESDK, isPIEReady, encryptCardData as pieEncrypt, getPIEState } from '../services/pie-encryption'
import { buildAuthHeaders } from '../utils/http/auth-headers.js'
import { GENERIC_API_ERROR_MESSAGE } from '../utils/constants/error-constants'

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_CONFIG = {
    maxRetries: 3,
    apiBasePath: '/api/jpmorgan'
}

/**
 * Fetch JPMC config from server
 * @private
 */
const fetchJPMCConfig = async ({ locale, getAccessToken, apiBasePath }) => {
    const configUrl = locale
        ? `${apiBasePath}/config?locale=${encodeURIComponent(locale)}`
        : `${apiBasePath}/config`
    
    const headers = { 'Content-Type': 'application/json' }
    let slasTokenStatus = 'not_attempted'
    
    if (getAccessToken) {
        try {
            const token = await getAccessToken()
            if (token) {
                headers['Authorization'] = `Bearer ${token}`
                slasTokenStatus = 'obtained'
            } else {
                slasTokenStatus = 'null_response'
                console.warn('[useJPMorganPayment] ⚠️  getAccessToken() returned null/undefined - custom object lookup will be SKIPPED, using Site Preferences instead')
            }
        } catch (tokenErr) {
            slasTokenStatus = 'error'
            console.warn('[useJPMorganPayment] ⚠️  Failed to get SLAS token:', tokenErr?.message, '- custom object lookup will be SKIPPED, using Site Preferences instead')
            // Token fetch failed, proceed without it (will fall back to Site Preferences)
        }
    } else {
        slasTokenStatus = 'not_provided'
        console.warn('[useJPMorganPayment] ⚠️  getAccessToken function not provided - custom object lookup will be SKIPPED, using Site Preferences instead')
    }
    
    const configResponse = await fetch(configUrl, {
        method: 'POST',
        headers
    })
    
    if (configResponse.ok) {
        const config = await configResponse.json()
        
        return config
    }
    
    
    return null
}

// =============================================================================
// Request Body Builders (extracted to reduce cognitive complexity)
// =============================================================================

/**
 * Build request body for Google Pay authorization
 * Note: Google Pay has its own authentication, 3DS/browserInfo not needed
 * @private
 */
const buildGooglePayRequestBody = ({ googlePayToken, amount, currency, merchantOrderNumber, captureMethod, billingAddress, accountHolder, fraudShoppingCart, shipTo, kountSessionId, fraudRuleAction, paymentInstrumentId, paymentAmount }) => ({
    paymentMethod: 'googlepay',
    googlePayToken,
    amount,
    currency,
    merchantOrderNumber,
    captureMethod,
    billingAddress,
    accountHolder,
    fraudShoppingCart,
    shipTo,
    kountSessionId,
    fraudRuleAction,
    // For server-side order patching after successful auth
    paymentInstrumentId,
    paymentAmount
})

/**
 * Build request body for SAFETECH token authorization
 * @private
 */
const buildTokenRequestBody = ({ tokenRef, cardExpiry, amount, currency, merchantOrderNumber, captureMethod, billingAddress, accountHolder, fraudShoppingCart, shipTo, kountSessionId, fraudRuleAction, browserInfo, paymentInstrumentId, paymentAmount, cardTypeName, cardType }) => ({
    tokenRef, // Encrypted token reference - server decrypts
    cardExpiry,
    amount,
    currency,
    merchantOrderNumber,
    captureMethod,
    billingAddress,
    accountHolder,
    fraudShoppingCart,
    shipTo,
    kountSessionId,
    fraudRuleAction,
    browserInfo,
    // For server-side order patching after successful auth
    paymentInstrumentId,
    paymentAmount,
    // Card type for 3DS support check
    cardTypeName,
    cardType
})

/**
 * Build request body for encrypted card authorization
 * @private
 */
const buildEncryptedCardRequestBody = ({ card, amount, currency, merchantOrderNumber, captureMethod, billingAddress, accountHolder, fraudShoppingCart, shipTo, kountSessionId, fraudRuleAction, browserInfo, paymentInstrumentId, paymentAmount, cardTypeName, cardType }) => ({
    amount,
    currency,
    merchantOrderNumber,
    captureMethod,
    card: {
        encryptedCardNumber: card.encryptedCardNumber,
        encryptedCVV: card.encryptedCVV,
        integrityCheck: card.integrityCheck,
        expiryMonth: Number.parseInt(card.expiryMonth || card.expiry?.month),
        expiryYear: Number.parseInt(card.expiryYear || card.expiry?.year)
    },
    billingAddress,
    accountHolder: accountHolder || {
        fullName: card.holder || card.cardholderName
    },
    fraudShoppingCart,
    shipTo,
    kountSessionId,
    fraudRuleAction,
    browserInfo,
    // For server-side order patching after successful auth
    paymentInstrumentId,
    paymentAmount,
    // Card type for 3DS support check
    cardTypeName,
    cardType
})

/**
 * Build request body for card authorization (handles encryption if needed)
 * @private
 */
const buildCardAuthRequestBody = (card, commonParams, encryptCard) => {
    const isAlreadyEncrypted = card.encryptedCardNumber && card.encryptedCVV
    
    if (isAlreadyEncrypted) {
        return buildEncryptedCardRequestBody({ card, ...commonParams })
    }
    
    // Card needs encryption
    if (!isPIEReady()) {
        throw new Error('PIE encryption SDK not available. Card encryption is required for payments.')
    }
    
    const encrypted = encryptCard({
        cardNumber: card.cardNumber || card.number,
        cvv: card.cvv || card.securityCode
    })
    
    if (!encrypted) {
        throw new Error('Failed to encrypt card data. Please try again.')
    }
    
    const encryptedCard = {
        encryptedCardNumber: encrypted.encryptedCardNumber,
        encryptedCVV: encrypted.encryptedCVV,
        integrityCheck: encrypted.integrityCheck,
        expiryMonth: card.expiryMonth || card.expiry?.month,
        expiryYear: card.expiryYear || card.expiry?.year,
        holder: card.holder || card.cardholderName
    }
    
    return buildEncryptedCardRequestBody({ card: encryptedCard, ...commonParams })
}

const isCardMasked = (cardData) => {
    if (!cardData) return true
    
    const cardNumber = typeof cardData === 'string' 
        ? cardData 
        : cardData.cardNumber || cardData.encryptedCardNumber
    
    if (!cardNumber) return true
    
    if (/[\*Xx]{4,}/.test(cardNumber)) return true
    if (/^[\*Xx\s\-]+\d{4}$/.test(cardNumber)) return true
    if (cardNumber.length <= 4) return true
    
    return false
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for handling JP Morgan payments with PIE encryption
 * 
 * @param {object} options - Hook options
 * @param {string} options.merchantId - JPMC merchant ID (for PIE SDK)
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {string} options.locale - Locale ID for multi-MID support (e.g., 'en_CA')
 * @param {function} options.onSuccess - Callback on successful payment
 * @param {function} options.onError - Callback on payment error
 * @returns {object} Hook state and methods
 * 
 * @example
 * const {
 *   isReady,
 *   isProcessing,
 *   error,
 *   authorize,
 *   resetError
 * } = useJPMorganPayment({
 *   merchantId: '100000000005',
 *   locale: 'en_CA',
 *   getAccessToken: async () => slasToken, // For multi-MID Custom Object lookup
 *   onSuccess: (result) => console.log('Payment successful', result),
 *   onError: (error) => console.error('Payment failed', error)
 * })
 */
export const useJPMorganPayment = (options = {}) => {
    const {
        merchantId: initialMerchantId,
        maxRetries = DEFAULT_CONFIG.maxRetries,
        locale,
        getAccessToken,
        onSuccess,
        onError
    } = options

    // State
    const [isReady, setIsReady] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isProcessing, setIsProcessing] = useState(false)
    const [error, setError] = useState(null)
    const [config, setConfig] = useState({
        merchantId: initialMerchantId,
        captureMethod: null // Will be set from BM config
    })
    const [retryCount, setRetryCount] = useState(0)

    // Refs
    const mountedRef = useRef(true)

    // =============================================================================
    // Initialization
    // =============================================================================

    /**
     * Fetch JPMC config from server and initialize PIE SDK
     */
    const initialize = useCallback(async () => {
        
        if (typeof window === 'undefined') {
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        setError(null)

        try {
            // First, get config from server (includes merchantId and PIE URLs)
            let merchantId = config.merchantId
            let pieUrls = null

            if (!merchantId) {
                const serverConfig = await fetchJPMCConfig({
                    locale,
                    getAccessToken,
                    apiBasePath: DEFAULT_CONFIG.apiBasePath
                })
                
                if (serverConfig) {
                    merchantId = serverConfig.merchantId
                    pieUrls = serverConfig.pieUrls
                    const captureMethod = serverConfig.captureMethod
                    
                    
                    
                    if (mountedRef.current) {
                        setConfig({
                            merchantId,
                            pieUrls,
                            captureMethod,
                            checkoutMode: serverConfig.checkoutMode || 'PIE',
                            dropInEnabled: serverConfig.dropInEnabled === true,
                            dropInScriptUrl: serverConfig.dropInScriptUrl || null
                        })
                    }
                }
            }

            if (!merchantId) {
                throw new Error('Unable to get merchant configuration')
            }

            // Load PIE SDK (required for production)
            const loaded = await loadPIESDK({ merchantId, pieUrls })

            if (mountedRef.current) {
                if (!loaded) {
                    setIsLoading(false)
                    setError({
                        code: 'PIE_LOAD_ERROR',
                        message: 'Failed to load PIE encryption SDK. Payments require card encryption.'
                    })
                } else {
                    setIsReady(loaded)
                    setIsLoading(false)
                }
            }
        } catch (err) {
            if (mountedRef.current) {
                setIsLoading(false)
                setError({
                    code: 'INITIALIZATION_ERROR',
                    message: GENERIC_API_ERROR_MESSAGE
                })
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.merchantId])

    // Initialize on mount
    useEffect(() => {
        mountedRef.current = true
        initialize()

        return () => {
            mountedRef.current = false
        }
    }, [initialize])

    // =============================================================================
    // Payment Methods
    // =============================================================================

    /**
     * Encrypt card data using PIE SDK
     * 
     * @param {object} cardData - { cardNumber, cvv, expiryMonth, expiryYear }
     * @returns {object|null} Encrypted card data or null on error
     */
    const encryptCard = useCallback((cardData) => {
        if (!isPIEReady()) {
            return null
        }

        const { cardNumber, cvv } = cardData
        return pieEncrypt(cardNumber, cvv)
    }, [])

    /**
     * Authorize payment with encrypted card data
     * 
     * IMPORTANT: This function is called AFTER order creation (order-first flow).
     * The merchantOrderNumber must be the SFCC orderNo, not basketId.
     * 
     * @param {object} paymentData - Payment details
     * @param {object} paymentData.card - Card data (cardNumber, cvv, expiryMonth, expiryYear, holder)
     * @param {number} paymentData.amount - Amount in cents
     * @param {string} paymentData.currency - Currency code (default: USD)
     * @param {string} paymentData.merchantOrderNumber - SFCC orderNo (REQUIRED - set after order creation)
     * @param {string} paymentData.captureMethod - 'NOW' or 'MANUAL' (optional - uses BM config if not provided)
     * @param {object} paymentData.billingAddress - Billing address
     * @returns {Promise<object>} Payment result
     */
    const authorize = useCallback(async (paymentData) => {
        const { card, tokenRef, googlePayToken, paymentMethod, amount, currency, merchantOrderNumber, billingAddress, accountHolder, fraudShoppingCart, shipTo, kountSessionId, fraudRuleAction, cardExpiry, browserInfo, paymentInstrumentId, paymentAmount, cardTypeName, cardType } = paymentData
        
        // Check if this payment method requires PIE encryption
        // Google Pay and token-based payments provide their own encrypted tokens
        const requiresPIEEncryption = card && !card.encryptedCardNumber && !tokenRef && !googlePayToken && paymentMethod !== 'googlepay'
        
        if (requiresPIEEncryption && !isReady) {
            const err = {
                code: 'NOT_READY',
                message: 'Payment system is not ready. Please wait or refresh the page.'
            }
            setError(err)
            onError?.(err)
            return { success: false, ...err }
        }

        setIsProcessing(true)
        setError(null)

        try {
            const captureMethod = paymentData.captureMethod || config.captureMethod
            
            if (!merchantOrderNumber) {
                throw new Error('merchantOrderNumber (orderNo) is required for authorization')
            }

            const commonParams = { amount, currency, merchantOrderNumber, captureMethod, billingAddress, accountHolder, fraudShoppingCart, shipTo, kountSessionId, fraudRuleAction, browserInfo, paymentInstrumentId, paymentAmount, cardTypeName, cardType }
            let requestBody

            // Build request body based on payment method
            if (googlePayToken || paymentMethod === 'googlepay') {
                requestBody = buildGooglePayRequestBody({ ...commonParams, googlePayToken })
            } else if (card && !isCardMasked(card)) {
                requestBody = buildCardAuthRequestBody(card, commonParams, encryptCard)
            } else if (tokenRef) {
                requestBody = buildTokenRequestBody({ ...commonParams, tokenRef, cardExpiry })
            } else {
                throw new Error('No payment data provided. Either token, card, or googlePayToken is required.')
            }

            // Call server API
            const authorizeUrl = locale
                ? `${DEFAULT_CONFIG.apiBasePath}/authorize?locale=${encodeURIComponent(locale)}`
                : `${DEFAULT_CONFIG.apiBasePath}/authorize`
            
            // Build headers with Authorization for multi-MID CO lookup
            const headers = await buildAuthHeaders({ getAccessToken })
            
            const response = await fetch(authorizeUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody)
            })

            const result = await response.json()

            if (mountedRef.current) {
                setIsProcessing(false)

                if (result.success) {
                    setRetryCount(0)
                    onSuccess?.(result)
                } else {
                    setError({
                        code: result.errorCode || 'PAYMENT_FAILED',
                        message: GENERIC_API_ERROR_MESSAGE
                    })
                    onError?.(result)
                }
            }

            return result
        } catch (err) {
            
            const errorObj = {
                success: false,
                code: 'AUTHORIZATION_ERROR',
                message: GENERIC_API_ERROR_MESSAGE,
                canRetry: true
            }

            if (mountedRef.current) {
                setIsProcessing(false)
                setError(errorObj)
            }

            onError?.(errorObj)
            return errorObj
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isReady, encryptCard, onSuccess, onError, locale])

    /**
     * Retry failed payment (increments retry count)
     */
    const retry = useCallback(async (paymentData) => {
        if (retryCount >= maxRetries) {
            const err = {
                code: 'MAX_RETRIES_EXCEEDED',
                message: 'Maximum retry attempts exceeded. Please try again later or use a different payment method.'
            }
            setError(err)
            onError?.(err)
            return { success: false, ...err }
        }

        setRetryCount(prev => prev + 1)
        return authorize(paymentData)
    }, [retryCount, maxRetries, authorize, onError])

    /**
     * Reset error state
     */
    const resetError = useCallback(() => {
        setError(null)
    }, [])

    /**
     * Reset retry count
     */
    const resetRetries = useCallback(() => {
        setRetryCount(0)
    }, [])

    // =============================================================================
    // Return
    // =============================================================================

    return {
        // State
        isReady,
        isLoading,
        isProcessing,
        error,
        config,
        retryCount,
        canRetry: retryCount < maxRetries,

        // Methods
        authorize,
        retry,
        encryptCard,
        resetError,
        resetRetries,
        reinitialize: initialize,

        // PIE SDK state
        pieState: getPIEState()
    }
}

export default useJPMorganPayment
