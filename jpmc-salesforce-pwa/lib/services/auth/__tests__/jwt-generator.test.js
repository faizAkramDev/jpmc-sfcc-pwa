/**
 * Tests for JWT Generator
 * 
 * Tests JWT Client Assertion generation for OAuth 2.0 authentication
 */

import { generateClientAssertion, decodeJWT, verifyJWT } from '../jwt-generator'

// Mock dependencies
jest.mock('../certificate-loader', () => ({
    loadPrivateKey: jest.fn(),
    getCertificateThumbprints: jest.fn()
}))

jest.mock('../../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}))

jest.mock('jsonwebtoken', () => ({
    sign: jest.fn(),
    decode: jest.fn(),
    verify: jest.fn()
}))

describe('JWT Generator', () => {
    const mockPrivateKey = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7...\n-----END PRIVATE KEY-----'
    const mockClientId = 'test-client-id-12345'
    const mockConfig = {
        clientId: mockClientId,
        certificateBase64: 'MIICljCCAX4CCQDhEFuR6YfFjDANBgkqhkiG...',
        privateKeyBase64: 'MIIEvQIBADANBgkqhkiG9w0BAQEFA...'
    }

    beforeEach(() => {
        jest.clearAllMocks()
        process.env.JPMC_DEBUG = 'false'
    })

    afterEach(() => {
        delete process.env.JPMC_DEBUG
    })

    describe('generateClientAssertion', () => {
        it('should generate a valid JWT token', () => {
            const { loadPrivateKey, getCertificateThumbprints } = require('../certificate-loader')
            const jwt = require('jsonwebtoken')

            loadPrivateKey.mockReturnValue(mockPrivateKey)
            getCertificateThumbprints.mockReturnValue({
                hexThumbprint: 'abcd1234abcd1234abcd1234abcd1234abcd1234',
                base64UrlThumbprint: 'abcd1234_abcd1234-abcd1234_abcd1234_abcd1234'
            })
            jwt.sign.mockReturnValue('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRJZCI6InRlc3QifQ.sig')

            const token = generateClientAssertion(mockConfig)

            expect(token).toBe('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRJZCI6InRlc3QifQ.sig')
            expect(loadPrivateKey).toHaveBeenCalledWith(mockConfig)
            expect(getCertificateThumbprints).toHaveBeenCalledWith(mockConfig)
            expect(jwt.sign).toHaveBeenCalled()
        })

        it('should include correct JWT header with thumbprints', () => {
            const { loadPrivateKey, getCertificateThumbprints } = require('../certificate-loader')
            const jwt = require('jsonwebtoken')

            loadPrivateKey.mockReturnValue(mockPrivateKey)
            getCertificateThumbprints.mockReturnValue({
                hexThumbprint: 'hex-thumb-value',
                base64UrlThumbprint: 'base64-thumb-value'
            })
            jwt.sign.mockReturnValue('token')

            generateClientAssertion(mockConfig)

            const signCall = jwt.sign.mock.calls[0]
            const signOptions = signCall[2]

            expect(signOptions.algorithm).toBe('RS256')
            expect(signOptions.header.alg).toBe('RS256')
            expect(signOptions.header.typ).toBe('JWT')
            expect(signOptions.header.x5t).toBe('base64-thumb-value')
            expect(signOptions.header.kid).toBe('hex-thumb-value')
        })

        it('should include required JWT claims', () => {
            const { loadPrivateKey, getCertificateThumbprints } = require('../certificate-loader')
            const jwt = require('jsonwebtoken')

            loadPrivateKey.mockReturnValue(mockPrivateKey)
            getCertificateThumbprints.mockReturnValue({
                hexThumbprint: 'hex',
                base64UrlThumbprint: 'base64'
            })
            jwt.sign.mockReturnValue('token')

            generateClientAssertion(mockConfig)

            const signCall = jwt.sign.mock.calls[0]
            const payload = signCall[0]

            expect(payload.jti).toBeDefined()
            expect(typeof payload.jti).toBe('string')
            expect(payload.iat).toBeDefined()
            expect(typeof payload.iat).toBe('number')
            expect(payload.exp).toBeDefined()
            expect(typeof payload.exp).toBe('number')
            expect(payload.aud).toMatch(/jpmorgan|oauth/i) // Accept any JPMC-related token URI
            expect(payload.iss).toBe(mockClientId)
            expect(payload.sub).toBe(mockClientId)
        })

        it('should set expiration to JWT_EXPIRY_SECONDS from iat', () => {
            const { loadPrivateKey, getCertificateThumbprints } = require('../certificate-loader')
            const jwt = require('jsonwebtoken')

            loadPrivateKey.mockReturnValue(mockPrivateKey)
            getCertificateThumbprints.mockReturnValue({
                hexThumbprint: 'hex',
                base64UrlThumbprint: 'base64'
            })
            jwt.sign.mockReturnValue('token')

            generateClientAssertion(mockConfig)

            const signCall = jwt.sign.mock.calls[0]
            const payload = signCall[0]

            expect(payload.exp - payload.iat).toBe(300) // 5 minutes
        })

        it('should use RS256 algorithm', () => {
            const { loadPrivateKey, getCertificateThumbprints } = require('../certificate-loader')
            const jwt = require('jsonwebtoken')

            loadPrivateKey.mockReturnValue(mockPrivateKey)
            getCertificateThumbprints.mockReturnValue({
                hexThumbprint: 'hex',
                base64UrlThumbprint: 'base64'
            })
            jwt.sign.mockReturnValue('token')

            generateClientAssertion(mockConfig)

            const signCall = jwt.sign.mock.calls[0]
            const signOptions = signCall[2]

            expect(signOptions.algorithm).toBe('RS256')
        })

        it('should throw error when config is null', () => {
            expect(() => generateClientAssertion(null)).toThrow(
                'Config is required for generateClientAssertion'
            )
        })

        it('should throw error when config is undefined', () => {
            expect(() => generateClientAssertion(undefined)).toThrow(
                'Config is required for generateClientAssertion'
            )
        })

        it('should throw error when loadPrivateKey fails', () => {
            const { loadPrivateKey, getCertificateThumbprints } = require('../certificate-loader')
            const jwt = require('jsonwebtoken')

            loadPrivateKey.mockImplementation(() => {
                throw new Error('Invalid key format')
            })

            expect(() => generateClientAssertion(mockConfig)).toThrow(
                'Failed to generate client assertion'
            )
        })

        it('should throw error when getCertificateThumbprints fails', () => {
            const { loadPrivateKey, getCertificateThumbprints } = require('../certificate-loader')

            loadPrivateKey.mockReturnValue(mockPrivateKey)
            getCertificateThumbprints.mockImplementation(() => {
                throw new Error('Certificate parsing failed')
            })

            expect(() => generateClientAssertion(mockConfig)).toThrow(
                'Failed to generate client assertion'
            )
        })

        it('should throw error when jwt.sign fails', () => {
            const { loadPrivateKey, getCertificateThumbprints } = require('../certificate-loader')
            const jwt = require('jsonwebtoken')

            loadPrivateKey.mockReturnValue(mockPrivateKey)
            getCertificateThumbprints.mockReturnValue({
                hexThumbprint: 'hex',
                base64UrlThumbprint: 'base64'
            })
            jwt.sign.mockImplementation(() => {
                throw new Error('Signing failed')
            })

            expect(() => generateClientAssertion(mockConfig)).toThrow(
                'Failed to generate client assertion'
            )
        })

        it('should log successful generation', () => {
            const { loadPrivateKey, getCertificateThumbprints } = require('../certificate-loader')
            const jwt = require('jsonwebtoken')
            const logger = require('../../../utils/logger')

            loadPrivateKey.mockReturnValue(mockPrivateKey)
            getCertificateThumbprints.mockReturnValue({
                hexThumbprint: 'hex',
                base64UrlThumbprint: 'base64'
            })
            jwt.sign.mockReturnValue('token')

            generateClientAssertion(mockConfig)

            expect(logger.info).toHaveBeenCalledWith(
                '[JWT] Client assertion generated successfully'
            )
        })

        it('should log debug info when JPMC_DEBUG is true', () => {
            const { loadPrivateKey, getCertificateThumbprints } = require('../certificate-loader')
            const jwt = require('jsonwebtoken')
            const logger = require('../../../utils/logger')

            process.env.JPMC_DEBUG = 'true'

            loadPrivateKey.mockReturnValue(mockPrivateKey)
            getCertificateThumbprints.mockReturnValue({
                hexThumbprint: 'hex',
                base64UrlThumbprint: 'base64'
            })
            jwt.sign.mockReturnValue('token')

            generateClientAssertion(mockConfig)

            expect(logger.debug).toHaveBeenCalledWith(
                '[JWT] Payload:',
                expect.stringContaining('jti')
            )
        })

        it('should generate unique JTI for each call', () => {
            const { loadPrivateKey, getCertificateThumbprints } = require('../certificate-loader')
            const jwt = require('jsonwebtoken')

            loadPrivateKey.mockReturnValue(mockPrivateKey)
            getCertificateThumbprints.mockReturnValue({
                hexThumbprint: 'hex',
                base64UrlThumbprint: 'base64'
            })

            const jtiValues = new Set()

            jwt.sign.mockImplementation((payload) => {
                jtiValues.add(payload.jti)
                return 'token'
            })

            generateClientAssertion(mockConfig)
            generateClientAssertion(mockConfig)
            generateClientAssertion(mockConfig)

            expect(jtiValues.size).toBe(3) // All different
        })
    })

    describe('decodeJWT', () => {
        it('should decode JWT without verification', () => {
            const jwt = require('jsonwebtoken')

            const mockDecoded = {
                header: { alg: 'RS256', typ: 'JWT' },
                payload: { iss: 'issuer', sub: 'subject' }
            }

            jwt.decode.mockReturnValue(mockDecoded)

            const result = decodeJWT('eyJhbGc...')

            expect(result).toEqual(mockDecoded)
            expect(jwt.decode).toHaveBeenCalledWith('eyJhbGc...', { complete: true })
        })

        it('should return null on decode error', () => {
            const jwt = require('jsonwebtoken')

            jwt.decode.mockImplementation(() => {
                throw new Error('Invalid token')
            })

            const result = decodeJWT('invalid-token')

            expect(result).toBeNull()
        })

        it('should log warning about unverified token', () => {
            const jwt = require('jsonwebtoken')
            const logger = require('../../../utils/logger')

            jwt.decode.mockReturnValue({
                header: {},
                payload: {}
            })

            decodeJWT('token')

            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('decoded WITHOUT signature verification')
            )
        })
    })

    describe('verifyJWT', () => {
        it('should verify valid JWT token', () => {
            const jwt = require('jsonwebtoken')

            const mockPayload = { iss: 'issuer', sub: 'subject', iat: 1234567890 }
            jwt.verify.mockReturnValue(mockPayload)

            const result = verifyJWT('token', mockPrivateKey)

            expect(result).toEqual(mockPayload)
            expect(jwt.verify).toHaveBeenCalledWith(
                'token',
                mockPrivateKey,
                { algorithms: ['RS256'] }
            )
        })

        it('should return null for invalid token', () => {
            const jwt = require('jsonwebtoken')

            jwt.verify.mockImplementation(() => {
                throw new Error('Invalid signature')
            })

            const result = verifyJWT('invalid-token', mockPrivateKey)

            expect(result).toBeNull()
        })

        it('should enforce RS256 algorithm', () => {
            const jwt = require('jsonwebtoken')

            jwt.verify.mockReturnValue({})

            verifyJWT('token', mockPrivateKey)

            expect(jwt.verify).toHaveBeenCalledWith(
                'token',
                mockPrivateKey,
                { algorithms: ['RS256'] }
            )
        })

        it('should log verification errors', () => {
            const jwt = require('jsonwebtoken')
            const logger = require('../../../utils/logger')

            jwt.verify.mockImplementation(() => {
                throw new Error('Expired token')
            })

            verifyJWT('token', mockPrivateKey)

            expect(logger.error).toHaveBeenCalledWith(
                '[JWT] Token verification failed:',
                'Expired token'
            )
        })
    })
})
