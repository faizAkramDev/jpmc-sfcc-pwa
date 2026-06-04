/**
 * Token Encryption Helper
 * 
 * Encrypts/decrypts JPMC tokens for secure transport.
 * Token never leaves server in plain form - only encrypted reference sent to client.
 * 
 * @module services/api/helpers/token-encryption
 */

import crypto from 'node:crypto'
import logger from '../../../utils/logger'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/**
 * Get token encryption key
 * Derives a 256-bit key from JPMC_PRIVATE_KEY_BASE64, which must already be
 * set for JWT signing to work. A domain prefix ensures this derivation is
 * distinct from any other use of that key material.
 * @private
 * @throws {Error} If JPMC_PRIVATE_KEY_BASE64 is not set
 */
const getEncryptionKey = () => {
    const privateKeyBase64 = process.env.JPMC_PRIVATE_KEY_BASE64
    if (!privateKeyBase64) {
        throw new Error(
            'JPMC_PRIVATE_KEY_BASE64 must be set — required for both JWT signing and token encryption'
        )
    }
    return crypto.createHash('sha256')
        .update('jpmc-token-encryption:')
        .update(Buffer.from(privateKeyBase64, 'base64'))
        .digest()
}

/**
 * Encrypt JPMC token for safe client transport
 * 
 * @param {string} token - Plain JPMC token
 * @param {string} basketId - Basket ID (used as additional auth data)
 * @returns {string} Encrypted token reference (base64)
 */
export const encryptToken = (token, basketId = '') => {
    if (!token) return null
    
    const key = getEncryptionKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    cipher.setAAD(Buffer.from(basketId))
    
    let encrypted = cipher.update(token, 'utf8')
    encrypted = Buffer.concat([encrypted, cipher.final()])
    
    const authTag = cipher.getAuthTag()
    
    // Format: iv:authTag:encrypted (all base64)
    const result = Buffer.concat([iv, authTag, encrypted]).toString('base64')
    return result
}

/**
 * Decrypt token reference back to plain token
 * 
 * @param {string} encryptedRef - Encrypted token reference from client
 * @param {string} basketId - Basket ID (must match encryption)
 * @returns {string|null} Plain JPMC token or null if decryption fails
 */
export const decryptToken = (encryptedRef, basketId = '') => {
    if (!encryptedRef) return null
    
    try {
        const key = getEncryptionKey()
        const data = Buffer.from(encryptedRef, 'base64')
        
        if (data.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
            logger.error('[Token Decrypt] Data too short:', data.length)
            return null
        }
        
        const iv = data.subarray(0, IV_LENGTH)
        const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
        const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
        
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
        decipher.setAuthTag(authTag)
        decipher.setAAD(Buffer.from(basketId))
        
        let decrypted = decipher.update(encrypted)
        decrypted = Buffer.concat([decrypted, decipher.final()])
        
        return decrypted.toString('utf8')
    } catch (err) {
        // Decryption failed - tampered data or wrong basketId
        logger.error('[Token Decrypt] Decryption failed:', err.message)
        return null
    }
}

export default { encryptToken, decryptToken }
