/**
 * 3D Secure Helpers
 * 
 * Helper functions for building JPMC 3DS authentication payloads.
 * Follows SFRA multi-merchant pattern: resolvedConfig → sitePrefs fallback.
 * 
 * @module services/api/helpers/threeds-helpers
 * @see https://developer.payments.jpmorgan.com/docs/commerce/online-payments/capabilities/online-payments/payment-enhancements/3d-secure
 */

import { THREE_DS } from '../../../utils/constants.mjs'

/**
 * Check if 3DS is enabled for current merchant/site
 * Follows SFRA pattern: resolvedConfig.jpmc3DSEnabled → sitePrefs.jpmc3DSEnabled
 * 
 * @param {Object} resolvedConfig - Per-merchant config from JPMCMerchantConfig
 * @param {Object} sitePrefs - Site preferences (fallback)
 * @returns {boolean} True if 3DS is enabled
 * 
 * @example
 * const config = await getJPMCConfigAsync()
 * if (is3DSEnabled(config.resolvedMerchantConfig, config)) {
 *     // Build 3DS parameters
 * }
 */
export function is3DSEnabled(resolvedConfig, sitePrefs) {
    return Boolean(
        (resolvedConfig && resolvedConfig.jpmc3DSEnabled === true) ||
        (sitePrefs && sitePrefs.jpmc3DSEnabled === true)
    )
}

/**
 * Build 3DS authentication parameters for payment request
 * Creates the paymentAuthenticationRequest object for JPMC /payments API
 * 
 * Follows SFRA pattern:
 * 1. Check if 3DS is enabled (merchant config → site pref)
 * 2. Build parameters using merchant config → site pref fallback for each field
 * 
 * @param {Object} options - Build options
 * @param {Object} options.resolvedConfig - Per-merchant config from JPMCMerchantConfig
 * @param {Object} options.sitePrefs - Site preferences (fallback)
 * @param {string} options.returnUrl - 3DS callback URL with orderNo and orderToken
 * @returns {Object|null} paymentAuthenticationRequest object or null if 3DS disabled
 * 
 * @example
 * const authParams = build3DSAuthenticationParameters({
 *     resolvedConfig: merchantConfig,
 *     sitePrefs: config,
 *     returnUrl: `${baseUrl}/checkout/3ds-callback?orderNo=${orderNo}&orderToken=${token}`
 * })
 * 
 * if (authParams) {
 *     requestBody.paymentMethodType.card.paymentAuthenticationRequest = authParams
 * }
 */
export function build3DSAuthenticationParameters({ resolvedConfig, sitePrefs, returnUrl }) {
    if (!is3DSEnabled(resolvedConfig, sitePrefs)) {
        return null
    }

    const authenticationRequest = {
        authenticationReturnUrl: returnUrl,
        threeDSRequestorAuthenticationInfo: {
            authenticationPurpose: THREE_DS.AUTH_PURPOSE.PAYMENT_TRANSACTION,
        },
        threeDSPurchaseInfo: {
            purchaseDate: new Date().toISOString(),
            threeDomainSecureTransactionType: THREE_DS.TRANSACTION_TYPE.GOODS_SERVICES
        }
    }

    return authenticationRequest
}

/**
 * Check if payment response requires 3DS authentication
 * 
 * @param {Object} response - Payment API response from JPMC
 * @returns {boolean} True if 3DS authentication is required
 * 
 * @example
 * const paymentResponse = await createPayment({ ... })
 * if (requires3DSAuthentication(paymentResponse)) {
 *     const orchestrationUrl = get3DSOrchestrationUrl(paymentResponse)
 *     // Initiate 3DS flow
 * }
 */
export function requires3DSAuthentication(response) {
    if (!response) return false

    return response.responseCode === THREE_DS.RESPONSE_CODE.PERFORM_AUTHENTICATION &&
           !!response.paymentAuthenticationResult?.authenticationOrchestrationUrl
}

/**
 * Get the 3DS orchestration URL from payment response
 * 
 * @param {Object} response - Payment API response from JPMC
 * @returns {string|null} Orchestration URL or null if not present
 */
export function get3DSOrchestrationUrl(response) {
    return response?.paymentAuthenticationResult?.authenticationOrchestrationUrl || null
}

