/**
 * usePaymentConfig Hook Tests
 * 
 * Tests for payment configuration fetching hook
 */

import { renderHook, waitFor } from '@testing-library/react'
import { usePaymentConfig } from '../usePaymentConfig.js'

// Mock global fetch
global.fetch = jest.fn()

describe('usePaymentConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        // Reset fetch mock
        global.fetch.mockReset()
    })

    // ==========================================================================
    // Initial State Tests
    // ==========================================================================
    
    describe('Initial State', () => {
        beforeEach(() => {
            // Default fetch behavior - return empty responses
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({})
            })
        })

        it('should return default fraud config', () => {
            const { result } = renderHook(() => usePaymentConfig())

            expect(result.current.fraudConfig).toEqual({
                enableFraudCheck: false,
                enableFraudCheckAtAuth: false,
                kountClientId: null,
                kountEnvironment: 'TEST'
            })
        })

        it('should return kountEnabled as false initially', () => {
            const { result } = renderHook(() => usePaymentConfig())

            expect(result.current.kountEnabled).toBe(false)
        })

        it('should return empty googlePayConfig initially', () => {
            const { result } = renderHook(() => usePaymentConfig())

            expect(result.current.googlePayConfig).toEqual({})
        })

        it('should return default applePayConfig', () => {
            const { result } = renderHook(() => usePaymentConfig())

            expect(result.current.applePayConfig).toEqual({
                merchantId: null,
                merchantName: null,
                countryCode: 'US',
                supportedNetworks: undefined,
                merchantCapabilities: undefined,
                environment: 'sandbox',
                isConfigured: false
            })
        })
    })

    // ==========================================================================
    // Fraud Config Fetch Tests
    // ==========================================================================
    
    describe('Fraud Config Fetch', () => {
        it('should fetch fraud config on mount', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    enableFraudCheck: true,
                    enableFraudCheckAtAuth: true,
                    kountClientId: 'kount-client-123',
                    kountEnvironment: 'PROD'
                })
            })

            const { result } = renderHook(() => usePaymentConfig())

            await waitFor(() => {
                expect(result.current.fraudConfig.enableFraudCheck).toBe(true)
            })

            expect(result.current.fraudConfig).toEqual({
                enableFraudCheck: true,
                enableFraudCheckAtAuth: true,
                kountClientId: 'kount-client-123',
                kountEnvironment: 'PROD'
            })
        })

        it('should fetch fraud config with locale', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    enableFraudCheck: true,
                    kountClientId: 'kount-ca'
                })
            })

            renderHook(() => usePaymentConfig({ locale: 'en_CA' }))

            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    '/api/jpmorgan/fraud-config?locale=en_CA',
                    expect.any(Object)
                )
            })
        })

        it('should include Authorization header when getAccessToken is provided', async () => {
            const mockGetAccessToken = jest.fn().mockResolvedValue('slas-token-123')
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({})
            })

            renderHook(() => usePaymentConfig({ getAccessToken: mockGetAccessToken }))

            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalled()
            })

            const fetchCall = global.fetch.mock.calls.find(call => 
                call[0].includes('fraud-config')
            )
            expect(fetchCall[1].headers.Authorization).toBe('Bearer slas-token-123')
        })

        it('should handle fetch failure gracefully', async () => {
            global.fetch.mockRejectedValue(new Error('Network error'))

            const { result } = renderHook(() => usePaymentConfig())

            // Should keep default values
            await waitFor(() => {
                expect(result.current.fraudConfig.enableFraudCheck).toBe(false)
            })
        })

        it('should handle non-OK response gracefully', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 500
            })

            const { result } = renderHook(() => usePaymentConfig())

            // Should keep default values
            await waitFor(() => {
                expect(result.current.fraudConfig.enableFraudCheck).toBe(false)
            })
        })

        it('should set kountEnabled to true when fraud check is enabled with clientId', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    enableFraudCheck: true,
                    kountClientId: 'kount-123'
                })
            })

            const { result } = renderHook(() => usePaymentConfig())

            await waitFor(() => {
                expect(result.current.kountEnabled).toBe(true)
            })
        })
    })

    // ==========================================================================
    // Google Pay Config Fetch Tests
    // ==========================================================================
    
    describe('Google Pay Config Fetch', () => {
        it('should fetch Google Pay config on mount', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    gatewayMerchantId: 'gateway-123',
                    merchantInfo: {
                        merchantName: 'Test Store',
                        merchantId: 'merchant-123'
                    },
                    environment: 'PRODUCTION',
                    gateway: 'jpmorgan',
                    allowedCardNetworks: ['VISA', 'MASTERCARD'],
                    allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
                    cartEnabled: true,
                    pdpEnabled: true,
                    allowedShippingCountries: ['US', 'CA'],
                    enableAVS: true,
                    billingAddressRequired: true
                })
            })

            const { result } = renderHook(() => usePaymentConfig())

            await waitFor(() => {
                expect(result.current.googlePayConfig.gatewayMerchantId).toBe('gateway-123')
            })

            expect(result.current.googlePayConfig).toMatchObject({
                gatewayMerchantId: 'gateway-123',
                merchantName: 'Test Store',
                merchantId: 'merchant-123',
                environment: 'production',
                gateway: 'jpmorgan',
                allowedNetworks: ['VISA', 'MASTERCARD'],
                allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
                cartEnabled: true,
                pdpEnabled: true,
                enableAVS: true,
                billingAddressRequired: true
            })
        })

        it('should skip fetch if googlePayConfigFromProps has gatewayMerchantId', async () => {
            const googlePayConfigFromProps = {
                gatewayMerchantId: 'props-gateway-456'
            }

            const { result } = renderHook(() => usePaymentConfig({ googlePayConfigFromProps }))

            // Wait a bit to ensure no fetch happened
            await new Promise(resolve => setTimeout(resolve, 100))

            expect(result.current.googlePayConfig).toBe(googlePayConfigFromProps)
            // Fetch should not have been called for googlepay config
            const googlePayFetchCalls = global.fetch.mock.calls.filter(call =>
                call[0].includes('googlepay')
            )
            expect(googlePayFetchCalls.length).toBe(0)
        })

        it('should set environment to sandbox for non-PRODUCTION', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    gatewayMerchantId: 'gateway-123',
                    environment: 'TEST'
                })
            })

            const { result } = renderHook(() => usePaymentConfig())

            await waitFor(() => {
                expect(result.current.googlePayConfig.environment).toBe('sandbox')
            })
        })

        it('should handle fetch failure gracefully', async () => {
            global.fetch.mockRejectedValue(new Error('Network error'))

            const { result } = renderHook(() => usePaymentConfig())

            // Should keep empty config
            await waitFor(() => {
                expect(result.current.googlePayConfig).toEqual({})
            })
        })

        it('should handle non-OK response gracefully', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 404
            })

            const { result } = renderHook(() => usePaymentConfig())

            await waitFor(() => {
                expect(result.current.isLoadingGooglePayConfig).toBe(false)
            })
            
            expect(result.current.googlePayConfig).toEqual({})
        })
    })

    // ==========================================================================
    // Apple Pay Config Fetch Tests
    // ==========================================================================
    
    describe('Apple Pay Config Fetch', () => {
        it('should fetch Apple Pay config on mount', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    merchantId: 'merchant.com.example.pay',
                    merchantName: 'Example Store',
                    countryCode: 'CA',
                    supportedNetworks: ['visa', 'masterCard'],
                    merchantCapabilities: ['supports3DS'],
                    environment: 'production',
                    isConfigured: true
                })
            })

            const { result } = renderHook(() => usePaymentConfig())

            await waitFor(() => {
                expect(result.current.applePayConfig.merchantId).toBe('merchant.com.example.pay')
            })

            expect(result.current.applePayConfig).toEqual({
                merchantId: 'merchant.com.example.pay',
                merchantName: 'Example Store',
                countryCode: 'CA',
                supportedNetworks: ['visa', 'masterCard'],
                merchantCapabilities: ['supports3DS'],
                environment: 'production',
                isConfigured: true
            })
        })

        it('should fetch Apple Pay config with locale', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({})
            })

            renderHook(() => usePaymentConfig({ locale: 'fr_CA' }))

            await waitFor(() => {
                const applePayFetch = global.fetch.mock.calls.find(call =>
                    call[0].includes('/api/jpmorgan/applepay/config')
                )
                expect(applePayFetch[0]).toContain('locale=fr_CA')
            })
        })

        it('should handle fetch failure gracefully', async () => {
            global.fetch.mockRejectedValue(new Error('Network error'))

            const { result } = renderHook(() => usePaymentConfig())

            // Should keep default config
            await waitFor(() => {
                expect(result.current.applePayConfig.countryCode).toBe('US')
            })
        })

        it('should handle non-OK response gracefully', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 500
            })

            const { result } = renderHook(() => usePaymentConfig())

            // Should keep default config
            await waitFor(() => {
                expect(result.current.applePayConfig.isConfigured).toBe(false)
            })
        })
    })

    // ==========================================================================
    // Locale Change Tests
    // ==========================================================================
    
    describe('Locale Changes', () => {
        it('should not re-fetch for same locale', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({})
            })

            const { rerender } = renderHook(
                ({ locale }) => usePaymentConfig({ locale }),
                { initialProps: { locale: 'en_US' }}
            )

            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalled()
            })

            const initialCallCount = global.fetch.mock.calls.length

            // Re-render with same locale
            rerender({ locale: 'en_US' })

            // Should not make additional calls
            expect(global.fetch.mock.calls.length).toBe(initialCallCount)
        })
    })

    // ==========================================================================
    // getAccessToken Error Handling Tests
    // ==========================================================================
    
    describe('getAccessToken Error Handling', () => {
        it('should proceed without token if getAccessToken throws', async () => {
            const mockGetAccessToken = jest.fn().mockRejectedValue(new Error('Token error'))
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ enableFraudCheck: true })
            })

            const { result } = renderHook(() => usePaymentConfig({ getAccessToken: mockGetAccessToken }))

            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalled()
            })

            // Should still work without token
            expect(result.current.fraudConfig).toBeDefined()
        })

        it('should proceed without token if getAccessToken returns null', async () => {
            const mockGetAccessToken = jest.fn().mockResolvedValue(null)
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({})
            })

            renderHook(() => usePaymentConfig({ getAccessToken: mockGetAccessToken }))

            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalled()
            })

            // Check that Authorization header is not set
            const fetchCall = global.fetch.mock.calls[0]
            expect(fetchCall[1].headers.Authorization).toBeUndefined()
        })
    })

    // ==========================================================================
    // SSR Safety Tests
    // ==========================================================================
    // Note: SSR safety tests are handled by the usePaymentConfig implementation
    // which checks for typeof window === 'undefined' before fetching.
    // These cannot be easily tested in jsdom environment.
})
