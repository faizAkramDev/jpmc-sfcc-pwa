/**
 * Unit Tests for SFCC Preference Mapper
 *
 * @jest-environment node
 */

const {
    buildJPMCConfigFromPreferences,
    mergeWithEnvironmentConfig,
    getPreferenceMapping
} = require('../preference-mapper')

// =============================================================================
// Setup
// =============================================================================

describe('SFCC Preference Mapper', () => {
    // =========================================================================
    // buildJPMCConfigFromPreferences Tests
    // =========================================================================

    describe('buildJPMCConfigFromPreferences', () => {
        it('should map SFCC preference IDs to config keys', () => {
            const preferences = {
                JPMCClientID: 'client-123',
                JPMC_MerchantCode: 'merchant-456',
                JPMCApiHost: 'api-ms-test.payments.jpmorgan.com',
                JPMCCaptureMethod: 'MANUAL'
            }

            const result = buildJPMCConfigFromPreferences(preferences)

            expect(result.clientId).toBe('client-123')
            expect(result.merchantId).toBe('merchant-456')
            expect(result.apiHost).toBe('api-ms-test.payments.jpmorgan.com')
            expect(result.captureMethod).toBe('MANUAL')
        })

        it('should NOT apply default values - all values must come from BM', () => {
            const preferences = {}

            const result = buildJPMCConfigFromPreferences(preferences)

            // No defaults - all values should be undefined unless set in BM
            expect(result.apiHost).toBeUndefined()
            expect(result.captureMethod).toBeUndefined()
            expect(result.merchantSoftwareCompany).toBeUndefined()
            expect(result.merchantSoftwareProduct).toBeUndefined()
            expect(result.merchantSoftwareVersion).toBeUndefined()
        })

        it('should use API host directly from BM preferences', () => {
            const sandboxPrefs = { JPMCApiHost: 'api-ms-test.payments.jpmorgan.com' }
            const prodPrefs = { JPMCApiHost: 'api-ms.payments.jpmorgan.com' }

            const sandboxResult = buildJPMCConfigFromPreferences(sandboxPrefs)
            const prodResult = buildJPMCConfigFromPreferences(prodPrefs)

            expect(sandboxResult.apiHost).toBe('api-ms-test.payments.jpmorgan.com')
            expect(prodResult.apiHost).toBe('api-ms.payments.jpmorgan.com')
        })

        it('should handle null and undefined values', () => {
            const preferences = {
                JPMCClientID: null,
                JPMC_MerchantCode: undefined,
                JPMCCaptureMethod: 'NOW'
            }

            const result = buildJPMCConfigFromPreferences(preferences)

            // Null/undefined should not be set (fall back to defaults)
            expect(result.clientId).toBeUndefined()
            expect(result.merchantId).toBeUndefined()
            expect(result.captureMethod).toBe('NOW')
        })

        it('should map all merchant software preferences', () => {
            const preferences = {
                JPMCMerchantSoftwareCompany: 'Custom Company',
                JPMCMerchantSoftwareProduct: 'Custom Product',
                JPMCMerchantSoftwareVersion: '2.0.0'
            }

            const result = buildJPMCConfigFromPreferences(preferences)

            expect(result.merchantSoftwareCompany).toBe('Custom Company')
            expect(result.merchantSoftwareProduct).toBe('Custom Product')
            expect(result.merchantSoftwareVersion).toBe('2.0.0')
        })

        it('should map PIE encryption URLs', () => {
            const preferences = {
                JPMCEncryptionUrl: 'https://custom-encryption.url/v1/encryption.js',
                JPMCGetKeyUrl: 'https://custom-getkey.url/v1/{merchantId}/getkey.js'
            }

            const result = buildJPMCConfigFromPreferences(preferences)

            expect(result.pieEncryptionUrl).toBe('https://custom-encryption.url/v1/encryption.js')
            expect(result.pieGetKeyUrl).toBe('https://custom-getkey.url/v1/{merchantId}/getkey.js')
        })
    })

    // =========================================================================
    // mergeWithEnvironmentConfig Tests
    // =========================================================================

    describe('mergeWithEnvironmentConfig', () => {
        it('should merge BM config with env config', () => {
            const bmConfig = {
                merchantId: 'bm-merchant',
                captureMethod: 'MANUAL'
            }
            const envConfig = {
                clientId: 'env-client',
                privateKeyBase64: 'sensitive-key'
            }

            const result = mergeWithEnvironmentConfig(bmConfig, envConfig)

            expect(result.merchantId).toBe('bm-merchant')
            expect(result.captureMethod).toBe('MANUAL')
            expect(result.clientId).toBe('env-client')
            expect(result.privateKeyBase64).toBe('sensitive-key')
        })

        it('should prioritize env config for sensitive fields', () => {
            const bmConfig = {
                merchantId: 'bm-merchant',
                privateKeyBase64: 'bm-key-should-be-overridden',
                certificateBase64: 'bm-cert-should-be-overridden'
            }
            const envConfig = {
                merchantId: 'env-merchant-ignored', // BM takes priority for non-sensitive
                privateKeyBase64: 'env-key-takes-priority',
                certificateBase64: 'env-cert-takes-priority'
            }

            const result = mergeWithEnvironmentConfig(bmConfig, envConfig)

            // BM config takes priority for non-sensitive keys
            expect(result.merchantId).toBe('bm-merchant')
            // Env config takes priority for sensitive credentials
            expect(result.privateKeyBase64).toBe('env-key-takes-priority')
            expect(result.certificateBase64).toBe('env-cert-takes-priority')
        })

        it('should use BM config when env config is missing', () => {
            const bmConfig = {
                merchantId: 'bm-merchant',
                apiHost: 'api-ms.payments.jpmorgan.com'
            }
            const envConfig = {}

            const result = mergeWithEnvironmentConfig(bmConfig, envConfig)

            expect(result.merchantId).toBe('bm-merchant')
            expect(result.apiHost).toBe('api-ms.payments.jpmorgan.com')
        })

        it('should handle empty configs', () => {
            const result = mergeWithEnvironmentConfig({}, {})

            expect(result).toEqual({})
        })
    })

    // =========================================================================
    // getPreferenceMapping Tests
    // =========================================================================

    describe('getPreferenceMapping', () => {
        it('should return the preference mapping object', () => {
            const mapping = getPreferenceMapping()

            expect(mapping).toHaveProperty('JPMCClientID', 'clientId')
            expect(mapping).toHaveProperty('JPMC_MerchantCode', 'merchantId')
            expect(mapping).toHaveProperty('JPMCCaptureMethod', 'captureMethod')
            expect(mapping).toHaveProperty('JPMCApiHost', 'apiHost')
        })

        it('should include Google Pay Cart/PDP preference mappings', () => {
            const mapping = getPreferenceMapping()

            expect(mapping).toHaveProperty('JPMCGooglePayCartEnabled', 'googlePayCartEnabled')
            expect(mapping).toHaveProperty('JPMCGooglePayPDPEnabled', 'googlePayPDPEnabled')
            expect(mapping).toHaveProperty('JPMCGooglePayAllowedShippingCountries', 'googlePayAllowedShippingCountries')
        })
    })

    // =========================================================================
    // Google Pay Cart/PDP Mapping Tests
    // =========================================================================

    describe('Google Pay Cart/PDP Preference Mapping', () => {
        it('should map googlePayCartEnabled from JPMCGooglePayCartEnabled', () => {
            const preferences = {
                JPMCGooglePayCartEnabled: true
            }

            const result = buildJPMCConfigFromPreferences(preferences)

            expect(result.googlePayCartEnabled).toBe(true)
        })

        it('should map googlePayPDPEnabled from JPMCGooglePayPDPEnabled', () => {
            const preferences = {
                JPMCGooglePayPDPEnabled: true
            }

            const result = buildJPMCConfigFromPreferences(preferences)

            expect(result.googlePayPDPEnabled).toBe(true)
        })

        it('should map googlePayAllowedShippingCountries from JPMCGooglePayAllowedShippingCountries', () => {
            const preferences = {
                JPMCGooglePayAllowedShippingCountries: 'US,CA,MX'
            }

            const result = buildJPMCConfigFromPreferences(preferences)

            expect(result.googlePayAllowedShippingCountries).toBe('US,CA,MX')
        })

        it('should handle all Google Pay Cart/PDP preferences together', () => {
            const preferences = {
                JPMCGooglePayCartEnabled: true,
                JPMCGooglePayPDPEnabled: false,
                JPMCGooglePayAllowedShippingCountries: 'US,CA'
            }

            const result = buildJPMCConfigFromPreferences(preferences)

            expect(result.googlePayCartEnabled).toBe(true)
            expect(result.googlePayPDPEnabled).toBe(false)
            expect(result.googlePayAllowedShippingCountries).toBe('US,CA')
        })
    })
})
