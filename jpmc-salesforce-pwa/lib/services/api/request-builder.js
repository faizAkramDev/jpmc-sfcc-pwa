/**
 * Payment Request Builder
 * 
 * Utilities for building JPMC payment request payloads.
 * 
 * @module services/api/request-builder
 */

import { formatBillingAddress } from '../../utils/formatters/address-formatter'
import { convertCountryCode } from '../../utils/formatters/country-codes'
import { 
    CAPTURE_METHODS, 
    ACCOUNT_ON_FILE, 
    INITIATOR_TYPE, 
    CARD_ENCRYPTION_TYPES,
    DEFAULT_LAT_LONG,
    THREE_DS
} from '../../utils/constants.mjs'
import logger from '../../utils/logger'
import { is3DSEnabled, build3DSAuthenticationParameters } from './helpers/threeds-helpers'
import { buildMerchantSoftware, formatPhoneForJPMC } from './helpers/request-helpers'
/**
 * Build complete merchant object from config
 * Includes merchantSoftware and optionally merchantCategoryCode
 * 
 * @param {object} _config - JPMC config with merchant* properties
 */
const buildMerchant = (_config = {}) => {
    return {
        merchantSoftware: buildMerchantSoftware()
    }
}

/**
 * Format Google Pay billing address for JP Morgan API
 * 
 * @param {object} googlePayAddress - Address from Google Pay response
 * @returns {object|null} Formatted billing address
 */
const formatGooglePayBillingAddressInternal = (googlePayAddress) => {
    if (!googlePayAddress) return null

    const rawCountry = googlePayAddress.countryCode || googlePayAddress.country
    const countryCode = convertCountryCode(rawCountry)
    
    return {
        line1: googlePayAddress.address1 || googlePayAddress.line1,
        line2: googlePayAddress.address2 || googlePayAddress.line2,
        city: googlePayAddress.locality || googlePayAddress.city,
        state: googlePayAddress.administrativeArea || googlePayAddress.state,
        postalCode: googlePayAddress.postalCode,
        countryCode: countryCode
    }
}

/**
 * Build account holder object from Google Pay billing data (internal)
 * 
 * @param {object} billingAddress - Billing address from Google Pay
 * @param {string} email - Customer email
 * @param {object} accountHolder - Existing account holder data
 * @returns {object} Account holder object
 */
const buildGooglePayAccountHolderInternal = (billingAddress, email, accountHolder) => {
    const result = { ...accountHolder }

    if (billingAddress) {
        if (billingAddress.name) {
            result.fullName = billingAddress.name
        }

        const formattedAddress = formatGooglePayBillingAddressInternal(billingAddress)
        if (formattedAddress) {
            result.billingAddress = formattedAddress
        }

        if (billingAddress.phoneNumber) {
            result.phone = formatPhoneForJPMC(billingAddress.phoneNumber, billingAddress.countryCode || billingAddress.country)
        }
    }

    if (email) {
        result.email = email
    }

    return result
}

/**
 * Internal function to build Google Pay request body
 * Used by buildPaymentRequestBody when it detects Google Pay payment
 * 
 * Per JP Morgan docs: https://developer.payments.jpmorgan.com/docs/commerce/online-payments/capabilities/online-payments/payment-methods/googlepay
 * Required fields:
 * - paymentMethodType.googlepay.latLong
 * - paymentMethodType.googlepay.encryptedPaymentBundle.encryptedPayload
 * - paymentMethodType.googlepay.encryptedPaymentBundle.encryptedPaymentHeader.ephemeralPublicKey
 * - paymentMethodType.googlepay.encryptedPaymentBundle.protocolVersion
 * - paymentMethodType.googlepay.encryptedPaymentBundle.signature
 * 
 * @param {object} paymentData - Payment data with Google Pay token
 * @param {object} config - Optional JPMC config for merchantSoftware
 * @returns {object} Formatted request body for JP Morgan API
 */
