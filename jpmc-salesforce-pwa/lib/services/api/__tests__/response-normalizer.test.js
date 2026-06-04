/**
 * Unit Tests for Response Normalizer
 */

import {
    normalizePaymentResponse,
    normalizeVerificationResponse,
    buildErrorResponse,
    isRetryableError
} from '../response-normalizer'

describe('Response Normalizer', () => {
    describe('normalizePaymentResponse', () => {
        it('normalizes successful authorized payment', () => {
            const response = {
                responseStatus: 'SUCCESS',
                transactionState: 'AUTHORIZED',
                transactionId: 'TXN-123',
                requestId: 'REQ-456',
                approvalCode: 'ABC123',
                hostReferenceId: 'HOST-789',
                amount: 10000,
                currency: 'USD',
                captureMethod: 'MANUAL',
                paymentMethodType: {
                    card: {
                        maskedAccountNumber: '************1111',
                        cardType: 'VI',
                        cardTypeName: 'Visa',
                        networkResponse: {
                            networkTransactionId: 'NET-123',
                            addressVerificationResult: 'MATCH',
                            cardVerificationResult: 'MATCH'
                        }
                    }
                }
            }

            const result = normalizePaymentResponse(response)

            expect(result.success).toBe(true)
            expect(result.transactionId).toBeUndefined()  // transactionId not exposed to client
            expect(result.amount).toBe(10000)
            expect(result.captureMethod).toBe('MANUAL')
            expect(result.cardTypeName).toBe('Visa')
            expect(result.canRetry).toBe(false)
        })

        it('normalizes successful closed/captured payment', () => {
            const response = {
                responseStatus: 'SUCCESS',
                transactionState: 'CLOSED',
                transactionId: 'TXN-123',
                captureMethod: 'NOW',
                paymentMethodType: { card: {} }
            }

            const result = normalizePaymentResponse(response)

            expect(result.success).toBe(true)
            expect(result.captureMethod).toBe('NOW')
        })

        it('normalizes failed payment', () => {
            const response = {
                responseStatus: 'DENIED',
                transactionState: 'ERROR',
                transactionId: 'TXN-123',
                paymentMethodType: { card: {} }
            }

            const result = normalizePaymentResponse(response)

            expect(result.success).toBe(false)
            expect(result.canRetry).toBe(true)
            expect(result.userMessage).toBe('Payment couldn\'t be processed. Please try again later.')
        })

        it('handles missing card data', () => {
            const response = {
                responseStatus: 'SUCCESS',
                transactionState: 'AUTHORIZED',
                transactionId: 'TXN-123',
                paymentMethodType: {}
            }

            const result = normalizePaymentResponse(response)

            expect(result.success).toBe(true)
            expect(result.cardTypeName).toBeUndefined()
        })

        it('normalizes 3DS PERFORM_AUTHENTICATION response as success', () => {
            const response = {
                responseStatus: 'SUCCESS',
                transactionState: 'PENDING',
                responseCode: 'PERFORM_AUTHENTICATION',
                transactionId: 'TXN-3DS-123',
                paymentMethodType: { card: {} },
                paymentAuthenticationResult: {
                    authenticationId: 'AUTH-123',
                    authenticationOrchestrationUrl: 'https://jpmc.com/3ds/orchestrate'
                },
                merchant: { merchantId: 'MID-123' }
            }

            const result = normalizePaymentResponse(response)

            expect(result.success).toBe(true)
            expect(result.responseCode).toBe('PERFORM_AUTHENTICATION')
            expect(result.paymentAuthenticationResult.authenticationOrchestrationUrl).toBe('https://jpmc.com/3ds/orchestrate')
            expect(result.userMessage).toBe('Authentication required')
        })
    })

    describe('normalizeVerificationResponse', () => {
        it('normalizes successful verification with SAFETECH token', () => {
            const response = {
                responseStatus: 'SUCCESS',
                transactionId: 'VER-123',
                paymentMethodType: {
                    card: {
                        maskedAccountNumber: '************4242',
                        cardType: 'VI',
                        cardTypeName: 'Visa',
                        paymentTokens: [
                            {
                                tokenProvider: 'SAFETECH',
                                tokenNumber: 'TOKEN-123',
                                responseStatus: 'SUCCESS'
                            }
                        ],
                        networkResponse: {
                            networkTransactionId: 'NET-456',
                            addressVerificationResult: 'MATCH',
                            cardVerificationResult: 'MATCH'
                        }
                    }
                }
            }

            const result = normalizeVerificationResponse(response)

            expect(result.success).toBe(true)
            expect(result.token).toBe('TOKEN-123')
        })

        it('falls back to NETWORK token when SAFETECH not available', () => {
            const response = {
                responseStatus: 'SUCCESS',
                transactionId: 'VER-123',
                paymentMethodType: {
                    card: {
                        paymentTokens: [
                            {
                                tokenProvider: 'NETWORK',
                                tokenNumber: 'NETWORK-TOKEN-456',
                                responseStatus: 'SUCCESS'
                            }
                        ]
                    }
                }
            }

            const result = normalizeVerificationResponse(response)

            expect(result.token).toBe('NETWORK-TOKEN-456')
        })

        it('normalizes failed verification', () => {
            const response = {
                responseStatus: 'ERROR',
                transactionId: 'VER-123',
                paymentMethodType: { card: {} }
            }

            const result = normalizeVerificationResponse(response)

            expect(result.success).toBe(false)
        })

        it('handles missing paymentTokens', () => {
            const response = {
                responseStatus: 'SUCCESS',
                transactionId: 'VER-123',
                paymentMethodType: {
                    card: {}
                }
            }

            const result = normalizeVerificationResponse(response)

            expect(result.token).toBeUndefined()
        })
    })

    describe('buildErrorResponse', () => {
        it('builds error response object', () => {
            const result = buildErrorResponse('ERR_001', 'Test error')

            expect(result.success).toBe(false)
            expect(result.responseStatus).toBe('ERROR')
            expect(result.transactionState).toBe('ERROR')
            expect(result.userMessage).toBe('Payment couldn\'t be processed. Please try again later.')
        })

        it('includes additional data', () => {
            const result = buildErrorResponse('ERR_001', 'Test error', {
                transactionId: 'TXN-123',
                customField: 'custom'
            })

            expect(result.transactionId).toBe('TXN-123')
            expect(result.customField).toBe('custom')
        })
    })

    describe('isRetryableError', () => {
        it('returns false for successful responses', () => {
            expect(isRetryableError({ success: true })).toBe(false)
        })

        it('returns false for validation errors', () => {
            expect(isRetryableError({
                success: false,
                validationErrors: [{ field: 'card', message: 'Invalid' }]
            })).toBe(false)
        })

        it('returns false for DENIED responses', () => {
            expect(isRetryableError({
                success: false,
                responseStatus: 'DENIED'
            })).toBe(false)
        })

        it('returns false for CLOSED transactions', () => {
            expect(isRetryableError({
                success: false,
                transactionState: 'CLOSED'
            })).toBe(false)
        })

        it('returns false for VOIDED transactions', () => {
            expect(isRetryableError({
                success: false,
                transactionState: 'VOIDED'
            })).toBe(false)
        })

        it('returns true for server errors', () => {
            expect(isRetryableError({
                success: false,
                responseStatus: 'ERROR',
                transactionState: 'ERROR'
            })).toBe(true)
        })

        it('returns true for timeout errors', () => {
            expect(isRetryableError({
                success: false,
                errorCode: 'TIMEOUT'
            })).toBe(true)
        })
    })
})
