/**
 * usePaymentMethods Hook
 * 
 * Auto-fetches available payment methods from SFCC Business Manager.
 * Provides a plug-and-play experience - no manual configuration needed.
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/client/context/hooks/usePaymentMethods
 * @internal
 */

import { useState, useEffect, useRef, useMemo } from 'react'

/**
 * Default payment method IDs (fallbacks if BM lookup fails)
 */
const DEFAULT_GOOGLE_PAY_METHOD_ID = 'JPMC_GOOGLE_PAY'
const DEFAULT_CREDIT_CARD_METHOD_ID = 'CREDIT_CARD'
const DEFAULT_APPLE_PAY_METHOD_ID = 'DW_APPLE_PAY'

/**
 * Cache for default locale - prevents repeated sites.js resolution
 * @type {string|null}
 */
let cachedDefaultLocale = null

/**
 * Resolve sites.js from multiple possible locations
 * Supports flexible integrator setups with different directory structures
 * @returns {object|null} Sites configuration or null if not found
 */
const resolveSitesConfig = () => {
    const possiblePaths = [
        '../../../../../retail-react-app/config/sites.js',
        '../../../../retail-react-app/config/sites.js',
        '../../retail-react-app/config/sites.js',
        '../config/sites.js',
    ]
    
    for (const path of possiblePaths) {
        try {
            // eslint-disable-next-line global-require
            const sites = require(path)
            if (sites && (Array.isArray(sites) || typeof sites === 'object')) {
                return sites
            }
        } catch (e) {
            // Continue to next path
        }
    }
    
    return null
}

/**
 * Get the default locale from sites.js configuration
 * Apple Pay is ONLY supported for the default locale
 * @param {string} defaultLocale - Default locale passed from consumer (e.g., 'en-US')
 * @returns {string} Default locale
 */
const getDefaultLocale = () => {
    // Return cached value if already loaded
    if (cachedDefaultLocale) {
        return cachedDefaultLocale
    }
    
    // Try to dynamically resolve and import sites.js
    const sites = resolveSitesConfig()
    
    if (sites) {
        // Handle array format (sites[0].l10n.defaultLocale)
        if (Array.isArray(sites) && sites[0]?.l10n?.defaultLocale) {
            cachedDefaultLocale = sites[0].l10n.defaultLocale
            return cachedDefaultLocale
        }
        // Handle object format (sites.l10n.defaultLocale)
        if (sites.l10n?.defaultLocale) {
            cachedDefaultLocale = sites.l10n.defaultLocale
            return cachedDefaultLocale
        }
        // Handle sites.localization.defaultLocale format
        if (sites.localization?.defaultLocale) {
            cachedDefaultLocale = sites.localization.defaultLocale
            return cachedDefaultLocale
        }
    }
    
    // Fallback to en-US if sites.js cannot be loaded
    cachedDefaultLocale = 'en-US'
    return cachedDefaultLocale
}

/**
 * Check if the given locale is the default locale
 * Apple Pay does NOT support multi-locale configuration
 * Normalizes locale formats (en-US vs en_US)
 * @param {string} locale - Locale to check (e.g., 'en-CA', 'en_CA')
 * @param {string} defaultLocale - Default locale (e.g., 'en-US')
 * @returns {boolean} True if locale is the default locale
 */
const isDefaultLocale = (locale, defaultLocale) => {
    if (!locale) return true // If no locale specified, assume default
    
    const defaultLoc = getDefaultLocale(defaultLocale)
    
    // Normalize both locales (replace _ with -)
    const normalizedLocale = locale.replace(/_/g, '-')
    const normalizedDefault = defaultLoc.replace(/_/g, '-')
    
    return normalizedLocale === normalizedDefault
}

/**
 * Hook to fetch and manage available payment methods from SFCC
 * 
 * @param {object} options
 * @param {string} options.basketId - Current basket ID
 * @param {function} options.getAccessToken - Function to get SLAS access token
 * @param {boolean} options.isGooglePayReady - Google Pay SDK ready state
 * @param {boolean} options.isGooglePayAvailable - Google Pay browser availability
 * @param {string} options.locale - Locale ID for multi-MID support (e.g., 'en_CA')
 * @param {string} options.defaultLocale - Default locale (e.g., 'en-US') - optional, defaults to 'en-US'
 * @returns {object} Payment methods state and derived values
 */
