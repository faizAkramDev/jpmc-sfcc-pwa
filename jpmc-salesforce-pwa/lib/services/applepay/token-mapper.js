/**
 * Apple Pay Token Mapper
 * 
 * Maps Apple Pay payment tokens to JP Morgan Online Payments API format.
 * This module handles the conversion of Apple Pay's encrypted payment bundle
 * to the structure required by JP Morgan's /payments endpoint.
 * 
 * @module services/applepay/token-mapper
 * 
 * @see https://developer.payments.jpmorgan.com/docs/commerce/online-payments/capabilities/online-payments/payment-methods/applepay
 */

import {
    APPLE_PAY_PROTOCOL_VERSIONS,
    APPLE_PAY_ERROR_CODES,
    APPLE_PAY_DEFAULTS,
    ACCOUNT_ON_FILE,
    INITIATOR_TYPE
} from '../../utils/constants.mjs'
import { convertCountryCode } from '../../utils/formatters/country-codes'
import { buildMerchantSoftware } from '../api/helpers/request-helpers'
// =============================================================================
// Error Class
// =============================================================================

/**
 * Apple Pay Token Error
 * Custom error class for Apple Pay token parsing/mapping errors
 */
export class ApplePayTokenError extends Error {
    constructor(code, message, cause = null) {
        super(message)
        this.name = 'ApplePayTokenError'
        this.code = code
        this.cause = cause
        
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ApplePayTokenError)
        }
    }
}

// =============================================================================
// Token Validation
// =============================================================================

/**
 * Validate Apple Pay token structure
 * 
 * @param {Object} applePayToken - The token from Apple Pay
 * @returns {boolean} True if valid
 * @throws {ApplePayTokenError} If token is invalid
 */
export const validateApplePayToken = (applePayToken) => {
    if (!applePayToken) {
        throw new ApplePayTokenError(
            APPLE_PAY_ERROR_CODES.TOKEN_ERROR,
            'Apple Pay token is missing or undefined'
        )
    }

    // Check for paymentData object
    const paymentData = applePayToken.paymentData
    if (!paymentData) {
        throw new ApplePayTokenError(
            APPLE_PAY_ERROR_CODES.TOKEN_INVALID,
            'Apple Pay token missing paymentData object'
        )
    }

    // Validate required paymentData fields
    if (!paymentData.data) {
        throw new ApplePayTokenError(
            APPLE_PAY_ERROR_CODES.TOKEN_INVALID,
            'Apple Pay token missing encrypted data (paymentData.data)'
        )
    }

    if (!paymentData.signature) {
        throw new ApplePayTokenError(
            APPLE_PAY_ERROR_CODES.TOKEN_INVALID,
            'Apple Pay token missing signature'
        )
    }

    if (!paymentData.version) {
        throw new ApplePayTokenError(
            APPLE_PAY_ERROR_CODES.TOKEN_INVALID,
            'Apple Pay token missing protocol version'
        )
    }

    // Validate header
    const header = paymentData.header
    if (!header) {
        throw new ApplePayTokenError(
            APPLE_PAY_ERROR_CODES.TOKEN_INVALID,
            'Apple Pay token missing header object'
        )
    }

    // EC_v1 requires ephemeralPublicKey
    if (paymentData.version === APPLE_PAY_PROTOCOL_VERSIONS.EC_V1) {
        if (!header.ephemeralPublicKey) {
            throw new ApplePayTokenError(
                APPLE_PAY_ERROR_CODES.TOKEN_INVALID,
                'Apple Pay EC_v1 token missing ephemeralPublicKey'
            )
        }
    }

    if (!header.publicKeyHash) {
        throw new ApplePayTokenError(
            APPLE_PAY_ERROR_CODES.TOKEN_INVALID,
            'Apple Pay token missing publicKeyHash'
        )
    }

    if (!header.transactionId) {
        throw new ApplePayTokenError(
            APPLE_PAY_ERROR_CODES.TOKEN_INVALID,
            'Apple Pay token missing transactionId'
        )
    }

    return true
}

/**
 * Check if Apple Pay token structure is valid (non-throwing)
 * 
 * @param {Object} applePayToken - The token to validate
 * @returns {boolean} True if valid, false otherwise
 */
export const isValidApplePayToken = (applePayToken) => {
    try {
        validateApplePayToken(applePayToken)
        return true
    } catch {
        return false
    }
}

// =============================================================================
// Token Mapping
// =============================================================================

