/**
 * Tests for Drop-in Payload Normalizer
 * 
 * Covers 4 payload variants from JPMC Drop-in SDK:
 * 1. Flat with both fields
 * 2. Only paymentGatewayTransactionId
 * 3. Wrapped in payResponse string
 * 4. 3DS status-only (deferred)
 */

import {
    normalizeDropInPayload,
    isPaymentSuccessful,
    isThreeDSDeferred
} from '../drop-in-payload-normalizer'

describe('drop-in-payload-normalizer', () => {
    describe('normalizeDropInPayload', () => {
        // Variant 1: Flat with both transactionId and paymentGatewayTransactionId
        test('returns payload as-is when flat with transactionId', () => {
            const payload = {
                transactionId: 'txn-123',
                status: 'STATUS_SUCCESS',
                maskedPan: '****1234',
                cardTypeName: 'VISA'
            }
            const result = normalizeDropInPayload(payload)
            expect(result).toEqual(payload)
        })

        test('returns payload as-is when flat with paymentGatewayTransactionId', () => {
            const payload = {
                paymentGatewayTransactionId: 'txn-456',
                status: 'STATUS_SUCCESS',
                maskedPan: '****5678'
            }
            const result = normalizeDropInPayload(payload)
            expect(result).toEqual(payload)
        })

        test('returns payload as-is when flat with both transaction IDs', () => {
            const payload = {
                transactionId: 'txn-outer',
                paymentGatewayTransactionId: 'txn-inner',
                status: 'STATUS_SUCCESS'
            }
            const result = normalizeDropInPayload(payload)
            expect(result).toEqual(payload)
        })

        // Variant 3: Wrapped in payResponse string
        test('unwraps payResponse when outer has no transactionId', () => {
            const payload = {
                payResponse: JSON.stringify({
                    transactionId: 'txn-wrapped',
                    status: 'STATUS_SUCCESS',
                    maskedPan: '****9999'
                })
            }
            const result = normalizeDropInPayload(payload)
            expect(result.transactionId).toBe('txn-wrapped')
            expect(result.status).toBe('STATUS_SUCCESS')
        })

        test('does not unwrap payResponse if outer has transactionId', () => {
            const payload = {
                transactionId: 'txn-outer',
                payResponse: JSON.stringify({
                    transactionId: 'txn-wrapped',
                    status: 'STATUS_SUCCESS'
                })
            }
            const result = normalizeDropInPayload(payload)
            expect(result.transactionId).toBe('txn-outer')
        })

        test('does not unwrap payResponse if outer has paymentGatewayTransactionId', () => {
            const payload = {
                paymentGatewayTransactionId: 'txn-outer',
                payResponse: JSON.stringify({
                    transactionId: 'txn-wrapped',
                    status: 'STATUS_SUCCESS'
                })
            }
            const result = normalizeDropInPayload(payload)
            expect(result.paymentGatewayTransactionId).toBe('txn-outer')
        })

        // Variant 4: 3DS status-only (deferred)
        test('returns status-only payload for 3DS deferred', () => {
            const payload = {
                status: 'STATUS_SUCCESS'
            }
            const result = normalizeDropInPayload(payload)
            expect(result.status).toBe('STATUS_SUCCESS')
            expect(result.transactionId).toBeUndefined()
        })

        test('handles invalid payResponse JSON gracefully', () => {
            const payload = {
                payResponse: 'invalid json {]',
                status: 'STATUS_SUCCESS'
            }
            const result = normalizeDropInPayload(payload)
            // Should return outer payload when payResponse fails to parse
            expect(result.status).toBe('STATUS_SUCCESS')
        })

        test('handles null payResponse gracefully', () => {
            const payload = {
                payResponse: null,
                status: 'STATUS_SUCCESS'
            }
            const result = normalizeDropInPayload(payload)
            expect(result.status).toBe('STATUS_SUCCESS')
        })

        test('returns empty object for null payload', () => {
            const result = normalizeDropInPayload(null)
            expect(result).toEqual({})
        })

        test('returns empty object for undefined payload', () => {
            const result = normalizeDropInPayload(undefined)
            expect(result).toEqual({})
        })

        test('returns empty object for non-object payload', () => {
            const result = normalizeDropInPayload('not-an-object')
            expect(result).toEqual({})
        })

        test('returns empty object for number payload', () => {
            const result = normalizeDropInPayload(123)
            expect(result).toEqual({})
        })
    })

    describe('isPaymentSuccessful', () => {
        test('returns true when status is STATUS_SUCCESS', () => {
            const payload = { status: 'STATUS_SUCCESS', transactionId: 'txn-123' }
            expect(isPaymentSuccessful(payload)).toBe(true)
        })

        test('returns true when status matches expected status', () => {
            const payload = { status: 'CUSTOM_STATUS' }
            expect(isPaymentSuccessful(payload, 'CUSTOM_STATUS')).toBe(true)
        })

        test('returns false when status does not match', () => {
            const payload = { status: 'STATUS_FAILED' }
            expect(isPaymentSuccessful(payload)).toBe(false)
        })

        test('returns false when status is missing', () => {
            const payload = { transactionId: 'txn-123' }
            expect(isPaymentSuccessful(payload)).toBe(false)
        })

        test('returns false when payload is null', () => {
            const result = isPaymentSuccessful(null)
            expect(result).toBeFalsy()
        })

        test('returns false when payload is undefined', () => {
            const result = isPaymentSuccessful(undefined)
            expect(result).toBeFalsy()
        })

        test('returns false for empty object', () => {
            expect(isPaymentSuccessful({})).toBe(false)
        })
    })

    describe('isThreeDSDeferred', () => {
        test('returns true for 3DS deferred (status but no transactionId)', () => {
            const payload = { status: 'STATUS_SUCCESS' }
            expect(isThreeDSDeferred(payload)).toBe(true)
        })

        test('returns false when transactionId is present', () => {
            const payload = {
                status: 'STATUS_SUCCESS',
                transactionId: 'txn-123'
            }
            expect(isThreeDSDeferred(payload)).toBe(false)
        })

        test('returns false when paymentGatewayTransactionId is present', () => {
            const payload = {
                status: 'STATUS_SUCCESS',
                paymentGatewayTransactionId: 'txn-456'
            }
            expect(isThreeDSDeferred(payload)).toBe(false)
        })

        test('returns false when status is missing', () => {
            const payload = { transactionId: 'txn-123' }
            const result = isThreeDSDeferred(payload)
            expect(result).toBeFalsy()
        })

        test('returns false when payload is null', () => {
            const result = isThreeDSDeferred(null)
            expect(result).toBeFalsy()
        })

        test('returns false for empty object', () => {
            const result = isThreeDSDeferred({})
            expect(result).toBeFalsy()
        })

        test('returns false when status is falsy', () => {
            const payload = { status: '' }
            const result = isThreeDSDeferred(payload)
            expect(result).toBeFalsy()
        })
    })
})