const buildGooglePayRequestBodyInternal = (paymentData, config = {}) => {
    const {
        googlePayToken,
        amount,
        currency,
        merchantOrderNumber,
        billingAddress,
        accountHolder,
        email,
        latLong,
        captureMethod = CAPTURE_METHODS.NOW,
        isAmountFinal = true,
        clientIp
    } = paymentData

    if (!googlePayToken) {
        throw new Error('googlePayToken is required for Google Pay payments')
    }
    if (amount === undefined || amount === null) {
        throw new Error('amount is required for Google Pay payments')
    }

    const amountMinorUnits = Math.round(Number.parseFloat(amount))

    let parsedToken = googlePayToken
    if (typeof googlePayToken === 'string') {
        try {
            const tokenObject = JSON.parse(googlePayToken)
            
            let signedMessageObj = {}
            if (tokenObject.signedMessage) {
                try {
                    signedMessageObj = JSON.parse(tokenObject.signedMessage)
                } catch (e) {
                    signedMessageObj = tokenObject.signedMessage
                }
            }
            
            parsedToken = {
                encryptedPayload: tokenObject.signedMessage,
                protocolVersion: tokenObject.protocolVersion,
                signature: tokenObject.signature || tokenObject.intermediateSigningKey?.signatures?.[0],
                encryptedPaymentHeader: {
                    ephemeralPublicKey: signedMessageObj.ephemeralPublicKey || ''
                }
            }
        } catch (parseError) {
            logger.error('[RequestBuilder] Failed to parse Google Pay token string:', parseError.message)
            parsedToken = googlePayToken
        }
    }

    const googlepayPaymentMethod = {
        latLong: latLong || DEFAULT_LAT_LONG,
        encryptedPaymentBundle: parsedToken
    }

    const body = {
        captureMethod,
        amount: amountMinorUnits,
        currency,
        merchant: buildMerchant(config),
        initiatorType: INITIATOR_TYPE,
        accountOnFile: ACCOUNT_ON_FILE.NOT_STORED,
        isAmountFinal,
        paymentMethodType: {
            googlepay: googlepayPaymentMethod
        }
    }

    if (merchantOrderNumber) {
        body.merchantOrderNumber = merchantOrderNumber
    }

    const enableAVS = config.enableAVS === true
    const addressForAccountHolder = enableAVS ? billingAddress : null
    const builtAccountHolder = buildGooglePayAccountHolderInternal(addressForAccountHolder, email, accountHolder)
    
    if (clientIp) {
        builtAccountHolder.IPAddress = clientIp
    }
    
    if (Object.keys(builtAccountHolder).length > 0) {
        body.accountHolder = builtAccountHolder
    }

    return body
}

// =============================================================================
// Helper functions to reduce cognitive complexity
// =============================================================================

/**
 * Check if 3DS authentication should be built (whitelist approach)
 * Only Visa, Mastercard, and Amex support 3DS
 * 
 * @param {object} browserInfo - Browser info for 3DS
 * @param {object} config - JPMC config
 * @param {string} cardTypeName - Card type name (SFCC or JPMC format)
 * @param {string} cardType - JPMC card type code (VI, MC, AX)
 * @returns {boolean} True if 3DS should be built
 */
function should3DSBeBuilt(browserInfo, config, cardTypeName, cardType) {
    if (!browserInfo) return false
    if (!is3DSEnabled(config, config)) return false
    
    // Check if either cardTypeName or cardType is in the supported list
    const cardTypeNameUpper = cardTypeName?.toUpperCase()
    const cardTypeUpper = cardType?.toUpperCase()
    
    const is3DSSupported = 
        (cardTypeNameUpper && THREE_DS.SUPPORTED_3DS_CARD_TYPES.includes(cardTypeNameUpper)) ||
        (cardTypeUpper && THREE_DS.SUPPORTED_3DS_CARD_TYPES.includes(cardTypeUpper))
    
    return is3DSSupported
}

/**
 * Build 3DS browser info for root-level placement
 */
function build3DSRootBrowserInfo(browserInfo, clientIp) {
    return {
        browserAcceptHeader: browserInfo.browserAcceptHeader,
        browserLanguage: browserInfo.browserLanguage,
        browserColorDepth: browserInfo.browserColorDepth,
        browserScreenHeight: browserInfo.browserScreenHeight,
        browserScreenWidth: browserInfo.browserScreenWidth,
        deviceLocalTimeZone: Number(browserInfo.deviceLocalTimeZone),
        browserUserAgent: browserInfo.browserUserAgent,
        javaEnabled: browserInfo.javaEnabled === 'true' || browserInfo.javaEnabled === true,
        javaScriptEnabled: browserInfo.javaScriptEnabled === 'true' || browserInfo.javaScriptEnabled === true,
        challengeWindowSize: browserInfo.challengeWindowSize || THREE_DS.CHALLENGE_WINDOW_SIZE,
        deviceIPAddress: clientIp || '0.0.0.0'
    }
}