export function usePaymentMethods({
    basketId,
    getAccessToken,
    isGooglePayReady = false,
    isGooglePayAvailable = false,
    isApplePayAvailable = false,
    locale,
    defaultLocale = 'en-US'
}) {
    // ==========================================================================
    // State
    // ==========================================================================
    
    const [activePaymentMethods, setActivePaymentMethods] = useState({
        isCreditCardActive: false,
        isGooglePayActive: false,
        isApplePayActive: false,
        creditCardPaymentMethodId: null,
        googlePayPaymentMethodId: null,
        applePayPaymentMethodId: null,
        isLoading: true
    })
    
    const paymentMethodsFetchedRef = useRef(null)
    
    // ==========================================================================
    // Fetch Payment Methods
    // ==========================================================================
    
    useEffect(() => {
        // Skip if no basket, already fetched for this basket+locale, or SSR
        if (!basketId || typeof window === 'undefined') {
            setActivePaymentMethods(prev =>
                prev.isLoading
                    ? {
                          ...prev,
                          isCreditCardActive: true,
                          isGooglePayActive: true,
                          isApplePayActive: true,
                          isLoading: false
                      }
                    : prev
            )
            return
        }
        
        // Track by basketId + locale to re-fetch when either changes
        const cacheKey = `${basketId}::${locale || 'default'}`
        if (paymentMethodsFetchedRef.current === cacheKey) {
            return
        }
        
        paymentMethodsFetchedRef.current = cacheKey
        
        const fetchPaymentMethods = async () => {
            try {
                
                // Get SLAS token for API call (required for Shopper Baskets API)
                let headers = { 'Content-Type': 'application/json' }
                if (getAccessToken) {
                    try {
                        const token = await getAccessToken()
                        if (token) {
                            headers['Authorization'] = `Bearer ${token}`
                        }
                    } catch (_tokenError) {
                        // Token fetch failed - proceed without auth header
                    }
                }
                
                const localeParam = locale ? `&locale=${encodeURIComponent(locale)}` : ''
                const response = await fetch(`/api/jpmorgan/available-payment-methods?basketId=${basketId}${localeParam}`, { headers })
                
                if (!response.ok) {
                    setActivePaymentMethods(prev => ({ ...prev, isLoading: false }))
                    return
                }
                
                const data = await response.json()
                
                setActivePaymentMethods({
                    isCreditCardActive: data.isCreditCardActive ?? false,
                    isGooglePayActive: data.isGooglePayActive ?? false,
                    isApplePayActive: data.isApplePayActive ?? false,
                    creditCardPaymentMethodId: data.creditCardPaymentMethodId || null,
                    googlePayPaymentMethodId: data.googlePayPaymentMethodId || null,
                    applePayPaymentMethodId: data.applePayPaymentMethodId || null,
                    isLoading: false
                })
            } catch (err) {
                setActivePaymentMethods(prev => ({ ...prev, isLoading: false }))
            }
        }
        
        fetchPaymentMethods()
    }, [basketId, getAccessToken, locale])
    
    // ==========================================================================
    // Derived Payment Method IDs (with fallbacks)
    // ==========================================================================
    
    const googlePayPaymentMethodId = activePaymentMethods.googlePayPaymentMethodId || DEFAULT_GOOGLE_PAY_METHOD_ID
    const creditCardPaymentMethodId = activePaymentMethods.creditCardPaymentMethodId || DEFAULT_CREDIT_CARD_METHOD_ID
    const applePayPaymentMethodId = activePaymentMethods.applePayPaymentMethodId || DEFAULT_APPLE_PAY_METHOD_ID
    
    // ==========================================================================
    // Computed *Enabled Flags
    // ==========================================================================
    // Single boolean to control button visibility
    // Combines: SDK availability + browser/device support + BM settings
    
    const isCreditCardEnabled = useMemo(() => {
        return activePaymentMethods?.isLoading || 
               activePaymentMethods?.isCreditCardActive !== false
    }, [activePaymentMethods?.isLoading, activePaymentMethods?.isCreditCardActive])
    
    const isGooglePayEnabled = useMemo(() => {
        const bmEnabled = activePaymentMethods?.isLoading || 
                          activePaymentMethods?.isGooglePayActive !== false
        return isGooglePayAvailable && isGooglePayReady && bmEnabled
    }, [isGooglePayAvailable, isGooglePayReady, activePaymentMethods?.isLoading, activePaymentMethods?.isGooglePayActive])
    
    const isApplePayEnabled = useMemo(() => {
        // Apple Pay is ONLY supported for the default locale (no multi-locale support)
        // Check locale first before any other checks
        if (!isDefaultLocale(locale, defaultLocale)) {
            return false
        }
        
        const bmEnabled = activePaymentMethods?.isLoading || 
               activePaymentMethods?.isApplePayActive !== false
        return isApplePayAvailable && bmEnabled
    }, [locale, defaultLocale, isApplePayAvailable, activePaymentMethods?.isLoading, activePaymentMethods?.isApplePayActive])
    
    // ==========================================================================
    // Return
    // ==========================================================================
    
    return {
        activePaymentMethods,
        googlePayPaymentMethodId,
        creditCardPaymentMethodId,
        applePayPaymentMethodId,
        isCreditCardEnabled,
        isGooglePayEnabled,
        isApplePayEnabled,
        isLoading: activePaymentMethods.isLoading
    }
}

export default usePaymentMethods