/**
 * Build initial order patch payload when 3DS is required (PERFORM_AUTHENTICATION received)
 * Follows SFRA pattern: marks order as pending 3DS and stores initial values
 * Called BEFORE showing the 3DS modal
 * 
 * @param {Object} options - Build options
 * @param {string} options.merchantId - Resolved merchant ID
 * @param {string} options.transactionId - JPMC paymentRequestId/transactionId
 * @param {string} options.authenticationId - 3DS authentication ID from paymentAuthenticationResult
 * @returns {Object} Order patch payload with c_* prefixed attributes
 * 
 * @example
 * // After authorize returns PERFORM_AUTHENTICATION:
 * if (requires3DSAuthentication(response)) {
 *     const patchPayload = build3DSInitialOrderPatchPayload({
 *         merchantId: config.merchantId,
 *         transactionId: response.transactionId,
 *         authenticationId: response.paymentAuthenticationResult?.authenticationId
 *     })
 *     await orderApi.patchOrder(orderNo, patchPayload)
 * }
 */
export function build3DSInitialOrderPatchPayload({ merchantId, transactionId, authenticationId }) {
    return {
        c_jpmcMerchantId: merchantId,
        c_pending3DSAuthentication: true,
        c_threeDSTransactionId: transactionId,
        c_threeDSAuthenticationId: authenticationId
    }
}

/**
 * Extract 3DS authentication values from payment details response
 * Used by SSR callback to get values for order patching
 * 
 * @param {Object} paymentDetails - Response from GET /payments/{id}
 * @returns {Object} Extracted 3DS values for order custom attributes
 * 
 * @example
 * const details = await getPaymentDetails(transactionId)
 * const threeDSValues = extract3DSValues(details)
 * await orderApi.patchOrder(orderNo, {
 *     c_threeDSTransactionId: threeDSValues.transactionId,
 *     c_threeDSAuthenticationValue: threeDSValues.authenticationValue,
 *     // ... etc
 * })
 */
export function extract3DSValues(paymentDetails) {
    const authResult = paymentDetails?.paymentAuthenticationResult || {}
    const threeDSCompletion = authResult.threeDomainSecureCompletion || {}

    return {
        authenticationId: authResult.authenticationId || null,
        authenticationValue: authResult.authenticationValue || null,
        transactionId: threeDSCompletion.threeDSDirectoryServerTransactionId || null,
        transactionStatus: threeDSCompletion.threeDSTransactionStatus || null,
        eci: threeDSCompletion.electronicCommerceIndicator || null,
        statusReasonText: threeDSCompletion.threeDSTransactionStatusReasonText || null
    }
}

/**
 * Build order patch payload from 3DS callback
 * Maps extracted values to order custom attribute names 
 * @param {Object} threeDSValues - Values from extract3DSValues()
 * @param {boolean} success - Whether authentication succeeded
 * @param {string} [failureReason] - Failure reason if not success
 * @returns {Object} Order patch payload with c_* prefixed attributes
 */
export function build3DSOrderPatchPayload(threeDSValues, success, failureReason = null) {
    const payload = {
        c_pending3DSAuthentication: false
    }

    if (threeDSValues.transactionStatus) {
        payload.c_threeDSTransactionStatus = threeDSValues.transactionStatus
    } else {
        payload.c_threeDSTransactionStatus = success 
            ? THREE_DS.TRANSACTION_STATUS.SUCCESS 
            : THREE_DS.TRANSACTION_STATUS.FAILED
    }

    if (threeDSValues.authenticationId) {
        payload.c_threeDSAuthenticationId = threeDSValues.authenticationId
    }

    if (threeDSValues.transactionId) {
        payload.c_threeDSTransactionId = threeDSValues.transactionId
    }

    if (threeDSValues.authenticationValue) {
        payload.c_threeDSAuthenticationValue = threeDSValues.authenticationValue
    }

    if (threeDSValues.eci) {
        payload.c_threeDSEci = threeDSValues.eci
    }

    if (failureReason) {
        payload.c_threeDSFailureReason = failureReason
    }

    return payload
}

export default {
    is3DSEnabled,
    build3DSAuthenticationParameters,
    requires3DSAuthentication,
    get3DSOrchestrationUrl,
    build3DSInitialOrderPatchPayload,
    extract3DSValues,
    build3DSOrderPatchPayload
}
