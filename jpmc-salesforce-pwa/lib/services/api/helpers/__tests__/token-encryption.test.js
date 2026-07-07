/**
 * Tests for Token Encryption Helper
 * 
 * Tests encryption and decryption of JPMC tokens using AES-256-GCM
 */

import { encryptToken, decryptToken } from '../token-encryption'

describe('Token Encryption Helper', () => {
    beforeEach(() => {
        // Set required environment variable for encryption key derivation
        process.env.JPMC_PRIVATE_KEY_BASE64 = Buffer.from('test-private-key-with-sufficient-length-for-crypto').toString('base64')
    })

    afterEach(() => {
        delete process.env.JPMC_PRIVATE_KEY_BASE64
    })

    describe('encryptToken', () => {
        it('should encrypt a token and return base64 string', () => {
            const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
            const basketId = 'basket-123'

            const encrypted = encryptToken(token, basketId)

            expect(encrypted).toBeDefined()
            expect(typeof encrypted).toBe('string')
            expect(encrypted.length > token.length).toBe(true) // Encrypted should be longer
            // Should be base64 encoded
            expect(/^[A-Za-z0-9+/=]+$/.test(encrypted)).toBe(true)
        })

        it('should encrypt token without basketId', () => {
            const token = 'test-token-12345'

            const encrypted = encryptToken(token)

            expect(encrypted).toBeDefined()
            expect(typeof encrypted).toBe('string')
            expect(encrypted.length > 0).toBe(true)
        })

        it('should produce different ciphertext for same token each time (due to random IV)', () => {
            const token = 'test-token'
            const basketId = 'basket-123'

            const encrypted1 = encryptToken(token, basketId)
            const encrypted2 = encryptToken(token, basketId)

            // Due to random IV, even same input produces different ciphertext
            expect(encrypted1).not.toBe(encrypted2)
        })

        it('should return null for null token', () => {
            const result = encryptToken(null, 'basket-123')
            expect(result).toBeNull()
        })

        it('should return null for undefined token', () => {
            const result = encryptToken(undefined, 'basket-123')
            expect(result).toBeNull()
        })

        it('should return null for empty string token', () => {
            const result = encryptToken('', 'basket-123')
            expect(result).toBeNull()
        })

        it('should handle long tokens', () => {
            const longToken = 'x'.repeat(10000)
            const encrypted = encryptToken(longToken, 'basket-123')

            expect(encrypted).toBeDefined()
            expect(typeof encrypted).toBe('string')
        })

        it('should handle special characters in token', () => {
            const specialToken = 'token!@#$%^&*()_+-=[]{}|;:\'",.<>?/'
            const encrypted = encryptToken(specialToken, 'basket-123')

            expect(encrypted).toBeDefined()
            expect(typeof encrypted).toBe('string')
        })

        it('should handle Unicode characters in token', () => {
            const unicodeToken = 'token-with-unicode-™-©-®'
            const encrypted = encryptToken(unicodeToken, 'basket-123')

            expect(encrypted).toBeDefined()
            expect(typeof encrypted).toBe('string')
        })

        it('should handle empty basketId', () => {
            const token = 'test-token'
            const encrypted = encryptToken(token, '')

            expect(encrypted).toBeDefined()
            expect(typeof encrypted).toBe('string')
        })

        it('should handle basketId with special characters', () => {
            const token = 'test-token'
            const basketId = 'basket!@#$%^&*()_+-=[]{}|'
            const encrypted = encryptToken(token, basketId)

            expect(encrypted).toBeDefined()
            expect(typeof encrypted).toBe('string')
        })

        it('should handle numeric basketId', () => {
            const token = 'test-token'
            const basketId = '123456789'
            const encrypted = encryptToken(token, basketId)

            expect(encrypted).toBeDefined()
            expect(typeof encrypted).toBe('string')
        })
    })

    describe('decryptToken', () => {
        it('should decrypt a previously encrypted token', () => {
            const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
            const basketId = 'basket-123'

            const encrypted = encryptToken(token, basketId)
            const decrypted = decryptToken(encrypted, basketId)

            expect(decrypted).toBe(token)
        })

        it('should return null for null encrypted reference', () => {
            const result = decryptToken(null, 'basket-123')
            expect(result).toBeNull()
        })

        it('should return null for undefined encrypted reference', () => {
            const result = decryptToken(undefined, 'basket-123')
            expect(result).toBeNull()
        })

        it('should return null for empty string encrypted reference', () => {
            const result = decryptToken('', 'basket-123')
            expect(result).toBeNull()
        })

        it('should return null when basketId does not match', () => {
            const token = 'test-token'
            const basketId1 = 'basket-123'
            const basketId2 = 'basket-456'

            const encrypted = encryptToken(token, basketId1)
            const decrypted = decryptToken(encrypted, basketId2)

            expect(decrypted).toBeNull()
        })

        it('should return null for tampered ciphertext', () => {
            const token = 'test-token'
            const basketId = 'basket-123'

            let encrypted = encryptToken(token, basketId)
            // Tamper with the encrypted data by changing one character
            encrypted = encrypted.slice(0, -5) + 'XXXXX'

            const decrypted = decryptToken(encrypted, basketId)
            expect(decrypted).toBeNull()
        })

        it('should return null for invalid base64', () => {
            const result = decryptToken('not-valid-base64!!!', 'basket-123')
            expect(result).toBeNull()
        })

        it('should return null for data that is too short', () => {
            const result = decryptToken('aG9mdQ==', 'basket-123') // Very short base64
            expect(result).toBeNull()
        })

        it('should decrypt token without basketId', () => {
            const token = 'test-token'

            const encrypted = encryptToken(token)
            const decrypted = decryptToken(encrypted)

            expect(decrypted).toBe(token)
        })

        it('should handle long tokens in round-trip', () => {
            const longToken = 'x'.repeat(10000)
            const basketId = 'basket-123'

            const encrypted = encryptToken(longToken, basketId)
            const decrypted = decryptToken(encrypted, basketId)

            expect(decrypted).toBe(longToken)
        })

        it('should handle special characters in token during round-trip', () => {
            const specialToken = 'token!@#$%^&*()_+-=[]{}|;:\'",.<>?/'
            const basketId = 'basket-123'

            const encrypted = encryptToken(specialToken, basketId)
            const decrypted = decryptToken(encrypted, basketId)

            expect(decrypted).toBe(specialToken)
        })

        it('should handle Unicode characters during round-trip', () => {
            const unicodeToken = 'token-with-unicode-™-©-®'
            const basketId = 'basket-123'

            const encrypted = encryptToken(unicodeToken, basketId)
            const decrypted = decryptToken(encrypted, basketId)

            expect(decrypted).toBe(unicodeToken)
        })

        it('should handle empty basketId during round-trip', () => {
            const token = 'test-token'

            const encrypted = encryptToken(token, '')
            const decrypted = decryptToken(encrypted, '')

            expect(decrypted).toBe(token)
        })

        it('should return null when missing environment variable', () => {
            delete process.env.JPMC_PRIVATE_KEY_BASE64

            const result = decryptToken('some-encrypted-data', 'basket-123')
            expect(result).toBeNull()
        })

        it('should return null for malformed encrypted reference missing auth tag', () => {
            const token = 'test-token'
            const basketId = 'basket-123'

            let encrypted = encryptToken(token, basketId)
            // Create a new buffer that's too short
            const buffer = Buffer.from(encrypted, 'base64')
            const shortened = buffer.slice(0, 10).toString('base64')

            const decrypted = decryptToken(shortened, basketId)
            expect(decrypted).toBeNull()
        })
    })

    describe('Integration: Encrypt/Decrypt Round-Trip', () => {
        it('should handle multiple tokens independently', () => {
            const tokens = [
                'token1-basket123',
                'token2-basket456',
                'token3-basket789'
            ]
            const basketIds = ['basket-1', 'basket-2', 'basket-3']

            const results = []
            for (let i = 0; i < tokens.length; i++) {
                const encrypted = encryptToken(tokens[i], basketIds[i])
                const decrypted = decryptToken(encrypted, basketIds[i])
                results.push(decrypted)
            }

            expect(results).toEqual(tokens)
        })

        it('should maintain token integrity through multiple encryptions', () => {
            const token = 'secure-token-data'
            const basketId = 'basket-123'

            const encrypted1 = encryptToken(token, basketId)
            const decrypted1 = decryptToken(encrypted1, basketId)
            
            const encrypted2 = encryptToken(decrypted1, basketId)
            const decrypted2 = decryptToken(encrypted2, basketId)

            expect(decrypted1).toBe(token)
            expect(decrypted2).toBe(token)
        })

        it('should cross-verify encryption with different basketIds fails', () => {
            const token = 'test-token'

            const encrypted1 = encryptToken(token, 'basket-1')
            const encrypted2 = encryptToken(token, 'basket-2')

            // Each encryption with different basketId should decrypt only with its basketId
            expect(decryptToken(encrypted1, 'basket-1')).toBe(token)
            expect(decryptToken(encrypted2, 'basket-2')).toBe(token)
            
            // Cross-decrypt should fail
            expect(decryptToken(encrypted1, 'basket-2')).toBeNull()
            expect(decryptToken(encrypted2, 'basket-1')).toBeNull()
        })

        it('should handle JWT tokens correctly', () => {
            const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
            const basketId = 'order-12345'

            const encrypted = encryptToken(jwtToken, basketId)
            const decrypted = decryptToken(encrypted, basketId)

            expect(decrypted).toBe(jwtToken)
        })
    })
})
