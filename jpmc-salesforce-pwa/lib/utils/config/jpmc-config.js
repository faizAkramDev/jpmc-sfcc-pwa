/**
 * JPMC Configuration - Sensitive Environment Variables Only
 * 
 * This module provides access to SENSITIVE configuration that MUST come
 * from environment variables (MRT secrets). Non-sensitive configuration
 * (merchantId, PIE URLs, etc.) comes from BM site preferences.
 * 
 * For full configuration including BM preferences, use:
 * import { getJPMCConfigAsync } from '../ssr'
 * 
 * @module utils/config/jpmc-config
 */

import { ensureEnvLoaded, getEnvVar } from './env-loader'

/**
 * Get sensitive JPMC configuration from environment variables
 * 
 * Returns ONLY sensitive credentials that cannot be stored in BM.
 * Non-sensitive configuration should be fetched from BM site preferences.
 * 
 * @param {object} overrides - Optional config overrides
 * @returns {object} Sensitive JPMC configuration
 */
export const getJPMCConfig = (overrides = {}) => {
    ensureEnvLoaded()
    
    const config = {
        // Certificate paths (for local development)
        certificatePath: getEnvVar('JPMC_CERTIFICATE_PATH', ''),
        privateKeyPath: getEnvVar('JPMC_PRIVATE_KEY_PATH', ''),
        
        // Base64 encoded credentials (for MRT/production)
        certificateBase64: getEnvVar('JPMC_CERTIFICATE_BASE64', ''),
        privateKeyBase64: getEnvVar('JPMC_PRIVATE_KEY_BASE64', ''),
        
        // Debug flag
        debug: getEnvVar('JPMC_DEBUG', '') === 'true'
    }
    
    // Merge overrides
    return { ...config, ...overrides }
}

/**
 * Get sensitive credentials for authentication
 * 
 * Returns only the certificate/key credentials from environment.
 * For full auth config including clientId, resourceId from BM, use getJPMCConfigAsync().
 * 
 * @returns {object} Sensitive auth credentials
 */
export const getSensitiveCredentials = () => {
    const config = getJPMCConfig()
    return {
        certificatePath: config.certificatePath,
        privateKeyPath: config.privateKeyPath,
        certificateBase64: config.certificateBase64,
        privateKeyBase64: config.privateKeyBase64
    }
}

/**
 * Check if sensitive credentials are available
 * 
 * @returns {boolean} True if either base64 or path credentials are set
 */
export const hasCredentials = () => {
    const creds = getSensitiveCredentials()
    const hasPrivateKey = !!(creds.privateKeyBase64 || creds.privateKeyPath)
    const hasCertificate = !!(creds.certificateBase64 || creds.certificatePath)
    return hasPrivateKey && hasCertificate
}

/**
 * Check if debug mode is enabled
 * 
 * @returns {boolean} True if JPMC_DEBUG is 'true'
 */
export const isDebugMode = () => {
    return getJPMCConfig().debug
}

export default {
    getJPMCConfig,
    getSensitiveCredentials,
    hasCredentials,
    isDebugMode
}
