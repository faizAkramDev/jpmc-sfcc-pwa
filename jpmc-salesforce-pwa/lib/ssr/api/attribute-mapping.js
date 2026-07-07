/**
 * JPMC Attribute Mapping Configuration
 * 
 * Configurable mapping of JPMC payment response data to SFCC custom attributes.
 * Users can extend or override the default mapping.
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/ssr/api/attribute-mapping
 */

import logger from '../../utils/logger.js'

/**
 * Default attribute mapping for JPMC payment response - OrderPaymentInstrument level
 * 
 * Each key is the SFCC custom attribute name (must start with c_)
 * Each value is either:
 * - A string: property path in the JPMC response
 * - A function: (jpmcResponse) => value
 * 
 * Note: The response may be normalized (cardTypeName at top level) or raw (nested in paymentMethodType.card)
 * 
 * @type {Object.<string, string|function>}
 */
export const DEFAULT_ATTRIBUTE_MAPPING = {
    c_jpmcTransactionId: 'transactionId',
    // Card type name from JPMC (e.g., VISA, MASTERCARD, DISCOVER, JCB, DINERS)
    // Used to conditionally skip 3DS for unsupported card types
    // Fallback chain: cardTypeName (full name) -> cardType (short code: VI, MC, AX) -> null
    c_jpmcCardTypeName: (response) => 
        response.cardTypeName || 
        response.paymentMethodType?.card?.cardTypeName || 
        response.cardType ||
        response.paymentMethodType?.card?.cardType ||
        null
}

/**
 * Order level fraud check attribute mapping
 * These attributes are set on the order after fraud check completion
 * 
 * @type {Object.<string, string|function>}
 */
export const FRAUD_CHECK_ORDER_ATTRIBUTE_MAPPING = {
    c_jpmcFraudTransactionId: 'transactionId',
    
    c_jpmcFraudRiskElement: (response) => {
        const riskElement = response.riskElement || null
        return riskElement ? JSON.stringify(riskElement) : null
    },
    
    c_jpmcFraudRiskDecision: (response) => {
        const riskDecision = response.riskDecision || null
        return riskDecision ? JSON.stringify(riskDecision) : null
    },
    
    c_jpmcFraudCheckDate: () => new Date().toISOString(),
    
    c_jpmcFraudResponse: (response) => {
        try {
            return JSON.stringify(response)
        } catch (err) {
            return null
        }
    }
}

/**
 * Order level authorization attribute mapping
 * These attributes are set on the order after successful authorization
 * 
 * @type {Object.<string, string|function>}
 */
export const AUTH_ORDER_ATTRIBUTE_MAPPING = {
    /**
     * Store card network response (AVS, CVV results, network transaction ID)
     * This contains valuable data for reconciliation and debugging:
     * - addressVerificationResult: AVS match result
     * - cardVerificationResult: CVV match result
     * - networkTransactionId: Network-level transaction ID
     * - networkResponseCode: Response code from card network
     */
    c_jpmcCardNetworkResponse: (response) => {
        const networkResponse = response.paymentMethodType?.card?.networkResponse
        
        if (!networkResponse) {
            return null
        }
        
        try {
            return JSON.stringify(networkResponse)
        } catch (err) {
            logger.warn('[AttributeMapping] Failed to stringify networkResponse:', err.message)
            return null
        }
    }
}

/**
 * PaymentTransaction level attribute mapping
 * These attributes are set on the payment transaction after successful authorization
 * 
 * @type {Object.<string, string|function>}
 */
