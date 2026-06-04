/**
 * usePaymentConfig Hook
 * 
 * Auto-fetches payment configuration from SFCC Business Manager:
 * - Fraud/Kount configuration
 * - Google Pay configuration
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/client/context/hooks/usePaymentConfig
 * @internal
 */

import { useState, useEffect, useRef } from 'react'

/**
 * Default fraud config values
 */
const DEFAULT_FRAUD_CONFIG = {
    enableFraudCheck: false,
    enableFraudCheckAtAuth: false,
    kountClientId: null,
    kountEnvironment: 'TEST'
}

/**
 * Hook to fetch and manage payment configuration
 * 
 * @param {object} options
 * @param {object} options.googlePayConfigFromProps - Google Pay config from props (optional)
 * @param {string} options.locale - Locale ID for multi-MID support (e.g., 'en_CA')
 * @param {function} options.getAccessToken - Async function to get SLAS access token (for multi-MID CO lookup)
 * @returns {object} Payment configuration state
 */
export function usePaymentConfig({ googlePayConfigFromProps, locale, getAccessToken } = {}) {
    // ==========================================================================
    // Fraud / Kount Config State
    // ==========================================================================
    
    const [fraudConfig, setFraudConfig] = useState(DEFAULT_FRAUD_CONFIG)
    // Track which locale was fetched (null = not fetched, string = fetched locale)
    const fraudConfigFetchedLocaleRef = useRef(null)
    
    // ==========================================================================
    // Google Pay Config State
    // ==========================================================================
    
    const [fetchedGooglePayConfig, setFetchedGooglePayConfig] = useState(null)
    const [isLoadingGooglePayConfig, setIsLoadingGooglePayConfig] = useState(false)
    // Track which locale was fetched (null = not fetched, string = fetched locale)
    const googlePayConfigFetchedLocaleRef = useRef(null)

    // ==========================================================================
    // Apple Pay Config State
    // ==========================================================================

    const [applePayConfig, setApplePayConfig] = useState({
        merchantId: null,
        merchantName: null,
        countryCode: 'US',
        supportedNetworks: undefined,
        merchantCapabilities: undefined,
        environment: 'sandbox',
        isConfigured: false
    })
    // Track which locale was fetched (null = not fetched, string = fetched locale)
    const applePayConfigFetchedLocaleRef = useRef(null)
    
    // ==========================================================================
    // Fraud Config Fetch
    // ==========================================================================
    
    useEffect(() => {
        // Skip if already fetched for this locale or SSR
        const localeKey = locale || 'default'
        if (fraudConfigFetchedLocaleRef.current === localeKey || typeof window === 'undefined') return
        fraudConfigFetchedLocaleRef.current = localeKey
        
        const fetchFraudConfig = async () => {
            try {
                const url = locale 
                    ? `/api/jpmorgan/fraud-config?locale=${encodeURIComponent(locale)}`
                    : '/api/jpmorgan/fraud-config'
                
                // Build headers with Authorization if SLAS token is available (for multi-MID CO lookup)
                const headers = {}
                if (getAccessToken) {
                    try {
                        const token = await getAccessToken()
                        if (token) {
                            headers['Authorization'] = `Bearer ${token}`
                        }
                    } catch (_tokenErr) {
                        // Token fetch failed, proceed without it (will fall back to Site Preferences)
                    }
                }
                
                const response = await fetch(url, { headers })
                
                if (response.ok) {
                    const data = await response.json()
                    const resolved = {
                        enableFraudCheck: data.enableFraudCheck || false,
                        enableFraudCheckAtAuth: data.enableFraudCheckAtAuth || false,
                        kountClientId: data.kountClientId || null,
                        kountEnvironment: data.kountEnvironment || 'TEST'
                    }
                    setFraudConfig(resolved)
                    // Fraud check settings loaded from server config
                }
                // Non-OK response: use defaults already set in state
            } catch (_err) {
                // Fetch failed: use defaults already set in state
            }
        }
        
        fetchFraudConfig()
    }, [locale, getAccessToken])
    
    // ==========================================================================
    // Google Pay Config Fetch
    // ==========================================================================
    
    useEffect(() => {
        // Skip if config was passed via props
        if (googlePayConfigFromProps?.gatewayMerchantId) {
            return
        }
        
        // SSR safety check
        if (typeof window === 'undefined') {
            return
        }
        
        // Skip if already fetched for this locale
        const localeKey = locale || 'default'
        if (googlePayConfigFetchedLocaleRef.current === localeKey) {
            return
        }
        
        googlePayConfigFetchedLocaleRef.current = localeKey
        setIsLoadingGooglePayConfig(true)
        
        const fetchGooglePayConfig = async () => {
            try {
                const url = locale
                    ? `/api/jpmorgan/googlepay/config?locale=${encodeURIComponent(locale)}`
                    : '/api/jpmorgan/googlepay/config'
                
                // Build headers with Authorization if SLAS token is available (for multi-MID CO lookup)
                const headers = {}
                if (getAccessToken) {
                    try {
                        const token = await getAccessToken()
                        if (token) {
                            headers['Authorization'] = `Bearer ${token}`
                        }
                    } catch (_tokenErr) {
                        // Token fetch failed, proceed without it (will fall back to Site Preferences)
                    }
                }
                
                const response = await fetch(url, { headers })
                
                if (!response.ok) {
                    return
                }
                
                const data = await response.json()
                
                // Transform API response to useGooglePay format
                setFetchedGooglePayConfig({
                    gatewayMerchantId: data.gatewayMerchantId,
                    merchantName: data.merchantInfo?.merchantName,
                    merchantId: data.merchantInfo?.merchantId,
                    environment: data.environment === 'PRODUCTION' ? 'production' : 'sandbox',
                    gateway: data.gateway,
                    allowedNetworks: data.allowedCardNetworks,
                    allowedAuthMethods: data.allowedAuthMethods,
                    // Cart/PDP enabled flags - strictly from BM (no fallbacks)
                    cartEnabled: data.cartEnabled === true,
                    pdpEnabled: data.pdpEnabled === true,
                    // Allowed shipping countries from BM (for cart/pdp Google Pay)
                    allowedShippingCountries: data.allowedShippingCountries,
                    // AVS settings - strictly from BM (no fallbacks)
                    enableAVS: data.enableAVS === true,
                    billingAddressRequired: data.billingAddressRequired === true
                })
            } catch (err) {
                // Fetch failed: Google Pay will be disabled (no config = no GPay)
            } finally {
                setIsLoadingGooglePayConfig(false)
            }
        }
        
        fetchGooglePayConfig()
    }, [googlePayConfigFromProps?.gatewayMerchantId, locale, getAccessToken])
    
    // ==========================================================================
    // Resolved Google Pay Config (props override fetched)
    // ==========================================================================
    
    const googlePayConfig = googlePayConfigFromProps?.gatewayMerchantId 
        ? googlePayConfigFromProps 
        : (fetchedGooglePayConfig || {})

    // ==========================================================================
    // Apple Pay Config Fetch
    // ==========================================================================

    useEffect(() => {
        // Skip if SSR
        if (typeof window === 'undefined') return
        
        // Skip if already fetched for this locale
        const localeKey = locale || 'default'
        if (applePayConfigFetchedLocaleRef.current === localeKey) return
        applePayConfigFetchedLocaleRef.current = localeKey

        const fetchApplePayConfig = async () => {
            try {
                const url = locale
                    ? `/api/jpmorgan/applepay/config?locale=${encodeURIComponent(locale)}`
                    : '/api/jpmorgan/applepay/config'
                
                // Build headers with Authorization if SLAS token is available (for multi-MID CO lookup)
                const headers = {}
                if (getAccessToken) {
                    try {
                        const token = await getAccessToken()
                        if (token) {
                            headers['Authorization'] = `Bearer ${token}`
                        }
                    } catch (_tokenErr) {
                        // Token fetch failed, proceed without it (will fall back to Site Preferences)
                    }
                }
                
                const response = await fetch(url, { headers })
                if (!response.ok) return
                const data = await response.json()
                setApplePayConfig({
                    merchantId: data.merchantId || null,
                    merchantName: data.merchantName || null,
                    countryCode: data.countryCode || 'US',
                    supportedNetworks: data.supportedNetworks || undefined,
                    merchantCapabilities: data.merchantCapabilities || undefined,
                    environment: data.environment || 'sandbox',
                    isConfigured: data.isConfigured || false
                })
            } catch (_err) {
                // Fetch failed: Apple Pay config remains at defaults
            }
        }

        fetchApplePayConfig()
    }, [locale, getAccessToken])
    
    // ==========================================================================
    // Derived Values
    // ==========================================================================
    
    const kountEnabled = fraudConfig.enableFraudCheck && !!fraudConfig.kountClientId
    
    // ==========================================================================
    // Return
    // ==========================================================================
    
    return {
        // Fraud/Kount config
        fraudConfig,
        kountEnabled,
        
        // Google Pay config
        googlePayConfig,
        isLoadingGooglePayConfig,

        // Apple Pay config
        applePayConfig,
        
        // Loading states
        isLoading: isLoadingGooglePayConfig
    }
}

export default usePaymentConfig
