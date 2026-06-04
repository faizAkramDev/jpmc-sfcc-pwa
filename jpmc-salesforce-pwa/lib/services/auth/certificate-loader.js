/**
 * Certificate Loader
 * 
 * Handles loading and validation of X.509 certificates and private keys.
 * Calculates SHA-1 thumbprints for JWT headers.
 * 
 * @module services/auth/certificate-loader
 */

import fs from 'node:fs'
import path from 'node:path'
import forge from 'node-forge'
import { isServerSide } from '../../utils/config/env-loader'
import logger from '../../utils/logger'

// =============================================================================
// In-Memory Cache for Certificate/Key/Thumbprints
// =============================================================================

/**
 * Cache to avoid repeated file reads and crypto operations.
 * Cache keys use clientId to support multi-tenant scenarios.
 */
const _cache = {
    certificates: new Map(),   // clientId -> certificatePEM
    privateKeys: new Map(),    // clientId -> privateKeyPEM
    thumbprints: new Map()     // clientId -> { hexThumbprint, base64UrlThumbprint }
}

/**
 * Clear all cached values (useful for testing or config changes)
 */
export const clearCertificateCache = () => {
    _cache.certificates.clear()
    _cache.privateKeys.clear()
    _cache.thumbprints.clear()
    logger.info('[Certificate] Cache cleared')
}

// =============================================================================
// Certificate Loading
// =============================================================================

/**
 * Load certificate content from base64 environment variable or file path
 * 
 * Priority: Base64 (production/MRT) > File path (development)
 * 
 * @param {object} config - Auth configuration (required - must include certificateBase64 or certificatePath)
 * @returns {string} Certificate PEM content
 * @throws {Error} If certificate cannot be loaded or config is missing
 */
export const loadCertificate = (config) => {
    if (!config) {
        throw new Error('Config is required for loadCertificate. Use getJPMCConfigAsync() to get config.')
    }
    
    // Check cache first (use clientId as key)
    const cacheKey = config.clientId || 'default'
    if (_cache.certificates.has(cacheKey)) {
        return _cache.certificates.get(cacheKey)
    }
    
    try {
        let certContent
        
        // Priority 1: Base64 environment variable (production/MRT)
        if (config.certificateBase64) {
            logger.info('[Certificate] Loading from base64 environment variable')
            certContent = Buffer.from(config.certificateBase64, 'base64').toString('utf8')
        }
        // Priority 2: File path (local development)
        else if (config.certificatePath) {
            logger.debug('[Certificate] Loading from file path')
            
            const certPath = resolveFilePath(config.certificatePath)
            
            if (!certPath) {
                throw new Error(`Certificate file not found: ${config.certificatePath}`)
            }
            
            logger.debug('[Certificate] Certificate file resolved')
            certContent = fs.readFileSync(certPath, 'utf8')
        } else {
            throw new Error('No certificate configured. Set JPMC_CERTIFICATE_BASE64 or JPMC_CERTIFICATE_PATH')
        }
        
        validateCertificateFormat(certContent)
        
        // Cache the result
        _cache.certificates.set(cacheKey, certContent)
        logger.info('[Certificate] Certificate cached for clientId:', cacheKey)
        
        return certContent
    } catch (error) {
        logger.error('[Certificate] Error loading certificate:', error.message)
        throw error
    }
}

/**
 * Load private key content from base64 environment variable or file path
 * 
 * Priority: Base64 (production/MRT) > File path (development)
 * 
 * @param {object} config - Auth configuration (required - must include privateKeyBase64 or privateKeyPath)
 * @returns {string} Private key PEM content
 * @throws {Error} If private key cannot be loaded or config is missing
 */