/**
 * Map Apple Pay token to JP Morgan encryptedPaymentBundle format
 * 
 * This function converts the Apple Pay token structure to the exact format
 * required by JP Morgan's Online Payments API.
 * 
 * @param {Object} applePayToken - The token from Apple Pay
 * @returns {Object} JP Morgan encryptedPaymentBundle
 * 
 * @example
 * // Apple Pay token structure:
 * // {
 * //   paymentData: {
 * //     data: "encrypted_payment_data_base64...",
 * //     signature: "signature_base64...",
 * //     header: {
 * //       ephemeralPublicKey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
 * //       publicKeyHash: "7LPgkHSCBXf/xq4zv59spY9j35fqgkfz7AcUYsASyS4=",
 * //       transactionId: "27ed51c15512070be3058fb6070c2e63...",
 * //       applicationData: "optional_hash..."
 * //     },
 * //     version: "EC_v1"
 * //   },
 * //   paymentMethod: { ... },
 * //   transactionIdentifier: "..."
 * // }
 * 
 * // Returns JP Morgan format:
 * // {
 * //   encryptedPayload: "encrypted_payment_data_base64...",
 * //   encryptedPaymentHeader: {
 * //     ephemeralPublicKey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
 * //     publicKeyHash: "7LPgkHSCBXf/xq4zv59spY9j35fqgkfz7AcUYsASyS4=",
 * //     walletTransactionId: "27ed51c15512070be3058fb6070c2e63...",
 * //     walletApplicationData: "optional_hash..."
 * //   },
 * //   signature: "signature_base64...",
 * //   protocolVersion: "EC_v1"
 * // }
 */
export const mapApplePayTokenToJPMC = (applePayToken) => {
    // Validate the token first
    validateApplePayToken(applePayToken)

    const { paymentData } = applePayToken
    const { header } = paymentData

    // Build the JP Morgan applepay payment method object
    // Per JPMC docs: fields go under paymentMethodType.applepay.encryptedPaymentBundle
    const applePayPaymentMethod = {
        // Required by JPMC: latLong coordinates (will be set by caller)
        // latLong: '1,1',
        
        // Encrypted payment bundle container
        encryptedPaymentBundle: {
            // Encrypted payment data (Apple: data -> JPMC: encryptedPayload)
            encryptedPayload: paymentData.data,
            
            // Header information mapped to JPMC field names
            encryptedPaymentHeader: {
                // Ephemeral public key (EC_v1 only) — omit rather than send empty string
                ...(header.ephemeralPublicKey && { ephemeralPublicKey: header.ephemeralPublicKey }),
                
                // Hash of the X.509 encoded public key
                publicKeyHash: header.publicKeyHash,
                
                // Transaction ID (Apple: transactionId -> JPMC: walletTransactionId)
                walletTransactionId: header.transactionId,
                
                // Application data hash — only include if Apple provided it
                // Do NOT fall back to transactionId; JPMC validates this field content
                ...(header.applicationData && { walletApplicationData: header.applicationData })
            },
            
            // Signature of the payment and header data
            signature: paymentData.signature,
            
            // Protocol version (EC_v1 or RSA_v1)
            protocolVersion: paymentData.version
        }
    }

    return applePayPaymentMethod
}

/**
 * Extract encrypted payment bundle from Apple Pay token
 * Alias for mapApplePayTokenToJPMC
 * 
 * @param {Object} applePayToken - The token from Apple Pay
 * @returns {Object} JP Morgan encryptedPaymentBundle
 */
export const extractEncryptedPaymentBundle = mapApplePayTokenToJPMC

// =============================================================================
// Address Mapping
// =============================================================================

/**
 * Map Apple Pay contact/address to JP Morgan address format
 * 
 * @param {Object} applePayContact - Apple Pay contact object
 * @returns {Object|null} JP Morgan address format
 * 
 * @example
 * // Apple Pay contact:
 * // {
 * //   givenName: "John",
 * //   familyName: "Doe",
 * //   addressLines: ["123 Main St", "Apt 4"],
 * //   locality: "San Francisco",
 * //   administrativeArea: "CA",
 * //   postalCode: "94105",
 * //   countryCode: "US",
 * //   emailAddress: "john@example.com",
 * //   phoneNumber: "+1234567890"
 * // }
 * 
 * // Returns JPMC format:
 * // {
 * //   line1: "123 Main St",
 * //   line2: "Apt 4",
 * //   city: "San Francisco",
 * //   state: "CA",
 * //   postalCode: "94105",
 * //   countryCode: "US"
 * // }
 */
export const mapApplePayAddress = (applePayContact) => {
    if (!applePayContact) {
        return null
    }

    const addressLines = applePayContact.addressLines || []

    const address = {
        // Address lines
        line1: addressLines[0] || '',
        
        // City (Apple: locality)
        city: applePayContact.locality || applePayContact.city || '',
        
        // State/Province (Apple: administrativeArea)
        state: applePayContact.administrativeArea || applePayContact.state || '',
        
        // Postal/ZIP code
        postalCode: applePayContact.postalCode || '',
        
        // Country code — JPMC requires ISO 3166-1 alpha-3 (e.g. 'USA'), Apple provides alpha-2 ('US')
        countryCode: convertCountryCode(applePayContact.countryCode || applePayContact.country) || applePayContact.countryCode || ''
    }

    // Only include line2/line3 when present — JPMC rejects empty strings for these fields
    if (addressLines[1]) address.line2 = addressLines[1]
    if (addressLines[2]) address.line3 = addressLines[2]

    return address
}

