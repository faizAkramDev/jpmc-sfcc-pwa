/**
 * Payment API Service
 * 
 * Handles all payment API calls to JPMC.
 * 
 * @module services/api/payment-api
 */

import { v4 as uuidv4 } from 'uuid'
import { JPMC_ENDPOINTS } from '../../utils/constants/api-constants'
import { RESPONSE_STATUS, PAYMENT_STATES } from '../../utils/constants'
import { GENERIC_API_ERROR_MESSAGE } from '../../utils/constants/error-constants'
import { buildJPMCHeaders } from '../../utils/http/http-client'
import { getAccessToken, clearTokenCache } from '../auth/oauth-service'
import { buildPaymentRequestBody } from './request-builder'
import { normalizePaymentResponse, buildErrorResponse } from './response-normalizer'
import logger, { safeStringify } from '../../utils/logger'

// =============================================================================
// Request ID Generation
// =============================================================================

/**
 * Generate a unique request ID for JPMC API calls
 * 
 * @returns {string} Unique request ID
 */
export const generateRequestId = () => {
    return `req-${Date.now()}-${uuidv4().substring(0, 8)}`
}

// =============================================================================
// Payment Operations
// =============================================================================

/**
 * Create a new payment (authorization)
 * 
 * @param {object} params - Payment parameters
 * @param {string} params.accessToken - OAuth access token (optional, will be fetched if not provided)
 * @param {object} params.config - API configuration (required)
 * @param {object} params.paymentData - Payment data
 * @returns {Promise<object>} Payment response
 */
export const createPayment = async ({ accessToken, config, paymentData }) => {
    if (!config) {
        throw new Error('Config is required for createPayment. Use getJPMCConfigAsync() to get config.')
    }
    const { merchantId, platformId } = config
    
    // Validate required BM configurations
    if (!merchantId) throw new Error('Missing required BM config: JPMC_MerchantCode (merchantId)')
    if (!config.apiHost) throw new Error('Missing required BM config: JPMCApiHost')
    
    // Use apiHost from config (set from BM preference)
    const host = config.apiHost
    const requestId = generateRequestId()
    
    const url = `https://${host}${JPMC_ENDPOINTS.PAYMENTS}`
    const requestBody = buildPaymentRequestBody(paymentData, config)



    // Get access token if not provided
    let token = accessToken
    if (!token) {
        try {
            token = await getAccessToken(config, false)
        } catch (tokenError) {
            logger.error('[Payment API] Failed to get access token:', tokenError.message)
            return buildErrorResponse(
                'AUTHENTICATION_ERROR',
                tokenError.message,
                { _requestId: requestId, _timestamp: new Date().toISOString() }
            )
        }
    }

    // Build headers
    const headers = buildJPMCHeaders({ merchantId, platformId, requestId, accessToken: token })
    // Prepare the raw request body that will be sent to JPMC
    const rawRequestBody = JSON.stringify(requestBody)
    logger.info('[Payment API] RAW REQUEST:', safeStringify(requestBody))
    // Log raw request

    try {
        let response = await fetch(url, {
            method: 'POST',
            headers,
            body: rawRequestBody
        })
        // Handle 401 - try to refresh token and retry once
        if (response.status === 401) {
            logger.warn('[Payment API] Received 401 - attempting token refresh')
            clearTokenCache()
            
            try {
                token = await getAccessToken(config, true)
                headers['Authorization'] = `Bearer ${token}`
                
                response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: rawRequestBody
                })
            } catch (refreshError) {
                logger.error('[Payment API] Token refresh failed:', refreshError.message)
                return buildErrorResponse(
                    'AUTHENTICATION_ERROR',
                    refreshError.message,
                    { _requestId: requestId, _timestamp: new Date().toISOString() }
                )
            }
        }

        const data = await response.json()
        data._requestId = requestId
        data._timestamp = new Date().toISOString()

        // Log raw response
        logger.info('[Payment API] RAW RESPONSE:', safeStringify(data))
        
        if (!response.ok) {
            logger.error('[Payment API] Payment FAILED - Full details above')
            return {
                success: false,
                responseStatus: RESPONSE_STATUS.ERROR,
                transactionState: PAYMENT_STATES.ERROR,
                userMessage: GENERIC_API_ERROR_MESSAGE,
                ...data
            }
        }

        return {
            success: data.responseStatus === RESPONSE_STATUS.SUCCESS,
            ...data
        }
    } catch (error) {
        logger.error('[Payment API] Payment error:', error.message)
        return buildErrorResponse(
            'NETWORK_ERROR',
            error.message,
            { _requestId: requestId, _timestamp: new Date().toISOString() }
        )
    }
}

/**
 * Get payment status by transaction ID
 * 
 * @param {object} params - Request parameters
 * @param {string} params.accessToken - OAuth access token (optional)
 * @param {object} params.config - API configuration (required)
 * @param {string} params.transactionId - Transaction ID
 * @returns {Promise<object>} Payment status
 */
