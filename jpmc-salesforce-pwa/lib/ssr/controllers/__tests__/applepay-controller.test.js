/**
 * Apple Pay Controller Tests
 * 
 * Tests for the server-side Apple Pay handlers
 */

import {
    configureApplePayController,
    getApplePayConfig,
    handleApplePaySession,
    handleApplePayAuthorize,
    handleApplePayConfig
} from '../applepay-controller'

// Mock dependencies
jest.mock('../../../services/applepay/session.js', () => ({
    validateMerchant: jest.fn().mockResolvedValue({
        epochTimestamp: Date.now(),
        expiresAt: Date.now() + 300000,
        merchantSessionIdentifier: 'session123',
        nonce: 'nonce123',
        merchantIdentifier: 'merchant.test',
        domainName: 'example.com',
        displayName: 'Test Store',
        signedFields: 'merchantIdentifier,merchantSessionIdentifier,displayName'
    })
}))

jest.mock('../../../services/applepay/token-mapper.js', () => ({
    buildJPMorganApplePayPayload: jest.fn().mockReturnValue({
        amount: 9999,
        currency: 'USD',
        paymentMethodType: { card: { type: 'NETWORK_TOKEN' } }
    }),
    parseJPMCApplePayResponse: jest.fn().mockReturnValue({
        success: true,
        transactionId: 'txn123',
        responseStatus: 'APPROVED'
    })
}))

jest.mock('../../../utils/constants.mjs', () => ({
    APPLE_PAY_ERROR_CODES: {
        INVALID_CONFIG: 'INVALID_CONFIG',
        MERCHANT_VALIDATION_FAILED: 'MERCHANT_VALIDATION_FAILED',
        TOKEN_MISSING: 'TOKEN_MISSING',
        AUTHORIZATION_FAILED: 'AUTHORIZATION_FAILED'
    },
    APPLE_PAY_DEFAULTS: {
        latLong: '37.7749,-122.4194'
    }
}))

jest.mock('../../index.js', () => ({
    getJPMCConfigAsync: jest.fn().mockResolvedValue({
        merchantId: 'jpmc-merchant-123',
        apiHost: 'api.jpmorgan.com',
        environment: 'sandbox',
        captureMethod: 'NOW',
        applePayMerchantId: 'merchant.test.applepay',
        applePayMerchantName: 'Test Merchant',
        applePayCountryCode: 'US',
        applePaySupportedNetworks: 'visa,masterCard',
        applePayMerchantCapabilities: 'supports3DS'
    })
}))

jest.mock('../../../services/auth/oauth-service.js', () => ({
    getAccessToken: jest.fn().mockResolvedValue('access-token-123'),
    clearTokenCache: jest.fn()
}))

jest.mock('../../../utils/http/http-client.js', () => ({
    buildJPMCHeaders: jest.fn().mockReturnValue({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer access-token-123',
        'x-merchant-id': 'merchant123',
        'x-request-id': 'req123'
    })
}))

jest.mock('../../../utils/logger.js', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    },
    safeStringify: jest.fn(obj => JSON.stringify(obj))
}))

jest.mock('../../../utils/locale-extractor.js', () => ({
    extractLocale: jest.fn().mockReturnValue(undefined), // Default: no locale specified
    extractSlasToken: jest.fn().mockReturnValue(null)
}))

jest.mock('../../../utils/site-config.js', () => ({
    isDefaultLocale: jest.fn().mockReturnValue(true), // Default: allow Apple Pay
    getDefaultLocale: jest.fn().mockReturnValue('en-US')
}))

// Mock global fetch
global.fetch = jest.fn()

import { validateMerchant } from '../../../services/applepay/session.js'
import { buildJPMorganApplePayPayload, parseJPMCApplePayResponse } from '../../../services/applepay/token-mapper.js'
import { getJPMCConfigAsync } from '../../index.js'
import { getAccessToken, clearTokenCache } from '../../../services/auth/oauth-service.js'
import { extractLocale } from '../../../utils/locale-extractor.js'
import { isDefaultLocale } from '../../../utils/site-config.js'

// Helper to create mock request/response
const createMockReqRes = (overrides = {}) => {
    const req = {
        params: {},
        body: {},
        hostname: 'example.com',
        ...overrides.req
    }
    
    const res = {
        locals: {},
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        ...overrides.res
    }
    
    const next = jest.fn()
    
    return { req, res, next }
}

