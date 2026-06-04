/**
 * Google Pay Config Resolver Tests
 * 
 * Tests for the configuration resolution logic
 */

import {
    resolveGooglePayConfig,
    isGooglePayDisabledInBM
} from '../googlepay-config-resolver'

describe('googlepay-config-resolver.js', () => {
    describe('resolveGooglePayConfig', () => {
        const baseProps = {
            gatewayMerchantId: null,
            merchantName: null,
            merchantId: null,
            environment: null,
            allowedCountryCodes: null
        }

        it('returns props values when provided (highest priority)', () => {
            const props = {
                gatewayMerchantId: 'prop-merchant-id',
                merchantName: 'Prop Store',
                merchantId: 'prop-google-id',
                environment: 'production'
            }

            const result = resolveGooglePayConfig({
                props,
                serverConfig: { gatewayMerchantId: 'server-merchant-id' },
                paymentConfig: { googlePay: { gatewayMerchantId: 'context-merchant-id' } }
            })

            expect(result.gatewayMerchantId).toBe('prop-merchant-id')
            expect(result.merchantName).toBe('Prop Store')
            expect(result.merchantId).toBe('prop-google-id')
            expect(result.environment).toBe('production')
            expect(result._configSource).toBe('props')
        })

        it('uses context config when props empty (second priority)', () => {
            const paymentConfig = {
                googlePay: {
                    gatewayMerchantId: 'context-merchant-id',
                    merchantName: 'Context Store',
                    merchantId: 'context-google-id',
                    gateway: 'stripe',
                    allowedNetworks: ['VISA', 'MASTERCARD']
                },
                environment: 'PRODUCTION'
            }

            const result = resolveGooglePayConfig({
                props: baseProps,
                serverConfig: { gatewayMerchantId: 'server-merchant-id' },
                paymentConfig
            })

            expect(result.gatewayMerchantId).toBe('context-merchant-id')
            expect(result.merchantName).toBe('Context Store')
            expect(result.environment).toBe('production')
            expect(result._configSource).toBe('context')
        })

        it('uses serverConfig when props and context empty', () => {
            const serverConfig = {
                gatewayMerchantId: 'server-merchant-id',
                merchantInfo: {
                    merchantName: 'Server Store',
                    merchantId: 'server-google-id'
                },
                environment: 'PRODUCTION',
                gateway: 'jpmorgan',
                allowedCardNetworks: ['AMEX', 'DISCOVER']
            }

            const result = resolveGooglePayConfig({
                props: baseProps,
                serverConfig,
                paymentConfig: null
            })

            expect(result.gatewayMerchantId).toBe('server-merchant-id')
            expect(result.merchantName).toBe('Server Store')
            expect(result.merchantId).toBe('server-google-id')
            expect(result.environment).toBe('production')
            expect(result._configSource).toBe('serverConfig')
        })

        it('falls back to merchantName from paymentConfig root', () => {
            const result = resolveGooglePayConfig({
                props: baseProps,
                paymentConfig: { merchantName: 'Root Merchant Name' },
                serverConfig: null
            })

            expect(result.merchantName).toBe('Root Merchant Name')
        })

        it('converts TEST environment to sandbox', () => {
            const result = resolveGooglePayConfig({
                props: baseProps,
                paymentConfig: { environment: 'TEST' },
                serverConfig: null
            })

            expect(result.environment).toBe('sandbox')
        })

        it('converts PRODUCTION environment to production', () => {
            const result = resolveGooglePayConfig({
                props: baseProps,
                serverConfig: { environment: 'PRODUCTION' },
                paymentConfig: null
            })

            expect(result.environment).toBe('production')
        })

        it('defaults environment to sandbox when none provided', () => {
            const result = resolveGooglePayConfig({
                props: baseProps,
                serverConfig: null,
                paymentConfig: null
            })

            expect(result.environment).toBe('sandbox')
        })

        it('resolves gateway from context over serverConfig', () => {
            const result = resolveGooglePayConfig({
                props: baseProps,
                paymentConfig: { googlePay: { gateway: 'ctx-gateway' } },
                serverConfig: { gateway: 'server-gateway' }
            })

            expect(result.gateway).toBe('ctx-gateway')
        })

        it('resolves allowedNetworks from serverConfig', () => {
            const result = resolveGooglePayConfig({
                props: baseProps,
                paymentConfig: null,
                serverConfig: { allowedCardNetworks: ['VISA', 'AMEX'] }
            })

            expect(result.allowedNetworks).toEqual(['VISA', 'AMEX'])
        })

        it('resolves allowedAuthMethods from context', () => {
            const result = resolveGooglePayConfig({
                props: baseProps,
                paymentConfig: { googlePay: { allowedAuthMethods: ['PAN_ONLY'] } },
                serverConfig: { allowedAuthMethods: ['CRYPTOGRAM_3DS'] }
            })

            expect(result.allowedAuthMethods).toEqual(['PAN_ONLY'])
        })

        it('resolves allowedCountryCodes from props', () => {
            const result = resolveGooglePayConfig({
                props: { ...baseProps, allowedCountryCodes: ['US', 'CA'] },
                paymentConfig: { googlePay: { allowedShippingCountries: ['UK', 'DE'] } },
                serverConfig: null
            })

            expect(result.resolvedAllowedCountryCodes).toEqual(['US', 'CA'])
        })

        it('resolves allowedCountryCodes from context when no props', () => {
            const result = resolveGooglePayConfig({
                props: baseProps,
                paymentConfig: { googlePay: { allowedShippingCountries: ['FR', 'IT'] } },
                serverConfig: null
            })

            expect(result.resolvedAllowedCountryCodes).toEqual(['FR', 'IT'])
        })

        it('resolves billingAddressRequired from context', () => {
            const result = resolveGooglePayConfig({
                props: baseProps,
                paymentConfig: { googlePay: { billingAddressRequired: true } },
                serverConfig: { billingAddressRequired: false }
            })

            expect(result.resolvedBillingAddressRequired).toBe(true)
        })

        it('resolves billingAddressRequired from serverConfig when context missing', () => {
            const result = resolveGooglePayConfig({
                props: baseProps,
                paymentConfig: null,
                serverConfig: { billingAddressRequired: false }
            })

            expect(result.resolvedBillingAddressRequired).toBe(false)
        })

        it('sets _configSource to none when no config provided', () => {
            const result = resolveGooglePayConfig({
                props: baseProps,
                paymentConfig: null,
                serverConfig: null
            })

            expect(result._configSource).toBe('none')
        })
    })

    describe('isGooglePayDisabledInBM', () => {
        it('returns false for cart context when cartEnabled is true', () => {
            const result = isGooglePayDisabledInBM({
                isCartContext: true,
                isPDPContext: false,
                serverConfig: { cartEnabled: true }
            })

            expect(result).toBe(false)
        })

        it('returns true for cart context when cartEnabled is false', () => {
            const result = isGooglePayDisabledInBM({
                isCartContext: true,
                isPDPContext: false,
                serverConfig: { cartEnabled: false }
            })

            expect(result).toBe(true)
        })

        it('returns true for cart context when cartEnabled is undefined', () => {
            const result = isGooglePayDisabledInBM({
                isCartContext: true,
                isPDPContext: false,
                serverConfig: {}
            })

            expect(result).toBe(true)
        })

        it('returns false for PDP context when pdpEnabled is true', () => {
            const result = isGooglePayDisabledInBM({
                isCartContext: false,
                isPDPContext: true,
                serverConfig: { pdpEnabled: true }
            })

            expect(result).toBe(false)
        })

        it('returns true for PDP context when pdpEnabled is false', () => {
            const result = isGooglePayDisabledInBM({
                isCartContext: false,
                isPDPContext: true,
                serverConfig: { pdpEnabled: false }
            })

            expect(result).toBe(true)
        })

        it('returns true for PDP context when pdpEnabled is undefined', () => {
            const result = isGooglePayDisabledInBM({
                isCartContext: false,
                isPDPContext: true,
                paymentConfig: null,
                serverConfig: null
            })

            expect(result).toBe(true)
        })

        it('returns false for checkout context (default)', () => {
            const result = isGooglePayDisabledInBM({
                isCartContext: false,
                isPDPContext: false,
                serverConfig: {}
            })

            expect(result).toBe(false)
        })

        it('uses paymentConfig.googlePay.cartEnabled when serverConfig missing', () => {
            const result = isGooglePayDisabledInBM({
                isCartContext: true,
                isPDPContext: false,
                paymentConfig: { googlePay: { cartEnabled: true } },
                serverConfig: {}
            })

            expect(result).toBe(false)
        })

        it('uses paymentConfig.googlePay.pdpEnabled when serverConfig missing', () => {
            const result = isGooglePayDisabledInBM({
                isCartContext: false,
                isPDPContext: true,
                paymentConfig: { googlePay: { pdpEnabled: true } },
                serverConfig: {}
            })

            expect(result).toBe(false)
        })

        it('prefers serverConfig over paymentConfig for cart', () => {
            const result = isGooglePayDisabledInBM({
                isCartContext: true,
                isPDPContext: false,
                paymentConfig: { googlePay: { cartEnabled: true } },
                serverConfig: { cartEnabled: false }
            })

            // serverConfig takes precedence
            expect(result).toBe(true)
        })

        it('prefers serverConfig over paymentConfig for PDP', () => {
            const result = isGooglePayDisabledInBM({
                isCartContext: false,
                isPDPContext: true,
                paymentConfig: { googlePay: { pdpEnabled: true } },
                serverConfig: { pdpEnabled: false }
            })

            // serverConfig takes precedence
            expect(result).toBe(true)
        })
    })
})