/**
 * Build payment method type for token or card
 */
function buildPaymentMethodTypePayload(paymentData, config, threeDSAuthParams) {
    const { paymentToken, card } = paymentData
    
    if (paymentToken) {
        return {
            card: {
                accountNumberType: config.tokenizationType || CARD_ENCRYPTION_TYPES.SAFETECH_TOKEN,
                accountNumber: paymentToken,
                ...(paymentData.cardExpiry && {
                    expiry: {
                        month: paymentData.cardExpiry.month,
                        year: paymentData.cardExpiry.year
                    }
                }),
                ...(threeDSAuthParams && { paymentAuthenticationRequest: threeDSAuthParams })
            }
        }
    }
    
    if (card) {
        const cardPayload = buildCardPayload(card)
        if (threeDSAuthParams) {
            cardPayload.paymentAuthenticationRequest = threeDSAuthParams
        }
        return { card: cardPayload }
    }
    
    return null
}

/**
 * Build account holder with optional billing address
 */
function buildAccountHolderPayload(accountHolder, billingAddress, clientIp, shouldIncludeBillingAddress) {
    let result = null
    
    if (accountHolder) {
        result = {
            fullName: accountHolder.fullName,
            ...(accountHolder.firstName && { firstName: accountHolder.firstName }),
            ...(accountHolder.lastName && { lastName: accountHolder.lastName }),
            ...(accountHolder.email && { email: accountHolder.email }),
            ...(accountHolder.phone && { phone: formatPhoneForJPMC(accountHolder.phone, billingAddress?.countryCode || billingAddress?.country) }),
            ...(clientIp && { IPAddress: clientIp })
        }
    } else if (clientIp) {
        result = { IPAddress: clientIp }
    }
    
    if (shouldIncludeBillingAddress && billingAddress) {
        const formattedAddress = formatBillingAddress(billingAddress)
        if (formattedAddress) {
            result = { ...result, billingAddress: formattedAddress }
        }
    }
    
    return result
}

/**
 * Build the payment request body according to JPMC API spec
 * 
 * @param {object} paymentData - Payment details
 * @param {object} config - Optional JPMC config for merchantSoftware and 3DS settings
 * @returns {object} Formatted request body
 */
export const buildPaymentRequestBody = (paymentData, config = {}) => {
    if (paymentData.isGooglePay || paymentData.googlePayToken) {
        return buildGooglePayRequestBodyInternal(paymentData, config)
    }

    const {
        amount,
        currency,
        card,
        paymentToken,
        captureMethod = CAPTURE_METHODS.NOW,
        merchantOrderNumber,
        accountHolder,
        billingAddress,
        isAmountFinal = true,
        clientIp,
        browserInfo,
        cardTypeName,
        cardType,
        locale
    } = paymentData

    const amountMinorUnits = Math.round(Number.parseFloat(amount))

    const body = {
        captureMethod,
        amount: amountMinorUnits,
        currency,
        merchant: buildMerchant(config),
        initiatorType: INITIATOR_TYPE,
        accountOnFile: ACCOUNT_ON_FILE.NOT_STORED,
        isAmountFinal
    }

    // Build 3DS authentication if applicable
    let threeDSAuthParams = null
    let rootBrowserInfo = null
    
    if (should3DSBeBuilt(browserInfo, config, cardTypeName, cardType)) {
        const callbackMerchantId = config.merchantId || ''
        const localeParam = locale ? `&locale=${encodeURIComponent(locale)}` : ''
        const returnUrl = config.threeDSReturnUrl || 
            `${config.baseUrl || ''}/checkout/3ds-callback?orderNo=${merchantOrderNumber}&orderToken=${merchantOrderNumber}&merchantId=${callbackMerchantId}${localeParam}`
        
        threeDSAuthParams = build3DSAuthenticationParameters({
            resolvedConfig: config,
            sitePrefs: config,
            returnUrl
        })
        
        if (threeDSAuthParams) {
            rootBrowserInfo = build3DSRootBrowserInfo(browserInfo, clientIp)
        }
    }

    // Build payment method type
    const paymentMethodType = buildPaymentMethodTypePayload(paymentData, config, threeDSAuthParams)
    if (paymentMethodType) {
        body.paymentMethodType = paymentMethodType
        if (paymentToken) {
            body.accountOnFile = ACCOUNT_ON_FILE.NOT_STORED
        }
    }

    if (merchantOrderNumber) {
        body.merchantOrderNumber = merchantOrderNumber
    }

    // Build account holder with optional billing address
    const shouldIncludeBillingAddress = !!threeDSAuthParams || config.enableAVS === true
    const accountHolderPayload = buildAccountHolderPayload(
        accountHolder, billingAddress, clientIp, shouldIncludeBillingAddress
    )
    if (accountHolderPayload) {
        body.accountHolder = accountHolderPayload
    }

    if (rootBrowserInfo) {
        body.browserInfo = rootBrowserInfo
    }

    return body
}

