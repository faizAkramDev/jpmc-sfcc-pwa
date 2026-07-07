/**
 * Request Builder Utilities for JPMC Payment Requests
 * 
 * Helper functions to build common request objects and resolve data
 * from multiple sources. Used by verifyAndSavePayment, authorizePayment,
 * and Google Pay flows to reduce code duplication.
 */

import { buildFraudShoppingCart, mapShipToForFraud } from './fraud-helpers'
import {
    getTokenFromSession,
    getFraudCart,
    getFraudShipTo,
    getFraudRuleAction,
    getCardTypeName,
    getCardType
} from './session-storage'
import { detectCardType } from '../../../utils/validation'
import { toMinorUnits } from '../../../utils/currency'

// =============================================================================
// Token Resolution
// =============================================================================

/**
 * Resolve JPMC token from multiple sources (in order of preference)
 * 
 * Sources checked:
 * 1. basket.paymentInstruments[0].paymentCard.creditCardToken (standard SFCC field)
 * 2. basket.paymentInstruments[0].c_jpmcToken (custom attribute)
 * 3. basket.paymentInstruments[0].c_jpmcVerificationToken (verification token)
 * 4. verificationResult.storedToken (local React state backup)
 * 5. sessionStorage (persists across navigation)
 * 
 * @param {object} options - Resolution options
 * @param {object} options.basket - SFCC basket object
 * @param {object} options.verificationResult - Verification result from context state
 * @returns {object} Token info with value and source
 */
export function resolvePaymentToken({ basket, verificationResult }) {
    const paymentInstrument = basket?.paymentInstruments?.[0]
    const sessionToken = getTokenFromSession(basket?.basketId)
    
    // Check sources in order of preference
    // All these sources store encrypted tokenRef
    if (paymentInstrument?.paymentCard?.creditCardToken) {
        return {
            tokenRef: paymentInstrument.paymentCard.creditCardToken,
            source: 'creditCardToken',
            paymentInstrument
        }
    }
    
    if (paymentInstrument?.c_jpmcToken) {
        return {
            tokenRef: paymentInstrument.c_jpmcToken,
            source: 'c_jpmcToken',
            paymentInstrument
        }
    }
    
    if (paymentInstrument?.c_jpmcVerificationToken) {
        return {
            tokenRef: paymentInstrument.c_jpmcVerificationToken,
            source: 'c_jpmcVerificationToken',
            paymentInstrument
        }
    }
    
    if (verificationResult?.storedToken) {
        return {
            tokenRef: verificationResult.storedToken,
            source: 'verificationResult',
            paymentInstrument
        }
    }
    
    if (sessionToken) {
        return {
            tokenRef: sessionToken,
            source: 'sessionStorage',
            paymentInstrument
        }
    }
    
    return {
        tokenRef: null,
        source: 'none',
        paymentInstrument
    }
}

// =============================================================================
// Billing Address Resolution
// =============================================================================

/**
 * Resolve billing address from multiple sources
 * 
 * Sources checked (in order of preference):
 * 1. Local billingAddress state (from payment form)
 * 2. basket.billingAddress (from SFCC)
 * 3. cardData.billingAddress (from stored card form data)
 * 4. options.billingAddress (explicit override)
 * 
 * @param {object} options - Resolution options
 * @param {object} options.billingAddress - Local billing address state
 * @param {object} options.basket - SFCC basket object
 * @param {object} options.cardData - Card form data with optional billing address
 * @param {object} options.overrideBillingAddress - Explicit override from options
 * @returns {object|null} Resolved billing address or null
 */
export function resolveBillingAddress({ billingAddress, basket, cardData, overrideBillingAddress }) {
    return billingAddress || 
           basket?.billingAddress || 
           cardData?.billingAddress || 
           overrideBillingAddress || 
           null
}

// =============================================================================
// Account Holder Building
// =============================================================================

/**
 * Build account holder object for JPMC payment requests
 * 
 * Resolves fullName, email, and phone from multiple sources:
 * - fullName: paymentCard.holder, cardData.holder
 * - email: basket.customerInfo.email, billingAddress.email, cardData.billingAddress.email
 * - phone: billingAddress.phone, basket.billingAddress.phone, cardData.billingAddress.phone
 * 
 * @param {object} options - Builder options
 * @param {object} options.paymentCard - Payment card from basket payment instrument
 * @param {object} options.cardData - Current card form data
 * @param {object} options.basket - SFCC basket object
 * @param {object} options.billingAddress - Local billing address state
 * @returns {object} Account holder object
 */
