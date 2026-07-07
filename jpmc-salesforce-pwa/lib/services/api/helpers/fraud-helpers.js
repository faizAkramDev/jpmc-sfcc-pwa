/**
 * Fraud Check Helpers
 * 
 * Helper functions for building JPMC fraud check payloads.
 * 
 * @module services/api/helpers/fraud-helpers
 */

import { CARD_ENCRYPTION_TYPES } from '../../../utils/constants.mjs'
import { convertCountryCode } from '../../../utils/formatters/country-codes'
import { buildMerchant, formatPhoneForJPMC } from './request-helpers'

// =============================================================================
// Address Building Helpers
// =============================================================================

/**
 * Build billing address object for fraud payload
 */
const buildBillingAddressForFraud = (billingAddress) => ({
    line1: billingAddress.line1 || billingAddress.address1,
    ...(billingAddress.line2 || billingAddress.address2
        ? { line2: billingAddress.line2 || billingAddress.address2 }
        : {}),
    city: billingAddress.city,
    state: billingAddress.state || billingAddress.stateCode,
    postalCode: billingAddress.postalCode,
    countryCode: convertCountryCode(billingAddress.countryCode || billingAddress.country)
})

/**
 * Build shipping address object for fraud payload
 */
const buildShippingAddressForFraud = (shipTo) => ({
    line1: shipTo.address1 || shipTo.line1,
    ...(shipTo.address2 || shipTo.line2
        ? { line2: shipTo.address2 || shipTo.line2 }
        : {}),
    city: shipTo.city,
    state: shipTo.stateCode || shipTo.state,
    postalCode: shipTo.postalCode,
    countryCode: convertCountryCode(shipTo.countryCode || shipTo.country)
})

/**
 * Build card object for fraud payload
 */
const buildCardForFraud = (card, accountNumberType) => {
    const isSafetechEncrypted = accountNumberType === CARD_ENCRYPTION_TYPES.SAFETECH_PAGE_ENCRYPTION
    return {
        accountNumber: card.accountNumber || card.encryptedCardNumber,
        accountNumberType,
        expiry: {
            month: Number.parseInt(card.expiryMonth || card.expiry?.month, 10),
            year: Number.parseInt(card.expiryYear || card.expiry?.year, 10)
        },
        ...(isSafetechEncrypted && card.encryptedCVV && { cvv: card.encryptedCVV }),
        ...(isSafetechEncrypted && card.integrityCheck && { encryptionIntegrityCheck: card.integrityCheck })
    }
}

/**
 * Build shipTo object for fraud payload
 */
const buildShipToForFraud = (shipTo) => ({
    shippingAddress: buildShippingAddressForFraud(shipTo),
    ...(shipTo.firstName || shipTo.lastName
        ? { fullName: `${shipTo.firstName || ''} ${shipTo.lastName || ''}`.trim() }
        : {}),
    ...(shipTo.firstName && { firstName: shipTo.firstName }),
    ...(shipTo.lastName && { lastName: shipTo.lastName }),
    ...(shipTo.phone && { phone: formatPhoneForJPMC(shipTo.phone, shipTo.countryCode || shipTo.country) }),
    ...(shipTo.shippingDescription && { shippingDescription: shipTo.shippingDescription })
})

// =============================================================================
// Fraud Check Payload Building
// =============================================================================

/**
 * Build fraud check payload for JPMC /api/v2/fraudcheck
 *
 * @param {object} p
 * @param {object} p.config - JPMC config (for merchantSoftware)
 * @param {object} p.card - Card data: { accountNumber|encryptedCardNumber, encryptedCVV, integrityCheck, expiryMonth, expiryYear }
 * @param {string} p.accountNumberType - SAFETECH_PAGE_ENCRYPTION | SAFETECH_TOKEN
 * @param {object} p.accountHolder - { fullName, email, phone }
 * @param {object} p.billingAddress - { line1, city, state, postalCode, countryCode }
 * @param {string} p.currency - ISO currency code
 * @param {number} p.amount - Amount in cents
 * @param {string} [p.fraudShoppingCart] - Pre-formatted cart string (T=...&I=...&|)
 * @param {object} [p.shipTo] - Shipping address object from client
 * @param {string} [p.kountSessionId] - Kount device session ID
 * @param {string} [p.userAgent] - Browser user agent string
 * @param {string} [p.deviceIPAddress] - Client IP address
 * @returns {object} Fraud check payload
 */
export const buildFraudCheckPayload = ({ 
    config, 
    card, 
    accountNumberType, 
    accountHolder, 
    billingAddress, 
    currency, 
    amount, 
    fraudShoppingCart, 
    shipTo, 
    kountSessionId, 
    userAgent, 
    deviceIPAddress 
}) => {
    const resolvedAccountNumberType = accountNumberType || CARD_ENCRYPTION_TYPES.SAFETECH_PAGE_ENCRYPTION

    const payload = {
        amount: Math.round(Number.parseFloat(amount) || 0),
        currency,
        accountHolder: {
            ...(accountHolder?.email && { email: accountHolder.email }),
            ...(accountHolder?.fullName && { fullName: accountHolder.fullName }),
            ...(accountHolder?.phone && { phone: formatPhoneForJPMC(accountHolder.phone, billingAddress?.countryCode || billingAddress?.country) }),
            ...(deviceIPAddress && { deviceIPAddress }),
            ...(billingAddress && { billingAddress: buildBillingAddressForFraud(billingAddress) })
        },
        paymentMethodType: {
            card: buildCardForFraud(card, resolvedAccountNumberType)
        },
        merchant: buildMerchant(config),
        fraudScore: {
            isFraudRuleReturn: true,
            ...(userAgent && { cardholderBrowserInformation: userAgent }),
            ...(fraudShoppingCart && { fraudCheckShoppingCart: fraudShoppingCart }),
            ...(kountSessionId && { sessionId: kountSessionId })
        }
    }

    if (shipTo) {
        payload.shipTo = buildShipToForFraud(shipTo)
    }

    return payload
}

// =============================================================================
// Exports
// =============================================================================

export default {
    buildFraudCheckPayload
}