export const PAYMENT_TRANSACTION_ATTRIBUTE_MAPPING = {
    c_jpmcTransactionId: 'transactionId',
    c_jpmcAuthorizationId: 'transactionId',
    
    c_jpmcCaptureMethod: 'captureMethod',
    
    c_jpmcAuthTimestamp: (response) => response.timestamp || response.transactionDate || response._timestamp,
    
    c_threeDSAuthenticationId: (response) => response.paymentAuthenticationResult?.authenticationId || null,
    
    c_threeDSAuthenticationValue: (response) => response.paymentAuthenticationResult?.authenticationValue || null,
    
    c_threeDSTransactionStatus: (response) => response.paymentAuthenticationResult?.threeDomainSecureCompletion?.threeDSTransactionStatus || null,
    
    c_threeDSEci: (response) => response.paymentAuthenticationResult?.threeDomainSecureCompletion?.electronicCommerceIndicator || null,
    
    c_threeDSTransactionId: (response) => response.paymentAuthenticationResult?.threeDomainSecureCompletion?.threeDSDirectoryServerTransactionId || response.transactionId,
    
    // Card type name from JPMC (e.g., VISA, MASTERCARD, DISCOVER, JCB, DINERS)
    // Fallback chain: cardTypeName (full name) -> cardType (short code: VI, MC, AX) -> null
    c_jpmcCardTypeName: (response) => 
        response.cardTypeName || 
        response.paymentMethodType?.card?.cardTypeName || 
        response.cardType ||
        response.paymentMethodType?.card?.cardType ||
        null
}

/**
 * Maps JPMC payment response to SFCC custom attributes
 * 
 * @param {object} jpmcResponse - JPMC payment authorization response
 * @param {object} customMapping - Optional custom attribute mapping to merge with defaults
 * @returns {object} Object with c_* attributes for SFCC
 * 
 * @example
 * ```javascript
 * // Using default mapping
 * const attributes = mapJPMCResponseToAttributes(jpmcResponse)
 * 
 * // With custom mapping
 * const attributes = mapJPMCResponseToAttributes(jpmcResponse, {
 *     c_myCustomField: (response) => response.transactionId,
 *     c_paymentProvider: () => 'JPMC'
 * })
 * ```
 */
export function mapJPMCResponseToAttributes(jpmcResponse, customMapping = {}) {
    if (!jpmcResponse) {
        logger.warn('[AttributeMapping] No JPMC response to map')
        return {}
    }

    const mapping = { ...DEFAULT_ATTRIBUTE_MAPPING, ...customMapping }
    
    const attributes = {}

    for (const [attributeName, mapper] of Object.entries(mapping)) {
        try {
            let value

            if (typeof mapper === 'function') {
                value = mapper(jpmcResponse)
            } else if (typeof mapper === 'string') {
                value = getNestedProperty(jpmcResponse, mapper)
            }

            if (value !== undefined && value !== null && value !== '') {
                attributes[attributeName] = value
            }
        } catch (error) {
            logger.warn(`[AttributeMapping] Error mapping ${attributeName}:`, error.message)
        }
    }

    return attributes
}

/**
 * Maps JPMC payment response to PaymentTransaction custom attributes
 * 
 * Calculates payment status and amount fields based on captureMethod:
 * - captureMethod = 'NOW': Immediate capture (Auth & Capture)
 *   - jpmcPaymentStatus = 'AC'
 *   - jpmcCapturedAmount = full amount
 *   - jpmcRemainingAuthAmount = 0
 *   - jpmcRemainingRefundableAmount = full amount
 * 
 * - captureMethod = 'MANUAL' or 'DELAYED': Authorization only
 *   - jpmcPaymentStatus = 'A'
 *   - jpmcRemainingAuthAmount = full amount
 *   - jpmcRemainingRefundableAmount = 0
 * 
 * @param {object} jpmcResponse - JPMC payment authorization response
 * @param {number} paymentAmount - Payment amount in dollars (from payment instrument)
 * @param {string} captureMethod - Capture method: 'NOW', 'MANUAL', or 'DELAYED'
 * @param {object} customMapping - Optional custom attribute mapping to merge with defaults
 * @returns {object} Object with c_* attributes for PaymentTransaction
 * 
 * @example
 * ```javascript
 * // Immediate capture (captureMethod = 'NOW')
 * const attributes = mapPaymentTransactionAttributes(jpmcResponse, 99.99, 'NOW')
 * // Returns:
 * // {
 * //   c_jpmcAuthorizationId: 'txn_123',
 * //   c_jpmcCaptureMethod: 'NOW',
 * //   c_jpmcAuthTimestamp: '2024-01-15T10:30:00.000Z',
 * //   c_jpmcPaymentStatus: 'AC',
 * //   c_jpmcCapturedAmount: 99.99,
 * //   c_jpmcRemainingAuthAmount: 0,
 * //   c_jpmcRemainingRefundableAmount: 99.99
 * // }
 * 
 * // Authorization only (captureMethod = 'MANUAL')
 * const attributes = mapPaymentTransactionAttributes(jpmcResponse, 99.99, 'MANUAL')
 * // Returns:
 * // {
 * //   c_jpmcAuthorizationId: 'txn_123',
 * //   c_jpmcCaptureMethod: 'MANUAL',
 * //   c_jpmcAuthTimestamp: '2024-01-15T10:30:00.000Z',
 * //   c_jpmcPaymentStatus: 'A',
 * //   c_jpmcRemainingAuthAmount: 99.99,
 * //   c_jpmcRemainingRefundableAmount: 0
 * // }
 * ```
 */
