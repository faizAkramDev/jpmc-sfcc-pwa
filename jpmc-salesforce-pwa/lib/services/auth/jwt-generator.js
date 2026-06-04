/**
 * JWT Generator
 * 
 * Generates JWT Client Assertions for OAuth 2.0 authentication.
 * 
 * @module services/auth/jwt-generator
 */

import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { loadPrivateKey, getCertificateThumbprints } from './certificate-loader'
import { TOKEN_CONFIG, JPMC_TOKEN_URI } from '../../utils/constants/misc-constants'
import logger from '../../utils/logger'

const { JWT_EXPIRY_SECONDS } = TOKEN_CONFIG

// =============================================================================
// JWT Generation
// =============================================================================

/**
 * Generate JWT Client Assertion for OAuth 2.0 token request
 * 
 * The JWT is signed with the private key using RS256 algorithm.
 * JP Morgan validates the signature using the public certificate.
 * 
 * JWT Structure:
 * - Header: { alg: "RS256", typ: "JWT", x5t: "<base64url-thumbprint>", kid: "<hex-thumbprint>" }
 * - Payload: { jti, iat, exp, aud, iss, sub }
 * 
 * @param {object} config - Auth configuration (required - must include clientId, certificate credentials)
 * @returns {string} Signed JWT token
 * @throws {Error} If JWT generation fails or config is missing
 * 
 * @example
 * const config = await getJPMCConfigAsync()
 * const assertion = generateClientAssertion(config)
 * // Use in token request:
 * // client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
 * // client_assertion: assertion
 */
export const generateClientAssertion = (config) => {
    if (!config) {
        throw new Error('Config is required for generateClientAssertion. Use getJPMCConfigAsync() to get config.')
    }
    
    try {
        // Load private key
        const privateKey = loadPrivateKey(config)
        
        // Get certificate thumbprints (both formats for compatibility)
        const { hexThumbprint, base64UrlThumbprint } = getCertificateThumbprints(config)
        
        // Current timestamp
        const now = Math.floor(Date.now() / 1000)
        
        // JWT payload (claims)
        const payload = {
            jti: uuidv4(),                              // Unique JWT ID (prevents replay)
            iat: now,                                   // Issued at
            exp: now + JWT_EXPIRY_SECONDS,              // Expiration (5 minutes)
            aud: JPMC_TOKEN_URI,                        // Audience (token endpoint - hardcoded)
            iss: config.clientId,                       // Issuer (your client ID)
            sub: config.clientId                        // Subject (your client ID)
        }
        
        // JWT header options
        // ADFS expects x5t (base64url-encoded SHA-1 thumbprint) for certificate identification
        const signOptions = {
            algorithm: 'RS256',
            header: {
                alg: 'RS256',
                typ: 'JWT',
                x5t: base64UrlThumbprint,               // Base64url-encoded thumbprint (ADFS standard)
                kid: hexThumbprint                       // Hex thumbprint (for compatibility)
            }
        }
        
        // Sign the JWT
        const token = jwt.sign(payload, privateKey, signOptions)
        
        logger.info('[JWT] Client assertion generated successfully')
        if (process.env.JPMC_DEBUG === 'true') {
            logger.debug('[JWT] Payload:', JSON.stringify({
                jti: payload.jti,
                iat: new Date(payload.iat * 1000).toISOString(),
                exp: new Date(payload.exp * 1000).toISOString(),
                aud: payload.aud,
                iss: payload.iss.substring(0, 10) + '...',
                sub: payload.sub.substring(0, 10) + '...'
            }))
        }
        
        return token
    } catch (error) {
        logger.error('[JWT] Error generating client assertion:', error.message)
        throw new Error(`Failed to generate client assertion: ${error.message}`)
    }
}

/**
 * Decode a JWT without verification (for debugging only)
 * 
 * WARNING: This function does NOT verify the JWT signature. The decoded
 * payload cannot be trusted for authentication or authorization decisions.
 * Use `verifyJWT` instead for secure verification.
 * 
 * @param {string} token - JWT token
 * @returns {object} { header, payload }
 */
export const decodeJWT = (token) => {
    logger.warn('[JWT] decodeJWT called — token is decoded WITHOUT signature verification. Do not use for auth decisions.')
    try {
        const decoded = jwt.decode(token, { complete: true })
        return {
            header: decoded.header,
            payload: decoded.payload
        }
    } catch (error) {
        logger.error('[JWT] Error decoding token:', error.message)
        return null
    }
}

/**
 * Verify a JWT signature
 * 
 * @param {string} token - JWT token
 * @param {string} publicKey - Public key for verification
 * @returns {object|null} Decoded payload or null if invalid
 */
export const verifyJWT = (token, publicKey) => {
    try {
        return jwt.verify(token, publicKey, { algorithms: ['RS256'] })
    } catch (error) {
        logger.error('[JWT] Token verification failed:', error.message)
        return null
    }
}

export default {
    generateClientAssertion,
    decodeJWT,
    verifyJWT
}