describe('applepay-controller', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        
        // Reset global fetch mock
        global.fetch.mockReset()
        
        // Configure controller with default settings
        configureApplePayController({
            merchantId: 'merchant.test.applepay',
            merchantName: 'Test Store',
            countryCode: 'US',
            supportedNetworks: ['visa', 'masterCard', 'amex'],
            merchantCapabilities: ['supports3DS'],
            merchantIdentityCert: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
            merchantIdentityKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
            environment: 'sandbox',
            debug: false
        })
    })

    describe('configureApplePayController', () => {
        it('accepts configuration', () => {
            expect(() => {
                configureApplePayController({
                    merchantId: 'merchant.new',
                    merchantName: 'New Store',
                    debug: true
                })
            }).not.toThrow()
        })
    })

    describe('getApplePayConfig', () => {
        it('returns client-safe configuration', () => {
            configureApplePayController({
                merchantId: 'merchant.test',
                merchantName: 'Test',
                countryCode: 'US',
                supportedNetworks: ['visa'],
                merchantCapabilities: ['supports3DS'],
                merchantIdentityCert: 'secret-cert',
                merchantIdentityKey: 'secret-key',
                environment: 'sandbox'
            })

            const config = getApplePayConfig()

            expect(config).toEqual(expect.objectContaining({
                merchantId: 'merchant.test',
                merchantName: 'Test',
                countryCode: 'US',
                supportedNetworks: ['visa'],
                merchantCapabilities: ['supports3DS'],
                environment: 'sandbox',
                isConfigured: true
            }))

            // Should NOT include secrets
            expect(config.merchantIdentityCert).toBeUndefined()
            expect(config.merchantIdentityKey).toBeUndefined()
        })

        it('indicates not configured when cert is missing', () => {
            configureApplePayController({
                merchantId: 'merchant.test',
                merchantIdentityCert: null,
                merchantIdentityKey: null,
                loadCertificates: null
            })

            const config = getApplePayConfig()

            expect(config.isConfigured).toBe(false)
        })

        it('indicates configured when loadCertificates function is provided', () => {
            configureApplePayController({
                merchantId: 'merchant.test',
                merchantIdentityCert: null,
                merchantIdentityKey: null,
                loadCertificates: jest.fn()
            })

            const config = getApplePayConfig()

            expect(config.isConfigured).toBe(true)
        })
    })

    describe('handleApplePaySession', () => {
        it('validates merchant successfully', async () => {
            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        validationURL: 'https://apple-pay-gateway.apple.com/validate',
                        // Client-provided values are intentionally ignored for security
                        // The server uses BM config instead
                        domain: 'example.com',
                        merchantId: 'merchant.test',
                        merchantName: 'Test Store'
                    }
                }
            })

            await handleApplePaySession(req, res, next)

            // Server resolves merchant identity from BM config, ignoring client values
            // This prevents client-side override of merchant configuration
            expect(validateMerchant).toHaveBeenCalledWith(expect.objectContaining({
                validationURL: 'https://apple-pay-gateway.apple.com/validate',
                merchantId: 'merchant.test.applepay',  // From BM config, not client
                merchantName: 'Test Merchant',          // From BM config, not client
                domain: 'example.com'                   // From req.hostname, not client
            }))
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                merchantSessionIdentifier: 'session123'
            }))
        })

        it('returns 400 when validationURL is missing', async () => {
            const { req, res, next } = createMockReqRes({
                req: {
                    body: {}
                }
            })

            await handleApplePaySession(req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.objectContaining({
                    code: 'INVALID_CONFIG',
                    message: 'validationURL is required'
                })
            }))
        })

        it('rejects non-default locale requests', async () => {
            // Mock isDefaultLocale to return false (non-default locale)
            isDefaultLocale.mockReturnValueOnce(false)

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        validationURL: 'https://apple-pay-gateway.apple.com/validate'
                    }
                }
            })

            await handleApplePaySession(req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.objectContaining({
                    code: 'INVALID_CONFIG',
                    message: expect.stringContaining('default locale')
                })
            }))
        })

        it('accepts default locale requests', async () => {
            // Mock isDefaultLocale to return true (default locale)
            isDefaultLocale.mockReturnValueOnce(true)

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        validationURL: 'https://apple-pay-gateway.apple.com/validate',
                        merchantId: 'merchant.test',
                        merchantName: 'Test Store'
                    }
                }
            })

            await handleApplePaySession(req, res, next)

            expect(validateMerchant).toHaveBeenCalled()
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                merchantSessionIdentifier: 'session123'
            }))
        })

        it('returns 400 for non-apple.com validation URL', async () => {
            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        validationURL: 'https://malicious-site.com/validate'
                    }
                }
            })

            await handleApplePaySession(req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    code: 'MERCHANT_VALIDATION_FAILED',
                    message: expect.stringContaining('apple.com')
                })
            }))
        })

        it('falls back to BM config when merchantId not in body', async () => {
            // Clear the controller's merchantId so it falls back to BM config
            configureApplePayController({
                merchantId: null,
                merchantName: 'Test Store',
                merchantIdentityCert: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
                merchantIdentityKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----'
            })

            getJPMCConfigAsync.mockResolvedValueOnce({
                applePayMerchantId: 'merchant.from.bm',
                applePayMerchantName: 'BM Merchant'
            })

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        validationURL: 'https://apple-pay-gateway.apple.com/validate'
                    }
                }
            })

            await handleApplePaySession(req, res, next)

            expect(validateMerchant).toHaveBeenCalledWith(expect.objectContaining({
                merchantId: 'merchant.from.bm'
            }))
        })

        it('uses domain from request hostname when not provided', async () => {
            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        validationURL: 'https://apple-pay-gateway.apple.com/validate'
                    },
                    hostname: 'mystore.com'
                }
            })

            await handleApplePaySession(req, res, next)

            expect(validateMerchant).toHaveBeenCalledWith(expect.objectContaining({
                domain: 'mystore.com'
            }))
        })

        it('handles validation failure with known error code', async () => {
            validateMerchant.mockRejectedValueOnce({
                code: 'CERT_EXPIRED',
                message: 'Certificate has expired'
            })

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        validationURL: 'https://apple-pay-gateway.apple.com/validate'
                    }
                }
            })

            await handleApplePaySession(req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    code: 'CERT_EXPIRED'
                })
            }))
        })

        it('handles multi-locale auth error', async () => {
            validateMerchant.mockRejectedValueOnce({
                code: 'MULTI_LOCALE_AUTH_ERROR',
                message: 'Auth required'
            })

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        validationURL: 'https://apple-pay-gateway.apple.com/validate'
                    }
                }
            })

            await handleApplePaySession(req, res, next)

            expect(res.status).toHaveBeenCalledWith(401)
        })

        it('passes unknown errors to next middleware', async () => {
            const unknownError = new Error('Unknown error')
            validateMerchant.mockRejectedValueOnce(unknownError)

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        validationURL: 'https://apple-pay-gateway.apple.com/validate'
                    }
                }
            })

            await handleApplePaySession(req, res, next)

            expect(next).toHaveBeenCalledWith(unknownError)
        })
    })

    describe('handleApplePayAuthorize', () => {
        beforeEach(() => {
            global.fetch.mockResolvedValue({
                status: 200,
                json: () => Promise.resolve({
                    responseStatus: 'APPROVED',
                    transactionId: 'txn123'
                })
            })
        })

        it('authorizes payment successfully', async () => {
            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        applePayToken: { paymentData: 'encrypted-data' },
                        amount: '99.99',
                        currency: 'USD',
                        merchantOrderNumber: 'ORDER123'
                    }
                }
            })

            await handleApplePayAuthorize(req, res, next)

            expect(buildJPMorganApplePayPayload).toHaveBeenCalledWith(expect.objectContaining({
                applePayToken: { paymentData: 'encrypted-data' },
                amount: 9999, // converted to minor units
                currency: 'USD',
                merchantOrderNumber: 'ORDER123'
            }))
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true
            }))
        })

        it('returns 400 when applePayToken is missing', async () => {
            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        amount: '99.99'
                    }
                }
            })

            await handleApplePayAuthorize(req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    code: 'TOKEN_MISSING'
                })
            }))
        })

        it('rejects non-default locale requests', async () => {
            // Mock isDefaultLocale to return false (non-default locale)
            isDefaultLocale.mockReturnValueOnce(false)

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        applePayToken: { paymentData: 'encrypted-data' },
                        amount: '99.99',
                        currency: 'USD'
                    }
                }
            })

            await handleApplePayAuthorize(req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.objectContaining({
                    code: 'LOCALE_NOT_SUPPORTED',
                    message: expect.stringContaining('default locale')
                })
            }))
        })

        it('accepts default locale requests', async () => {
            // Mock isDefaultLocale to return true (default locale)
            isDefaultLocale.mockReturnValueOnce(true)

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        applePayToken: { paymentData: 'encrypted-data' },
                        amount: '99.99',
                        currency: 'USD'
                    }
                }
            })

            await handleApplePayAuthorize(req, res, next)

            expect(buildJPMorganApplePayPayload).toHaveBeenCalled()
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true
            }))
        })

        it('returns 400 when amount is missing', async () => {
            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        applePayToken: { paymentData: 'data' }
                    }
                }
            })

            await handleApplePayAuthorize(req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    code: 'INVALID_CONFIG',
                    message: 'Payment amount is required'
                })
            }))
        })

        it('includes billingContact and shippingContact in payload', async () => {
            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        applePayToken: { paymentData: 'data' },
                        amount: '99.99',
                        billingContact: { locality: 'NYC' },
                        shippingContact: { locality: 'LA' }
                    }
                }
            })

            await handleApplePayAuthorize(req, res, next)

            expect(buildJPMorganApplePayPayload).toHaveBeenCalledWith(expect.objectContaining({
                billingContact: { locality: 'NYC' },
                shippingContact: { locality: 'LA' }
            }))
        })

        it('uses captureMethod from request body', async () => {
            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        applePayToken: { paymentData: 'data' },
                        amount: '99.99',
                        captureMethod: 'MANUAL'
                    }
                }
            })

            await handleApplePayAuthorize(req, res, next)

            expect(buildJPMorganApplePayPayload).toHaveBeenCalledWith(expect.objectContaining({
                captureMethod: 'MANUAL'
            }))
        })

        it('falls back to BM config for captureMethod', async () => {
            getJPMCConfigAsync.mockResolvedValueOnce({
                apiHost: 'api.jpmc.com',
                merchantId: 'merchant123',
                captureMethod: 'NOW'
            })

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        applePayToken: { paymentData: 'data' },
                        amount: '99.99'
                    }
                }
            })

            await handleApplePayAuthorize(req, res, next)

            expect(buildJPMorganApplePayPayload).toHaveBeenCalledWith(expect.objectContaining({
                captureMethod: 'NOW'
            }))
        })

        it('retries on 401 response', async () => {
            global.fetch
                .mockResolvedValueOnce({
                    status: 401,
                    json: () => Promise.resolve({ error: 'Unauthorized' })
                })
                .mockResolvedValueOnce({
                    status: 200,
                    json: () => Promise.resolve({
                        responseStatus: 'APPROVED',
                        transactionId: 'txn123'
                    })
                })

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        applePayToken: { paymentData: 'data' },
                        amount: '99.99'
                    }
                }
            })

            await handleApplePayAuthorize(req, res, next)

            expect(clearTokenCache).toHaveBeenCalled()
            expect(getAccessToken).toHaveBeenCalledTimes(2)
            expect(global.fetch).toHaveBeenCalledTimes(2)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true
            }))
        })

        it('handles authorization failure', async () => {
            parseJPMCApplePayResponse.mockReturnValueOnce({
                success: false,
                responseCode: 'DECLINED',
                responseMessage: 'Card declined'
            })

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        applePayToken: { paymentData: 'data' },
                        amount: '99.99'
                    }
                }
            })

            await handleApplePayAuthorize(req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.objectContaining({
                    code: 'DECLINED'
                })
            }))
        })

        it('handles OAuth token fetch failure', async () => {
            getAccessToken.mockRejectedValueOnce(new Error('OAuth failed'))

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        applePayToken: { paymentData: 'data' },
                        amount: '99.99'
                    }
                }
            })

            await handleApplePayAuthorize(req, res, next)

            expect(res.status).toHaveBeenCalledWith(500)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    code: 'AUTHENTICATION_ERROR'
                })
            }))
        })

        it('handles multi-locale auth error', async () => {
            getJPMCConfigAsync.mockRejectedValueOnce({
                code: 'MULTI_LOCALE_AUTH_ERROR',
                message: 'Auth required',
                statusCode: 401
            })

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        applePayToken: { paymentData: 'data' },
                        amount: '99.99'
                    }
                }
            })

            await handleApplePayAuthorize(req, res, next)

            expect(res.status).toHaveBeenCalledWith(401)
        })

        it('passes unknown errors to next middleware', async () => {
            const unknownError = new Error('Network error')
            global.fetch.mockRejectedValueOnce(unknownError)

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        applePayToken: { paymentData: 'data' },
                        amount: '99.99'
                    }
                }
            })

            await handleApplePayAuthorize(req, res, next)

            expect(next).toHaveBeenCalledWith(unknownError)
        })
    })

    describe('handleApplePayConfig', () => {
        it('rejects non-default locale requests', async () => {
            // Mock isDefaultLocale to return false (non-default locale)
            isDefaultLocale.mockReturnValueOnce(false)

            const { req, res } = createMockReqRes()

            await handleApplePayConfig(req, res)

            expect(res.status).toHaveBeenCalledWith(200)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                isConfigured: false,
                message: expect.stringContaining('default locale')
            }))
        })

        it('accepts default locale requests', async () => {
            // Mock isDefaultLocale to return true (default locale)
            isDefaultLocale.mockReturnValueOnce(true)

            getJPMCConfigAsync.mockResolvedValueOnce({
                applePayMerchantId: 'merchant.test',
                applePayMerchantName: 'Test Store'
            })

            const { req, res } = createMockReqRes()

            await handleApplePayConfig(req, res)

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                merchantId: 'merchant.test',
                merchantName: 'Test Store'
            }))
        })

        it('returns merged config from BM and controller', async () => {
            getJPMCConfigAsync.mockResolvedValueOnce({
                applePayMerchantId: 'merchant.from.bm',
                applePayMerchantName: 'BM Store',
                applePayCountryCode: 'CA',
                applePaySupportedNetworks: 'visa,masterCard,amex',
                applePayMerchantCapabilities: 'supports3DS,supportsEMV'
            })

            const { req, res, next } = createMockReqRes()

            await handleApplePayConfig(req, res)

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                merchantId: 'merchant.from.bm',
                merchantName: 'BM Store',
                countryCode: 'CA',
                supportedNetworks: ['visa', 'masterCard', 'amex'],
                merchantCapabilities: ['supports3DS', 'supportsEMV']
            }))
        })

        it('falls back to controller config when BM fetch fails', async () => {
            getJPMCConfigAsync.mockRejectedValueOnce(new Error('BM fetch failed'))

            configureApplePayController({
                merchantId: 'merchant.fallback',
                merchantName: 'Fallback Store',
                countryCode: 'US',
                supportedNetworks: ['visa'],
                merchantCapabilities: ['supports3DS'],
                environment: 'sandbox',
                merchantIdentityCert: 'cert'
            })

            const { req, res, next } = createMockReqRes()

            await handleApplePayConfig(req, res)

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                merchantId: 'merchant.fallback',
                merchantName: 'Fallback Store'
            }))
        })

        it('handles array values from BM for networks', async () => {
            getJPMCConfigAsync.mockResolvedValueOnce({
                applePayMerchantId: 'merchant.test',
                applePaySupportedNetworks: ['visa', 'masterCard'] // Already an array
            })

            const { req, res, next } = createMockReqRes()

            await handleApplePayConfig(req, res)

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                supportedNetworks: ['visa', 'masterCard']
            }))
        })

        it('returns isConfigured based on cert availability', async () => {
            getJPMCConfigAsync.mockResolvedValueOnce({
                applePayMerchantId: 'merchant.test'
            })

            configureApplePayController({
                merchantId: 'merchant.test',
                merchantIdentityCert: 'cert-data',
                merchantIdentityKey: 'key-data'
            })

            const { req, res, next } = createMockReqRes()

            await handleApplePayConfig(req, res)

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                isConfigured: true
            }))
        })

        it('checks env var for cert availability', async () => {
            const originalEnv = process.env.APPLE_PAY_MERCHANT_IDENTITY_CERT_BASE64
            process.env.APPLE_PAY_MERCHANT_IDENTITY_CERT_BASE64 = 'base64-cert'

            getJPMCConfigAsync.mockResolvedValueOnce({
                applePayMerchantId: 'merchant.test'
            })

            configureApplePayController({
                merchantId: 'merchant.test',
                merchantIdentityCert: null,
                loadCertificates: null
            })

            const { req, res, next } = createMockReqRes()

            await handleApplePayConfig(req, res)

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                isConfigured: true
            }))

            process.env.APPLE_PAY_MERCHANT_IDENTITY_CERT_BASE64 = originalEnv
        })
    })

    describe('certificate loading', () => {
        it('handles loadCertificates function', async () => {
            const mockCerts = {
                cert: 'loaded-cert',
                key: 'loaded-key',
                passphrase: 'pass'
            }
            
            configureApplePayController({
                merchantId: 'merchant.test',
                merchantIdentityCert: null,
                merchantIdentityKey: null,
                loadCertificates: jest.fn().mockResolvedValue(mockCerts)
            })

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        validationURL: 'https://apple-pay-gateway.apple.com/validate',
                        merchantId: 'merchant.test'
                    }
                }
            })

            await handleApplePaySession(req, res, next)

            expect(validateMerchant).toHaveBeenCalledWith(expect.objectContaining({
                merchantIdentityCert: 'loaded-cert',
                merchantIdentityKey: 'loaded-key',
                merchantIdentityPassphrase: 'pass'
            }))
        })

        it('handles base64 encoded certs from env', async () => {
            const originalCert = process.env.APPLE_PAY_MERCHANT_IDENTITY_CERT_BASE64
            const originalKey = process.env.APPLE_PAY_MERCHANT_IDENTITY_KEY_BASE64
            
            process.env.APPLE_PAY_MERCHANT_IDENTITY_CERT_BASE64 = Buffer.from('cert-content').toString('base64')
            process.env.APPLE_PAY_MERCHANT_IDENTITY_KEY_BASE64 = Buffer.from('key-content').toString('base64')

            configureApplePayController({
                merchantId: 'merchant.test',
                merchantIdentityCert: null,
                merchantIdentityKey: null,
                loadCertificates: null
            })

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        validationURL: 'https://apple-pay-gateway.apple.com/validate',
                        merchantId: 'merchant.test'
                    }
                }
            })

            await handleApplePaySession(req, res, next)

            expect(validateMerchant).toHaveBeenCalledWith(expect.objectContaining({
                merchantIdentityCert: 'cert-content',
                merchantIdentityKey: 'key-content'
            }))

            process.env.APPLE_PAY_MERCHANT_IDENTITY_CERT_BASE64 = originalCert
            process.env.APPLE_PAY_MERCHANT_IDENTITY_KEY_BASE64 = originalKey
        })

        it('throws error when certificates not configured', async () => {
            const originalCert = process.env.APPLE_PAY_MERCHANT_IDENTITY_CERT_BASE64
            const originalKey = process.env.APPLE_PAY_MERCHANT_IDENTITY_KEY_BASE64
            
            delete process.env.APPLE_PAY_MERCHANT_IDENTITY_CERT_BASE64
            delete process.env.APPLE_PAY_MERCHANT_IDENTITY_KEY_BASE64

            configureApplePayController({
                merchantId: 'merchant.test',
                merchantIdentityCert: null,
                merchantIdentityKey: null,
                loadCertificates: null
            })

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        validationURL: 'https://apple-pay-gateway.apple.com/validate',
                        merchantId: 'merchant.test'
                    }
                }
            })

            await handleApplePaySession(req, res, next)

            // Should pass error to next middleware
            expect(next).toHaveBeenCalledWith(expect.any(Error))

            process.env.APPLE_PAY_MERCHANT_IDENTITY_CERT_BASE64 = originalCert
            process.env.APPLE_PAY_MERCHANT_IDENTITY_KEY_BASE64 = originalKey
        })
    })

    describe('debug mode', () => {
        it('logs debug info when debug is enabled', async () => {
            const logger = require('../../../utils/logger.js').default

            configureApplePayController({
                merchantId: 'merchant.test',
                merchantIdentityCert: 'cert',
                merchantIdentityKey: 'key',
                debug: true
            })

            const { req, res, next } = createMockReqRes({
                req: {
                    body: {
                        validationURL: 'https://apple-pay-gateway.apple.com/validate'
                    }
                }
            })

            await handleApplePaySession(req, res, next)

            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[ApplePay Session]'),
                expect.anything()
            )
        })
    })
})