export function mapPaymentTransactionAttributes(jpmcResponse, paymentAmount, captureMethod = 'MANUAL', customMapping = {}) {
    if (!jpmcResponse) {
        logger.warn('[AttributeMapping] No JPMC response to map for PaymentTransaction')
        return {}
    }

    if (!paymentAmount || typeof paymentAmount !== 'number') {
        logger.warn('[AttributeMapping] Invalid payment amount for PaymentTransaction:', paymentAmount)
        return {}
    }

    const mapping = { ...PAYMENT_TRANSACTION_ATTRIBUTE_MAPPING, ...customMapping }
    
    const attributes = {}

    for (const [attributeName, mapper] of Object.entries(mapping)) {
        try {
            let value

            if (typeof mapper === 'function') {
                value = mapper(jpmcResponse)
            } else if (typeof mapper === 'string') {
                value = getNestedProperty(jpmcResponse, mapper)
            }

            if (attributeName === 'c_jpmcCaptureMethod') {
                value = captureMethod
            }

            if (value !== undefined && value !== null && value !== '') {
                attributes[attributeName] = value
            }
        } catch (error) {
            logger.warn(`[AttributeMapping] Error mapping ${attributeName}:`, error.message)
        }
    }

    const isImmediateCapture = captureMethod === 'NOW'

    

    if (isImmediateCapture) {
        attributes.c_jpmcPaymentStatus = 'AC'
        attributes.c_jpmcCapturedAmount = paymentAmount
        attributes.c_jpmcRemainingAuthAmount = 0
        attributes.c_jpmcRemainingRefundableAmount = paymentAmount
    } else {
        attributes.c_jpmcPaymentStatus = 'A'
        attributes.c_jpmcRemainingAuthAmount = paymentAmount
        attributes.c_jpmcRemainingRefundableAmount = 0
    }

    return attributes
}

/**
 * Maps authorization response to order-level custom attributes
 * 
 * @param {object} authResponse - JPMC authorization response
 * @param {object} customMapping - Optional custom attribute mapping to merge with defaults
 * @returns {object} Object with c_* attributes for Order
 * 
 * @example
 * ```javascript
 * const attributes = mapAuthResponseToOrderAttributes(authResponse)
 * // Returns:
 * // {
 * //   c_jpmcCardNetworkResponse: '{"addressVerificationResult":"ADDRESS_POSTALCODE_MATCH","cardVerificationResult":"MATCH",...}'
 * // }
 * ```
 */
export function mapAuthResponseToOrderAttributes(authResponse, customMapping = {}) {
    if (!authResponse) {
        logger.warn('[AttributeMapping] No auth response to map')
        return {}
    }

    const mapping = { ...AUTH_ORDER_ATTRIBUTE_MAPPING, ...customMapping }
    
    const attributes = {}

    for (const [attributeName, mapper] of Object.entries(mapping)) {
        try {
            let value

            if (typeof mapper === 'function') {
                value = mapper(authResponse)
            } else if (typeof mapper === 'string') {
                value = getNestedProperty(authResponse, mapper)
            }

            if (value !== undefined && value !== null && value !== '') {
                attributes[attributeName] = value
            }
        } catch (error) {
            logger.warn(`[AttributeMapping] Error mapping auth order attribute ${attributeName}:`, error.message)
        }
    }

    return attributes
}

