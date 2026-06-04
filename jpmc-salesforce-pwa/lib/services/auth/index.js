/**
 * Authentication Module Index
 * 
 * Single source of truth for JPMC OAuth authentication.
 * 
 * @module services/auth
 */

// Token management
export {
    isTokenValid,
    getCachedToken,
    cacheToken,
    clearTokenCache,
    getTokenCacheStatus,
    getTimeUntilExpiry,
    needsRefresh
} from './token-manager'

// Certificate loading
export {
    loadCertificate,
    loadPrivateKey,
    getCertificateThumbprints,
    getCertificateThumbprint,
    validateCertificateFormat,
    validatePrivateKeyFormat,
    wrapCertificateInPem,
    resolveFilePath,
    clearCertificateCache
} from './certificate-loader'

// JWT generation
export {
    generateClientAssertion,
    decodeJWT,
    verifyJWT
} from './jwt-generator'

// OAuth service
export {
    getAccessToken,
    verifyAuthConfiguration
} from './oauth-service'

// Default exports
export { default as tokenManager } from './token-manager'
export { default as certificateLoader } from './certificate-loader'
export { default as jwtGenerator } from './jwt-generator'
export { default as oauthService } from './oauth-service'
