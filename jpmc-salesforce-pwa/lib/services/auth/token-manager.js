/**
 * Token Manager
 * 
 * Single source of truth for access token caching and management.
 * Consolidates token cache from jpmorgan-auth.js and jpmorgan-api.js.
 * 
 * @module services/auth/token-manager
 */

import { TOKEN_CONFIG } from '../../utils/constants/misc-constants'
import logger from '../../utils/logger'

const { TOKEN_BUFFER_MS } = TOKEN_CONFIG

// =============================================================================
// Token Cache (Single Instance)
// =============================================================================

/**
 * Token cache - single source of truth
 * @private
 */
let tokenCache = {
    accessToken: null,
    expiresAt: null,
    tokenType: null
}

/**
 * In-flight refresh lock — prevents concurrent token refresh requests.
 * When a refresh is already in progress, subsequent callers await this
 * same Promise rather than starting another HTTP request.
 * @private
 */
let _refreshLock = null

// =============================================================================
// Token Management Functions
// =============================================================================

/**
 * Check if cached token is still valid
 * 
 * Token is considered valid if:
 * - It exists
 * - It hasn't expired
 * - There's at least TOKEN_BUFFER_MS before expiry
 * 
 * @returns {boolean} True if token is valid and not expiring soon
 */
export const isTokenValid = () => {
    if (!tokenCache.accessToken || !tokenCache.expiresAt) {
        return false
    }
    
    const now = Date.now()
    
    // Token is valid if we have more than buffer time before expiry
    return (tokenCache.expiresAt - now) > TOKEN_BUFFER_MS
}

/**
 * Get cached access token (if valid)
 * 
 * @returns {string|null} Access token or null if not cached/expired
 */
export const getCachedToken = () => {
    if (isTokenValid()) {
        return tokenCache.accessToken
    }
    return null
}

/**
 * Cache a new access token
 * 
 * @param {string} accessToken - The access token
 * @param {number} expiresIn - Token validity in seconds
 * @param {string} tokenType - Token type (default: 'Bearer')
 */
export const cacheToken = (accessToken, expiresIn, tokenType = 'Bearer') => {
    const now = Date.now()
    
    tokenCache = {
        accessToken,
        expiresAt: now + (expiresIn * 1000),
        tokenType
    }
    
    logger.info('[Token Manager] Token cached successfully')
    logger.info('[Token Manager] Expires in:', Math.round(expiresIn / 60), 'minutes')
}

/**
 * Clear the token cache
 * 
 * Use this when:
 * - Token is rejected with 401/403
 * - Credentials have changed
 * - Testing token refresh logic
 */
export const clearTokenCache = () => {
    logger.info('[Token Manager] Clearing token cache')
    tokenCache = {
        accessToken: null,
        expiresAt: null,
        tokenType: null
    }
}

/**
 * Get token cache status (for debugging/monitoring)
 * 
 * @returns {object} Token cache status (without exposing actual token)
 */
export const getTokenCacheStatus = () => {
    const now = Date.now()
    
    return {
        hasToken: !!tokenCache.accessToken,
        isValid: isTokenValid(),
        expiresAt: tokenCache.expiresAt 
            ? new Date(tokenCache.expiresAt).toISOString() 
            : null,
        expiresIn: tokenCache.expiresAt 
            ? Math.round((tokenCache.expiresAt - now) / 1000) 
            : null,
        tokenType: tokenCache.tokenType
    }
}

/**
 * Get time until token expires (in seconds)
 * 
 * @returns {number} Seconds until expiry, or 0 if expired/not cached
 */
export const getTimeUntilExpiry = () => {
    if (!tokenCache.expiresAt) {
        return 0
    }
    
    const remaining = tokenCache.expiresAt - Date.now()
    return Math.max(0, Math.round(remaining / 1000))
}

/**
 * Check if token needs refresh soon
 * 
 * @returns {boolean} True if token will expire within buffer time
 */
export const needsRefresh = () => {
    if (!tokenCache.accessToken || !tokenCache.expiresAt) {
        return true
    }
    
    const now = Date.now()
    return (tokenCache.expiresAt - now) <= TOKEN_BUFFER_MS
}

/**
 * Acquire a refresh lock to prevent concurrent token refresh requests.
 * If a refresh is already in progress, returns the existing Promise so
 * concurrent callers all await the same single HTTP request.
 *
 * @param {function(): Promise<string>} asyncRefreshFn - Async function that performs the token refresh
 * @returns {Promise<string>} The token returned by the refresh
 */
export const acquireRefreshLock = (asyncRefreshFn) => {
    if (_refreshLock !== null) {
        return _refreshLock
    }
    _refreshLock = Promise.resolve(asyncRefreshFn()).finally(() => {
        _refreshLock = null
    })
    return _refreshLock
}

export default {
    isTokenValid,
    getCachedToken,
    cacheToken,
    clearTokenCache,
    getTokenCacheStatus,
    getTimeUntilExpiry,
    needsRefresh,
    acquireRefreshLock
}
