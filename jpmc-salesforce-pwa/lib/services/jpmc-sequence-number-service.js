/**
 * JPMC Sequence Number Service
 *
 * Calls the SFRA JPMC-GetSequenceNumber endpoint to generate a unique order sequence number.
 * This endpoint creates a new SFCC order number via OrderMgr.createOrderSequenceNo().
 *
 * Used by Drop-in UI checkout before calling /checkout/intent.
 * SFRA is the only source of truth — there is no fallback generation.
 *
 * @module services/jpmc-sequence-number-service
 */

import logger from '../utils/logger.js'

/**
 * Get a sequence number from SFRA JPMC-GetSequenceNumber endpoint
 *
 * The SFRA endpoint calls OrderMgr.createOrderSequenceNo() to generate a unique
 * sequence number. This ensures SFCC and JPMC share the same order reference.
 *
 * @param {Object} options - Configuration
 * @param {string} options.sfraBaseUrl - Base URL of SFRA instance (e.g., 'https://zzrd-019.dx.commercecloud.salesforce.com/on/demandware.store/Sites-RefArch-Site/it_IT')
 * @param {string} [options.locale] - Locale for logging (optional)
 * @returns {Promise<Object>} Result object with:
 *   - {string} sequenceNumber - Sequence number obtained from SFRA
 * @throws {Error} If validation fails (missing required params) or SFRA endpoint fails
 */
export const getSequenceNumber = async (options = {}) => {
    const { sfraBaseUrl, locale } = options

    // Validate required parameters
    if (!sfraBaseUrl) {
        const error = new Error('[JPMCSequenceNumberService] sfraBaseUrl is required')
        error.statusCode = 400
        throw error
    }

    // Construct the JPMC-GetSequenceNumber endpoint URL
    const endpointUrl = `${sfraBaseUrl}/JPMC-GetSequenceNumber`

    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }

    logger.info('[JPMCSequenceNumberService] Calling JPMC-GetSequenceNumber endpoint', {
        url: endpointUrl,
        locale: locale
    })

    const response = await fetch(endpointUrl, {
        method: 'GET',
        headers: headers
    })

    const data = await response.json()

    logger.info('[JPMCSequenceNumberService] Received response from endpoint', {
        status: response.status,
        success: data.success,
        hasSequenceNumber: !!data.sequenceNumber
    })

    // Handle non-OK response
    if (!response.ok) {
        const error = new Error(
            `[JPMCSequenceNumberService] Endpoint returned ${response.status}: ${data.error || 'Unknown error'}`
        )
        error.statusCode = response.status
        throw error
    }

    // Check if response indicates success
    if (!data.success) {
        throw new Error(`[JPMCSequenceNumberService] Endpoint returned success=false: ${data.error || 'Unknown error'}`)
    }

    // Extract sequence number from response
    const { sequenceNumber } = data

    if (!sequenceNumber) {
        throw new Error('[JPMCSequenceNumberService] No sequenceNumber in response')
    }

    logger.info('[JPMCSequenceNumberService] Sequence number obtained successfully', {
        sequenceNumber: sequenceNumber,
        locale: locale
    })

    return { sequenceNumber }
}

export default { getSequenceNumber }
