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

const { parseAllowedShippingCountries, handleGetGooglePayConfig } = require('../config-handlers')
const { getJPMCConfigAsync } = require('../../../../ssr')
const logger = require('../../../../utils/logger')

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
    })
})
