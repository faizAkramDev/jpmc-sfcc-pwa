/**
 * useJPMCPlaceOrder Hook
 * 
 * A simplified hook for the place order flow that wraps authorizeAndPlaceOrder
 * with loading state, error state, and callback management.
 * 
 * Now includes 3D Secure (3DS) support. When the payment requires 3DS authentication,
 * the hook will return 3DS state that can be used to render the ThreeDSModal component.
 * 
 * This hook reduces boilerplate in the developer's checkout index.jsx from ~60 lines to ~5 lines.
 * 
 * @module hooks/useJPMCPlaceOrder
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useJPMCCheckout } from '../client/context/JPMCCheckoutProvider'
import { collectBrowserInfo } from '../utils/browser-info'
import { requires3DSAuthentication, get3DSOrchestrationUrl } from '../services/api/helpers/threeds-helpers'
import { THREE_DS } from '../utils/constants.mjs'

/**
 * Default error message for payment failures
 * This is user-friendly and doesn't expose technical details
 */
const DEFAULT_ERROR_MESSAGE = "Payment couldn't be processed. Please try again later."

/**
 * Error message for missing payment information
 */
const MISSING_PAYMENT_MESSAGE = 'Please enter payment information.'

const THREE_DS_ERROR_MESSAGES = {
    TIMEOUT: 'Authentication timed out. Please try again.',
    USER_CANCELLED: 'Authentication was cancelled.',
    DENIED: 'Your card issuer denied authentication. Please try another payment method.',
    ERROR: 'An error occurred during authentication. Please try again.'
}

/**
 * Simplified hook for place order flow with 3D Secure support
 * 
 * Wraps authorizeAndPlaceOrder with loading/error state management.
 * Handles card data validation, authorization, order creation, 3DS, and callbacks.
 * 
 * When 3DS is required:
 * - isThreeDSRequired = true
 * - ThreeDSModal is rendered by JPMCCheckoutProvider (no manual rendering needed)
 * 
 * When payment authorization fails AFTER order creation:
 * - error.shouldRedirect = true
 * - error.orderNo = the failed order number * - The onError callback should navigate to your error page
 * 
 * @param {Object} options - Hook options
 * @param {Function} options.createOrderFn - Async function that creates SFCC order
 *   Should call the SFCC createOrder mutation and return the order object
 * @param {Function} [options.onSuccess] - Called with order object on successful place order
 * @param {Function} [options.onError] - Called with error object on failure.
 *   If error.shouldRedirect is true, navigate to your error page
 * @param {string} [options.baseUrl] - Base URL for 3DS callback (defaults to window.location.origin)
 * @returns {Object} Hook return value
 * @returns {Function} returns.submitOrder - Async function to trigger place order
 * @returns {boolean} returns.isLoading - True while place order is in progress
 * @returns {Object|null} returns.error - Error object or null
 * @returns {Function} returns.resetError - Function to clear the error state
 * @returns {boolean} returns.isThreeDSRequired - True when 3DS authentication is in progress
 * 
 * @example
 * // In checkout/index.jsx:
 * import { useJPMCPlaceOrder } from '@jpmorgan/jpmorgan-salesforce-pwa/client'
 * import { ThreeDSModal } from '@jpmorgan/jpmorgan-salesforce-pwa/client'
 * 
 * // Define your own error route
 * const ORDER_ERROR_ROUTE = '/checkout/order-failed'
 * 
 * const { 
 *     submitOrder, 
 *     isLoading, 
 *     error, 
 *     isThreeDSRequired,
 *     threeDSModalProps 
 * } = useJPMCPlaceOrder({
 *     createOrderFn: () => createOrder({ body: { basketId: basket.basketId } }),
 *     onSuccess: (order) => navigate(`/checkout/confirmation/${order.orderNo}`),
 *     onError: (err) => {
 *         if (err.shouldRedirect) {
 *             navigate(ORDER_ERROR_ROUTE)
 *         }
 *     }
 * })
 * 
 * // In JSX:
 * <Button onClick={submitOrder} isLoading={isLoading}>Place Order</Button>
 * {error && !error.shouldRedirect && <Alert status="error">{error.message}</Alert>}
 * // Note: ThreeDSModal is automatically rendered by JPMCCheckoutProvider
 */
