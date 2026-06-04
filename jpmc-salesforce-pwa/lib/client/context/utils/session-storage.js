/**
 * Session Storage Utilities for JPMC Checkout
 * 
 * Handles persistence of payment tokens, fraud data, and errors
 * across React re-renders and page navigation within a session.
 * 
 * All functions are SSR-safe (check for window before accessing sessionStorage).
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/client/context/utils/session-storage
 */

// =============================================================================
// Constants
// =============================================================================

// Storage Keys
const JPMC_TOKEN_STORAGE_KEY = 'jpmc_verification_token'
const JPMC_BASKET_ID_STORAGE_KEY = 'jpmc_basket_id'
const JPMC_FRAUD_RULE_ACTION_KEY = 'jpmc_fraud_rule_action'
const JPMC_FRAUD_CART_KEY = 'jpmc_fraud_cart'
const JPMC_FRAUD_SHIP_TO_KEY = 'jpmc_fraud_ship_to'
const JPMC_PAYMENT_ERROR_KEY = 'jpmc_payment_error'
const JPMC_CARD_TYPE_NAME_KEY = 'jpmc_card_type_name'
const JPMC_CARD_TYPE_KEY = 'jpmc_card_type'

/**
 * Error expiration time (5 minutes)
 * Prevents stale errors from showing on future visits
 */
const ERROR_EXPIRATION_MS = 5 * 60 * 1000

// =============================================================================
// SSR-Safe Helpers
// =============================================================================

/**
 * Check if we're in a browser environment
 * @returns {boolean}
 */
const isBrowser = () => typeof globalThis.window !== 'undefined'

/**
 * Safely get item from sessionStorage
 * @param {string} key - Storage key
 * @returns {string|null}
 */
const safeGetItem = (key) => {
    if (!isBrowser()) return null
    try {
        return sessionStorage.getItem(key)
    } catch (_e) {
        return null
    }
}

/**
 * Safely set item in sessionStorage
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 * @returns {boolean} Success
 */
const safeSetItem = (key, value) => {
    if (!isBrowser()) return false
    try {
        sessionStorage.setItem(key, value)
        return true
    } catch (_e) {
        return false
    }
}

/**
 * Safely remove item from sessionStorage
 * @param {string} key - Storage key
 * @returns {boolean} Success
 */
const safeRemoveItem = (key) => {
    if (!isBrowser()) return false
    try {
        sessionStorage.removeItem(key)
        return true
    } catch (_e) {
        return false
    }
}

// =============================================================================
// Token Storage (Verification Token)
// =============================================================================

/**
 * Save verification token to sessionStorage
 * Persists across navigation within session
 * 
 * @param {string} token - JPMC verification token
 * @param {string} basketId - Associated basket ID
 */
export const saveTokenToSession = (token, basketId) => {
    if (token && safeSetItem(JPMC_TOKEN_STORAGE_KEY, token)) {
        if (basketId) {
            safeSetItem(JPMC_BASKET_ID_STORAGE_KEY, basketId)
        }
    }
}

/**
 * Get verification token from sessionStorage
 * Only returns token if it matches the current basket
 * 
 * @param {string} basketId - Current basket ID
 * @returns {string|null} Token or null
 */
export const getTokenFromSession = (basketId) => {
    const storedBasketId = safeGetItem(JPMC_BASKET_ID_STORAGE_KEY)
    
    // Only return token if it's for the same basket
    if (basketId && storedBasketId && storedBasketId !== basketId) {
        clearTokenFromSession()
        return null
    }
    
    const token = safeGetItem(JPMC_TOKEN_STORAGE_KEY)
    // Return token if found (may be null if not stored)
    return token
}

/**
 * Clear verification token from sessionStorage
 */
export const clearTokenFromSession = () => {
    safeRemoveItem(JPMC_TOKEN_STORAGE_KEY)
    safeRemoveItem(JPMC_BASKET_ID_STORAGE_KEY)
}

// =============================================================================
// Fraud Rule Action Storage
// =============================================================================

/**
 * Save fraud rule action from verify stage
 * Used at authorize stage to include prior fraud decision
 * 
 * @param {string} action - Fraud rule action (e.g., 'A', 'R', 'D')
 */
export const saveFraudRuleAction = (action) => {
    if (action) {
        safeSetItem(JPMC_FRAUD_RULE_ACTION_KEY, action)
    }
}

/**
 * Get saved fraud rule action
 * @returns {string|null}
 */
export const getFraudRuleAction = () => {
    return safeGetItem(JPMC_FRAUD_RULE_ACTION_KEY)
}

/**
 * Clear fraud rule action
 */
export const clearFraudRuleAction = () => {
    safeRemoveItem(JPMC_FRAUD_RULE_ACTION_KEY)
}

// =============================================================================
// Fraud Cart Storage
// =============================================================================

/**
 * Save fraud shopping cart string
 * Persisted because basket may be slim after addPaymentInstrumentToBasket
 * 
 * @param {string} cart - Formatted cart string (T=...&I=...&|)
 */