export function buildAccountHolder({ paymentCard, cardData, basket, billingAddress }) {
    const rawPhone = billingAddress?.phone || 
               basket?.billingAddress?.phone || 
               cardData?.billingAddress?.phone || 
               null
    const phone = rawPhone ? rawPhone.replace(/\D/g, '') : null
    
    const resolvedBilling = billingAddress || basket?.billingAddress || cardData?.billingAddress
    const firstName = resolvedBilling?.firstName || null
    const lastName = resolvedBilling?.lastName || null
    
    let fullName = paymentCard?.holder || cardData?.holder || null
    if (!fullName && (firstName || lastName)) {
        fullName = ((firstName || '') + ' ' + (lastName || '')).trim() || null
    }
    
    return {
        fullName,
        firstName,
        lastName,
        email: basket?.customerInfo?.email || 
               billingAddress?.email || 
               cardData?.billingAddress?.email || 
               null,
        phone
    }
}

// =============================================================================
// Fraud Data Building
// =============================================================================

/**
 * Build fraud check fields for JPMC payment requests
 * 
 * Combines live basket data with persisted fallbacks:
 * - fraudRuleAction: from session storage (persisted during verify)
 * - kountSessionId: from ref (device fingerprint)
 * - fraudShoppingCart: live basket items OR persisted fallback
 * - shipTo: live basket shipping OR persisted fallback
 * 
 * @param {object} options - Builder options
 * @param {object} options.basket - SFCC basket object
 * @param {string} options.kountSessionId - Kount session ID from ref
 * @returns {object} Fraud check fields (undefined values for empty fields)
 */
export function buildFraudFields({ basket, kountSessionId }) {
    // Build shopping cart from live basket or fall back to persisted value
    const shoppingCart = buildFraudShoppingCart(basket?.productItems) || getFraudCart()
    
    // Build shipTo from live basket or fall back to persisted value
    const shipTo = mapShipToForFraud(basket) || getFraudShipTo()
    
    return {
        fraudRuleAction: getFraudRuleAction() || undefined,
        kountSessionId: kountSessionId || undefined,
        fraudShoppingCart: shoppingCart || undefined,
        shipTo: shipTo || undefined
    }
}

// =============================================================================
// Card Expiry Resolution
// =============================================================================

/**
 * Resolve card expiry from payment card or card form data
 * 
 * @param {object} options - Resolution options
 * @param {object} options.paymentCard - Payment card from basket
 * @param {object} options.cardData - Current card form data
 * @returns {object} Card expiry { month, year }
 */
export function resolveCardExpiry({ paymentCard, cardData }) {
    return {
        month: paymentCard?.expirationMonth || cardData?.expiryMonth || null,
        year: paymentCard?.expirationYear || cardData?.expiryYear || null
    }
}

// =============================================================================
// Authorization Request Builders
// =============================================================================

/**
 * Build token-based authorization request
 * Used when we have a SAFETECH token from verification
 * 
 * IMPORTANT: This is called AFTER order creation (order-first flow).
 * The merchantOrderNumber should be the SFCC orderNo, not basketId.
 * 
 * @param {object} options - Request options
 * @param {string} options.token - SAFETECH token
 * @param {object} options.basket - SFCC basket (for amount, currency, billing data)
 * @param {object} options.billingAddress - Local billing address state
 * @param {object} options.cardData - Card form data
 * @param {object} options.paymentConfig - Payment configuration
 * @param {string} options.kountSessionId - Kount session ID
 * @param {object} options.overrides - Required: { merchantOrderNumber } (orderNo from SFCC)
 * @returns {object} Token authorization request object
 */
export function buildTokenAuthRequest({
    tokenRef,
    basket,
    billingAddress,
    cardData,
    paymentConfig,
    kountSessionId,
    overrides = {}
}) {
    const paymentInstrument = basket?.paymentInstruments?.[0]
    const paymentCard = paymentInstrument?.paymentCard
    
    const amount = overrides.amount || toMinorUnits(basket?.orderTotal || 0, overrides.currency || basket?.currency)
    const currency = overrides.currency || basket?.currency
    
    // CRITICAL: merchantOrderNumber is REQUIRED - must be orderNo from SFCC order
    // This is set after order creation in the order-first flow
    const merchantOrderNumber = overrides.merchantOrderNumber
    if (!merchantOrderNumber) {
        throw new Error('merchantOrderNumber (orderNo) is required for authorization')
    }
    
    return {
        tokenRef,
        cardExpiry: resolveCardExpiry({ paymentCard, cardData }),
        amount,
        currency,
        merchantOrderNumber,
        captureMethod: overrides.captureMethod || paymentConfig?.captureMethod,
        paymentInstrumentId: overrides.paymentInstrumentId,
        paymentAmount: overrides.paymentAmount,
        // Card type for 3DS support check - check overrides, then basket paymentCard.cardType, then session storage
        cardTypeName: overrides.cardTypeName || paymentInstrument?.paymentCard?.cardType || getCardTypeName(),
        // JPMC cardType code (VI, MC, AX) from session storage
        cardType: overrides.cardType || getCardType(),
        billingAddress: resolveBillingAddress({
            billingAddress,
            basket,
            cardData,
            overrideBillingAddress: overrides.billingAddress
        }),
        accountHolder: buildAccountHolder({
            paymentCard,
            cardData,
            basket,
            billingAddress
        }),
        ...buildFraudFields({ basket, kountSessionId }),
        ...(overrides.browserInfo && { browserInfo: overrides.browserInfo })
    }
}

