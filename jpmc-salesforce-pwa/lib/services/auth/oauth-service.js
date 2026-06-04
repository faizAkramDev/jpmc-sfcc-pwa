/**
 * OAuth Service
 * 
 * Handles OAuth 2.0 authentication with JP Morgan APIs.
 * Uses JWT Client Assertion grant type.
 * 
 * @module services/auth/oauth-service
 */

import { generateClientAssertion } from './jwt-generator'
import { getCertificateThumbprint, loadPrivateKey } from './certificate-loader'
import { 
    isTokenValid, 
    getCachedToken, 
    cacheToken, 
    clearTokenCache,
    getTokenCacheStatus,
    acquireRefreshLock
} from './token-manager'
import { TOKEN_CONFIG, JPMC_TOKEN_URI } from '../../utils/constants/misc-constants'
import logger from '../../utils/logger'

const { DEFAULT_TOKEN_VALIDITY_SECONDS } = TOKEN_CONFIG

// =============================================================================
// Access Token Management
// =============================================================================

/**
 * Get OAuth 2.0 access token from JP Morgan
 * 
 * Uses JWT Client Assertion grant type (urn:ietf:params:oauth:client-assertion-type:jwt-bearer)
 * Caches token for reuse until it expires (8-hour validity, refreshed with 5-min buffer)
 * 
 * @param {object} config - Auth configuration (required - must include clientId, resourceId)
 * @param {boolean} forceRefresh - Force token refresh even if cached token is valid
 * @returns {Promise<string>} Access token
 * @throws {Error} If token request fails or config is missing
 * 
 * @example
 * const config = await getJPMCConfigAsync()
 * const token = await getAccessToken(config)
 * // Use token in Authorization header:
 * // headers: { 'Authorization': `Bearer ${token}` }
 */
export const getAccessToken = async (config, forceRefresh = false) => {
    if (!config) {
        throw new Error('Config is required for getAccessToken. Use getJPMCConfigAsync() to get config.')
    }
    
    // Check cache first (unless force refresh requested)
    if (!forceRefresh && isTokenValid()) {
        const cachedToken = getCachedToken()
        if (cachedToken) {
            const status = getTokenCacheStatus()
            logger.info('[OAuth] Using cached access token (expires in', 
                Math.round(status.expiresIn / 60), 'minutes)')
            return cachedToken
        }
    }
    
    logger.info('[OAuth] Requesting new access token from JP Morgan')
    
    return acquireRefreshLock(async () => {
        // Re-check cache in case another concurrent request already refreshed the token
        if (!forceRefresh && isTokenValid()) {
            const cachedToken = getCachedToken()
            if (cachedToken) {
                return cachedToken
            }
        }

        try {
            // Generate signed JWT (client assertion)
            const clientAssertion = generateClientAssertion(config)
            
            // Build token request body
            const body = new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: config.clientId,
                client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
                client_assertion: clientAssertion,
                resource: config.resourceId
            })
            
            logger.info('[OAuth] Token request to:', JPMC_TOKEN_URI)
            logger.info('[OAuth] Resource:', config.resourceId)
            
            // Make token request
            const response = await fetch(JPMC_TOKEN_URI, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: body.toString()
            })
            
            // Handle response
            if (!response.ok) {
                const errorText = await response.text()
                let errorDetails = errorText
                
                try {
                    const errorJson = JSON.parse(errorText)
                    errorDetails = JSON.stringify(errorJson, null, 2)
                } catch (e) {
                    // Keep original text if not JSON
                }
                
                logger.error('[OAuth] Token request failed:', response.status)
                if (process.env.JPMC_DEBUG === 'true') {
                    logger.debug('[OAuth] Token request error details:', errorDetails)
                }
                throw new Error(`Token request failed: ${response.status}`)
            }
            
            const data = await response.json()
            
            // Validate response
            if (!data.access_token) {
                throw new Error('Token response missing access_token')
            }
            
            // Cache the token - use expires_in from the API response, fallback to default
            const expiresIn = data.expires_in || DEFAULT_TOKEN_VALIDITY_SECONDS
            cacheToken(data.access_token, expiresIn, data.token_type || 'Bearer')
            
            logger.info('[OAuth] Access token obtained successfully')
            
            return data.access_token
        } catch (error) {
            logger.error('[OAuth] Error getting access token:', error.message)
            throw error
        }
    })
}

/**
 * Verify that authentication is properly configured
 * 
 * Use this during application startup to catch configuration errors early.
 * 
 * @param {object} config - Auth configuration (required - must include clientId, resourceId, environment)
 * @returns {object} Configuration status
 */
export const verifyAuthConfiguration = (config) => {
    logger.info('[OAuth] Verifying authentication configuration...')
    
    if (!config) {
        throw new Error('Config is required for verifyAuthConfiguration. Use getJPMCConfigAsync() to get config.')
    }
    
    // Try to load certificate and calculate thumbprint
    const thumbprint = getCertificateThumbprint(config)
    
    // Try to load private key (just validates it can be loaded)
    loadPrivateKey(config)
    
    logger.info('[OAuth] ✅ Configuration verified successfully')
    logger.info('[OAuth] Client ID:', config.clientId ? config.clientId.substring(0, 15) + '...' : 'NOT SET')
    logger.info('[OAuth] Token URI:', JPMC_TOKEN_URI)
    logger.info('[OAuth] Certificate thumbprint:', thumbprint)
    
    return {
        valid: true,
        clientId: config.clientId ? config.clientId.substring(0, 15) + '...' : 'NOT SET',
        tokenUri: JPMC_TOKEN_URI,
        thumbprint: thumbprint,
        message: 'Authentication configuration is valid'
    }
}

// Re-export token manager functions for convenience
export { clearTokenCache, isTokenValid, getTokenCacheStatus } from './token-manager'

export default {
    getAccessToken,
    verifyAuthConfiguration,
    clearTokenCache,
    isTokenValid,
    getTokenCacheStatus
}
