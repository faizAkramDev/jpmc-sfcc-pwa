/**
 * Error Constants
 * 
 * Simplified error handling for MVP - one generic message for all JPMC API errors.
 * 
 * @module utils/constants/error-constants
 */

// =============================================================================
// Generic API Error Message
// =============================================================================

/**
 * Generic error message for all JPMC API errors
 */
export const GENERIC_API_ERROR_MESSAGE = "Payment couldn't be processed. Please try again later."

// =============================================================================
// Error Codes (for internal use only)
// =============================================================================

export const ERROR_CODES = {
    // Encryption errors (client-side - keep specific messages)
    ENCRYPTION_FAILED: 'ENCRYPTION_FAILED',
    SDK_NOT_LOADED: 'SDK_NOT_LOADED'
}

// =============================================================================
// Error Messages (only for client-side encryption errors)
// =============================================================================

export const ERROR_MESSAGES = {
    [ERROR_CODES.ENCRYPTION_FAILED]: 'Failed to encrypt payment data. Please try again.',
    [ERROR_CODES.SDK_NOT_LOADED]: 'Payment system not ready. Please refresh and try again.'
}

// =============================================================================
// HTTP Status Codes
// =============================================================================

export const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    PAYMENT_REQUIRED: 402,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    UNPROCESSABLE_ENTITY: 422,
    INTERNAL_SERVER_ERROR: 500,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504
}

export default {
    ERROR_CODES,
    ERROR_MESSAGES,
    HTTP_STATUS,
    GENERIC_API_ERROR_MESSAGE
}
