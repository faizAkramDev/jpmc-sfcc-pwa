/**
 * Error Helpers
 * 
 * Shared error handling utilities for payment API handlers.
 * Consolidates duplicate error handling patterns.
 * 
 * @module services/api/helpers/error-helpers
 */

import { GENERIC_API_ERROR_MESSAGE } from '../../../utils/constants/error-constants'
import logger from '../../../utils/logger'

/**
 * Check if error is a multi-locale authentication error
 * 
 * @param {Error} error - Error to check
 * @returns {boolean} True if auth error
 */
export const isMultiLocaleAuthError = (error) => {
    return error.code === 'MULTI_LOCALE_AUTH_ERROR' || error.statusCode === 401
}

/**
 * Handle payment handler errors with consistent response format
 * 
 * Provides unified error handling for all payment handlers:
 * - Logs error with operation context
 * - Returns 401 for multi-locale auth errors
 * - Returns 500 with generic message for other errors
 * 
 * @param {Object} res - Express response object
 * @param {Error} error - Error that occurred
 * @param {string} operation - Operation name for logging (e.g., 'Authorization', 'Capture')
 * @param {Object} [options={}] - Additional options
 * @param {boolean} [options.canRetry=false] - Whether client can retry the operation
 * @param {string} [options.logPrefix='JPMC Payment'] - Log prefix
 * @returns {Object} Express response
 * 
 * @example
 * } catch (error) {
 *     return handlePaymentError(res, error, 'Authorization', { canRetry: true })
 * }
 */
export const handlePaymentError = (res, error, operation, options = {}) => {
    const { canRetry = false, logPrefix = 'JPMC Payment' } = options
    
    logger.error(`[${logPrefix}] ${operation} error:`, error)
    
    // Return 401 for multi-locale auth errors
    if (isMultiLocaleAuthError(error)) {
        return res.status(401).json({
            success: false,
            errorCode: 'MULTI_LOCALE_AUTH_ERROR',
            message: GENERIC_API_ERROR_MESSAGE
        })
    }
    
    // Return 500 with generic error message
    const errorResponse = {
        success: false,
        message: GENERIC_API_ERROR_MESSAGE
    }
    
    if (canRetry) {
        errorResponse.canRetry = true
    }
    
    return res.status(500).json(errorResponse)
}

export default { isMultiLocaleAuthError, handlePaymentError }
