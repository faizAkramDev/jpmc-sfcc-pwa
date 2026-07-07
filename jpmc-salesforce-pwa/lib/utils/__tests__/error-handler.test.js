/**
 * Unit Tests for Error Handler Utilities
 *
 * @jest-environment node
 */

const errorHandler = require('../error-handler')

// =============================================================================
// Tests
// =============================================================================

describe('Error Handler Utilities', () => {

    // =========================================================================
    // JPMorganPaymentError Tests
    // =========================================================================

    describe('JPMorganPaymentError', () => {
        it('should create error with code and message', () => {
            const error = new errorHandler.JPMorganPaymentError(
                'PAYMENT_DECLINED',
                'Your card was declined'
            )

            expect(error.code).toBe('PAYMENT_DECLINED')
            expect(error.message).toBe('Your card was declined')
            expect(error.name).toBe('JPMorganPaymentError')
        })

        it('should create error with details', () => {
            const error = new errorHandler.JPMorganPaymentError(
                'VALIDATION_ERROR',
                'Invalid card',
                { field: 'cardNumber' }
            )

            expect(error.details).toEqual({ field: 'cardNumber' })
        })

        it('should include timestamp', () => {
            const beforeTime = new Date().toISOString()
            const error = new errorHandler.JPMorganPaymentError('TEST', 'Test')
            const afterTime = new Date().toISOString()

            expect(error.timestamp).toBeDefined()
            expect(error.timestamp >= beforeTime).toBe(true)
            expect(error.timestamp <= afterTime).toBe(true)
        })

        it('should use default message from ERROR_MESSAGES when message not provided', () => {
            const error = new errorHandler.JPMorganPaymentError('ENCRYPTION_FAILED')

            expect(error.message).toContain('encrypt')
        })

        it('should serialize to JSON correctly', () => {
            const error = new errorHandler.JPMorganPaymentError(
                'TEST_ERROR',
                'Test message',
                { extra: 'data' }
            )

            const json = error.toJSON()

            expect(json.name).toBe('JPMorganPaymentError')
            expect(json.code).toBe('TEST_ERROR')
            expect(json.message).toBe('Test message')
            expect(json.details).toEqual({ extra: 'data' })
            expect(json.timestamp).toBeDefined()
        })

        it('should be instanceof Error', () => {
            const error = new errorHandler.JPMorganPaymentError('TEST', 'Test')

            expect(error).toBeInstanceOf(Error)
        })
    })

    // =========================================================================
    // parseAPIError Tests (MVP - simplified error handling)
    // =========================================================================

    describe('parseAPIError', () => {
        it('should return same error if already JPMorganPaymentError', () => {
            const original = new errorHandler.JPMorganPaymentError('TEST', 'Test')

            const result = errorHandler.parseAPIError(original)

            expect(result).toBe(original)
        })

        it('should return API_ERROR for any non-JPMorganPaymentError', () => {
            const error = new Error('Network request failed')

            const result = errorHandler.parseAPIError(error)

            expect(result).toBeInstanceOf(errorHandler.JPMorganPaymentError)
            expect(result.code).toBe('API_ERROR')
        })

        it('should use generic error message for all API errors', () => {
            const error = new Error('Some error')

            const result = errorHandler.parseAPIError(error)

            expect(result.message).toBe("Payment couldn't be processed. Please try again later.")
        })

        it('should include original error message in details', () => {
            const error = new Error('Original error message')

            const result = errorHandler.parseAPIError(error)

            expect(result.details.originalError).toBe('Original error message')
        })
    })

    // =========================================================================
    // handleEncryptionError Tests
    // =========================================================================

    describe('handleEncryptionError', () => {
        it('should create ENCRYPTION_FAILED error', () => {
            const original = new Error('PIE SDK failed')

            const result = errorHandler.handleEncryptionError(original)

            expect(result).toBeInstanceOf(errorHandler.JPMorganPaymentError)
            expect(result.code).toBe('ENCRYPTION_FAILED')
        })

        it('should include original error message in details', () => {
            const original = new Error('Specific encryption failure')

            const result = errorHandler.handleEncryptionError(original)

            expect(result.details.originalError).toBe('Specific encryption failure')
        })
    })

    // =========================================================================
    // handleValidationError Tests (MVP - simplified)
    // =========================================================================

    describe('handleValidationError', () => {
        it('should create VALIDATION_ERROR from validation errors object', () => {
            const validationErrors = {
                cardNumber: 'INVALID_CARD_NUMBER',
                cvv: 'INVALID_CVV'
            }

            const result = errorHandler.handleValidationError(validationErrors)

            expect(result).toBeInstanceOf(errorHandler.JPMorganPaymentError)
            expect(result.code).toBe('VALIDATION_ERROR')
        })

        it('should use generic API error message', () => {
            const validationErrors = {
                cardNumber: 'INVALID_CARD_NUMBER'
            }

            const result = errorHandler.handleValidationError(validationErrors)

            expect(result.message).toBe("Payment couldn't be processed. Please try again later.")
        })

        it('should include all validation errors in details', () => {
            const validationErrors = {
                cardNumber: 'INVALID_CARD_NUMBER',
                expiry: 'INVALID_EXPIRY_DATE'
            }

            const result = errorHandler.handleValidationError(validationErrors)

            expect(result.details.validationErrors).toEqual(validationErrors)
        })
    })

    // =========================================================================
    // logError Tests (no-op function - logging disabled for production)
    // =========================================================================

    describe('logError', () => {
        it('should accept error and context parameters without throwing', () => {
            const error = new errorHandler.JPMorganPaymentError('TEST', 'Test')
            expect(() => errorHandler.logError(error, { extra: 'context' })).not.toThrow()
        })

        it('should accept error without context without throwing', () => {
            const error = new Error('Test error')
            expect(() => errorHandler.logError(error)).not.toThrow()
        })
    })

    // =========================================================================
    // getUserFriendlyMessage Tests (MVP - simplified)
    // =========================================================================

    describe('getUserFriendlyMessage', () => {
        it('should return specific message for ENCRYPTION_FAILED', () => {
            const error = new errorHandler.JPMorganPaymentError(
                'ENCRYPTION_FAILED',
                'Failed to encrypt payment data. Please try again.'
            )

            const result = errorHandler.getUserFriendlyMessage(error)

            expect(result).toBe('Failed to encrypt payment data. Please try again.')
        })

        it('should return specific message for SDK_NOT_LOADED', () => {
            const error = new errorHandler.JPMorganPaymentError(
                'SDK_NOT_LOADED',
                'Payment system not ready. Please refresh and try again.'
            )

            const result = errorHandler.getUserFriendlyMessage(error)

            expect(result).toBe('Payment system not ready. Please refresh and try again.')
        })

        it('should return generic message for other error codes', () => {
            const error = new errorHandler.JPMorganPaymentError(
                'OTHER_ERROR',
                'Some specific message'
            )

            const result = errorHandler.getUserFriendlyMessage(error)

            expect(result).toBe("Payment couldn't be processed. Please try again later.")
        })

        it('should return generic message for generic errors', () => {
            const error = new Error('Technical error details')

            const result = errorHandler.getUserFriendlyMessage(error)

            expect(result).toBe("Payment couldn't be processed. Please try again later.")
        })
    })

    // =========================================================================
    // isRetryableError Tests (MVP - never retry)
    // =========================================================================

    describe('isRetryableError', () => {
        it('should return false for all errors (MVP behavior)', () => {
            const error = new errorHandler.JPMorganPaymentError('NETWORK_ERROR', 'Network issue')

            const result = errorHandler.isRetryableError(error)

            expect(result).toBe(false)
        })

        it('should return false for authentication errors', () => {
            const error = new errorHandler.JPMorganPaymentError('AUTHENTICATION_REQUIRED', 'Auth')

            const result = errorHandler.isRetryableError(error)

            expect(result).toBe(false)
        })
    })

    // =========================================================================
    // formatErrorResponse Tests (MVP - simplified)
    // =========================================================================

    describe('formatErrorResponse', () => {
        it('should format error for API response with generic message', () => {
            const error = new errorHandler.JPMorganPaymentError(
                'PAYMENT_DECLINED',
                'Card declined',
                { reason: 'insufficient_funds' }
            )

            const result = errorHandler.formatErrorResponse(error)

            expect(result).toEqual({
                success: false,
                errorCode: 'PAYMENT_DECLINED',
                message: "Payment couldn't be processed. Please try again later.",
                canRetry: false
            })
        })

        it('should always have canRetry as false (MVP)', () => {
            const networkError = new errorHandler.JPMorganPaymentError('NETWORK_ERROR', 'Network')

            const result = errorHandler.formatErrorResponse(networkError)

            expect(result.canRetry).toBe(false)
        })

        it('should handle generic errors', () => {
            const error = new Error('Something went wrong')

            const result = errorHandler.formatErrorResponse(error)

            expect(result.success).toBe(false)
            expect(result.errorCode).toBe('UNKNOWN_ERROR')
            expect(result.message).toBe("Payment couldn't be processed. Please try again later.")
        })
    })
})
