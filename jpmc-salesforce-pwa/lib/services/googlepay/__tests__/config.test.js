/**
 * Unit Tests for Google Pay Configuration Builder
 *
 * @jest-environment node
 */

import {
    buildBaseCardPaymentMethod,
    buildTokenizationSpecification,
    buildCardPaymentMethod,
    buildIsReadyToPayRequest,
    buildPaymentDataRequest,
    buildClientOptions,
    buildGooglePayConfig,
    validateGooglePayConfig
} from '../config.js'

import {
    GOOGLE_PAY_API_VERSION,
    GOOGLE_PAY_ALLOWED_NETWORKS,
    GOOGLE_PAY_AUTH_METHODS
} from '../../../utils/constants.mjs'

describe('Google Pay Configuration Builder', () => {
    const mockMerchantId = 'test-merchant-123'
    const mockMerchantName = 'Test Store'

    describe('buildBaseCardPaymentMethod', () => {
        it('should return card payment method with correct structure', () => {
            const result = buildBaseCardPaymentMethod()
            
            expect(result.type).toBe('CARD')
            expect(result.parameters).toBeDefined()
            expect(result.parameters.allowedAuthMethods).toEqual(GOOGLE_PAY_AUTH_METHODS)
            expect(result.parameters.allowedCardNetworks).toEqual(GOOGLE_PAY_ALLOWED_NETWORKS)
        })
    })

    describe('buildTokenizationSpecification', () => {
        it('should build tokenization spec for Chase gateway', () => {
            const result = buildTokenizationSpecification(mockMerchantId)
            
            expect(result.type).toBe('PAYMENT_GATEWAY')
            expect(result.parameters.gateway).toBe('chase')
            expect(result.parameters.gatewayMerchantId).toBe(mockMerchantId)
        })

        it('should throw error if merchantId is missing', () => {
            expect(() => buildTokenizationSpecification()).toThrow()
            expect(() => buildTokenizationSpecification('')).toThrow()
            expect(() => buildTokenizationSpecification(null)).toThrow()
        })
    })

    describe('buildCardPaymentMethod', () => {
        it('should build card payment method with tokenization', () => {
            const result = buildCardPaymentMethod({
                gatewayMerchantId: mockMerchantId
            })
            
            expect(result.type).toBe('CARD')
            expect(result.tokenizationSpecification).toBeDefined()
            expect(result.tokenizationSpecification.parameters.gatewayMerchantId).toBe(mockMerchantId)
        })

        it('should include billing address parameters', () => {
            const result = buildCardPaymentMethod({
                gatewayMerchantId: mockMerchantId,
                billingAddressRequired: true,
                billingAddressFormat: 'FULL'
            })
            
            expect(result.parameters.billingAddressRequired).toBe(true)
            expect(result.parameters.billingAddressParameters.format).toBe('FULL')
        })

        it('should allow custom networks and auth methods', () => {
            const customNetworks = ['VISA', 'MASTERCARD']
            const customAuthMethods = ['CRYPTOGRAM_3DS']
            
            const result = buildCardPaymentMethod({
                gatewayMerchantId: mockMerchantId,
                allowedNetworks: customNetworks,
                allowedAuthMethods: customAuthMethods
            })
            
            expect(result.parameters.allowedCardNetworks).toEqual(customNetworks)
            expect(result.parameters.allowedAuthMethods).toEqual(customAuthMethods)
        })
    })

    describe('buildIsReadyToPayRequest', () => {
        it('should include API version', () => {
            const result = buildIsReadyToPayRequest()
            
            expect(result.apiVersion).toBe(GOOGLE_PAY_API_VERSION.apiVersion)
            expect(result.apiVersionMinor).toBe(GOOGLE_PAY_API_VERSION.apiVersionMinor)
        })

        it('should include allowed payment methods', () => {
            const result = buildIsReadyToPayRequest()
            
            expect(result.allowedPaymentMethods).toHaveLength(1)
            expect(result.allowedPaymentMethods[0].type).toBe('CARD')
        })

        it('should support existingPaymentMethodRequired option', () => {
            const result = buildIsReadyToPayRequest({
                existingPaymentMethodRequired: true
            })
            
            expect(result.existingPaymentMethodRequired).toBe(true)
        })
    })

    describe('buildPaymentDataRequest', () => {
        const validOptions = {
            gatewayMerchantId: mockMerchantId,
            merchantName: mockMerchantName,
            totalPrice: '99.99',
            currencyCode: 'USD'
        }

        it('should build complete payment data request', () => {
            const result = buildPaymentDataRequest(validOptions)
            
            expect(result.apiVersion).toBe(GOOGLE_PAY_API_VERSION.apiVersion)
            expect(result.allowedPaymentMethods).toHaveLength(1)
            expect(result.merchantInfo.merchantName).toBe(mockMerchantName)
            expect(result.transactionInfo.totalPrice).toBe('99.99')
            expect(result.transactionInfo.currencyCode).toBe('USD')
        })

        it('should throw error for missing required fields', () => {
            expect(() => buildPaymentDataRequest({})).toThrow('gatewayMerchantId is required')
            expect(() => buildPaymentDataRequest({ gatewayMerchantId: mockMerchantId }))
                .toThrow('merchantName is required')
            expect(() => buildPaymentDataRequest({ 
                gatewayMerchantId: mockMerchantId, 
                merchantName: mockMerchantName 
            })).toThrow('totalPrice is required')
        })

        it('should include Google Merchant ID when provided', () => {
            const result = buildPaymentDataRequest({
                ...validOptions,
                merchantId: 'BCR2DN123456789'
            })
            
            expect(result.merchantInfo.merchantId).toBe('BCR2DN123456789')
        })

        it('should include shipping address when required', () => {
            const result = buildPaymentDataRequest({
                ...validOptions,
                shippingAddressRequired: true
            })
            
            expect(result.shippingAddressRequired).toBe(true)
            expect(result.shippingAddressParameters).toBeDefined()
        })

        it('should include transaction ID when provided', () => {
            const result = buildPaymentDataRequest({
                ...validOptions,
                transactionId: 'txn-123'
            })
            
            expect(result.transactionInfo.transactionId).toBe('txn-123')
        })

        it('should convert totalPrice to string', () => {
            const result = buildPaymentDataRequest({
                ...validOptions,
                totalPrice: 100
            })
            
            expect(result.transactionInfo.totalPrice).toBe('100')
        })
    })

    describe('buildClientOptions', () => {
        it('should return TEST environment for sandbox', () => {
            const result = buildClientOptions({ environment: 'sandbox' })
            expect(result.environment).toBe('TEST')
        })

        it('should return PRODUCTION environment for production', () => {
            const result = buildClientOptions({ environment: 'production' })
            expect(result.environment).toBe('PRODUCTION')
        })

        it('should include payment data callback when provided', () => {
            const callback = jest.fn()
            const result = buildClientOptions({ onPaymentDataChanged: callback })
            
            expect(result.paymentDataCallbacks).toBeDefined()
            expect(result.paymentDataCallbacks.onPaymentDataChanged).toBe(callback)
        })
    })

    describe('buildGooglePayConfig', () => {
        it('should build complete configuration object', () => {
            const config = buildGooglePayConfig({
                gatewayMerchantId: mockMerchantId,
                merchantName: mockMerchantName
            })
            
            expect(config.clientOptions).toBeDefined()
            expect(config.isReadyToPayRequest).toBeDefined()
            expect(config.buildPaymentDataRequest).toBeInstanceOf(Function)
            expect(config.raw).toBeDefined()
        })

        it('should provide factory function for payment data request', () => {
            const config = buildGooglePayConfig({
                gatewayMerchantId: mockMerchantId,
                merchantName: mockMerchantName
            })
            
            const paymentRequest = config.buildPaymentDataRequest('50.00', 'USD')
            
            expect(paymentRequest.transactionInfo.totalPrice).toBe('50.00')
            expect(paymentRequest.transactionInfo.currencyCode).toBe('USD')
        })

        it('should include raw configuration', () => {
            const config = buildGooglePayConfig({
                gatewayMerchantId: mockMerchantId,
                merchantName: mockMerchantName,
                environment: 'sandbox'
            })
            
            expect(config.raw.gatewayMerchantId).toBe(mockMerchantId)
            expect(config.raw.merchantName).toBe(mockMerchantName)
            expect(config.raw.environment).toBe('TEST')
        })
    })

    describe('validateGooglePayConfig', () => {
        it('should return valid for complete config', () => {
            const result = validateGooglePayConfig({
                gatewayMerchantId: mockMerchantId,
                merchantName: mockMerchantName
            })
            
            expect(result.valid).toBe(true)
            expect(result.errors).toHaveLength(0)
        })

        it('should return errors for missing fields', () => {
            const result = validateGooglePayConfig({})
            
            expect(result.valid).toBe(false)
            expect(result.errors).toContain('gatewayMerchantId is required')
            expect(result.errors).toContain('merchantName is required')
        })

        it('should require Google Merchant ID for production', () => {
            const result = validateGooglePayConfig({
                gatewayMerchantId: mockMerchantId,
                merchantName: mockMerchantName,
                environment: 'production'
            })
            
            expect(result.valid).toBe(false)
            expect(result.errors).toContain('merchantId (Google Merchant ID) is required for production')
        })

        it('should pass validation for production with all fields', () => {
            const result = validateGooglePayConfig({
                gatewayMerchantId: mockMerchantId,
                merchantName: mockMerchantName,
                merchantId: 'BCR2DN123456789',
                environment: 'production'
            })
            
            expect(result.valid).toBe(true)
        })
    })

    // =========================================================================
    // Cart/PDP Context Tests
    // =========================================================================

    describe('buildPaymentDataRequest (Cart/PDP Context)', () => {
        const baseOptions = {
            gatewayMerchantId: mockMerchantId,
            merchantName: mockMerchantName,
            totalPrice: '99.99',
            currencyCode: 'USD'
        }

        it('should use ESTIMATED totalPriceStatus for cart context', () => {
            const result = buildPaymentDataRequest({
                ...baseOptions,
                context: 'cart'
            })
            
            expect(result.transactionInfo.totalPriceStatus).toBe('ESTIMATED')
        })

        it('should use ESTIMATED totalPriceStatus for pdp context', () => {
            const result = buildPaymentDataRequest({
                ...baseOptions,
                context: 'pdp'
            })
            
            expect(result.transactionInfo.totalPriceStatus).toBe('ESTIMATED')
        })

        it('should use FINAL totalPriceStatus for checkout context', () => {
            const result = buildPaymentDataRequest({
                ...baseOptions,
                context: 'checkout'
            })
            
            expect(result.transactionInfo.totalPriceStatus).toBe('FINAL')
        })

        it('should use Est. Total label for cart context', () => {
            const result = buildPaymentDataRequest({
                ...baseOptions,
                context: 'cart'
            })
            
            expect(result.transactionInfo.totalPriceLabel).toBe('Est. Total')
        })

        it('should use Total label for checkout context', () => {
            const result = buildPaymentDataRequest({
                ...baseOptions,
                context: 'checkout'
            })
            
            expect(result.transactionInfo.totalPriceLabel).toBe('Total')
        })

        it('should include callbackIntents for cart context', () => {
            const result = buildPaymentDataRequest({
                ...baseOptions,
                context: 'cart'
            })
            
            expect(result.callbackIntents).toBeDefined()
            expect(result.callbackIntents).toContain('SHIPPING_ADDRESS')
            expect(result.callbackIntents).toContain('SHIPPING_OPTION')
            expect(result.callbackIntents).toContain('PAYMENT_AUTHORIZATION')
        })

        it('should include callbackIntents for pdp context', () => {
            const result = buildPaymentDataRequest({
                ...baseOptions,
                context: 'pdp'
            })
            
            expect(result.callbackIntents).toBeDefined()
            expect(result.callbackIntents).toContain('SHIPPING_ADDRESS')
            expect(result.callbackIntents).toContain('SHIPPING_OPTION')
        })

        it('should not include callbackIntents for checkout context (uses simple token collection)', () => {
            const result = buildPaymentDataRequest({
                ...baseOptions,
                context: 'checkout'
            })
            
            // Checkout context uses empty intents array, so callbackIntents is not added
            expect(result.callbackIntents).toBeUndefined()
        })

        it('should set shippingOptionRequired for cart context', () => {
            const result = buildPaymentDataRequest({
                ...baseOptions,
                context: 'cart'
            })
            
            expect(result.shippingOptionRequired).toBe(true)
        })

        it('should set shippingAddressRequired for cart context', () => {
            const result = buildPaymentDataRequest({
                ...baseOptions,
                context: 'cart'
            })
            
            expect(result.shippingAddressRequired).toBe(true)
        })

        it('should include allowedCountryCodes in shipping parameters', () => {
            const result = buildPaymentDataRequest({
                ...baseOptions,
                context: 'cart',
                allowedCountryCodes: ['US', 'CA', 'MX']
            })
            
            expect(result.shippingAddressParameters.allowedCountryCodes).toEqual(['US', 'CA', 'MX'])
        })

        it('should fallback to countryCode if allowedCountryCodes not provided', () => {
            const result = buildPaymentDataRequest({
                ...baseOptions,
                context: 'cart',
                countryCode: 'US'
            })
            
            expect(result.shippingAddressParameters.allowedCountryCodes).toEqual(['US'])
        })

        it('should include phoneNumberRequired in shipping parameters for cart', () => {
            const result = buildPaymentDataRequest({
                ...baseOptions,
                context: 'cart',
                phoneNumberRequired: true
            })
            
            expect(result.shippingAddressParameters.phoneNumberRequired).toBe(true)
        })

        it('should include phoneNumberRequired in billing parameters for cart', () => {
            const result = buildPaymentDataRequest({
                ...baseOptions,
                context: 'cart',
                phoneNumberRequired: true
            })
            
            const cardMethod = result.allowedPaymentMethods[0]
            expect(cardMethod.parameters.billingAddressParameters.phoneNumberRequired).toBe(true)
        })

        it('should include displayItems when provided', () => {
            const displayItems = [
                { label: 'Subtotal', type: 'SUBTOTAL', price: '80.00' },
                { label: 'Tax', type: 'TAX', price: '8.00' }
            ]
            
            const result = buildPaymentDataRequest({
                ...baseOptions,
                context: 'cart',
                displayItems
            })
            
            expect(result.transactionInfo.displayItems).toEqual(displayItems)
        })

        it('should allow overriding context-aware defaults', () => {
            const result = buildPaymentDataRequest({
                ...baseOptions,
                context: 'cart',
                totalPriceStatus: 'FINAL',
                totalPriceLabel: 'Custom Label'
            })
            
            expect(result.transactionInfo.totalPriceStatus).toBe('FINAL')
            expect(result.transactionInfo.totalPriceLabel).toBe('Custom Label')
        })
    })

    describe('buildClientOptions (Cart/PDP Context)', () => {
        it('should include onPaymentDataChanged callback', () => {
            const mockCallback = jest.fn()
            const result = buildClientOptions({
                context: 'cart',
                onPaymentDataChanged: mockCallback
            })
            
            expect(result.paymentDataCallbacks.onPaymentDataChanged).toBe(mockCallback)
        })

        it('should include onPaymentAuthorized callback', () => {
            const mockCallback = jest.fn()
            const result = buildClientOptions({
                context: 'cart',
                onPaymentAuthorized: mockCallback
            })
            
            expect(result.paymentDataCallbacks.onPaymentAuthorized).toBe(mockCallback)
        })

        it('should include both callbacks when provided', () => {
            const mockDataChanged = jest.fn()
            const mockAuthorized = jest.fn()
            
            const result = buildClientOptions({
                context: 'cart',
                onPaymentDataChanged: mockDataChanged,
                onPaymentAuthorized: mockAuthorized
            })
            
            expect(result.paymentDataCallbacks.onPaymentDataChanged).toBe(mockDataChanged)
            expect(result.paymentDataCallbacks.onPaymentAuthorized).toBe(mockAuthorized)
        })
    })

    describe('buildGooglePayConfig (Cart/PDP Context)', () => {
        it('should build config for cart context', () => {
            const config = buildGooglePayConfig({
                gatewayMerchantId: mockMerchantId,
                merchantName: mockMerchantName,
                context: 'cart'
            })
            
            expect(config.raw.context).toBe('cart')
        })

        it('should include allowedCountryCodes in raw config', () => {
            const config = buildGooglePayConfig({
                gatewayMerchantId: mockMerchantId,
                merchantName: mockMerchantName,
                context: 'cart',
                allowedCountryCodes: ['US', 'CA']
            })
            
            expect(config.raw.allowedCountryCodes).toEqual(['US', 'CA'])
        })

        it('should pass callbacks to client options', () => {
            const mockDataChanged = jest.fn()
            const mockAuthorized = jest.fn()

            const config = buildGooglePayConfig({
                gatewayMerchantId: mockMerchantId,
                merchantName: mockMerchantName,
                context: 'cart',
                onPaymentDataChanged: mockDataChanged,
                onPaymentAuthorized: mockAuthorized
            })
            
            expect(config.clientOptions.paymentDataCallbacks.onPaymentDataChanged).toBe(mockDataChanged)
            expect(config.clientOptions.paymentDataCallbacks.onPaymentAuthorized).toBe(mockAuthorized)
        })

        it('should build payment request with cart context defaults', () => {
            const config = buildGooglePayConfig({
                gatewayMerchantId: mockMerchantId,
                merchantName: mockMerchantName,
                context: 'cart',
                allowedCountryCodes: ['US', 'CA']
            })
            
            const paymentRequest = config.buildPaymentDataRequest('50.00', 'USD')
            
            expect(paymentRequest.transactionInfo.totalPriceStatus).toBe('ESTIMATED')
            expect(paymentRequest.shippingAddressRequired).toBe(true)
            expect(paymentRequest.shippingOptionRequired).toBe(true)
        })
    })

    describe('validateGooglePayConfig (Cart/PDP Context)', () => {
        it('should warn if callbacks missing for cart context', () => {
            const result = validateGooglePayConfig({
                gatewayMerchantId: mockMerchantId,
                merchantName: mockMerchantName,
                context: 'cart'
            })
            
            expect(result.valid).toBe(true)
            expect(result.warnings).toContain('onPaymentDataChanged callback recommended for cart/pdp context to handle shipping updates')
        })

        it('should not warn if callbacks provided for cart context', () => {
            const result = validateGooglePayConfig({
                gatewayMerchantId: mockMerchantId,
                merchantName: mockMerchantName,
                context: 'cart',
                onPaymentDataChanged: jest.fn(),
                onPaymentAuthorized: jest.fn()
            })
            
            expect(result.warnings).not.toContain('onPaymentDataChanged callback recommended for cart/pdp context to handle shipping updates')
        })

        it('should error for invalid context', () => {
            const result = validateGooglePayConfig({
                gatewayMerchantId: mockMerchantId,
                merchantName: mockMerchantName,
                context: 'invalid'
            })
            
            expect(result.valid).toBe(false)
            expect(result.errors.some(e => e.includes('Invalid context'))).toBe(true)
        })

        it('should warn for invalid country codes', () => {
            const result = validateGooglePayConfig({
                gatewayMerchantId: mockMerchantId,
                merchantName: mockMerchantName,
                context: 'cart',
                allowedCountryCodes: ['US', 'USA', 'INVALID']
            })
            
            expect(result.warnings.some(w => w.includes('Invalid country codes'))).toBe(true)
        })

        it('should error if allowedCountryCodes is not an array', () => {
            const result = validateGooglePayConfig({
                gatewayMerchantId: mockMerchantId,
                merchantName: mockMerchantName,
                context: 'cart',
                allowedCountryCodes: 'US'
            })
            
            expect(result.valid).toBe(false)
            expect(result.errors).toContain('allowedCountryCodes must be an array')
        })
    })
})
