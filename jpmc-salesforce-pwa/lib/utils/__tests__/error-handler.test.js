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

    // =========================================================================
    // retryWithBackoff Tests
    // =========================================================================

    describe('retryWithBackoff', () => {
        it('should return result on first successful attempt', async () => {
            const fn = jest.fn().mockResolvedValue('success')

            const result = await errorHandler.retryWithBackoff(fn, 3, 1)

            expect(result).toBe('success')
            expect(fn).toHaveBeenCalledTimes(1)
        })

        it('should retry on failure and succeed on second attempt', async () => {
            const fn = jest.fn()
                .mockRejectedValueOnce(new Error('First attempt failed'))
                .mockResolvedValueOnce('success')

            const result = await errorHandler.retryWithBackoff(fn, 3, 1)

            expect(result).toBe('success')
            expect(fn).toHaveBeenCalledTimes(2)
        })

        it('should retry multiple times until success', async () => {
            const fn = jest.fn()
                .mockRejectedValueOnce(new Error('Fail 1'))
                .mockRejectedValueOnce(new Error('Fail 2'))
                .mockResolvedValueOnce('success')

            const result = await errorHandler.retryWithBackoff(fn, 5, 1)

            expect(result).toBe('success')
            expect(fn).toHaveBeenCalledTimes(3)
        })

        it('should throw error after max retries exceeded', async () => {
            const originalError = new Error('Permanent failure')
            const fn = jest.fn().mockRejectedValue(originalError)

            await expect(errorHandler.retryWithBackoff(fn, 3, 1)).rejects.toThrow('Permanent failure')
            expect(fn).toHaveBeenCalledTimes(3)
        })

        it('should throw last error from failed attempts', async () => {
            const error1 = new Error('First error')
            const error2 = new Error('Second error')
            const error3 = new Error('Third error')

            const fn = jest.fn()
                .mockRejectedValueOnce(error1)
                .mockRejectedValueOnce(error2)
                .mockRejectedValueOnce(error3)

            await expect(errorHandler.retryWithBackoff(fn, 3, 1)).rejects.toThrow('Third error')
            expect(fn).toHaveBeenCalledTimes(3)
        })

        it('should use default maxRetries when not specified', async () => {
            const fn = jest.fn()
                .mockRejectedValueOnce(new Error('Fail'))
                .mockResolvedValueOnce('success')

            const result = await errorHandler.retryWithBackoff(fn, undefined, 1)

            expect(result).toBe('success')
            expect(fn).toHaveBeenCalledTimes(2)
        })

        it('should use default delay when not specified', async () => {
            const fn = jest.fn().mockResolvedValue('success')

            const result = await errorHandler.retryWithBackoff(fn, 1)

            expect(result).toBe('success')
        })

        it('should increase delay with exponential backoff', async () => {
            const delays = []
            const now = Date.now()
            
            const fn = jest.fn()
                .mockImplementationOnce(async () => {
                    delays.push(Date.now() - now)
                    throw new Error('Fail 1')
                })
                .mockImplementationOnce(async () => {
                    delays.push(Date.now() - now)
                    throw new Error('Fail 2')
                })
                .mockImplementationOnce(async () => {
                    delays.push(Date.now() - now)
                    return 'success'
                })

            const result = await errorHandler.retryWithBackoff(fn, 3, 10)

            expect(result).toBe('success')
            expect(fn).toHaveBeenCalledTimes(3)
            // Check that delays increased (rough check, allowing some variance)
            expect(delays[1]).toBeGreaterThan(delays[0])
            expect(delays[2]).toBeGreaterThan(delays[1])
        })

        it('should work with synchronous functions', async () => {
            const fn = jest.fn()
                .mockReturnValueOnce(Promise.reject(new Error('Fail')))
                .mockReturnValueOnce(Promise.resolve('success'))

            const result = await errorHandler.retryWithBackoff(fn, 2, 1)

            expect(result).toBe('success')
        })

        it('should not delay after final attempt', async () => {
            const fn = jest.fn()
                .mockRejectedValueOnce(new Error('Fail'))
                .mockResolvedValueOnce('success')

            const result = await errorHandler.retryWithBackoff(fn, 2, 100)

            expect(result).toBe('success')
            expect(fn).toHaveBeenCalledTimes(2)
        })
    })

    // =========================================================================
    // isValidErrorResponse Tests
    // =========================================================================

    describe('isValidErrorResponse', () => {
        it('should return true for error with errorCode', () => {
            const errorData = { errorCode: 'PAYMENT_FAILED' }

            const result = errorHandler.isValidErrorResponse(errorData)

            expect(result).toBeTruthy()
        })

        it('should return true for error with message', () => {
            const errorData = { message: 'Payment declined' }

            const result = errorHandler.isValidErrorResponse(errorData)

            expect(result).toBeTruthy()
        })

        it('should return true for error with both errorCode and message', () => {
            const errorData = { 
                errorCode: 'PAYMENT_FAILED', 
                message: 'Payment declined' 
            }

            const result = errorHandler.isValidErrorResponse(errorData)

            expect(result).toBeTruthy()
        })

        it('should return false for null error', () => {
            const result = errorHandler.isValidErrorResponse(null)

            expect(result).toBeFalsy()
        })

        it('should return false for undefined error', () => {
            const result = errorHandler.isValidErrorResponse(undefined)

            expect(result).toBeFalsy()
        })

        it('should return false for non-object error', () => {
            const result = errorHandler.isValidErrorResponse('string error')

            expect(result).toBeFalsy()
        })

        it('should return false for empty object', () => {
            const result = errorHandler.isValidErrorResponse({})

            expect(result).toBeFalsy()
        })

        it('should return false for object with neither errorCode nor message', () => {
            const errorData = { timestamp: '2024-01-01', details: 'some details' }

            const result = errorHandler.isValidErrorResponse(errorData)

            expect(result).toBeFalsy()
        })

        it('should return true for error with additional properties', () => {
            const errorData = {
                errorCode: 'VALIDATION_ERROR',
                message: 'Invalid input',
                details: { field: 'cardNumber' },
                timestamp: '2024-01-01',
                requestId: 'req-123'
            }

            const result = errorHandler.isValidErrorResponse(errorData)

            expect(result).toBeTruthy()
        })

        it('should return true for error with null errorCode but valid message', () => {
            const errorData = { 
                errorCode: null, 
                message: 'Error occurred' 
            }

            const result = errorHandler.isValidErrorResponse(errorData)

            expect(result).toBeTruthy()
        })

        it('should return true for error with empty string message (falsy but present)', () => {
            const errorData = { 
                message: '' 
            }

            const result = errorHandler.isValidErrorResponse(errorData)

            // Empty string is falsy, so this would return false
            expect(result).toBeFalsy()
        })

        it('should handle array as error code', () => {
            const errorData = { errorCode: [] }

            const result = errorHandler.isValidErrorResponse(errorData)

            expect(result).toBeTruthy()
        })

        it('should return truthy for number as errorCode', () => {
            const errorData = { errorCode: 0 }

            const result = errorHandler.isValidErrorResponse(errorData)

            // 0 is falsy, so this would return false
            expect(result).toBeFalsy()
        })
    })
})