export const loadPrivateKey = (config) => {
    if (!config) {
        throw new Error('Config is required for loadPrivateKey. Use getJPMCConfigAsync() to get config.')
    }
    
    // Check cache first
    const cacheKey = config.clientId || 'default'
    if (_cache.privateKeys.has(cacheKey)) {
        return _cache.privateKeys.get(cacheKey)
    }
    
    try {
        let keyContent
        
        // Priority 1: Base64 environment variable (production/MRT)
        if (config.privateKeyBase64) {
            logger.info('[Certificate] Loading private key from base64 environment variable')
            keyContent = Buffer.from(config.privateKeyBase64, 'base64').toString('utf8')
        }
        // Priority 2: File path (local development)
        else if (config.privateKeyPath) {
            logger.debug('[Certificate] Loading private key from file path')
            
            const keyPath = resolveFilePath(config.privateKeyPath)
            
            if (!keyPath) {
                throw new Error(`Private key file not found: ${config.privateKeyPath}`)
            }
            
            keyContent = fs.readFileSync(keyPath, 'utf8')
        } else {
            throw new Error('No private key configured. Set JPMC_PRIVATE_KEY_BASE64 or JPMC_PRIVATE_KEY_PATH')
        }
        
        validatePrivateKeyFormat(keyContent)
        
        // Cache the result
        _cache.privateKeys.set(cacheKey, keyContent)
        logger.info('[Certificate] Private key cached for clientId:', cacheKey)
        
        return keyContent
    } catch (error) {
        logger.error('[Certificate] Error loading private key:', error.message)
        throw error
    }
}

// =============================================================================
// Thumbprint Calculation
// =============================================================================

/**
 * Calculate certificate SHA-1 thumbprints in multiple formats
 * 
 * Returns both hex and base64url formats for different use cases:
 * - hexThumbprint: Used in JWT 'kid' header
 * - base64UrlThumbprint: Used in JWT 'x5t' header (ADFS standard)
 * 
 * @param {object} config - Auth configuration (optional)
 * @returns {object} { hexThumbprint, base64UrlThumbprint }
 * @throws {Error} If thumbprint calculation fails
 */
export const getCertificateThumbprints = (config = null) => {
    // Check cache first
    const cacheKey = config?.clientId || 'default'
    if (_cache.thumbprints.has(cacheKey)) {
        return _cache.thumbprints.get(cacheKey)
    }
    
    try {
        const certPem = loadCertificate(config)
        
        // Parse the PEM certificate using node-forge
        let cert
        try {
            cert = forge.pki.certificateFromPem(certPem)
        } catch (parseError) {
            // If PEM parsing fails, try wrapping base64 content
            const wrappedPem = wrapCertificateInPem(certPem)
            cert = forge.pki.certificateFromPem(wrappedPem)
        }
        
        // Convert certificate to ASN.1 DER format
        const asn1 = forge.pki.certificateToAsn1(cert)
        const der = forge.asn1.toDer(asn1)
        
        // Calculate SHA-1 hash
        const sha1 = forge.md.sha1.create()
        sha1.update(der.bytes())
        const hashBytes = sha1.digest().bytes()
        
        // Hex format (uppercase, no separators)
        const hexThumbprint = forge.util.bytesToHex(hashBytes).toUpperCase()
        
        // Base64url format (for ADFS x5t header)
        // Convert base64 to base64url: replace + with -, / with _, remove padding
        const base64Thumbprint = forge.util.encode64(hashBytes)
        const base64UrlThumbprint = base64Thumbprint
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .split('=')[0]
        
        const thumbprints = { hexThumbprint, base64UrlThumbprint }
        
        // Cache the result
        _cache.thumbprints.set(cacheKey, thumbprints)
        logger.info('[Certificate] Thumbprints calculated and cached:')
        logger.info('[Certificate]   Hex (kid):', hexThumbprint)
        logger.info('[Certificate]   Base64url (x5t):', base64UrlThumbprint)
        
        return thumbprints
    } catch (error) {
        logger.error('[Certificate] Error calculating thumbprints:', error.message)
        throw new Error(`Failed to calculate certificate thumbprints: ${error.message}`)
    }
}

/**
 * Calculate certificate SHA-1 thumbprint (hex format only)
 * 
 * @param {object} config - Auth configuration (optional)
 * @returns {string} Hex thumbprint (uppercase)
 */