/**
 * Maps fraud check response to order-level custom attributes
 * 
 * @param {object} fraudResponse - Fraud check response from JPMC
 * @param {string} kountSessionId - Kount session ID
 * @param {object} customMapping - Optional custom attribute mapping to merge with defaults
 * @returns {object} Object with c_* attributes for Order
 * 
 * @example
 * ```javascript
 * const attributes = mapFraudResponseToOrderAttributes(fraudResponse, 'kount_session_123')
 * // Returns:
 * // {
 * //   c_jpmcFraudTransactionId: 'txn_fraud_123',
 * //   c_jpmcFraudRiskElement: '{...}',
 * //   c_jpmcFraudRiskDecision: '{"fraudRuleAction":"R"}',
 * //   c_jpmcFraudCheckDate: '2024-01-15T10:30:00.000Z',
 * //   c_kountSessionId: 'kount_session_123',
 * //   c_jpmcFraudResponse: '{...}'
 * // }
 * ```
 */
export function mapFraudResponseToOrderAttributes(fraudResponse, kountSessionId = null, customMapping = {}) {
    if (!fraudResponse) {
        logger.warn('[AttributeMapping] No fraud response to map')
        return {}
    }

    const mapping = { ...FRAUD_CHECK_ORDER_ATTRIBUTE_MAPPING, ...customMapping }
    
    const attributes = {}

    for (const [attributeName, mapper] of Object.entries(mapping)) {
        try {
            let value

            if (typeof mapper === 'function') {
                value = mapper(fraudResponse)
            } else if (typeof mapper === 'string') {
                value = getNestedProperty(fraudResponse, mapper)
            }

            if (value !== undefined && value !== null && value !== '') {
                attributes[attributeName] = value
            }
        } catch (error) {
            logger.warn(`[AttributeMapping] Error mapping fraud attribute ${attributeName}:`, error.message)
        }
    }

    // Add Kount session ID if provided
    if (kountSessionId) {
        attributes.c_kountSessionId = kountSessionId
    }

    return attributes
}

/**
 * Get nested property from object using dot notation
 * 
 * @param {object} obj - Source object
 * @param {string} path - Property path (e.g., 'card.lastFour')
 * @returns {*} Property value or undefined
 */
function getNestedProperty(obj, path) {
    return path.split('.').reduce((current, key) => 
        current && current[key] !== undefined ? current[key] : undefined, 
        obj
    )
}

/**
 * Create a custom attribute mapper with merged configuration
 * 
 * This is useful for creating a reusable mapper with custom attributes.
 * 
 * @param {object} customMapping - Custom attribute mapping
 * @returns {function} Mapper function that takes jpmcResponse
 * 
 * @example
 * ```javascript
 * // In ssr.js configuration
 * const myMapper = createAttributeMapper({
 *     c_myCustomField: (response) => response.transactionId,
 *     c_paymentProvider: () => 'JPMC'
 * })
 * 
 * // Later in code
 * const attributes = myMapper(jpmcResponse)
 * ```
 */
export function createAttributeMapper(customMapping = {}) {
    return (jpmcResponse) => mapJPMCResponseToAttributes(jpmcResponse, customMapping)
}

/**
 * Validate that required custom attributes are defined in SFCC
 * 
 * This is a helper to check if the attributes used in mapping exist.
 * Note: This only validates the attribute names, not their existence in SFCC.
 * 
 * @param {object} mapping - Attribute mapping to validate
 * @returns {object} { valid: boolean, errors: string[] }
 */
export function validateAttributeMapping(mapping = DEFAULT_ATTRIBUTE_MAPPING) {
    const errors = []

    for (const attributeName of Object.keys(mapping)) {
        if (!attributeName.startsWith('c_')) {
            errors.push(`Attribute "${attributeName}" must start with "c_" prefix`)
        }
        
        if (!/^c_[a-zA-Z]\w*$/.test(attributeName)) {
            errors.push(`Attribute "${attributeName}" contains invalid characters`)
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        attributes: Object.keys(mapping)
    }
}

export default {
    DEFAULT_ATTRIBUTE_MAPPING,
    PAYMENT_TRANSACTION_ATTRIBUTE_MAPPING,
    FRAUD_CHECK_ORDER_ATTRIBUTE_MAPPING,
    AUTH_ORDER_ATTRIBUTE_MAPPING,
    mapJPMCResponseToAttributes,
    mapPaymentTransactionAttributes,
    mapAuthResponseToOrderAttributes,
    mapFraudResponseToOrderAttributes,
    createAttributeMapper,
    validateAttributeMapping
}
