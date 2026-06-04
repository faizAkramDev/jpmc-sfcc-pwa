/**
 * Response Normalizer
 * 
 * Utilities for normalizing JPMC API responses into a consistent format.
 * 
 * @module services/api/response-normalizer
 */

import { RESPONSE_STATUS, PAYMENT_STATES } from '../../utils/constants.mjs'
import { GENERIC_API_ERROR_MESSAGE } from '../../utils/constants/error-constants'

// =============================================================================
// Response Normalization
// =============================================================================

/**
 * Normalize JPMC payment response into standardized format for UI
 * 
 * @param {object} response - JPMC API response
 * @returns {object} Normalized response
 */
export const normalizePaymentResponse = (response) => {
    // For 3DS: PENDING state with PERFORM_AUTHENTICATION is a valid "in-progress" response
    const is3DSRequired = response.responseCode === 'PERFORM_AUTHENTICATION' &&
        !!response.paymentAuthenticationResult?.authenticationOrchestrationUrl
    
    const isSuccess = response.responseStatus === RESPONSE_STATUS.SUCCESS &&
        (response.transactionState === PAYMENT_STATES.AUTHORIZED || 
         response.transactionState === PAYMENT_STATES.CLOSED ||
         is3DSRequired) // 3DS pending is also a valid success state

    // Extract card data for cardTypeName
    const cardData = response.paymentMethodType?.card || {}

    return {
        success: isSuccess,
        // NOTE: transactionId intentionally omitted - stored server-side only
        
        // 3DS fields - needed for requires3DSAuthentication() check
        responseCode: response.responseCode,
        paymentAuthenticationResult: response.paymentAuthenticationResult,
        
        // Payment details
        amount: response.amount,
        captureMethod: response.captureMethod,
        
        // Card type for 3DS skip logic
        cardTypeName: cardData.cardTypeName,
        
        // Timestamp for order patching
        timestamp: response.transactionDate || response._timestamp,
        
        // For UI messaging
        canRetry: !isSuccess,
        userMessage: isSuccess ? (is3DSRequired ? 'Authentication required' : 'Payment authorized successfully') : GENERIC_API_ERROR_MESSAGE
    }
}

/**
 * Normalize verification response
 * 
 * @param {object} response - JPMC verification API response
 * @returns {object} Normalized verification response
 */
export const normalizeVerificationResponse = (response) => {
    // Extract SAFETECH token from paymentTokens array
    const paymentTokens = response.paymentMethodType?.card?.paymentTokens || []
    const safetechToken = paymentTokens.find(t => t.tokenProvider === 'SAFETECH' && t.responseStatus === 'SUCCESS')
    const networkToken = paymentTokens.find(t => t.tokenProvider === 'NETWORK' && t.responseStatus === 'SUCCESS')
    
    // Use SAFETECH token as the primary token for stored payments
    const token = safetechToken?.tokenNumber || networkToken?.tokenNumber

    const isSuccess = response.responseStatus === RESPONSE_STATUS.SUCCESS

    return {
        success: isSuccess,
        token
    }
}

/**
 * Build error response object
 * 
 * @param {string} errorCode - Error code (for logging only)
 * @param {string} message - Error message (for logging only)
 * @param {object} additionalData - Additional data to include
 * @returns {object} Error response
 */
export const buildErrorResponse = (errorCode, message, additionalData = {}) => {
    return {
        success: false,
        responseStatus: RESPONSE_STATUS.ERROR,
        transactionState: PAYMENT_STATES.ERROR,
        userMessage: GENERIC_API_ERROR_MESSAGE,
        ...additionalData
    }
}

/**
 * Check if response indicates a retryable error
 * 
 * @param {object} response - API response
 * @returns {boolean} True if error is retryable
 */
export const isRetryableError = (response) => {
    // Don't retry successful responses
    if (response.success) return false
    
    // Don't retry validation errors
    if (response.validationErrors?.length > 0) return false
    
    // Don't retry denied responses (card declined, etc.)
    if (response.responseStatus === RESPONSE_STATUS.DENIED) return false
    
    // Don't retry closed/final transactions
    if (response.transactionState === PAYMENT_STATES.CLOSED) return false
    if (response.transactionState === PAYMENT_STATES.VOIDED) return false
    
    // Retry other errors (network, timeout, server errors)
    return true
}

export default {
    normalizePaymentResponse,
    normalizeVerificationResponse,
    buildErrorResponse,
    isRetryableError
}
