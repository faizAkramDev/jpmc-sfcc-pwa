/**
 * Drop-in UI Payload Normalizer
 *
 * The JPMC Drop-in SDK returns payment payloads in multiple formats depending on
 * the payment method, SDK version, and flow (standard vs 3DS).
 *
 * This utility normalizes all variants to a standard structure so downstream
 * code (attribute mapping, order confirmation) works consistently.
 *
 * Payload Variants Handled:
 * 1. Flat with both fields:
 *    { transactionId: 'X', paymentGatewayTransactionId: 'X', status: 'STATUS_SUCCESS', ... }
 *
 * 2. Only paymentGatewayTransactionId (missing transactionId):
 *    { paymentGatewayTransactionId: 'X', status: 'STATUS_SUCCESS', ... }
 *    → Maps to transactionId for attribute mapping
 *
 * 3. Wrapped in payResponse string with card details at outer (3DS flows):
 *    { payResponse: '{"status":"STATUS_SUCCESS"}', maskedPan: '4111', cardTypeName: 'VISA' }
 *    → Unwrapped and MERGED with outer to preserve card details
 *
 * 4. 3DS status-only (transactionId arrives later via notifications):
 *    { status: 'STATUS_SUCCESS' }
 *    → Preserved as-is (no transactionId available yet)
 *
 * @module @jpmorgan/jpmorgan-salesforce-pwa/utils/drop-in-payload-normalizer
 */

/**
 * Unwrap and parse a payResponse string if present
 *
 * The Drop-in SDK sometimes wraps the actual response in a "payResponse"
 * field as a JSON string. This function unwraps it.
 *
 * @param {string} payResponseString - JSON string to parse
 * @returns {Object | null} Parsed object or null if parsing fails
 * @private
 */
function unwrapPayResponse(payResponseString) {
    if (!payResponseString || typeof payResponseString !== 'string') {
        return null
    }

    try {
        return JSON.parse(payResponseString)
    } catch (err) {
        // If parsing fails, return null - the outer payload will be used
        return null
    }
}

/**
 * Normalize Drop-in SDK payload to standard format
 *
 * Unwraps payResponse if present and merges with outer fields.
 * This ensures card details at outer level are preserved during unwrapping.
 *
 * 1. If payResponse exists and outer has no transactionId/paymentGatewayTransactionId:
 *    → Unwrap payResponse and MERGE with outer fields (unwrapped takes precedence)
 * 2. Otherwise: Return outer payload as-is
 *
 * This handles 3DS flows where card details are at outer level and payResponse
 * contains only the status, preventing card details from being lost.
 *
 * @param {Object} rawPayload - Raw payload from Drop-in SDK
 * @returns {Object} Normalized payload with consistent structure
 *
 * @example
 * // Variant 3: Wrapped in payResponse (3DS) with card details at outer
 * normalizeDropInPayload({
 *   payResponse: '{"status":"STATUS_SUCCESS"}',
 *   maskedPan: '4111',
 *   cardTypeName: 'VISA'
 * })
 * // → {status: 'STATUS_SUCCESS', maskedPan: '4111', cardTypeName: 'VISA'} (merged, not replaced)
 *
 * @example
 * // Variant 1: Flat with transactionId
 * normalizeDropInPayload({ transactionId: '123', status: 'STATUS_SUCCESS', maskedPan: '4111' })
 * // → {transactionId: '123', status: 'STATUS_SUCCESS', maskedPan: '4111'} (returned as-is)
 */
export function normalizeDropInPayload(rawPayload) {
    if (!rawPayload || typeof rawPayload !== 'object') {
        return {}
    }



    // Try to unwrap payResponse if present
    if (rawPayload.payResponse && typeof rawPayload.payResponse === 'string') {
      // Only unwrap if outer payload has NO transaction IDs
        // This handles 3DS flows where payResponse is the actual response
        if (!rawPayload.transactionId && !rawPayload.paymentGatewayTransactionId) {
      
            const unwrapped = unwrapPayResponse(rawPayload.payResponse)
            if (unwrapped && typeof unwrapped === 'object') {
                const merged = { ...rawPayload, ...unwrapped }
                
                return merged
            }
        }
    }

    // No payResponse to unwrap, or outer has transaction IDs
    // Return outer payload as-is
    return rawPayload
}

/**
 * Validate that a normalized payload has the required status field
 *
 * The Drop-in SDK sends status field to indicate payment success/failure.
 * This helper validates that the status is present and expected.
 *
 * @param {Object} normalizedPayload - Payload to validate
 * @param {string} [expectedStatus='STATUS_SUCCESS'] - Expected status value
 * @returns {boolean} True if status is present and matches expected value
 *
 * @example
 * if (isPaymentSuccessful(payload, 'STATUS_SUCCESS')) {
 *   // Proceed with order creation
 * }
 */
export function isPaymentSuccessful(normalizedPayload, expectedStatus = 'STATUS_SUCCESS') {
    return normalizedPayload && normalizedPayload.status === expectedStatus
}

/**
 * Check if a payload is a 3DS deferred auth (status-only, no transactionId)
 *
 * 3DS flows may return only the status initially, with the transactionId
 * arriving later via notifications. This helper identifies such flows.
 *
 * @param {Object} normalizedPayload - Payload to check
 * @returns {boolean} True if payload is 3DS deferred auth (has status but no transactionId)
 *
 * @example
 * if (isThreeDSDeferred(payload)) {
 *   // Wait for notification polling to get transactionId
 * }
 */
export function isThreeDSDeferred(normalizedPayload) {
    return (
        normalizedPayload &&
        normalizedPayload.status &&
        !normalizedPayload.transactionId &&
        !normalizedPayload.paymentGatewayTransactionId
    )
}