/**
 * Build encrypted card authorization request
 * Used when we don't have a token (legacy flow)
 * 
 * IMPORTANT: This is called AFTER order creation (order-first flow).
 * The merchantOrderNumber should be the SFCC orderNo, not basketId.
 * 
 * @param {object} options - Request options
 * @param {object} options.encryptedCardData - Encrypted card data from PIE
 * @param {object} options.basket - SFCC basket (for amount, currency, billing data)
 * @param {object} options.billingAddress - Local billing address state
 * @param {object} options.cardData - Card form data
 * @param {object} options.paymentConfig - Payment configuration
 * @param {string} options.kountSessionId - Kount session ID
 * @param {object} options.overrides - Required: { merchantOrderNumber } (orderNo from SFCC)
 * @returns {object} Card authorization request object
 */
export function buildCardAuthRequest({
    encryptedCardData,
    basket,
    billingAddress,
    cardData,
    paymentConfig,
    kountSessionId,
    overrides = {}
}) {
    const paymentInstrument = basket?.paymentInstruments?.[0]
    const amount = overrides.amount || toMinorUnits(basket?.orderTotal || 0, overrides.currency || basket?.currency)
    const currency = overrides.currency || basket?.currency
    
    // Build card object based on whether data is encrypted
    const card = encryptedCardData.isPlain ? {
        cardNumber: encryptedCardData.cardNumber,
        cvv: encryptedCardData.cvv,
        expiryMonth: encryptedCardData.expiryMonth,
        expiryYear: encryptedCardData.expiryYear
    } : {
        encryptedCardNumber: encryptedCardData.encryptedCardNumber,
        encryptedCVV: encryptedCardData.encryptedCVV,
        integrityCheck: encryptedCardData.integrityCheck,
        expiryMonth: encryptedCardData.expiryMonth,
        expiryYear: encryptedCardData.expiryYear
    }
    
    // CRITICAL: merchantOrderNumber is REQUIRED - must be orderNo from SFCC order
    // This is set after order creation in the order-first flow
    const merchantOrderNumber = overrides.merchantOrderNumber
    if (!merchantOrderNumber) {
        throw new Error('merchantOrderNumber (orderNo) is required for authorization')
    }
    
    return {
        card,
        amount,
        currency,
        merchantOrderNumber,
        captureMethod: overrides.captureMethod || paymentConfig?.captureMethod,
        // For server-side order patching after successful auth
        paymentInstrumentId: overrides.paymentInstrumentId,
        paymentAmount: overrides.paymentAmount,
        billingAddress: resolveBillingAddress({
            billingAddress,
            basket,
            cardData,
            overrideBillingAddress: overrides.billingAddress
        }),
        accountHolder: buildAccountHolder({
            paymentCard: null,
            cardData,
            basket,
            billingAddress
        }),
        ...buildFraudFields({ basket, kountSessionId }),
        // Card type for 3DS support check
        cardTypeName: overrides.cardTypeName || paymentInstrument?.paymentCard?.cardType || getCardTypeName() || (cardData?.cardNumber && detectCardType(cardData.cardNumber)) || null,
        // JPMC cardType code (VI, MC, AX) from session storage
        cardType: overrides.cardType || getCardType(),
        ...(overrides.browserInfo && { browserInfo: overrides.browserInfo })
    }
}

// =============================================================================
// Card Masking Detection
// =============================================================================

export function isCardMasked(cardData) {
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
// Logging Helpers
// =============================================================================

export function buildTokenDebugInfo(tokenInfo, { sessionToken, cardFormData, encryptedCardData }) {
    return {
        hasPaymentInstrument: !!tokenInfo.paymentInstrument,
        hasToken: !!tokenInfo.token,
        hasSessionToken: !!sessionToken,
        tokenSource: tokenInfo.source,
        hasCardFormData: !!cardFormData,
        hasEncryptedCardData: !!encryptedCardData
    }
}