export function useJPMCPlaceOrder({ createOrderFn, onSuccess, onError, baseUrl }) {
    const { 
        authorizeAndPlaceOrder, 
        hasCardData, 
        clearCheckoutData,
        isGooglePayMethod,
        googlePayResult,
        isApplePayMethod,
        initiateOrchestration,
        registerThreeDSCallbacks,
        failOrderWithReopenBasket,
        commerceConfig,
        refetchBasket
    } = useJPMCCheckout()

    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState(null)
    
    const [isThreeDSRequired, setIsThreeDSRequired] = useState(false)
    const pendingOrderRef = useRef(null)
    
    const enableCheckoutForm = useCallback(() => {
        setIsLoading(false)
    }, [])

    const lastBasketReopenResultRef = useRef(null)

    const fail3DSOrderFn = useCallback(async (orderNo, orderToken, failureReason) => {
        lastBasketReopenResultRef.current = null
        
        if (failOrderWithReopenBasket && commerceConfig) {
            const { proxy, organizationId, siteId } = commerceConfig
            if (proxy && organizationId && siteId) {
                try {
                    const reopenResult = await failOrderWithReopenBasket({
                        orderNo,
                        reasonCode: 'payment_auth_failure',
                        proxy,
                        organizationId,
                        siteId
                    })
                    
                    if (reopenResult.basketReopened) {
                        lastBasketReopenResultRef.current = reopenResult
                        await refetchBasket?.()
                        return
                    }
                } catch (err) {
                    // Fall through to server endpoint
                }
            }
        }
        
        try {
            await fetch('/api/jpmorgan/3ds/fail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderNo, orderToken, failureReason })
            })
        } catch (err) {
            // Non-blocking
        }
    }, [failOrderWithReopenBasket, commerceConfig, refetchBasket])
    
    useEffect(() => {
        registerThreeDSCallbacks({
            onSuccess: (data) => {
                clearCheckoutData()
                setIsThreeDSRequired(false)
                setIsLoading(false)
                
                if (data.continueUrl) {
                    onSuccess?.({ orderNo: data.orderID, continueUrl: data.continueUrl })
                }
            },
            onDenied: (data) => {
                setIsThreeDSRequired(false)
                const reopenResult = lastBasketReopenResultRef.current
                const errorObj = {
                    message: THREE_DS_ERROR_MESSAGES.DENIED,
                    code: 'THREE_DS_DENIED',
                    orderNo: data.orderID,
                    basketReopened: reopenResult?.basketReopened || false,
                    basketId: reopenResult?.basketId,
                    shouldRedirect: !reopenResult?.basketReopened
                }
                setError(errorObj)
                onError?.(errorObj)
                enableCheckoutForm()
            },
            onError: (data) => {
                setIsThreeDSRequired(false)
                const reopenResult = lastBasketReopenResultRef.current
                const errorObj = {
                    message: data?.error === THREE_DS.FAILURE_REASON.TIMEOUT 
                        ? THREE_DS_ERROR_MESSAGES.TIMEOUT 
                        : THREE_DS_ERROR_MESSAGES.ERROR,
                    code: data?.error || 'THREE_DS_ERROR',
                    orderNo: pendingOrderRef.current?.orderNo,
                    basketReopened: reopenResult?.basketReopened || false,
                    basketId: reopenResult?.basketId,
                    shouldRedirect: !reopenResult?.basketReopened
                }
                setError(errorObj)
                onError?.(errorObj)
                enableCheckoutForm()
            },
            onCancel: () => {
                setIsThreeDSRequired(false)
                const reopenResult = lastBasketReopenResultRef.current
                const errorObj = {
                    message: THREE_DS_ERROR_MESSAGES.USER_CANCELLED,
                    code: 'THREE_DS_CANCELLED',
                    orderNo: pendingOrderRef.current?.orderNo,
                    basketReopened: reopenResult?.basketReopened || false,
                    basketId: reopenResult?.basketId,
                    shouldRedirect: !reopenResult?.basketReopened
                }
                setError(errorObj)
                onError?.(errorObj)
                enableCheckoutForm()
            },
            onTimeout: () => {
                setIsThreeDSRequired(false)
                const reopenResult = lastBasketReopenResultRef.current
                const errorObj = {
                    message: THREE_DS_ERROR_MESSAGES.TIMEOUT,
                    code: 'THREE_DS_TIMEOUT',
                    orderNo: pendingOrderRef.current?.orderNo,
                    basketReopened: reopenResult?.basketReopened || false,
                    basketId: reopenResult?.basketId,
                    shouldRedirect: !reopenResult?.basketReopened
                }
                setError(errorObj)
                onError?.(errorObj)
                enableCheckoutForm()
            },
            fail3DSOrderFn
        })
    }, [registerThreeDSCallbacks, clearCheckoutData, onSuccess, onError, enableCheckoutForm, fail3DSOrderFn])

    /**
     * Reset error state
     * Can be called by developer when they want to clear displayed errors
     */
    const resetError = useCallback(() => {
        setError(null)
    }, [])

    /**
     * Submit order - main function to trigger place order flow
     * 
     * Flow:
     * 1. Validate card data exists
     * 2. Collect browser info for 3DS
     * 3. Call authorizeAndPlaceOrder (handles auth + order creation)
     * 4. Check if 3DS is required
     * 5. If 3DS required: initiate orchestration and wait
     * 6. On success: clear checkout data, call onSuccess callback
     * 7. On failure: set error state, call onError callback
     */
    const submitOrder = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        setIsThreeDSRequired(false)
        pendingOrderRef.current = null

        try {
            const isWalletPayment = isGooglePayMethod || isApplePayMethod
            
            const hasPaymentData = isGooglePayMethod 
                ? googlePayResult?.success 
                : hasCardData

            if (!hasPaymentData) {
                const errorObj = { message: MISSING_PAYMENT_MESSAGE }
                setError(errorObj)
                onError?.(errorObj)
                setIsLoading(false)
                return { success: false, error: errorObj }
            }

            if (!createOrderFn || typeof createOrderFn !== 'function') {
                const errorObj = { message: 'Order creation function is required' }
                setError(errorObj)
                onError?.(errorObj)
                setIsLoading(false)
                return { success: false, error: errorObj }
            }

            let browserInfo = null
            if (!isWalletPayment) {
                browserInfo = collectBrowserInfo()
            }

            const result = await authorizeAndPlaceOrder(createOrderFn, { browserInfo })

            if (requires3DSAuthentication(result.authorization)) {
                pendingOrderRef.current = {
                    orderNo: result.order?.orderNo,
                    orderToken: result.order?.orderToken || result.order?.orderNo
                }

                const orchestrationUrl = get3DSOrchestrationUrl(result.authorization)
                
                if (!orchestrationUrl) {
                    const errorObj = {
                        message: 'Authentication required but URL not provided',
                        code: 'THREE_DS_NO_URL',
                        orderNo: result.order?.orderNo
                    }
                    setError(errorObj)
                    onError?.(errorObj)
                    setIsLoading(false)
                    return { success: false, error: errorObj }
                }

                setIsThreeDSRequired(true)

                initiateOrchestration(
                    orchestrationUrl,
                    pendingOrderRef.current.orderNo,
                    pendingOrderRef.current.orderToken
                )

                return {
                    success: false,
                    pending3DS: true,
                    orderNo: result.order?.orderNo
                }
            }

            if (result.success) {
                clearCheckoutData()
                
                onSuccess?.(result.order)
                
                return { 
                    success: true, 
                    order: result.order
                }
            } else {
                const shouldRedirect = !result.basketReopened && !!result.orderNo
                const errorObj = { 
                    message: result.error || result.message || DEFAULT_ERROR_MESSAGE,
                    step: result.step,
                    code: result.code || result.errorCode,
                    orderNo: result.orderNo,
                    basketReopened: result.basketReopened,
                    basketId: result.basketId,
                    shouldRedirect
                }
                setError(errorObj)
                onError?.(errorObj)
                
                return { success: false, error: errorObj }
            }
        } catch (err) {
            const errorObj = { 
                message: DEFAULT_ERROR_MESSAGE,
                originalError: err
            }
            setError(errorObj)
            onError?.(errorObj)
            
            return { success: false, error: errorObj }
        } finally {
            if (!isThreeDSRequired) {
                setIsLoading(false)
            }
        }
    }, [
        authorizeAndPlaceOrder, 
        createOrderFn, 
        hasCardData, 
        isGooglePayMethod,
        isApplePayMethod,
        googlePayResult,
        clearCheckoutData, 
        onSuccess, 
        onError,
        initiateOrchestration,
        isThreeDSRequired
    ])

    return {
        submitOrder,
        isLoading,
        error,
        resetError,
        isThreeDSRequired
    }
}

export default useJPMCPlaceOrder