/**
 * Map Apple Pay contact to JP Morgan account holder format
 * 
 * @param {Object} billingContact - Apple Pay billing contact
 * @param {Object} _shippingContact - Apple Pay shipping contact (optional, reserved for future use)
 * @returns {Object} JP Morgan accountHolder format
 */
export const mapApplePayContactToAccountHolder = (billingContact, _shippingContact = null) => {
    const accountHolder = {}

    if (billingContact) {
        // Full name
        const firstName = billingContact.givenName || ''
        const lastName = billingContact.familyName || ''
        if (firstName || lastName) {
            accountHolder.fullName = `${firstName} ${lastName}`.trim()
            accountHolder.firstName = firstName
            accountHolder.lastName = lastName
        }

        // Email
        if (billingContact.emailAddress) {
            accountHolder.email = billingContact.emailAddress
        }

        // Phone
        if (billingContact.phoneNumber) {
            accountHolder.phone = {
                phoneNumber: billingContact.phoneNumber.replace(/\D/g, ''),
                countryCode: '1' // Default to US, could be parsed from number
            }
        }

        // Billing address
        accountHolder.billingAddress = mapApplePayAddress(billingContact)
    }

    return accountHolder
}

// =============================================================================
// Full Payload Builder
// =============================================================================

/**
 * Build complete JP Morgan Apple Pay payment payload
 * 
 * Constructs the full payment request object for JP Morgan's Online Payments API
 * including the Apple Pay encrypted bundle, amount, merchant info, and addresses.
 * 
 * @param {Object} options - Payload options
 * @param {Object} options.applePayToken - The token from Apple Pay
 * @param {number|string} options.amount - Payment amount in minor units (cents)
 * @param {string} options.currency - Currency code (e.g., 'USD')
 * @param {string} [options.merchantOrderNumber] - Merchant order reference
 * @param {Object} [options.billingContact] - Apple Pay billing contact
 * @param {Object} [options.shippingContact] - Apple Pay shipping contact
 * @param {string} [options.latLong] - Geolocation (required by JPMC, defaults to '1,1')
 * @param {Object} [options.merchant] - Merchant software info
 * @returns {Object} Complete JP Morgan payment request
 * 
 * @example
 * const payload = buildJPMorganApplePayPayload({
 *   applePayToken: payment.token,
 *   amount: 9999, // $99.99 in cents
 *   currency: 'USD',
 *   merchantOrderNumber: 'ORDER-123',
 *   billingContact: payment.billingContact,
 *   shippingContact: payment.shippingContact
 * })
 */
export const buildJPMorganApplePayPayload = (options) => {
    const {
        applePayToken,
        amount,
        currency,
        merchantOrderNumber,
        billingContact,
        shippingContact,
        latLong = APPLE_PAY_DEFAULTS.defaultLatLong,
        merchant = {},
        captureMethod = 'NOW',
        initiatorType = INITIATOR_TYPE,
        accountOnFile = ACCOUNT_ON_FILE.NOT_STORED
    } = options

    // Map the Apple Pay token to JPMC format (returns object with encryptedPaymentBundle)
    const applePayPaymentMethod = mapApplePayTokenToJPMC(applePayToken)

    // Build the payment request
    const paymentRequest = {
        // Amount in minor units (cents)
        amount: typeof amount === 'string' ? Number.parseInt(amount, 10) : amount,
        
        // Currency
        currency: currency.toUpperCase(),
        
        // Capture method
        captureMethod,
        
        // Initiator type
        initiatorType,
        
        // Account on file status
        accountOnFile,
        
        // Merchant info (hardcoded values, only MCC from config)
        merchant: {
            merchantSoftware: buildMerchantSoftware(),
            ...(merchant.merchantCategoryCode && { merchantCategoryCode: merchant.merchantCategoryCode })
        },
        
        // Payment method type - Apple Pay
        // Add latLong at the applepay level (required by JPMC)
        paymentMethodType: {
            applepay: {
                // Required by JPMC: latLong coordinates
                latLong,
                
                // The encrypted payment bundle (already contains encryptedPayload, encryptedPaymentHeader, signature, protocolVersion)
                ...applePayPaymentMethod
            }
        }
    }

    // Add merchant order number if provided
    if (merchantOrderNumber) {
        paymentRequest.merchantOrderNumber = merchantOrderNumber
    }

    // Add account holder (billing info)
    if (billingContact) {
        paymentRequest.accountHolder = mapApplePayContactToAccountHolder(billingContact, shippingContact)
    }

    // Add shipping info — only when the contact has actual address data
    // Express checkout shipping contacts may only have email/phone (no address lines)
    const hasShippingAddress = shippingContact?.addressLines?.length > 0 && shippingContact.addressLines[0]
    if (shippingContact && hasShippingAddress) {
        const fullName = `${shippingContact.givenName || ''} ${shippingContact.familyName || ''}`.trim()
        const shipTo = {
            shippingAddress: mapApplePayAddress(shippingContact)
        }
        if (fullName) shipTo.fullName = fullName
        if (shippingContact.emailAddress) shipTo.email = shippingContact.emailAddress
        if (shippingContact.phoneNumber) {
            shipTo.phone = {
                phoneNumber: shippingContact.phoneNumber.replace(/\D/g, ''),
                countryCode: '1'
            }
        }
        paymentRequest.shipTo = shipTo
    }

    return paymentRequest
}

