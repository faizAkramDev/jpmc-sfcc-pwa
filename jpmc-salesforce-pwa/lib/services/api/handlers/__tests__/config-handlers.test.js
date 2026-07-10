/**
 * Unit Tests for Configuration Handlers
 *
 * @jest-environment node
 */

// Mock dependencies BEFORE requiring modules
jest.mock('../../../../ssr', () => ({
    getJPMCConfigAsync: jest.fn()
}))

jest.mock('../../../sfcc/site-preferences', () => ({
    getApplePayPreferences: jest.fn()
}))

jest.mock('../../../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}))

const { parseAllowedShippingCountries, handleGetGooglePayConfig, handleGetFraudConfig, handleGetConfig, handleGetApplePayConfig } = require('../config-handlers')
const { getJPMCConfigAsync } = require('../../../../ssr')
const { getApplePayPreferences } = require('../../../sfcc/site-preferences')
const logger = require('../../../../utils/logger')
jest.mock('../../../../utils/locale-extractor', () => ({
    extractLocale: jest.fn(),
    extractSlasToken: jest.fn()
}))
jest.mock('../../../../utils/site-config.js', () => ({
    isDefaultLocale: jest.fn()
}))
const localeExtractor = require('../../../../utils/locale-extractor')
const siteConfig = require('../../../../utils/site-config.js')

// =============================================================================
// Test Data
// =============================================================================

const mockGooglePayConfig = {
    merchantId: '998482157630',
    googlePayGatewayMerchantId: '998482157630',
    googlePayEnvironment: 'TEST',
    googlePayMerchantName: 'Test Merchant',
    googlePayGateway: 'jpmorganchase',
    googlePayAllowedCardNetworks: 'VISA,MASTERCARD,AMEX',
    googlePayAllowedAuthMethods: 'PAN_ONLY,CRYPTOGRAM_3DS',
    googlePayCartEnabled: true,
    googlePayPDPEnabled: false,
    googlePayAllowedShippingCountries: 'US,CA,MX'
}

// =============================================================================
// parseAllowedShippingCountries Tests
// =============================================================================

describe('config-handlers', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('parseAllowedShippingCountries', () => {
        it('should parse comma-separated country codes', () => {
            const result = parseAllowedShippingCountries('US,CA,MX')
            expect(result).toEqual(['US', 'CA', 'MX'])
        })

        it('should handle spaces around country codes', () => {
            const result = parseAllowedShippingCountries('US, CA, MX')
            expect(result).toEqual(['US', 'CA', 'MX'])
        })

        it('should convert lowercase to uppercase', () => {
            const result = parseAllowedShippingCountries('us,ca,mx')
            expect(result).toEqual(['US', 'CA', 'MX'])
        })

        it('should handle mixed case', () => {
            const result = parseAllowedShippingCountries('Us,cA,Mx')
            expect(result).toEqual(['US', 'CA', 'MX'])
        })

        it('should return empty array for undefined input', () => {
            const result = parseAllowedShippingCountries(undefined)
            expect(result).toEqual([])
        })

        it('should return empty array for null input', () => {
            const result = parseAllowedShippingCountries(null)
            expect(result).toEqual([])
        })

        it('should return empty array for empty string', () => {
            const result = parseAllowedShippingCountries('')
            expect(result).toEqual([])
        })

        it('should return empty array for non-string input', () => {
            const result = parseAllowedShippingCountries(123)
            expect(result).toEqual([])
        })

        it('should filter out invalid country codes (too long)', () => {
            const result = parseAllowedShippingCountries('US,USA,CA')
            expect(result).toEqual(['US', 'CA'])
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Invalid country code ignored: "USA"')
            )
        })

        it('should filter out invalid country codes (too short)', () => {
            const result = parseAllowedShippingCountries('US,A,CA')
            expect(result).toEqual(['US', 'CA'])
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Invalid country code ignored: "A"')
            )
        })

        it('should filter out invalid country codes (contains numbers)', () => {
            const result = parseAllowedShippingCountries('US,U2,CA')
            expect(result).toEqual(['US', 'CA'])
        })

        it('should handle single country code', () => {
            const result = parseAllowedShippingCountries('US')
            expect(result).toEqual(['US'])
        })

        it('should filter out empty entries from extra commas', () => {
            const result = parseAllowedShippingCountries('US,,CA,')
            expect(result).toEqual(['US', 'CA'])
        })
    })

    // =========================================================================
    // handleGetGooglePayConfig Tests
    // =========================================================================

    describe('handleGetGooglePayConfig', () => {
        let mockReq
        let mockRes

        beforeEach(() => {
            mockReq = {}
            mockRes = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            }
        })

        it('should return Google Pay config with parsed shipping countries', async () => {
            getJPMCConfigAsync.mockResolvedValue(mockGooglePayConfig)

            await handleGetGooglePayConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    allowedShippingCountries: ['US', 'CA', 'MX'],
                    cartEnabled: true,
                    pdpEnabled: false
                })
            )
        })

        it('should handle string "true" for cartEnabled', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                ...mockGooglePayConfig,
                googlePayCartEnabled: 'true'
            })

            await handleGetGooglePayConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    cartEnabled: true
                })
            )
        })

        it('should return empty array when allowedShippingCountries is not configured', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                ...mockGooglePayConfig,
                googlePayAllowedShippingCountries: undefined
            })

            await handleGetGooglePayConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    allowedShippingCountries: []
                })
            )
        })

        it('should return 500 when required config is missing', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                merchantId: '998482157630'
                // Missing required Google Pay config
            })

            await handleGetGooglePayConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(500)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'CONFIGURATION_ERROR'
                })
            )
        })

        it('should return 500 on exception', async () => {
            getJPMCConfigAsync.mockRejectedValue(new Error('Config fetch failed'))

            await handleGetGooglePayConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(500)
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                errorCode: 'CONFIGURATION_ERROR',
                message: 'Failed to retrieve Google Pay configuration.'
            })
        })

        it('should require googlePayMerchantId for PRODUCTION environment', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                ...mockGooglePayConfig,
                googlePayEnvironment: 'PRODUCTION',
                googlePayMerchantId: undefined
            })

            await handleGetGooglePayConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(500)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    missingConfigurations: expect.arrayContaining([
                        expect.stringContaining('JPMCGooglePayMerchantId')
                    ])
                })
            )
        })

        it('should include merchantId in merchantInfo for PRODUCTION', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                ...mockGooglePayConfig,
                googlePayEnvironment: 'PRODUCTION',
                googlePayMerchantId: 'BCR2DN4T12345'
            })

            await handleGetGooglePayConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    merchantInfo: {
                        merchantName: 'Test Merchant',
                        merchantId: 'BCR2DN4T12345'
                    }
                })
            )
        })

        it('should not include merchantId for TEST environment', async () => {
            getJPMCConfigAsync.mockResolvedValue(mockGooglePayConfig)

            await handleGetGooglePayConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    merchantInfo: {
                        merchantName: 'Test Merchant'
                        // No merchantId for TEST
                    }
                })
            )
        })

        it('should use fallback gatewayMerchantId when googlePayGatewayMerchantId not set', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                ...mockGooglePayConfig,
                googlePayGatewayMerchantId: undefined
                // Will fallback to merchantId
            })

            await handleGetGooglePayConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    gatewayMerchantId: '998482157630'
                })
            )
        })

        it('should handle missing googlePayGatewayMerchantId AND merchantId', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                ...mockGooglePayConfig,
                googlePayGatewayMerchantId: undefined,
                merchantId: undefined
            })

            await handleGetGooglePayConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(500)
        })

        it('should log config values when successfully retrieved', async () => {
            getJPMCConfigAsync.mockResolvedValue(mockGooglePayConfig)

            await handleGetGooglePayConfig(mockReq, mockRes)

            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[JPMC Google Pay]')
            )
        })

        it('should return false for cartEnabled when not configured', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                ...mockGooglePayConfig,
                googlePayCartEnabled: false
            })

            await handleGetGooglePayConfig(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    cartEnabled: false
                })
            )
        })
    })

    // =========================================================================
    // handleGetFraudConfig Tests
    // =========================================================================

    describe('handleGetFraudConfig', () => {
        let mockReq, mockRes

        beforeEach(() => {
            mockReq = {}
            mockRes = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            }
        })

        it('should return fraud config with enableFraudCheck true', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                enableFraudCheck: true,
                enableFraudCheckAtAuth: true,
                kountClientId: 'test-kount-id',
                kountEnvironment: 'PROD'
            })

            await handleGetFraudConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith({
                enableFraudCheck: true,
                enableFraudCheckAtAuth: true,
                kountClientId: 'test-kount-id',
                kountEnvironment: 'PROD'
            })
        })

        it('should return false when enableFraudCheck is not true', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                enableFraudCheck: false,
                enableFraudCheckAtAuth: false,
                kountClientId: null,
                kountEnvironment: 'TEST'
            })

            await handleGetFraudConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith({
                enableFraudCheck: false,
                enableFraudCheckAtAuth: false,
                kountClientId: null,
                kountEnvironment: 'TEST'
            })
        })

        it('should return default TEST environment when not configured', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                enableFraudCheck: true,
                enableFraudCheckAtAuth: true,
                kountClientId: 'test-id'
                // kountEnvironment not provided
            })

            await handleGetFraudConfig(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    kountEnvironment: 'TEST'
                })
            )
        })

        it('should return null for kountClientId when not configured', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                enableFraudCheck: true,
                enableFraudCheckAtAuth: true
                // kountClientId not provided
            })

            await handleGetFraudConfig(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    kountClientId: null
                })
            )
        })

        it('should handle 401 auth error with correct status and code', async () => {
            getJPMCConfigAsync.mockRejectedValue({
                code: 'MULTI_LOCALE_AUTH_ERROR',
                statusCode: 401
            })

            await handleGetFraudConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(401)
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                errorCode: 'MULTI_LOCALE_AUTH_ERROR',
                message: expect.any(String)
            })
        })

        it('should handle 500 error for other exceptions', async () => {
            getJPMCConfigAsync.mockRejectedValue(new Error('Config error'))

            await handleGetFraudConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(500)
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                errorCode: 'CONFIGURATION_ERROR',
                message: expect.stringContaining('fraud')
            })
        })
    })

    // =========================================================================
    // handleGetConfig Tests (PIE/Payment Config)
    // =========================================================================

    describe('handleGetConfig', () => {
        let mockReq, mockRes

        beforeEach(() => {
            mockReq = {}
            mockRes = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            }
        })

        const mockPaymentConfig = {
            merchantId: 'MERCHANT123',
            pieEncryptionUrl: 'https://pie.jpmc.com/encrypt.js',
            pieGetKeyUrl: 'https://pie.jpmc.com',
            pieKey: 'KEY123',
            captureMethod: 'NOW',
            checkoutMode: 'PIE',
            _configSource: 'sitePreferences',
            _locale: 'default'
        }

        it('should return PIE payment config with valid configuration', async () => {
            getJPMCConfigAsync.mockResolvedValue(mockPaymentConfig)

            await handleGetConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    merchantId: 'MERCHANT123',
                    captureMethod: 'NOW',
                    checkoutMode: 'PIE',
                    dropInEnabled: false,
                    supportedCardBrands: ['visa', 'mastercard', 'amex', 'discover']
                })
            )
        })

        it('should include pieUrls in response when properly configured', async () => {
            getJPMCConfigAsync.mockResolvedValue(mockPaymentConfig)

            await handleGetConfig(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    pieUrls: {
                        encryption: 'https://pie.jpmc.com/encrypt.js',
                        getKey: 'https://pie.jpmc.com/KEY123/getkey.js'
                    }
                })
            )
        })

        it('should set dropInEnabled to true when checkoutMode is DROP_IN', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                ...mockPaymentConfig,
                checkoutMode: 'DROP_IN',
                dropInScriptUrl: 'https://jpmc.com/dropin.js'
            })

            await handleGetConfig(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    checkoutMode: 'DROP_IN',
                    dropInEnabled: true,
                    dropInScriptUrl: 'https://jpmc.com/dropin.js'
                })
            )
        })

        it('should return 200 even when PIE URLs are missing (logs warning)', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                ...mockPaymentConfig,
                pieEncryptionUrl: null,
                pieGetKeyUrl: null
            })

            await handleGetConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Missing PIE URLs')
            )
        })

        it('should log warning when PIE Key is missing', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                ...mockPaymentConfig,
                pieKey: null
            })

            await handleGetConfig(mockReq, mockRes)

            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Missing PIE Key')
            )
        })

        it('should log warning when Drop-in Mode enabled but script URL not configured', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                ...mockPaymentConfig,
                checkoutMode: 'DROP_IN',
                dropInScriptUrl: null
            })

            await handleGetConfig(mockReq, mockRes)

            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('JPMCDropInScriptUrl NOT configured')
            )
        })

        it('should log warning when Drop-in Mode enabled but capture method not configured', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                ...mockPaymentConfig,
                checkoutMode: 'DROP_IN',
                captureMethod: null
            })

            await handleGetConfig(mockReq, mockRes)

            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('JPMCCaptureMethod NOT configured')
            )
        })

        it('should default checkoutMode to PIE when not provided', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                ...mockPaymentConfig,
                checkoutMode: undefined
            })

            await handleGetConfig(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    checkoutMode: 'PIE'
                })
            )
        })

        it('should return null for dropInScriptUrl when not configured', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                ...mockPaymentConfig,
                dropInScriptUrl: null
            })

            await handleGetConfig(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    dropInScriptUrl: null
                })
            )
        })

        it('should handle getKey URL construction with pieKey', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                ...mockPaymentConfig,
                pieGetKeyUrl: 'https://pie.example.com',
                pieKey: 'MYKEY'
            })

            await handleGetConfig(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    pieUrls: expect.objectContaining({
                        getKey: 'https://pie.example.com/MYKEY/getkey.js'
                    })
                })
            )
        })

        it('should handle undefined getKey when pieKey or pieBaseUrl missing', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                ...mockPaymentConfig,
                pieGetKeyUrl: null
            })

            await handleGetConfig(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    pieUrls: expect.objectContaining({
                        getKey: undefined
                    })
                })
            )
        })

        it('should return 500 on exception', async () => {
            getJPMCConfigAsync.mockRejectedValue(new Error('Config failed'))

            await handleGetConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(500)
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                errorCode: 'CONFIGURATION_ERROR',
                message: 'Failed to retrieve payment configuration.'
            })
        })

        it('should return 401 for auth errors', async () => {
            getJPMCConfigAsync.mockRejectedValue({
                statusCode: 401
            })

            await handleGetConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(401)
        })
    })

    // =========================================================================
    // handleGetApplePayConfig Tests
    // =========================================================================

    describe('handleGetApplePayConfig', () => {
        let mockReq, mockRes

        beforeEach(() => {
            mockReq = {
                query: {},
                body: {}
            }
            mockRes = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            }
            siteConfig.isDefaultLocale.mockReturnValue(true)
            getApplePayPreferences.mockResolvedValue({
                enabled: true,
                merchantId: 'merchant.com.jpmc.test',
                merchantName: 'JPMC Test',
                countryCode: 'US',
                supportedNetworks: ['visa', 'masterCard', 'amex'],
                merchantCapabilities: ['supports3DS', 'supportsCredit']
            })
        })

        it('should return Apple Pay config for default locale', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                environment: 'sandbox'
            })

            await handleGetApplePayConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    merchantId: 'merchant.com.jpmc.test',
                    merchantName: 'JPMC Test',
                    isEnabled: true,
                    isConfigured: true
                })
            )
        })

        it('should return disabled Apple Pay for non-default locale', async () => {
            siteConfig.isDefaultLocale.mockReturnValue(false)
            mockReq.query.locale = 'de-DE'

            await handleGetApplePayConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    isEnabled: false,
                    isConfigured: false,
                    message: expect.stringContaining('default locale')
                })
            )
        })

        it('should extract locale from query params', async () => {
            mockReq.query.locale = 'en-US'
            siteConfig.isDefaultLocale.mockReturnValue(true)
            getJPMCConfigAsync.mockResolvedValue({ environment: 'sandbox' })

            await handleGetApplePayConfig(mockReq, mockRes)

            expect(siteConfig.isDefaultLocale).toHaveBeenCalledWith('en-US')
        })

        it('should extract locale from body params as fallback', async () => {
            mockReq.body.locale = 'en-GB'
            siteConfig.isDefaultLocale.mockReturnValue(false)
            getJPMCConfigAsync.mockResolvedValue({ environment: 'sandbox' })

            await handleGetApplePayConfig(mockReq, mockRes)

            expect(siteConfig.isDefaultLocale).toHaveBeenCalledWith('en-GB')
        })

        it('should return unconfigured when merchantId not in SFCC prefs and no env var', async () => {
            getApplePayPreferences.mockResolvedValue({})
            getJPMCConfigAsync.mockResolvedValue({})

            await handleGetApplePayConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    isEnabled: false,
                    isConfigured: false
                })
            )
        })

        it('should use environment variables as fallback for Apple Pay config', async () => {
            getApplePayPreferences.mockResolvedValue({})
            process.env.APPLE_PAY_MERCHANT_ID = 'env.merchant.id'
            process.env.APPLE_PAY_MERCHANT_NAME = 'ENV Merchant'
            process.env.APPLE_PAY_SUPPORTED_NETWORKS = 'visa,masterCard'
            process.env.APPLE_PAY_MERCHANT_CAPABILITIES = 'supports3DS,supportsCredit'
            getJPMCConfigAsync.mockResolvedValue({ environment: 'production' })

            await handleGetApplePayConfig(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    merchantId: 'env.merchant.id',
                    merchantName: 'ENV Merchant',
                    supportedNetworks: ['visa', 'masterCard'],
                    merchantCapabilities: ['supports3DS', 'supportsCredit']
                })
            )

            // Cleanup
            delete process.env.APPLE_PAY_MERCHANT_ID
            delete process.env.APPLE_PAY_MERCHANT_NAME
            delete process.env.APPLE_PAY_SUPPORTED_NETWORKS
            delete process.env.APPLE_PAY_MERCHANT_CAPABILITIES
        })

        it('should default environment to sandbox when not configured', async () => {
            getJPMCConfigAsync.mockResolvedValue({})

            await handleGetApplePayConfig(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    environment: 'sandbox'
                })
            )
        })

        it('should log configuration source from SFCC preferences', async () => {
            getJPMCConfigAsync.mockResolvedValue({ environment: 'sandbox' })

            await handleGetApplePayConfig(mockReq, mockRes)

            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[JPMC Apple Pay] Configuration loaded')
            )
        })

        it('should handle auth error with 500 status', async () => {
            getJPMCConfigAsync.mockRejectedValue({
                code: 'MULTI_LOCALE_AUTH_ERROR'
            })

            await handleGetApplePayConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(401)
        })

        it('should handle general exception with 500 status', async () => {
            getJPMCConfigAsync.mockRejectedValue(new Error('Unexpected error'))

            await handleGetApplePayConfig(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(500)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    errorCode: 'CONFIGURATION_ERROR',
                    message: expect.stringContaining('Apple Pay')
                })
            )
        })

        it('should use default supported networks when not configured', async () => {
            process.env.APPLE_PAY_MERCHANT_ID = 'merchant.test'
            getApplePayPreferences.mockResolvedValue({})
            getJPMCConfigAsync.mockResolvedValue({})

            await handleGetApplePayConfig(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    supportedNetworks: ['visa', 'masterCard', 'amex', 'discover']
                })
            )

            delete process.env.APPLE_PAY_MERCHANT_ID
        })

        it('should use default capabilities when not configured', async () => {
            process.env.APPLE_PAY_MERCHANT_ID = 'merchant.test'
            getApplePayPreferences.mockResolvedValue({})
            getJPMCConfigAsync.mockResolvedValue({})

            await handleGetApplePayConfig(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    merchantCapabilities: expect.arrayContaining(['supports3DS', 'supportsDebit', 'supportsCredit'])
                })
            )

            delete process.env.APPLE_PAY_MERCHANT_ID
        })
    })
})