export const getPaymentStatus = async ({ accessToken, config, transactionId }) => {
    if (!config) {
        throw new Error('Config is required for getPaymentStatus. Use getJPMCConfigAsync() to get config.')
    }
    const { merchantId, platformId } = config
    
    // Validate required BM configurations
    if (!merchantId) throw new Error('Missing required BM config: JPMC_MerchantCode (merchantId)')
    if (!config.apiHost) throw new Error('Missing required BM config: JPMCApiHost')
    
    // Use apiHost from config (set from BM preference)
    const host = config.apiHost
    const requestId = generateRequestId()

    // Get access token if not provided
    let token = accessToken
    if (!token) {
        token = await getAccessToken(config, false)
    }

    const url = `https://${host}${JPMC_ENDPOINTS.PAYMENTS}/${transactionId}`
    const headers = buildJPMCHeaders({ merchantId, platformId, requestId, accessToken: token })

    try {
        let response = await fetch(url, { method: 'GET', headers })

        // Handle 401 retry
        if (response.status === 401) {
            logger.warn('[Payment API] Received 401 on getPaymentStatus - attempting token refresh')
            clearTokenCache()
            token = await getAccessToken(config, true)
            headers['Authorization'] = `Bearer ${token}`
            response = await fetch(url, { method: 'GET', headers })
        }

        const data = await response.json()
        return { success: response.ok, ...data }
    } catch (error) {
        logger.error('[Payment API] Get payment status error:', error.message)
        throw error
    }
}

/**
 * Call Fraud Check API
 *
 * Calls JPMC /api/v2/fraudcheck for pre-payment fraud detection.
 * Fail-open semantics: returns null on any service or network error so the
 * transaction is never blocked by a fraud service outage.
 *
 * @param {object} params
 * @param {object} params.config - JPMC configuration (required)
 * @param {object} params.fraudPayload - Fraud check request payload
 * @returns {Promise<object|null>} Fraud check response, or null on error (fail-open)
 */
export const callFraudCheck = async ({ config, fraudPayload }) => {
    if (!config) throw new Error('Config is required for callFraudCheck')
    const { merchantId, platformId } = config
    if (!merchantId) throw new Error('Missing required BM config: JPMC_MerchantCode (merchantId)')
    if (!config.apiHost) throw new Error('Missing required BM config: JPMCApiHost')

    const host = config.apiHost
    const requestId = generateRequestId()
    const url = `https://${host}${JPMC_ENDPOINTS.FRAUD_CHECK}`

    let token
    try {
        token = await getAccessToken(config, false)
    } catch (tokenError) {
        logger.error('[Fraud Check] Failed to get access token:', tokenError.message, '- failing open')
        return null
    }

    const headers = buildJPMCHeaders({ merchantId, platformId, requestId, accessToken: token })

    logger.info('[Fraud Check] RAW REQUEST:', safeStringify(fraudPayload))

    try {
        let response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(fraudPayload)
        })

        if (response.status === 401) {
            logger.warn('[Fraud Check] Received 401 - attempting token refresh')
            clearTokenCache()
            try {
                token = await getAccessToken(config, true)
                headers['Authorization'] = `Bearer ${token}`
                response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(fraudPayload) })
            } catch (refreshError) {
                logger.error('[Fraud Check] Token refresh failed:', refreshError.message, '- failing open')
                return null
            }
        }

        const data = await response.json()
        logger.info('[Fraud Check] RAW RESPONSE:', safeStringify(data))

        if (!response.ok) {
            logger.warn('[Fraud Check] Fraud API returned error status:', response.status, '- failing open')
            return null
        }

        return data
    } catch (error) {
        logger.error('[Fraud Check] Network error:', error.message, '- failing open')
        return null
    }
}

/**
 * Get full payment details by transaction ID
 * Alias for getPaymentStatus - used specifically for 3DS callback flow
 * to retrieve complete authentication results.
 * 
 * @param {object} params - Request parameters
 * @param {string} params.accessToken - OAuth access token (optional)
 * @param {object} params.config - API configuration (required)
 * @param {string} params.transactionId - Transaction/Payment Request ID from 3DS callback
 * @returns {Promise<object>} Payment details including paymentAuthenticationResult
 * 
 * @example
 * // In 3DS callback handler
 * const details = await getPaymentDetails({
 *     config: jpmcConfig,
 *     transactionId: paymentRequestId // from JPMC POST
 * })
 * 
 * const authResult = details.paymentAuthenticationResult
 * const threeDSStatus = authResult.threeDomainSecureCompletion.threeDSTransactionStatus
 */
export const getPaymentDetails = getPaymentStatus

// Re-export response normalizer for convenience
export { normalizePaymentResponse } from './response-normalizer'

export default {
    generateRequestId,
    createPayment,
    getPaymentStatus,
    getPaymentDetails,
    callFraudCheck,
    normalizePaymentResponse
}