/**
 * Build card payload (supports both encrypted and raw card data)
 * 
 * @param {object} card - Card details
 * @returns {object} Card payload
 */
export const buildCardPayload = (card) => {
    const payload = {
        expiry: {
            month: card.expiryMonth || card.expiry?.month,
            year: card.expiryYear || card.expiry?.year
        }
    }

    if (card.accountNumberType === CARD_ENCRYPTION_TYPES.SAFETECH_PAGE_ENCRYPTION || card.encryptionIntegrityCheck) {
        payload.accountNumberType = CARD_ENCRYPTION_TYPES.SAFETECH_PAGE_ENCRYPTION
        payload.accountNumber = card.encryptedCardNumber || card.accountNumber
        payload.cvv = card.encryptedCVV || card.cvv
        
        if (card.encryptionIntegrityCheck) {
            payload.encryptionIntegrityCheck = card.encryptionIntegrityCheck
        }
    } else {
        const cardNumber = (card.cardNumber || card.accountNumber || '').replace(/\D/g, '')
        payload.accountNumber = cardNumber
        if (card.cvv) {
            payload.cvv = card.cvv
        }
    }

    return payload
}

/**
 * Build verification request payload
 * 
 * @param {object} data - Verification data
 * @param {boolean} usePlainCard - Whether to use plain card (mock mode)
 * @param {object} config - Optional JPMC config for merchantSoftware
 * @returns {object} Verification request body
 */
export const buildVerificationRequestBody = (data, usePlainCard = false, config = {}) => {
    const { card, accountHolder, billingAddress, currency } = data
    
    const body = {
        merchant: buildMerchant(config),
        currency,
        paymentMethodType: {
            card: usePlainCard ? {
                accountNumber: (card.cardNumber || card.encryptedCardNumber || '').replace(/\s/g, ''),
                expiry: {
                    month: card.expiryMonth,
                    year: card.expiryYear
                },
                cvv: card.cvv || card.securityCode
            } : {
                accountNumberType: CARD_ENCRYPTION_TYPES.SAFETECH_PAGE_ENCRYPTION,
                accountNumber: card.encryptedCardNumber,
                expiry: {
                    month: card.expiryMonth,
                    year: card.expiryYear
                },
                cvv: card.encryptedCVV,
                encryptionIntegrityCheck: card.integrityCheck
            }
        },
        initiatorType: INITIATOR_TYPE,
        accountOnFile: ACCOUNT_ON_FILE.TO_BE_STORED,
        accountHolder: {
            fullName: accountHolder?.fullName || accountHolder?.name,
            email: accountHolder?.email,
            phone: accountHolder?.phone
        }
    }
    
    return body
}

/**
 * Build capture request body
 * 
 * @param {number} amount - Amount to capture
 * @param {string} currency - Currency code
 * @returns {object} Capture request body
 */
export const buildCaptureRequestBody = (amount, currency) => {
    return { amount, currency }
}

