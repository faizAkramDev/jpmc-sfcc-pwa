/**
 * PWA Kit Form Data Transformer
 * 
 * Transforms SFCC PWA Kit payment form data to JPMC card data format.
 * This utility reduces boilerplate code in developer's payment.jsx file.
 * 
 * @module utils/form-transformer
 */

import { CARD_TYPES } from './constants.mjs'

// =============================================================================
// Card Type Mapping
// =============================================================================

/**
 * Maps PWA Kit card type names to SFCC card type values
 * 
 * PWA Kit PaymentForm uses lowercase types (visa, mastercard, amex)
 * SFCC Shopper Baskets API expects specific values (Visa, Master Card, Amex)
 * Values must match card-type attribute in payment-methods.xml (SFCC metadata)
 * 
 * Keys are normalized (lowercase, no spaces/hyphens) to match any input format:
 * - 'diners-club', 'diners club', 'Diners Club' → all become 'dinersclub' → 'DinersClub'
 * 
 * @type {Object.<string, string>}
 */
const PWA_KIT_TO_JPMC_CARD_TYPE = {
    // Normalized keys → SFCC paymentCard.cardType values (must match payment-methods.xml)
    'visa': CARD_TYPES.VISA,              // 'Visa'
    'mastercard': CARD_TYPES.MASTERCARD,  // 'Master Card'
    'americanexpress': CARD_TYPES.AMEX,   // 'Amex'
    'amex': CARD_TYPES.AMEX,              // 'Amex'
    'discover': CARD_TYPES.DISCOVER,      // 'Discover'
    'jcb': CARD_TYPES.JCB,                // 'JCB'
    'dinersclub': CARD_TYPES.DINERS,      // 'DinersClub' (handles diners-club, diners club, etc.)
    'diners': CARD_TYPES.DINERS,          // 'DinersClub'
    'maestro': CARD_TYPES.MAESTRO,        // 'Maestro'
    'chinaunionpay': CARD_TYPES.CHINA_UNIONPAY,  // 'China UnionPay'
    'unionpay': CARD_TYPES.CHINA_UNIONPAY,       // 'China UnionPay'
    'cup': CARD_TYPES.CHINA_UNIONPAY,            // 'China UnionPay' (abbreviation)
}

/**
 * Normalizes card type string by removing special characters and converting to lowercase
 * 
 * @param {string} cardType - Card type string (e.g., 'diners-club', 'American Express')
 * @returns {string} Normalized string (e.g., 'dinersclub', 'americanexpress')
 */
function normalizeCardType(cardType) {
    return cardType.toLowerCase().replace(/[\s\-_]/g, '')
}

/**
 * Maps PWA Kit card type to SFCC card type value
 * 
 * @param {string} pwaKitCardType - Card type from PWA Kit (e.g., 'visa', 'diners-club')
 * @returns {string} SFCC card type value (e.g., 'Visa', 'Diners')
 * 
 * @example
 * mapPWAKitCardType('mastercard')      // returns 'Master Card'
 * mapPWAKitCardType('american-express') // returns 'Amex'
 * mapPWAKitCardType('diners-club')     // returns 'Diners'
 * mapPWAKitCardType('Diners Club')     // returns 'Diners'
 */
export function mapPWAKitCardType(pwaKitCardType) {
    if (!pwaKitCardType) {
        return CARD_TYPES.VISA // Default to Visa
    }

    const normalizedType = normalizeCardType(pwaKitCardType)
    const jpmcType = PWA_KIT_TO_JPMC_CARD_TYPE[normalizedType]
    
    if (!jpmcType) {
        return CARD_TYPES.VISA
    }
    
    return jpmcType
}

// =============================================================================
// Address Transformation
// =============================================================================

/**
 * Transforms PWA Kit address object to JPMC billing address format
 * 
 * @param {Object} address - PWA Kit address object
 * @param {string} [address.firstName] - First name
 * @param {string} [address.lastName] - Last name
 * @param {string} [address.address1] - Address line 1
 * @param {string} [address.address2] - Address line 2
 * @param {string} [address.city] - City
 * @param {string} [address.stateCode] - State code (e.g., 'CA')
 * @param {string} [address.postalCode] - Postal/ZIP code
 * @param {string} [address.countryCode] - Country code (e.g., 'US')
 * @param {string} [address.phone] - Phone number
 * @returns {Object|undefined} JPMC billing address format or undefined if no address
 */