// =============================================================================
// Response Parsing
// =============================================================================

/**
 * Parse JP Morgan Apple Pay payment response
 * 
 * @param {Object} response - JP Morgan API response
 * @returns {Object} Parsed payment result
 */
export const parseJPMCApplePayResponse = (response) => {
    if (!response) {
        return {
            success: false,
            error: {
                code: 'EMPTY_RESPONSE',
                message: 'Empty response from JP Morgan API'
            }
        }
    }

    // For 3DS: PENDING state with PERFORM_AUTHENTICATION is a valid "in-progress" response
    const is3DSRequired = response.responseCode === 'PERFORM_AUTHENTICATION' &&
        !!response.paymentAuthenticationResult?.authenticationOrchestrationUrl

    const isSuccess = response.responseStatus === 'SUCCESS' &&
        (response.transactionState === 'AUTHORIZED' || 
         response.transactionState === 'CLOSED' ||
         is3DSRequired) // 3DS pending is also a valid success state

    // Extract card info from response
    const cardInfo = response.paymentMethodType?.card || {}

    return {
        success: isSuccess,
        
        // Transaction ID for backend order patching (payment transaction attributes)
        transactionId: response.transactionId,
        
        // 3DS fields - needed for requires3DSAuthentication() check
        responseCode: response.responseCode,
        paymentAuthenticationResult: response.paymentAuthenticationResult,
        
        // Payment details
        amount: response.amount,
        captureMethod: response.captureMethod,
        
        // Card type for 3DS skip logic
        cardTypeName: cardInfo.cardTypeName,
        
        // Timestamp for order patching
        timestamp: response.transactionDate || response._timestamp,
        
        // For UI messaging
        canRetry: !isSuccess,
        userMessage: isSuccess ? (is3DSRequired ? 'Authentication required' : 'Payment authorized successfully') : 'Payment couldn\'t be processed. Please try again later.'
    }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get card network from Apple Pay payment method
 * 
 * @param {Object} applePayPayment - Apple Pay payment object
 * @returns {string|null} Card network (e.g., 'VISA', 'MASTERCARD')
 */
export const getCardNetwork = (applePayPayment) => {
    const network = applePayPayment?.paymentMethod?.network
    if (!network) return null
    
    // Normalize network names to uppercase
    const networkMap = {
        'visa': 'VISA',
        'mastercard': 'MASTERCARD',
        'amex': 'AMEX',
        'discover': 'DISCOVER',
        'jcb': 'JCB',
        'chinaUnionPay': 'CHINA_UNION_PAY'
    }
    
    return networkMap[network.toLowerCase()] || network.toUpperCase()
}

/**
 * Get card display name from Apple Pay payment
 * 
 * @param {Object} applePayPayment - Apple Pay payment object
 * @returns {string|null} Display name (e.g., 'Visa 1234')
 */
export const getCardDisplayName = (applePayPayment) => {
    return applePayPayment?.paymentMethod?.displayName || null
}

/**
 * Check if payment is from a debit card
 * 
 * @param {Object} applePayPayment - Apple Pay payment object
 * @returns {boolean} True if debit card
 */
export const isDebitCard = (applePayPayment) => {
    return applePayPayment?.paymentMethod?.type === 'debit'
}

// =============================================================================
// Exports (default object for convenience)
// =============================================================================

export default {
    // Validation
    validateApplePayToken,
    isValidApplePayToken,
    
    // Token mapping
    mapApplePayTokenToJPMC,
    extractEncryptedPaymentBundle,
    
    // Address mapping
    mapApplePayAddress,
    mapApplePayContactToAccountHolder,
    
    // Payload building
    buildJPMorganApplePayPayload,
    
    // Response parsing
    parseJPMCApplePayResponse,
    
    // Utilities
    getCardNetwork,
    getCardDisplayName,
    isDebitCard,
    
    // Error class
    ApplePayTokenError
}