/**
 * Build Google Pay payment request body according to JPMC API spec
 * 
 * Google Pay tokens are encrypted by Google and decrypted by JP Morgan.
 * The token contains the card details in encrypted form.
 * 
 * @param {object} paymentData - Google Pay payment details
 * @param {object} paymentData.googlePayToken - Encrypted payment bundle from Google Pay
 * @param {string|number} paymentData.amount - Payment amount
 * @param {string} [paymentData.currency] - Currency code (default: USD)
 * @param {string} [paymentData.merchantOrderNumber] - Merchant order reference
 * @param {object} [paymentData.billingAddress] - Billing address from Google Pay
 * @param {string} [paymentData.email] - Customer email
 * @param {string} [paymentData.cardNetwork] - Card network (VISA, MASTERCARD, etc.)
 * @param {string} [paymentData.captureMethod] - Capture method (NOW, DELAYED, MANUAL)
 * @returns {object} Formatted request body for JP Morgan API
 * 
 * @example
 * const body = buildGooglePayRequestBody({
 *   googlePayToken: { signature: '...', signedMessage: '...', ... },
 *   amount: '99.99',
 *   currency: 'USD',
 *   merchantOrderNumber: 'ORDER-123',
 *   billingAddress: { line1: '123 Main St', ... },
 *   email: 'customer@example.com'
 * })
 */
export const buildGooglePayRequestBody = (paymentData) => {
    return buildGooglePayRequestBodyInternal(paymentData)
}

/**
 * Build account holder object from Google Pay billing data
 * 
 * @param {object} billingAddress - Billing address from Google Pay
 * @param {string} email - Customer email
 * @returns {object} Account holder object
 */
export const buildGooglePayAccountHolder = (billingAddress, email) => {
    return buildGooglePayAccountHolderInternal(billingAddress, email, {})
}

/**
 * Format Google Pay billing address to JP Morgan format
 * 
 * Google Pay address format:
 * {
 *   name: "John Doe",
 *   line1: "123 Main St",
 *   line2: "Apt 4",
 *   city: "San Francisco",
 *   state: "CA",
 *   postalCode: "94105",
 *   countryCode: "US"
 * }
 * 
 * JP Morgan address format:
 * {
 *   line1: "123 Main St",
 *   line2: "Apt 4",
 *   city: "San Francisco",
 *   state: "CA",
 *   postalCode: "94105",
 *   country: "US"
 * }
 * 
 * @param {object} googlePayAddress - Address from Google Pay
 * @returns {object|null} Formatted address or null
 */
export const formatGooglePayBillingAddress = (googlePayAddress) => {
    if (!googlePayAddress) {
        return null
    }

    const address = {}

    if (googlePayAddress.line1) {
        address.line1 = googlePayAddress.line1
    }
    if (googlePayAddress.line2) {
        address.line2 = googlePayAddress.line2
    }
    if (googlePayAddress.city) {
        address.city = googlePayAddress.city
    }
    if (googlePayAddress.state) {
        address.state = googlePayAddress.state
    }
    if (googlePayAddress.postalCode) {
        address.postalCode = googlePayAddress.postalCode
    }
    if (googlePayAddress.countryCode) {
        address.country = googlePayAddress.countryCode
    }

    return address.line1 ? address : null
}

/**
 * Validate Google Pay token structure
 * 
 * @param {object} token - Google Pay token
 * @returns {object} Validation result { valid: boolean, errors: string[] }
 */
export const validateGooglePayToken = (token) => {
    const errors = []

    if (!token) {
        errors.push('Token is required')
        return { valid: false, errors }
    }

    if (!token.signature) {
        errors.push('Token missing signature field')
    }
    if (!token.signedMessage) {
        errors.push('Token missing signedMessage field')
    }
    if (!token.protocolVersion) {
        errors.push('Token missing protocolVersion field')
    }
    if (!token.intermediateSigningKey) {
        errors.push('Token missing intermediateSigningKey field')
    }

    return {
        valid: errors.length === 0,
        errors
    }
}

export default {
    buildPaymentRequestBody,
    buildCardPayload,
    buildVerificationRequestBody,
    buildCaptureRequestBody,
    buildGooglePayRequestBody,
    buildGooglePayAccountHolder,
    formatGooglePayBillingAddress,
    validateGooglePayToken
}
