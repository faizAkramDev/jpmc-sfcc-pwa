/**
 * useOrderConfirm Hook
 * 
 * Handles server-side order confirmation after JPMC authorization.
 * Calls POST /api/jpmorgan/order/:orderNo/confirm to:
 * 1. Update order status from 'created' to 'new'
 * 2. Patch payment instrument with JPMC transaction data
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/client/context/hooks/useOrderConfirm
 * @internal
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { GENERIC_API_ERROR_MESSAGE } from '../../../utils/constants/error-constants'

/**
 * Hook to manage server-side order confirmation
 * 
 * @param {object} options
 * @param {string} options.locale - Locale ID for multi-MID support (e.g., 'en_CA')
 * @param {function} options.getAccessToken - Function to get SLAS token for multi-MID CO lookup
 * @returns {object} Order confirmation state and methods
 */
export function useOrderConfirm({ locale, getAccessToken } = {}) {
    // ==========================================================================
    // State
    // ==========================================================================
    
    const [orderConfirmResult, setOrderConfirmResult] = useState(null)
    const [isConfirmingOrder, setIsConfirmingOrder] = useState(false)
    
    // Mounted ref to prevent state updates after unmount
    const mountedRef = useRef(true)
    
    useEffect(() => {
        return () => {
            mountedRef.current = false
        }
    }, [])
    
    // ==========================================================================
    // Confirm Order Method
    // ==========================================================================
    
    /**
     * Confirm order with JPMC payment data via server-side API
     * 
     * This calls POST /api/jpmorgan/order/:orderNo/confirm which:
     * 1. Updates order status from 'created' to 'new'
     * 2. Patches payment instrument with JPMC transaction data (c_jpmcTransactionId)
     * 3. Patches payment transaction with authorization details and calculated amounts
     * 
     * @param {string} orderNo - SFCC order number
     * @param {object} jpmcResponse - JPMC authorization response
     * @param {string} paymentInstrumentId - Payment instrument ID
     * @param {object} options - Additional options
     * @param {string} options.captureMethod - Capture method used ('NOW', 'MANUAL', 'DELAYED')
     * @param {number} options.paymentAmount - Payment amount in dollars
     * @returns {Promise<object>} Confirmation result
     */
    const confirmOrderServerSide = useCallback(async (orderNo, jpmcResponse, paymentInstrumentId, options = {}) => {
        const { captureMethod = 'MANUAL', paymentAmount } = options
        
        if (!orderNo) {
            return { success: false, error: 'orderNo is required' }
        }
        
        
        setIsConfirmingOrder(true)
        
        try {
            const localeParam = locale ? `?locale=${encodeURIComponent(locale)}` : ''
            
            // Build headers with Authorization for multi-MID CO lookup
            const headers = { 'Content-Type': 'application/json' }
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
            
            const response = await fetch(`/api/jpmorgan/order/${orderNo}/confirm${localeParam}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    jpmcResponse,
                    paymentInstrumentId,
                    captureMethod,
                    paymentAmount
                })
            })
            
            const result = await response.json()
            
            if (mountedRef.current) {
                setOrderConfirmResult(result)
            }
            
            // Result logged server-side; success/failure handled by caller
            
            return result
        } catch (error) {
            return { success: false, error: GENERIC_API_ERROR_MESSAGE }
        } finally {
            if (mountedRef.current) {
                setIsConfirmingOrder(false)
            }
        }
    }, [locale, getAccessToken])
    
    // ==========================================================================
    // Fail Order Method
    // ==========================================================================
    
    /**
     * Mark order as failed via server-side API
     * 
     * This calls POST /api/jpmorgan/order/:orderNo/fail which:
     * 1. Updates order status to 'failed' in SFCC BM
     * 2. Logs the failure reason for debugging
     * 
     * @param {string} orderNo - SFCC order number
     * @param {object} jpmcResponse - JPMC response (may contain error details)
     * @param {string} reason - Failure reason description
     * @param {string} errorCode - Error code from JPMC
     * @returns {Promise<object>} Fail result
     */
    const failOrderServerSide = useCallback(async (orderNo, jpmcResponse, reason, errorCode) => {
        if (!orderNo) {
            return { success: false, error: 'orderNo is required' }
        }
        
        
        try {
            const localeParam = locale ? `?locale=${encodeURIComponent(locale)}` : ''
            
            // Build headers with Authorization for multi-MID CO lookup
            const headers = { 'Content-Type': 'application/json' }
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
            
            const response = await fetch(`/api/jpmorgan/order/${orderNo}/fail${localeParam}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    jpmcResponse,
                    reason,
                    errorCode
                })
            })
            
            const result = await response.json()
            return result
        } catch (error) {
            return { success: false, error: GENERIC_API_ERROR_MESSAGE }
        }
    }, [locale, getAccessToken])
    
    // ==========================================================================
    // Fail Order with Basket Reopen (Client-Side SCAPI Call)
    // ==========================================================================
    
    /**
     * Fail order via SCAPI and reopen basket (Client-Side)
     * 
     * Makes direct call to SCAPI failOrder endpoint with reopenBasket=true.
     * This allows the customer to retry payment without losing their cart.
     * 
     * Note: This bypasses the server-side /api/jpmorgan/order/:orderNo/fail endpoint
     * and calls SCAPI directly from the client using the shopper's JWT token.
     * 
     * @param {object} options
     * @param {string} options.orderNo - SFCC order number
     * @param {string} options.reasonCode - Reason code ('payment_auth_failure', 'payment_confirm_failure', 'payment_capture_failure')
     * @param {string} options.proxy - Proxy URL from commerce-sdk-react useConfig
     * @param {string} options.organizationId - Organization ID from commerce-sdk-react useConfig
     * @param {string} options.siteId - Site ID from commerce-sdk-react useConfig
     * @returns {Promise<{success: boolean, basketId?: string, basketReopened?: boolean, error?: string, conflictError?: boolean}>}
     */
    const failOrderWithReopenBasket = useCallback(async ({
        orderNo,
        reasonCode = 'payment_auth_failure',
        proxy,
        organizationId,
        siteId
    }) => {
        if (!orderNo || !proxy || !organizationId || !siteId) {
            return { success: false, error: 'Missing required parameters' }
        }

        try {
            let token = null
            if (getAccessToken) {
                try {
                    token = await getAccessToken()
                } catch (_tokenErr) {
                    return { success: false, error: 'Failed to get access token' }
                }
            }

            if (!token) {
                return { success: false, error: 'No access token available' }
            }

            const url = `${proxy}/checkout/shopper-orders/v1/organizations/${organizationId}/orders/${orderNo}/actions/fail?siteId=${siteId}&reopenBasket=true`

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ reasonCode })
            })

            if (response.status === 409) {
                return { 
                    success: false, 
                    error: 'Cannot reopen basket - customer already has an active basket',
                    conflictError: true 
                }
            }

            if (!response.ok) {
                const errorText = await response.text().catch(() => '')
                return { 
                    success: false, 
                    error: `Failed to fail order: ${response.status} ${errorText}` 
                }
            }

            const locationHeader = response.headers.get('Location')
            let basketId = null
            
            if (locationHeader) {
                const basketMatch = locationHeader.match(/\/baskets\/([^/?]+)/)
                if (basketMatch) {
                    basketId = basketMatch[1]
                }
            }

            return { 
                success: true, 
                basketReopened: !!basketId,
                basketId 
            }

        } catch (error) {
            return { success: false, error: GENERIC_API_ERROR_MESSAGE }
        }
    }, [getAccessToken])
    
    // ==========================================================================
    // Reset Method
    // ==========================================================================
    
    /**
     * Reset order confirmation state
     */
    const resetOrderConfirm = useCallback(() => {
        setOrderConfirmResult(null)
        setIsConfirmingOrder(false)
    }, [])
    
    // ==========================================================================
    // Return
    // ==========================================================================
    
    return {
        // State
        orderConfirmResult,
        isConfirmingOrder,
        
        // Methods
        confirmOrderServerSide,
        failOrderServerSide,
        failOrderWithReopenBasket,
        resetOrderConfirm,
        
        // Computed
        isOrderConfirmed: orderConfirmResult?.success || false
    }
}

export default useOrderConfirm
