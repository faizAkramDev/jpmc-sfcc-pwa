/**
 * Payment Methods Handler Tests
 *
 * @jest-environment node
 *
 * Tests for available payment methods endpoint
 */

import { handleGetAvailablePaymentMethods } from '../payment-methods-handler'

// Mock logger
jest.mock('../../../../utils/logger', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }
}))

// Mock locale-extractor
jest.mock('../../../../utils/locale-extractor', () => ({
    extractSlasToken: jest.fn()
}))

// Mock site-config
jest.mock('../../../../utils/site-config', () => ({
    isDefaultLocale: jest.fn().mockReturnValue(true) // Default: allow Apple Pay
}))

// Mock useAvailablePaymentMethods
jest.mock('../../../../hooks/useAvailablePaymentMethods', () => ({
    checkAvailablePaymentMethods: jest.fn()
}))

// Mock SSR config
jest.mock('../../../../ssr/index.js', () => ({
    getJPMCConfigAsync: jest.fn()
}))

import { extractSlasToken } from '../../../../utils/locale-extractor'
import { isDefaultLocale } from '../../../../utils/site-config'
import { checkAvailablePaymentMethods } from '../../../../hooks/useAvailablePaymentMethods'
import { getJPMCConfigAsync } from '../../../../ssr/index.js'