export function transformBillingAddress(address) {
    if (!address) {
        return undefined
    }

    return {
        firstName: address.firstName || '',
        lastName: address.lastName || '',
        address1: address.address1 || '',
        address2: address.address2 || '',
        city: address.city || '',
        stateCode: address.stateCode || '',
        postalCode: address.postalCode || '',
        countryCode: address.countryCode || 'US',
        phone: address.phone || ''
    }
}

// =============================================================================
// Expiry Date Parsing
// =============================================================================

/**
 * Parses expiry date string in MM/YY format
 * 
 * @param {string} expiry - Expiry date in "MM/YY" or "MM/YYYY" format
 * @returns {{ month: number, year: number }} Parsed month and 4-digit year
 * @throws {Error} If expiry format is invalid
 * 
 * @example
 * parseExpiryDate('12/25')  // returns { month: 12, year: 2025 }
 * parseExpiryDate('03/2026')  // returns { month: 3, year: 2026 }
 */
export function parseExpiryDate(expiry) {
    if (!expiry || typeof expiry !== 'string') {
        throw new Error('Invalid expiry date: must be a string in MM/YY format')
    }

    const parts = expiry.split('/')
    
    if (parts.length !== 2) {
        throw new Error(`Invalid expiry date format: "${expiry}". Expected MM/YY or MM/YYYY`)
    }

    const [monthStr, yearStr] = parts
    const month = Number.parseInt(monthStr.trim(), 10)
    let year = Number.parseInt(yearStr.trim(), 10)

    // Validate month
    if (Number.isNaN(month) || month < 1 || month > 12) {
        throw new TypeError(`Invalid expiry month: "${monthStr}". Must be 01-12`)
    }

    // Validate and convert year
    if (Number.isNaN(year)) {
        throw new Error(`Invalid expiry year: "${yearStr}". Must be a number`)
    }

    // Convert 2-digit year to 4-digit
    if (year < 100) {
        year = 2000 + year
    }

    return { month, year }
}

// =============================================================================
// Main Transformer Function
// =============================================================================

/**
 * Transform PWA Kit payment form data to JPMC card data format
 * 
 * This utility converts the payment form values from SFCC PWA Kit's PaymentForm
 * component into the format expected by JPMC's verifyAndSavePayment() method.
 * 
 * @param {Object} formValues - PWA Kit PaymentForm values
 * @param {string} formValues.number - Card number (may have spaces/dashes, e.g., "4111 1111 1111 1111")
 * @param {string} formValues.holder - Cardholder name
 * @param {string} formValues.expiry - Expiration date in "MM/YY" format
 * @param {string} formValues.securityCode - CVV/CVC code
 * @param {string} formValues.cardType - Card type from PWA Kit (e.g., 'visa', 'master card')
 * @param {Object} [billingAddress] - PWA Kit billing address object
 * @returns {Object} JPMC cardData format ready for verifyAndSavePayment()
 * 
 * @example
 * // In payment.jsx:
 * import { transformPWAKitFormData } from '@jpmorgan/jpmorgan-salesforce-pwa/client'
 * 
 * const onSubmit = paymentMethodForm.handleSubmit(async (paymentFormValues) => {
 *     const billingAddress = billingSameAsShipping 
 *         ? selectedShippingAddress 
 *         : billingAddressForm.getValues()
 *     
 *     const cardData = transformPWAKitFormData(paymentFormValues, billingAddress)
 *     
 *     const result = await verifyAndSavePayment(addPaymentFn, cardData)
 *     // ...
 * })
 * 
 * @throws {Error} If required form values are missing or invalid
 */
export function transformPWAKitFormData(formValues, billingAddress) {
    // Validate required fields
    if (!formValues) {
        throw new Error('formValues is required')
    }

    if (!formValues.number) {
        throw new Error('Card number is required')
    }

    if (!formValues.expiry) {
        throw new Error('Expiry date is required')
    }

    if (!formValues.securityCode) {
        throw new Error('Security code (CVV) is required')
    }

    // Parse expiry date
    const { month: expiryMonth, year: expiryYear } = parseExpiryDate(formValues.expiry)

    // Strip spaces, dashes, and other non-numeric characters from card number
    const cleanCardNumber = formValues.number.replace(/[\s\-.]/g, '')

    // Build JPMC card data object
    const cardData = {
        cardNumber: cleanCardNumber,
        cvv: formValues.securityCode,
        expiryMonth,
        expiryYear,
        holder: formValues.holder || '',
        cardType: mapPWAKitCardType(formValues.cardType),
        billingAddress: transformBillingAddress(billingAddress)
    }

    return cardData
}

// =============================================================================
// Exports
// =============================================================================

export default transformPWAKitFormData
