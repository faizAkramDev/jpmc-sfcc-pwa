/**
 * Google Pay Token Parser
 * 
 * Parses and validates Google Pay payment tokens for JP Morgan API.
 * Extracts the encrypted payment bundle and billing information.
 * 
 * @module services/googlepay/token-parser
 */

import {
    GOOGLE_PAY_ERROR_CODES,
    GOOGLE_PAY_PROTOCOL_VERSION
} from '../../utils/constants.mjs'

/**
 * Parse Google Pay payment data response
 * 
 * Extracts the payment token and related information from the
 * paymentData object returned by loadPaymentData().
 * 
 * @param {Object} paymentData - Payment data from loadPaymentData()
 * @returns {Object} Parsed payment data
 * @throws {GooglePayTokenError} If payment data is invalid
 * 
 * @example
 * const paymentData = await paymentsClient.loadPaymentData(request)
 * const parsed = parseGooglePayResponse(paymentData)
 * // Use parsed.encryptedPaymentBundle for JP Morgan API
 */
export const parseGooglePayResponse = (paymentData) => {
    if (!paymentData) {
        throw new GooglePayTokenError(
            GOOGLE_PAY_ERROR_CODES.PAYMENT_DATA_INVALID,
            'Payment data is empty or undefined'
        )
    }

    // Extract payment method data
    const paymentMethodData = paymentData.paymentMethodData
    if (!paymentMethodData) {
        throw new GooglePayTokenError(
            GOOGLE_PAY_ERROR_CODES.PAYMENT_DATA_INVALID,
            'paymentMethodData is missing from response'
        )
    }

    // Extract tokenization data
    const tokenizationData = paymentMethodData.tokenizationData
    if (!tokenizationData?.token) {
        throw new GooglePayTokenError(
            GOOGLE_PAY_ERROR_CODES.TOKEN_MISSING,
            'Tokenization data or token is missing'
        )
    }

    // Parse the token JSON string to extract required fields for JP Morgan API
    // JP Morgan requires a structured format, not the raw token string
    let tokenObject
    try {
        tokenObject = JSON.parse(tokenizationData.token)
    } catch (error) {
        throw new GooglePayTokenError(
            GOOGLE_PAY_ERROR_CODES.TOKEN_PARSE_ERROR,
            'Failed to parse token JSON',
            error
        )
    }

    // Parse the signedMessage to extract ephemeralPublicKey
    // signedMessage contains: { encryptedMessage, ephemeralPublicKey, tag }
    let signedMessageObj = {}
    if (tokenObject.signedMessage) {
        try {
            signedMessageObj = JSON.parse(tokenObject.signedMessage)
        } catch (e) {
            // signedMessage might already be an object or not parseable
            signedMessageObj = tokenObject.signedMessage
        }
    }

    // Build the JP Morgan encryptedPaymentBundle structure
    // Per JP Morgan docs: https://developer.payments.jpmorgan.com/docs/commerce/online-payments/capabilities/online-payments/payment-methods/googlepay
    const jpmcPaymentBundle = {
        // signedMessage goes to encryptedPayload
        encryptedPayload: tokenObject.signedMessage,
        // Protocol version (e.g., "ECv2")
        protocolVersion: tokenObject.protocolVersion,
        // Signature from intermediateSigningKey or root signature
        signature: tokenObject.signature || tokenObject.intermediateSigningKey?.signatures?.[0],
        // encryptedPaymentHeader contains ephemeralPublicKey
        encryptedPaymentHeader: {
            ephemeralPublicKey: signedMessageObj.ephemeralPublicKey || ''
        }
    }

    // Extract card info
    const cardInfo = paymentMethodData.info || {}
    
    // Extract billing address
    const billingAddress = cardInfo.billingAddress || null

    // Extract email if present
    const email = paymentData.email || null

    // Extract shipping address if present
    const shippingAddress = paymentData.shippingAddress || null

    return {
        // The encrypted payment bundle for JP Morgan API - structured object format
        encryptedPaymentBundle: jpmcPaymentBundle,
        
        // Tokenization type ('PAYMENT_GATEWAY')
        tokenizationType: tokenizationData.type,
        
        // Card network (e.g., 'VISA', 'MASTERCARD')
        cardNetwork: cardInfo.cardNetwork || null,
        
        // Card details (masked)
        cardDetails: cardInfo.cardDetails || null,
        
        // Billing address from Google Pay
        billingAddress: billingAddress ? mapGooglePayAddress(billingAddress) : null,
        
        // Email address
        email,
        
        // Shipping address (if requested)
        shippingAddress: shippingAddress ? mapGooglePayAddress(shippingAddress) : null,
        
        // Original payment data
        raw: paymentData
    }
}

/**
 * Extract the encrypted payment bundle for JP Morgan API
 * 
 * Returns the token in the format required by JP Morgan's
 * paymentMethodType.googlepay.encryptedPaymentBundle field.
 * 
 * @param {Object} paymentData - Payment data from loadPaymentData()
 * @returns {Object} Encrypted payment bundle
 * 
 * @example
 * const bundle = extractEncryptedPaymentBundle(paymentData)
 * // bundle = {
 * //   signature: "...",
 * //   intermediateSigningKey: { ... },
 * //   protocolVersion: "ECv2",
 * //   signedMessage: "..."
 * // }
 */
export const extractEncryptedPaymentBundle = (paymentData) => {
    const parsed = parseGooglePayResponse(paymentData)
    return parsed.encryptedPaymentBundle
}