// Mock global fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('Payment Methods Handler', () => {
    let mockReq
    let mockRes

    beforeEach(() => {
        jest.clearAllMocks()

        // Set environment variables
        process.env.SFCC_SHORT_CODE = 'test-short-code'
        process.env.SFCC_ORG_ID = 'test-org-id'
        process.env.SFCC_SITE_ID = 'RefArch'

        // Default mock implementations
        extractSlasToken.mockReturnValue('slas-token-123')
        checkAvailablePaymentMethods.mockReturnValue({
            isCreditCardActive: true,
            isGooglePayActive: true,
            isApplePayActive: true,
            creditCardPaymentMethodId: 'CREDIT_CARD',
            googlePayPaymentMethodId: 'DW_GOOGLE_PAY',
            applePayPaymentMethodId: 'DW_APPLE_PAY'
        })
        getJPMCConfigAsync.mockResolvedValue({
            applePayEnabled: true
        })
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                applicablePaymentMethods: [
                    { id: 'CREDIT_CARD', name: 'Credit Card' },
                    { id: 'DW_GOOGLE_PAY', name: 'Google Pay' },
                    { id: 'DW_APPLE_PAY', name: 'Apple Pay' }
                ]
            })
        })

        // Mock request
        mockReq = {
            query: { basketId: 'basket-123' },
            body: {},
            headers: { authorization: 'Bearer slas-token-123' }
        }

        // Mock response
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        }
    })

    afterEach(() => {
        delete process.env.SFCC_SHORT_CODE
        delete process.env.SFCC_ORG_ID
        delete process.env.SFCC_SITE_ID
    })

    describe('handleGetAvailablePaymentMethods', () => {
        it('should return 400 with defaults when basketId is missing', async () => {
            mockReq.query = {}

            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(400)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    errorCode: 'INVALID_REQUEST',
                    message: 'Missing required query parameter: basketId',
                    isCreditCardActive: true,
                    isGooglePayActive: false,
                    isApplePayActive: false
                })
            )
        })

        it('should return defaults when no SLAS token', async () => {
            extractSlasToken.mockReturnValue(null)

            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    isCreditCardActive: true,
                    isGooglePayActive: false,
                    isApplePayActive: false,
                    warning: 'No authorization - using defaults'
                })
            )
            expect(mockFetch).not.toHaveBeenCalled()
        })

        it('should return defaults when SFCC configuration is missing', async () => {
            delete process.env.SFCC_SHORT_CODE
            delete process.env.SFCC_ORG_ID

            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    isCreditCardActive: true,
                    isGooglePayActive: false,
                    isApplePayActive: false,
                    warning: 'Missing SFCC configuration - using defaults'
                })
            )
        })

        it('should call Shopper Baskets API with correct URL', async () => {
            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('https://test-short-code.api.commercecloud.salesforce.com/checkout/shopper-baskets/v1/organizations/test-org-id/baskets/basket-123/payment-methods'),
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer slas-token-123',
                        'Content-Type': 'application/json'
                    })
                })
            )
        })

        it('should return defaults on API error', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error'
            })

            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    isCreditCardActive: true,
                    isGooglePayActive: false,
                    isApplePayActive: false,
                    warning: 'SFCC API error 500 - using defaults'
                })
            )
        })

        it('should analyze payment methods using checkAvailablePaymentMethods', async () => {
            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(checkAvailablePaymentMethods).toHaveBeenCalledWith([
                { id: 'CREDIT_CARD', name: 'Credit Card' },
                { id: 'DW_GOOGLE_PAY', name: 'Google Pay' },
                { id: 'DW_APPLE_PAY', name: 'Apple Pay' }
            ])
        })

        it('should return analyzed availability flags', async () => {
            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    isCreditCardActive: true,
                    isGooglePayActive: true,
                    isApplePayActive: true,
                    creditCardPaymentMethodId: 'CREDIT_CARD',
                    googlePayPaymentMethodId: 'DW_GOOGLE_PAY',
                    applePayPaymentMethodId: 'DW_APPLE_PAY'
                })
            )
        })

        it('should override isApplePayActive when JPMCApplePayEnabled is false', async () => {
            getJPMCConfigAsync.mockResolvedValue({
                applePayEnabled: false
            })

            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    isApplePayActive: false
                })
            )
        })

        it('should disable Apple Pay for non-default locales', async () => {
            mockReq.query = { basketId: 'basket-123', locale: 'en-CA' }
            // Mock isDefaultLocale to return false for en-CA
            isDefaultLocale.mockReturnValueOnce(false)

            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    isApplePayActive: false // Disabled for non-default locale
                })
            )
        })

        it('should enable Apple Pay for default locale', async () => {
            mockReq.query = { basketId: 'basket-123', locale: 'en-US' }
            // Mock isDefaultLocale to return true for en-US (the default)
            isDefaultLocale.mockReturnValueOnce(true)
            getJPMCConfigAsync.mockResolvedValue({
                applePayEnabled: true
            })

            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    isApplePayActive: true
                })
            )
        })

        it('should use locale from body if not in query', async () => {
            mockReq.query = { basketId: 'basket-123' }
            mockReq.body = { locale: 'de-DE' }
            // Mock isDefaultLocale to return false for de-DE
            isDefaultLocale.mockReturnValueOnce(false)

            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            // Apple Pay should be disabled for non-default locale
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    isApplePayActive: false
                })
            )
        })

        it('should continue on config error and not override applePayActive', async () => {
            getJPMCConfigAsync.mockRejectedValue(new Error('Config fetch failed'))

            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    isApplePayActive: true // Original value preserved
                })
            )
        })

        it('should return availability flags in response', async () => {
            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    isCreditCardActive: true,
                    isGooglePayActive: true,
                    isApplePayActive: true
                })
            )
        })

        it('should handle empty applicablePaymentMethods', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    applicablePaymentMethods: []
                })
            })

            checkAvailablePaymentMethods.mockReturnValue({
                isCreditCardActive: false,
                isGooglePayActive: false,
                isApplePayActive: false,
                creditCardPaymentMethodId: null,
                googlePayPaymentMethodId: null,
                applePayPaymentMethodId: null
            })

            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    isCreditCardActive: false,
                    isGooglePayActive: false,
                    creditCardPaymentMethodId: null,
                    googlePayPaymentMethodId: null,
                    applePayPaymentMethodId: null
                })
            )
        })

        it('should handle undefined applicablePaymentMethods', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({})
            })

            checkAvailablePaymentMethods.mockReturnValue({
                isCreditCardActive: false,
                isGooglePayActive: false,
                isApplePayActive: false,
                creditCardPaymentMethodId: null,
                googlePayPaymentMethodId: null,
                applePayPaymentMethodId: null
            })

            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(checkAvailablePaymentMethods).toHaveBeenCalledWith([])
        })

        it('should return defaults on exception', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'))

            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(mockRes.status).toHaveBeenCalledWith(200)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    isCreditCardActive: true,
                    isGooglePayActive: false,
                    isApplePayActive: false,
                    warning: 'Error: Network error - using defaults'
                })
            )
        })

        it('should use COMMERCE_API env variables as fallback', async () => {
            delete process.env.SFCC_SHORT_CODE
            delete process.env.SFCC_ORG_ID
            process.env.COMMERCE_API_SHORT_CODE = 'commerce-short'
            process.env.COMMERCE_API_ORG_ID = 'commerce-org'

            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('commerce-short'),
                expect.any(Object)
            )

            delete process.env.COMMERCE_API_SHORT_CODE
            delete process.env.COMMERCE_API_ORG_ID
        })

        it('should call API with undefined siteId when not configured (strict mode - no fallback)', async () => {
            delete process.env.SFCC_SITE_ID

            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('siteId=undefined'),
                expect.any(Object)
            )
        })

        it('should include payment method ids in response', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    applicablePaymentMethods: [
                        { id: 'CREDIT_CARD', name: 'Credit Card', description: 'Pay with credit card' }
                    ]
                })
            })

            await handleGetAvailablePaymentMethods(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    creditCardPaymentMethodId: 'CREDIT_CARD'
                })
            )
        })
    })
})