export const getCertificateThumbprint = (config = null) => {
    const { hexThumbprint } = getCertificateThumbprints(config)
    return hexThumbprint
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate certificate PEM format
 * 
 * @param {string} certPem - Certificate content
 * @throws {Error} If certificate format is invalid
 */
export const validateCertificateFormat = (certPem) => {
    if (!certPem || typeof certPem !== 'string') {
        throw new Error('Certificate content is empty or invalid')
    }
    
    // Check for PEM format markers
    const hasPemMarkers = certPem.includes('-----BEGIN CERTIFICATE-----') && 
                          certPem.includes('-----END CERTIFICATE-----')
    
    // Also accept DER-style base64 without markers (will be wrapped)
    const isBase64Content = /^[A-Za-z0-9+/=\s]+$/.test(certPem.trim())
    
    if (!hasPemMarkers && !isBase64Content) {
        throw new Error('Invalid certificate format. Expected PEM or base64 DER format')
    }
}

/**
 * Validate private key PEM format
 * 
 * @param {string} keyPem - Private key content
 * @throws {Error} If private key format is invalid
 */
export const validatePrivateKeyFormat = (keyPem) => {
    if (!keyPem || typeof keyPem !== 'string') {
        throw new Error('Private key content is empty or invalid')
    }
    
    // Check for PEM format markers (various key types)
    const validMarkers = [
        '-----BEGIN PRIVATE KEY-----',       // PKCS#8
        '-----BEGIN RSA PRIVATE KEY-----',   // PKCS#1
        '-----BEGIN EC PRIVATE KEY-----',    // EC
        '-----BEGIN ENCRYPTED PRIVATE KEY-----' // Encrypted PKCS#8
    ]
    
    const hasValidMarker = validMarkers.some(marker => keyPem.includes(marker))
    
    if (!hasValidMarker) {
        throw new Error('Invalid private key format. Expected PEM format (PKCS#8 or PKCS#1)')
    }
}

/**
 * Wrap raw base64 certificate content in PEM markers
 * 
 * @param {string} content - Base64 certificate content
 * @returns {string} PEM formatted certificate
 */
export const wrapCertificateInPem = (content) => {
    // Remove any existing whitespace/newlines (\s includes \r, \n, space, tab)
    const cleanContent = content.replace(/\s/g, '')
    
    // Split into 64-character lines (PEM standard)
    const lines = cleanContent.match(/.{1,64}/g) || []
    
    return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`
}

// =============================================================================
// File Path Resolution
// =============================================================================

/**
 * Resolve a file path, handling PWA Kit's build directory structure
 * 
 * @param {string} filePath - File path (absolute or relative)
 * @returns {string|null} Resolved absolute path if file exists, null otherwise
 */
export const resolveFilePath = (filePath) => {
    // Server-side only
    if (!isServerSide()) {
        return null
    }
    
    // Absolute paths are used as-is
    if (path.isAbsolute(filePath)) {
        if (fs.existsSync(filePath)) {
            return filePath
        }
        logger.warn('[Certificate] Absolute path not found:', filePath)
        return null
    }
    
    const cwd = process.cwd()
    
    // Search paths for relative files:
    // 1. Relative to cwd (for when running from project root)
    // 2. Relative to parent of cwd (for when running from build/)
    // 3. Relative to grandparent of cwd (edge cases)
    const searchPaths = [
        path.resolve(cwd, filePath),
        path.resolve(cwd, '..', filePath),
        path.resolve(cwd, '..', '..', filePath),
    ]
    
    for (const resolvedPath of searchPaths) {
        if (fs.existsSync(resolvedPath)) {
            return resolvedPath
        }
    }
    
    logger.warn('[Certificate] File not found. Searched:', searchPaths)
    return null
}

export default {
    loadCertificate,
    loadPrivateKey,
    getCertificateThumbprints,
    getCertificateThumbprint,
    validateCertificateFormat,
    validatePrivateKeyFormat,
    wrapCertificateInPem,
    resolveFilePath,
    clearCertificateCache
}
