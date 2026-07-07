/**
 * Tests for Certificate Loader
 * 
 * Tests certificate and private key loading, caching, and thumbprint calculation
 */

import * as certificateLoader from '../certificate-loader'

jest.mock('node:fs')
jest.mock('node:path')
jest.mock('node-forge')

jest.mock('../../../utils/config/env-loader', () => ({
    isServerSide: jest.fn(() => true)
}))

jest.mock('../../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}))

describe('Certificate Loader', () => {
    const mockCertificatePem = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAJC1/iNAZwqDMA0GCSqGSIb3DQEBBQUAMEUxCzAJBgNV
-----END CERTIFICATE-----`

    const mockPrivateKeyPem = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj
-----END PRIVATE KEY-----`

    const mockConfig = {
        clientId: 'test-client-id',
        certificateBase64: 'TUlJRFhUQ0NBa1dnQXdJQkFnSUpBSkMxL2lOQVp3cURNQTBHQ1NxR1NJYjNEUUVCQlFVQU1FVXhDekFKQmdOVkJB',
        privateKeyBase64: 'TUlJRXZRSUJBREFOQmdrcWhraUc5dzBCQVFFRkFBU0NCS2N3Z2dTakFnRUFBb0lCQVFDN1ZKVFVFdTlVczhjS2o='
    }

    beforeEach(() => {
        jest.clearAllMocks()
        certificateLoader.clearCertificateCache()
    })

    describe('clearCertificateCache', () => {
        it('should clear all cached values', () => {
            const logger = require('../../../utils/logger')

            certificateLoader.clearCertificateCache()

            expect(logger.info).toHaveBeenCalledWith('[Certificate] Cache cleared')
        })
    })

    describe('loadCertificate', () => {
        it('should throw error when config is null', () => {
            expect(() => certificateLoader.loadCertificate(null)).toThrow(
                'Config is required for loadCertificate'
            )
        })

        it('should throw error when config is undefined', () => {
            expect(() => certificateLoader.loadCertificate(undefined)).toThrow(
                'Config is required for loadCertificate'
            )
        })

        it('should load certificate from base64', () => {
            global.Buffer = {
                from: jest.fn((str, encoding) => ({
                    toString: jest.fn(() => mockCertificatePem)
                }))
            }

            const cert = certificateLoader.loadCertificate(mockConfig)

            expect(cert).toBe(mockCertificatePem)
            expect(global.Buffer.from).toHaveBeenCalledWith(
                mockConfig.certificateBase64,
                'base64'
            )
        })

        it('should cache certificate after loading and return same instance', () => {
            global.Buffer = {
                from: jest.fn((str, encoding) => ({
                    toString: jest.fn(() => mockCertificatePem)
                }))
            }

            const cert1 = certificateLoader.loadCertificate(mockConfig)
            const cert2 = certificateLoader.loadCertificate(mockConfig)

            // Both should be the same
            expect(cert1).toBe(cert2)
            // Buffer.from should only be called once (cached after first call)
            expect(global.Buffer.from).toHaveBeenCalledTimes(1)
        })

        it('should throw error when certificate not configured', () => {
            const config = { clientId: 'test' }

            expect(() => certificateLoader.loadCertificate(config)).toThrow(
                'No certificate configured'
            )
        })

        it('should throw error when loadCertificate fails', () => {
            global.Buffer = {
                from: jest.fn(() => {
                    throw new Error('Invalid base64')
                })
            }

            expect(() => certificateLoader.loadCertificate(mockConfig)).toThrow()
        })
    })

    describe('loadPrivateKey', () => {
        it('should throw error when config is null', () => {
            expect(() => certificateLoader.loadPrivateKey(null)).toThrow(
                'Config is required for loadPrivateKey'
            )
        })

        it('should throw error when config is undefined', () => {
            expect(() => certificateLoader.loadPrivateKey(undefined)).toThrow(
                'Config is required for loadPrivateKey'
            )
        })

        it('should load private key from base64', () => {
            global.Buffer = {
                from: jest.fn((str, encoding) => ({
                    toString: jest.fn(() => mockPrivateKeyPem)
                }))
            }

            const key = certificateLoader.loadPrivateKey(mockConfig)

            expect(key).toBe(mockPrivateKeyPem)
            expect(global.Buffer.from).toHaveBeenCalledWith(
                mockConfig.privateKeyBase64,
                'base64'
            )
        })

        it('should cache private key after loading and return same instance', () => {
            global.Buffer = {
                from: jest.fn((str, encoding) => ({
                    toString: jest.fn(() => mockPrivateKeyPem)
                }))
            }

            const key1 = certificateLoader.loadPrivateKey(mockConfig)
            const key2 = certificateLoader.loadPrivateKey(mockConfig)

            expect(key1).toBe(key2)
            // Buffer.from should only be called once (cached after first call)
            expect(global.Buffer.from).toHaveBeenCalledTimes(1)
        })

        it('should throw error when private key not configured', () => {
            const config = { clientId: 'test' }

            expect(() => certificateLoader.loadPrivateKey(config)).toThrow(
                'No private key configured'
            )
        })

        it('should use separate cache for different clients', () => {
            global.Buffer = {
                from: jest.fn((str, encoding) => ({
                    toString: jest.fn(() => mockPrivateKeyPem)
                }))
            }

            const config1 = { clientId: 'client-1', privateKeyBase64: 'key1' }
            const config2 = { clientId: 'client-2', privateKeyBase64: 'key2' }

            const key1a = certificateLoader.loadPrivateKey(config1)
            const key1b = certificateLoader.loadPrivateKey(config1)
            const key2a = certificateLoader.loadPrivateKey(config2)
            const key2b = certificateLoader.loadPrivateKey(config2)

            // Same client should return same cached value
            expect(key1a).toBe(key1b)
            expect(key2a).toBe(key2b)
            // Buffer.from called twice (once per client, as each gets separately cached)
            expect(global.Buffer.from).toHaveBeenCalledTimes(2)
        })

        it('should throw error when loadPrivateKey fails', () => {
            global.Buffer = {
                from: jest.fn(() => {
                    throw new Error('Invalid base64')
                })
            }

            expect(() => certificateLoader.loadPrivateKey(mockConfig)).toThrow()
        })
    })

    describe('getCertificateThumbprints', () => {
        it('should throw error when config is null', () => {
            expect(() => certificateLoader.getCertificateThumbprints(null)).toThrow()
        })

        it('should call forge to generate thumbprints', () => {
            const forge = require('node-forge')

            global.Buffer = {
                from: jest.fn((str, encoding) => ({
                    toString: jest.fn(() => mockCertificatePem)
                }))
            }

            const certificateMock = { 
                publicKey: { n: { toString: () => 'modulus' } }
            }

            const derMock = {
                bytes: jest.fn(() => 'der-bytes')
            }

            forge.pki = {
                certificateFromPem: jest.fn(() => certificateMock),
                certificateToAsn1: jest.fn(() => ({}))
            }

            forge.asn1 = {
                toDer: jest.fn(() => derMock)
            }

            forge.md = {
                sha1: {
                    create: jest.fn(() => ({
                        update: jest.fn().mockReturnThis(),
                        digest: jest.fn(() => ({
                            bytes: jest.fn(() => 'hash-bytes')
                        }))
                    }))
                }
            }

            forge.util = {
                bytesToHex: jest.fn(() => 'abcd1234abcd1234abcd1234abcd1234abcd1234'),
                encode64: jest.fn(() => 'base64-encoded-value')
            }

            const thumbprints = certificateLoader.getCertificateThumbprints(mockConfig)

            expect(thumbprints).toHaveProperty('hexThumbprint')
            expect(thumbprints).toHaveProperty('base64UrlThumbprint')
            expect(forge.pki.certificateFromPem).toHaveBeenCalled()
            expect(forge.md.sha1.create).toHaveBeenCalled()
        })
    })

    describe('getCertificateThumbprint', () => {
        it('should return hex thumbprint string', () => {
            const forge = require('node-forge')

            global.Buffer = {
                from: jest.fn((str, encoding) => ({
                    toString: jest.fn(() => mockCertificatePem)
                }))
            }

            const certificateMock = { 
                publicKey: { n: { toString: () => 'modulus' } }
            }

            const derMock = {
                bytes: jest.fn(() => 'der-bytes')
            }

            forge.pki = {
                certificateFromPem: jest.fn(() => certificateMock),
                certificateToAsn1: jest.fn(() => ({}))
            }

            forge.asn1 = {
                toDer: jest.fn(() => derMock)
            }

            forge.md = {
                sha1: {
                    create: jest.fn(() => ({
                        update: jest.fn().mockReturnThis(),
                        digest: jest.fn(() => ({
                            bytes: jest.fn(() => 'hash-bytes')
                        }))
                    }))
                }
            }

            forge.util = {
                bytesToHex: jest.fn(() => 'abcd1234efgh5678'),
                encode64: jest.fn(() => 'base64-encoded-value')
            }

            const thumbprint = certificateLoader.getCertificateThumbprint(mockConfig)

            expect(typeof thumbprint).toBe('string')
            expect(thumbprint.length).toBeGreaterThan(0)
            expect(forge.pki.certificateFromPem).toHaveBeenCalled()
        })
    })
})