/**
 * Build JP Morgan Google Pay request body from payment data
 * 
 * Transforms Google Pay payment data into the format required
 * by JP Morgan's Online Payments API.
 * 
 * @param {Object} paymentData - Payment data from loadPaymentData()
 * @param {Object} orderDetails - Order details
 * @param {string} orderDetails.amount - Payment amount
 * @param {string} orderDetails.currency - Currency code
 * @param {string} orderDetails.merchantOrderNumber - Merchant order reference
 * @returns {Object} Request body for JP Morgan API
 */
export const buildJPMorganGooglePayPayload = (paymentData, orderDetails) => {
    const parsed = parseGooglePayResponse(paymentData)
    const { amount, currency, merchantOrderNumber } = orderDetails

    // Build the payment method type for Google Pay
    const paymentMethodType = {
        googlepay: {
            encryptedPaymentBundle: parsed.encryptedPaymentBundle
        }
    }

    // Build account holder from Google Pay data
    const accountHolder = buildAccountHolderFromGooglePay(parsed)

    return {
        paymentMethodType,
        amount,
        currency,
        merchantOrderNumber,
        accountHolder,
        // Include original card network for reference
        cardNetwork: parsed.cardNetwork,
        // Include billing address if available
        ...(parsed.billingAddress && { billingAddress: parsed.billingAddress })
    }
}

/**
 * Build account holder information from Google Pay data
 * 
 * @param {Object} parsedData - Parsed Google Pay response
 * @returns {Object} Account holder object for JP Morgan API
 */
export const buildAccountHolderFromGooglePay = (parsedData) => {
    const { billingAddress, email } = parsedData
    
    const accountHolder = {}

    if (billingAddress) {
        // Extract name from billing address
        if (billingAddress.name) {
            accountHolder.fullName = billingAddress.name
        }
        
        // Build address object
        accountHolder.billingAddress = {
            line1: billingAddress.line1,
            line2: billingAddress.line2,
            city: billingAddress.city,
            state: billingAddress.state,
            postalCode: billingAddress.postalCode,
            countryCode: billingAddress.countryCode
        }
    }

    if (email) {
        accountHolder.emailAddress = email
    }

    return accountHolder
}

/**
 * Map Google Pay address format to standard format
 * 
 * Google Pay returns addresses in a specific format that may need
 * to be mapped to your application's format.
 * 
 * @param {Object} googleAddress - Address from Google Pay
 * @returns {Object} Mapped address
 * 
 * Google Pay Address Format:
 * {
 *   name: "John Doe",
 *   address1: "123 Main St",
 *   address2: "Apt 4",
 *   address3: "",
 *   locality: "San Francisco",
 *   administrativeArea: "CA",
 *   postalCode: "94105",
 *   countryCode: "US",
 *   phoneNumber: "+14155551234"
 * }
 */
export const mapGooglePayAddress = (googleAddress) => {
    if (!googleAddress) {
        return null
    }

    return {
        name: googleAddress.name || null,
        line1: googleAddress.address1 || googleAddress.line1 || null,
        line2: googleAddress.address2 || googleAddress.line2 || null,
        line3: googleAddress.address3 || googleAddress.line3 || null,
        city: googleAddress.locality || googleAddress.city || null,
        state: googleAddress.administrativeArea || googleAddress.state || null,
        postalCode: googleAddress.postalCode || null,
        countryCode: googleAddress.countryCode || null,
        phoneNumber: googleAddress.phoneNumber || null
    }
}

/**
 * Validate token structure
 * 
 * Checks that the token has the required fields for JP Morgan API.
 * 
 * @param {Object} token - Parsed token object
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export const validateTokenStructure = (token) => {
    const errors = []

    if (!token) {
        errors.push('Token is null or undefined')
        return { valid: false, errors }
    }

    // Check required fields for ECv2 token
    if (!token.signature) {
        errors.push('Token missing required field: signature')
    }

    if (!token.signedMessage) {
        errors.push('Token missing required field: signedMessage')
    }

    if (!token.protocolVersion) {
        errors.push('Token missing required field: protocolVersion')
    } else if (token.protocolVersion !== GOOGLE_PAY_PROTOCOL_VERSION) {
        errors.push(`Unexpected protocol version: ${token.protocolVersion}, expected ${GOOGLE_PAY_PROTOCOL_VERSION}`)
    }

    if (!token.intermediateSigningKey) {
        errors.push('Token missing required field: intermediateSigningKey')
    }

    return {
        valid: errors.length === 0,
        errors
    }
}

/**
 * Check if payment data indicates a successful card selection
 * 
 * @param {Object} paymentData - Payment data from loadPaymentData()
 * @returns {boolean} True if payment data is valid
 */
export const isValidPaymentData = (paymentData) => {
    try {
        parseGooglePayResponse(paymentData)
        return true
    } catch (error) {
        return false
    }
}

/**
 * Google Pay Token Error
 * Custom error class for token-related errors
 */
export class GooglePayTokenError extends Error {
    /**
     * @param {string} code - Error code from GOOGLE_PAY_ERROR_CODES
     * @param {string} message - Error message
     * @param {Error} [cause] - Original error
     */
    constructor(code, message, cause = null) {
        super(message)
        this.name = 'GooglePayTokenError'
        this.code = code
        this.cause = cause
        
        // Maintain proper stack trace (only in V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, GooglePayTokenError)
        }
    }
}
