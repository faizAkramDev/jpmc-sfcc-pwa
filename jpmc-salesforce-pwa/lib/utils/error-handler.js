/**
 * Error Handling Utilities
 * @module error-handler
 */

import { ERROR_CODES, ERROR_MESSAGES, GENERIC_API_ERROR_MESSAGE } from './constants/index'

/**
 * JP Morgan Payment Error Class
 */
export class JPMorganPaymentError extends Error {
    constructor(code, message, details = {}) {
        super(message || ERROR_MESSAGES[code] || 'Unknown payment error')
        this.name = 'JPMorganPaymentError'
        this.code = code
        this.details = details
        this.timestamp = new Date().toISOString()
    }

    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            details: this.details,
            timestamp: this.timestamp
        }
    }
}

/**
 * Parse API error response - simplified for MVP
 * @param {object} error - Error object
 * @returns {JPMorganPaymentError} Formatted error
 */
export const parseAPIError = (error) => {
    if (error instanceof JPMorganPaymentError) {
        return error
    }

    // All API errors get the generic message
    return new JPMorganPaymentError(
        'API_ERROR',
        GENERIC_API_ERROR_MESSAGE,
        { originalError: error.message }
    )
}

/**
 * Handle encryption error
 * @param {Error} error - Encryption error
 * @returns {JPMorganPaymentError} Formatted error
 */
export const handleEncryptionError = (error) => {
    return new JPMorganPaymentError(
        ERROR_CODES.ENCRYPTION_FAILED,
        ERROR_MESSAGES[ERROR_CODES.ENCRYPTION_FAILED],
        { originalError: error.message }
    )
}

/**
 * Handle validation error - simplified for MVP
 * @param {object} validationErrors - Validation errors object
 * @returns {JPMorganPaymentError} Formatted error
 */
export const handleValidationError = (validationErrors) => {
    return new JPMorganPaymentError(
        'VALIDATION_ERROR',
        GENERIC_API_ERROR_MESSAGE,
        { validationErrors }
    )
}

/**
 * Log error for debugging
 * @param {Error} error - Error to log
 * @param {object} context - Additional context
 */
export const logError = (_error, _context = {}) => {
    // Logging disabled for production - function kept for API compatibility
}

/**
 * Create user-friendly error message - simplified for MVP
 * @param {Error} error - Error object
 * @returns {string} User-friendly message
 */
export const getUserFriendlyMessage = (error) => {
    // For encryption errors, use specific messages
    if (error instanceof JPMorganPaymentError) {
        if (error.code === ERROR_CODES.ENCRYPTION_FAILED || 
            error.code === ERROR_CODES.SDK_NOT_LOADED) {
            return error.message
        }
    }

    // All other errors get the generic message
    return GENERIC_API_ERROR_MESSAGE
}

/**
 * Check if an error is retryable - simplified for MVP
 * @param {Error} _error - Error object
 * @returns {boolean} True if error can be retried
 */
export const isRetryableError = (_error) => {
    // For MVP, don't retry any errors
    return false
}

/**
 * Format error for API response - simplified for MVP
 * @param {Error} error - Error object
 * @returns {object} Formatted error response
 */
export const formatErrorResponse = (error) => {
    return {
        success: false,
        errorCode: error instanceof JPMorganPaymentError ? error.code : 'UNKNOWN_ERROR',
        message: GENERIC_API_ERROR_MESSAGE,
        canRetry: false
    }
}

/**
 * Retry handler with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} delay - Initial delay in milliseconds
 * @returns {Promise} Function result
 */
export const retryWithBackoff = async (fn, maxRetries = 3, delay = 1000) => {
    let lastError

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error

            // Wait before retrying (exponential backoff)
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)))
            }
        }
    }

    throw lastError
}

/**
 * Validate error response structure
 * @param {object} errorData - Error data from API
 * @returns {boolean} True if valid error structure
 */
export const isValidErrorResponse = (errorData) => {
    return errorData && 
           typeof errorData === 'object' && 
           (errorData.errorCode || errorData.message)
}