export const saveFraudCart = (cart) => {
    if (cart) {
        safeSetItem(JPMC_FRAUD_CART_KEY, cart)
    }
}

/**
 * Get saved fraud shopping cart
 * @returns {string|null}
 */
export const getFraudCart = () => {
    return safeGetItem(JPMC_FRAUD_CART_KEY)
}

/**
 * Clear fraud cart
 */
export const clearFraudCart = () => {
    safeRemoveItem(JPMC_FRAUD_CART_KEY)
}

// =============================================================================
// Fraud Ship To Storage
// =============================================================================

/**
 * Save fraud shipTo object
 * @param {object} shipTo - Ship to address object
 */
export const saveFraudShipTo = (shipTo) => {
    if (shipTo) {
        safeSetItem(JPMC_FRAUD_SHIP_TO_KEY, JSON.stringify(shipTo))
    }
}

/**
 * Get saved fraud shipTo
 * @returns {object|null}
 */
export const getFraudShipTo = () => {
    const val = safeGetItem(JPMC_FRAUD_SHIP_TO_KEY)
    if (val) {
        try {
            return JSON.parse(val)
        } catch (_e) {
            return null
        }
    }
    return null
}

/**
 * Clear fraud shipTo
 */
export const clearFraudShipTo = () => {
    safeRemoveItem(JPMC_FRAUD_SHIP_TO_KEY)
}

// =============================================================================
// Payment Error Storage
// =============================================================================

/**
 * Save payment error to sessionStorage
 * Used to display error details on the order-failed page
 * 
 * @param {object} error - Error object to save
 * @param {string} error.message - User-friendly error message
 * @param {string} [error.orderNo] - Order number if error occurred after order creation
 * @param {string} [error.step] - Step where error occurred (e.g., 'authorization')
 * @param {string} [error.code] - Error code from JPMC
 */
export const savePaymentError = (error) => {
    if (!error) return false
    
    const errorWithTimestamp = {
        ...error,
        timestamp: Date.now()
    }
    
    return safeSetItem(JPMC_PAYMENT_ERROR_KEY, JSON.stringify(errorWithTimestamp))
}

/**
 * Get payment error from sessionStorage
 * Returns null if error has expired or doesn't exist
 * 
 * @returns {object|null} Error object or null
 */
export const getPaymentError = () => {
    const val = safeGetItem(JPMC_PAYMENT_ERROR_KEY)
    if (!val) return null
    
    try {
        const error = JSON.parse(val)
        
        // Check if error has expired
        if (error.timestamp && (Date.now() - error.timestamp > ERROR_EXPIRATION_MS)) {
            clearPaymentError()
            return null
        }
        
        return error
    } catch (_e) {
        return null
    }
}

/**
 * Clear payment error from sessionStorage
 */
export const clearPaymentError = () => {
    safeRemoveItem(JPMC_PAYMENT_ERROR_KEY)
}

/**
 * Check if there's a payment error in sessionStorage
 * @returns {boolean}
 */
export const hasPaymentError = () => {
    return !!getPaymentError()
}

// =============================================================================
// Clear All Session Data
// =============================================================================

/**
 * Clear all JPMC session data
 */
export const saveCardTypeName = (cardTypeName) => {
    if (cardTypeName) {
        safeSetItem(JPMC_CARD_TYPE_NAME_KEY, cardTypeName)
    }
}

export const getCardTypeName = () => {
    return safeGetItem(JPMC_CARD_TYPE_NAME_KEY)
}

export const clearCardTypeName = () => {
    safeRemoveItem(JPMC_CARD_TYPE_NAME_KEY)
}

// Card Type (JPMC short code: VI, MC, AX)
export const saveCardType = (cardType) => {
    if (cardType) {
        safeSetItem(JPMC_CARD_TYPE_KEY, cardType)
    }
}

export const getCardType = () => {
    return safeGetItem(JPMC_CARD_TYPE_KEY)
}

export const clearCardType = () => {
    safeRemoveItem(JPMC_CARD_TYPE_KEY)
}

export const clearAllSessionData = () => {
    clearTokenFromSession()
    clearFraudRuleAction()
    clearFraudCart()
    clearFraudShipTo()
    clearPaymentError()
    clearCardTypeName()
    clearCardType()
}

export default {
    saveTokenToSession,
    getTokenFromSession,
    clearTokenFromSession,
    saveFraudRuleAction,
    getFraudRuleAction,
    clearFraudRuleAction,
    saveFraudCart,
    getFraudCart,
    clearFraudCart,
    saveFraudShipTo,
    getFraudShipTo,
    clearFraudShipTo,
    savePaymentError,
    getPaymentError,
    clearPaymentError,
    hasPaymentError,
    saveCardTypeName,
    getCardTypeName,
    clearCardTypeName,
    saveCardType,
    getCardType,
    clearCardType,
    clearAllSessionData,
}
