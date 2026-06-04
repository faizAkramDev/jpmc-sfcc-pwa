/**
 * HTTP Client with Retry Logic
 * 
 * Provides a reusable HTTP client with:
 * - Automatic token refresh on 401
 * - Exponential backoff retry
 * - Standard headers
 * 
 * @module utils/http/http-client
 */

import { v4 as uuidv4 } from 'uuid'
import logger from '../logger.js'

/**
 * Generate a unique request ID
 * 
 * @param {string} prefix - Optional prefix for the ID
 * @returns {string} Unique request ID
 */
export const generateRequestId = (prefix = 'req') => {
    return `${prefix}-${Date.now()}-${uuidv4().substring(0, 8)}`
}

/**
 * Sleep for a specified duration
 * 
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Perform a fetch request with automatic retry on failure
 * 
 * Features:
 * - Exponential backoff (1s, 2s, 4s, ...)
 * - Configurable max retries
 * - Skips retry for validation errors (400, 422)
 * 
 * @param {string} url - Request URL
 * @param {object} options - Fetch options
 * @param {object} retryConfig - Retry configuration
 * @param {number} retryConfig.maxRetries - Maximum retry attempts (default: 3)
 * @param {number} retryConfig.baseDelay - Base delay in ms (default: 1000)
 * @param {number[]} retryConfig.retryStatusCodes - Status codes to retry (default: [500, 502, 503, 504])
 * @returns {Promise<Response>} Fetch response
 */
export const fetchWithRetry = async (url, options = {}, retryConfig = {}) => {
    const {
        maxRetries = 3,
        baseDelay = 1000,
        retryStatusCodes = [500, 502, 503, 504]
    } = retryConfig
    
    let lastError = null
    let lastResponse = null
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options)
            
            // Success or non-retryable error
            if (response.ok || !retryStatusCodes.includes(response.status)) {
                return response
            }
            
            // Retryable error
            lastResponse = response
            
            if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt)
                logger.warn(`[HTTP] Request failed with ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
                await sleep(delay)
            }
        } catch (error) {
            lastError = error
            
            if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt)
                logger.warn(`[HTTP] Request failed with error: ${error.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
                await sleep(delay)
            }
        }
    }
    
    // All retries exhausted
    if (lastResponse) {
        return lastResponse
    }
    
    throw lastError || new Error('Request failed after all retries')
}

/**
 * Perform a fetch request with automatic 401 token refresh
 * 
 * When a 401 is received:
 * 1. Clear the token cache
 * 2. Get a new access token
 * 3. Retry the request once
 * 
 * @param {string} url - Request URL
 * @param {object} options - Fetch options
 * @param {object} authConfig - Authentication configuration
 * @param {function} authConfig.getToken - Function to get access token
 * @param {function} authConfig.clearToken - Function to clear token cache
 * @param {boolean} authConfig.retryOn401 - Whether to retry on 401 (default: true)
 * @returns {Promise<Response>} Fetch response
 */
export const fetchWithAuth = async (url, options = {}, authConfig = {}) => {
    const {
        getToken,
        clearToken,
        retryOn401 = true
    } = authConfig
    
    // Build headers with auth token
    const buildHeaders = async (token) => {
        return {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...options.headers,
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
    }
    
    // Get initial token
    const token = getToken ? await getToken() : null
    const headers = await buildHeaders(token)
    
    // Make initial request
    let response = await fetch(url, {
        ...options,
        headers
    })
    
    // Handle 401 - try to refresh token and retry
    if (response.status === 401 && retryOn401 && getToken && clearToken) {
        logger.warn('[HTTP] Received 401 - attempting token refresh')
        
        try {
            // Clear old token
            clearToken()
            
            // Get new token
            const newToken = await getToken()
            const newHeaders = await buildHeaders(newToken)
            
            // Retry request
            response = await fetch(url, {
                ...options,
                headers: newHeaders
            })
        } catch (refreshError) {
            logger.error('[HTTP] Token refresh failed:', refreshError.message)
            // Return original 401 response
        }
    }
    
    return response
}

/**
 * Build standard JPMC API headers
 * 
 * @param {object} config - Header configuration
 * @param {string} config.merchantId - Merchant ID
 * @param {string} config.platformId - Platform ID
 * @param {string} config.requestId - Request ID (generated if not provided)
 * @param {string} config.accessToken - Access token (optional)
 * @returns {object} Headers object
 */
export const buildJPMCHeaders = (config) => {
    const {
        merchantId,
        platformId,
        requestId = generateRequestId(),
        accessToken
    } = config
    
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'merchant-id': merchantId,
        'request-id': requestId
    }
    
    // Only add platform-id if configured
    if (platformId) {
        headers['platform-id'] = platformId
    }
    
    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`
    }
    
    return headers
}

/**
 * Parse JSON response with error handling
 * 
 * @param {Response} response - Fetch response
 * @returns {Promise<object>} Parsed JSON or error object
 */
export const parseJSONResponse = async (response) => {
    try {
        const text = await response.text()
        if (!text) {
            return {}
        }
        return JSON.parse(text)
    } catch (error) {
        logger.error('[HTTP] Failed to parse JSON response:', error.message)
        return {
            parseError: true,
            message: 'Failed to parse response'
        }
    }
}

export default {
    generateRequestId,
    sleep,
    fetchWithRetry,
    fetchWithAuth,
    buildJPMCHeaders,
    parseJSONResponse
}
