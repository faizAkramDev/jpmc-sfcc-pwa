/**
 * useServerConfig Hook
 * 
 * Handles fetching Google Pay configuration from server API.
 * Skips fetching if contextGooglePayConfig is already provided from JPMCCheckoutProvider context.
 * 
 * @module client/components/hooks/useServerConfig
 */

import { useState, useEffect, useRef } from 'react'
import { GENERIC_API_ERROR_MESSAGE } from '../../../utils/constants/error-constants'

/**
 * Hook for fetching Google Pay config from server
 * 
 * @param {Object} options - Hook options
 * @param {boolean} options.autoFetchConfig - Whether to auto-fetch config
 * @param {string} options.apiBasePath - API base path
 * @param {Object} [options.contextGooglePayConfig] - Google Pay config from JPMCCheckoutProvider (skips fetch if has gatewayMerchantId)
 * @param {function} [options.getAccessToken] - Function to get SLAS token for multi-MID CO lookup
 * @param {string} [options.locale] - Locale ID for multi-MID CO lookup
 * @returns {Object} Config state
 */
export const useServerConfig = ({
    autoFetchConfig,
    apiBasePath,
    contextGooglePayConfig,
    getAccessToken,
    locale
}) => {
    const [serverConfig, setServerConfig] = useState(null)
    // Skip loading if context already has config with gatewayMerchantId
    const hasContextConfig = !!contextGooglePayConfig?.gatewayMerchantId
    const [configLoading, setConfigLoading] = useState(autoFetchConfig && !hasContextConfig)
    const [configError, setConfigError] = useState(null)
    const configFetchedRef = useRef(false)

    useEffect(() => {
        // Skip if context already has Google Pay config with gatewayMerchantId
        // This prevents duplicate fetch when inside JPMCCheckoutProvider
        if (contextGooglePayConfig?.gatewayMerchantId) {
            setConfigLoading(false)
            return
        }
        
        // Skip if autoFetchConfig is not enabled or already fetched
        if (!autoFetchConfig || configFetchedRef.current || serverConfig) {
            return
        }
        
        configFetchedRef.current = true
        
        const fetchConfig = async () => {
            try {
                setConfigLoading(true)
                setConfigError(null)
                
                // Build URL with locale param for multi-MID
                const localeParam = locale ? `?locale=${encodeURIComponent(locale)}` : ''
                
                // Build headers with Authorization for multi-MID CO lookup
                const headers = {}
                if (getAccessToken) {
                    try {
                        const token = await getAccessToken()
                        if (token) {
                            headers['Authorization'] = `Bearer ${token}`
                        }
                    } catch (_tokenErr) {
                        // Token fetch failed, proceed without it
                    }
                }
                
                const response = await fetch(`${apiBasePath}/googlepay/config${localeParam}`, { headers })
                const data = await response.json()
                
                if (!response.ok) {
                    throw new Error(GENERIC_API_ERROR_MESSAGE)
                }
                
                setServerConfig(data)
            } catch (err) {
                setConfigError(err)
            } finally {
                setConfigLoading(false)
            }
        }
        
        fetchConfig()
    }, [autoFetchConfig, apiBasePath, serverConfig, contextGooglePayConfig?.gatewayMerchantId, getAccessToken, locale])

    return {
        serverConfig,
        configLoading,
        configError
    }
}

export default useServerConfig
