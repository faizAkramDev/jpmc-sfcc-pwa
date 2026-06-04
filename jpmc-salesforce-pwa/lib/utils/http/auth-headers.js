/**
 * Auth Headers Utility
 * 
 * Shared utility for building HTTP headers with optional SLAS authorization.
 * Used across payment hooks to support multi-MID configuration via Custom Objects.
 * 
 * @module utils/http/auth-headers
 */

/**
 * Build HTTP headers with optional Authorization token
 * 
 * Attempts to get SLAS token from getAccessToken function if provided.
 * Falls back gracefully if token fetch fails (uses Site Preferences fallback).
 * 
 * @param {Object} options - Options
 * @param {Function} [options.getAccessToken] - Async function to get SLAS token
 * @param {string} [options.contentType='application/json'] - Content-Type header value
 * @returns {Promise<Object>} Headers object with Content-Type and optional Authorization
 * 
 * @example
 * // With token
 * const headers = await buildAuthHeaders({ getAccessToken })
 * // Returns: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ...' }
 * 
 * @example
 * // Without token (fallback)
 * const headers = await buildAuthHeaders({})
 * // Returns: { 'Content-Type': 'application/json' }
 */
export const buildAuthHeaders = async ({ getAccessToken, contentType = 'application/json' } = {}) => {
    const headers = { 'Content-Type': contentType }
    
    // Add SLAS token if getAccessToken is available (for multi-MID support)
    if (getAccessToken) {
        try {
            const token = await getAccessToken()
            if (token) {
                headers['Authorization'] = `Bearer ${token}`
            }
        } catch (_tokenErr) {
            // Token fetch failed, proceed without it (will fall back to Site Preferences)
        }
    }
    
    return headers
}

export default { buildAuthHeaders }
