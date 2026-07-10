/**
 * useDropInPaymentSuccess Hook
 *
 * Encapsulates the complete Drop-in payment success flow:
 * 1. Set billing address to basket
 * 2. Attach CREDIT_CARD payment instrument
 * 3. Create SFCC order
 * 4. Normalize Drop-in payload and confirm order server-side
 * 5. Call success callback (e.g., navigate to confirmation)
 *
 * This hook extracts the 100+ lines of handleDropInPaymentSuccess logic
 * from retail-react-app/checkout so integrators don't need to duplicate
 * this flow in every app.
 *
 * @module @jpmorgan/jpmorgan-salesforce-pwa/hooks/useDropInPaymentSuccess
 *
 * @example
 * const { handlePaymentSuccess, isProcessing, error } = useDropInPaymentSuccess({
 *   basket,
 *   createOrderFn: createOrderMutation,
 *   onSuccess: (orderNo) => navigate(`/checkout/confirmation/${orderNo}`),
 *   onError: (error) => setErrorMessage(error)
 * })
 *
 * return <DropInCheckout onPaymentSuccess={handlePaymentSuccess} />
 */

import { useCallback, useState, useRef } from 'react'
import { normalizeDropInPayload } from '../utils/drop-in-payload-normalizer'
import { useJPMCCheckout } from '../client/context/JPMCCheckoutProvider'

/**
 * Hook to handle Drop-in payment success
 *
 * Orchestrates the complete order flow after Drop-in SDK fires PaymentSuccess.
 * All integration-specific logic (like redirect-to-confirmation) should be in
 * the onSuccess callback, keeping this hook framework-agnostic.
 *
 * **Payment Metadata Persistence (Server-Side Responsibility):**
 * 
 * The confirmOrderServerSide endpoint receives confirmPayload containing payment data.
 * It MUST persist the following to the order and payment instrument:
 * 
 * Payment Instrument Attributes:
 * - transactionId (from normalizedPayload.transactionId or .paymentGatewayTransactionId)
 * - maskedPan (credit card number for display)
 * - cardTypeName (card brand: Visa, Mastercard, etc.)
 * - cardExpirationMonth (card expiry month)
 * - cardExpirationYear (card expiry year)
 * - accountHolderName (cardholder name)
 * 
 * Payment Transaction Attributes:
 * - jpmcAuthTimestamp (from normalizedPayload.paymentGatewayTransactionTimestamp)
 * - jpmcMerchantId (from config, for merchant tracking)
 * 
 * Order Custom Attributes:
 * - jpmcCheckoutMode = 'DROP_IN' (identifies Drop-in orders vs other payment methods)
 * - jpmcGatewayTransactionId = transactionId (JPMC transaction ID for reconciliation)
 * - jpmcMerchantId = merchantId (merchant tracking)
 * - jpmcMaskedPan = maskedPan (card last 4 for display in Business Manager)
 * - jpmcApprovalCode = approvalCode (authorization code, if available)
 *
 * @param {object} options
 * @param {object} options.basket - Current basket from useCurrentBasket hook
 *   Must have: basketId, shipments[].shippingAddress, billingAddress, orderTotal, paymentInstruments
 *
 * @param {function} options.createOrderFn - SCAPI createOrder mutation function
 *   Signature: async (body: { basketId }) => Promise<{ orderNo, paymentInstruments, orderTotal }>
 *
 * @param {function} options.onSuccess - Called after order confirmed successfully
 *   Signature: (orderNo: string) => void
 *   Common usage: navigate to confirmation page, show success message
 *
 * @param {function} [options.fraudDetectionFn] - Optional fraud detection check
 *   Signature: async (order: object, payload: object) => Promise<{ status: 'pass'|'fail', errorCode?: string }>
 *   Called after order creation to validate against fraud scoring
 *   If status === 'fail', order is failed and error returned to user
 *   If omitted, fraud detection is skipped (no fraud checks run)
 *   NOTE: Requires custom endpoint implementation - not provided by default
 *
 * @param {function} [options.onError] - Called if any step fails
 *   Signature: (error: string) => void
 *   If omitted, errors are logged to console only
 *
 * @param {boolean} [options.debug=false] - Enable detailed logging for troubleshooting
 *
 * @returns {object} Hook result
 * @returns {function} result.handlePaymentSuccess - Main handler, call with jpmcPayload
 *   Signature: async (jpmcPayload) => Promise<{ success: boolean, error?: string }>
 *
 * @returns {boolean} result.isProcessing - True while any step is running
 * @returns {string|null} result.error - Last error message, null if none
 * @returns {function} result.clearError - Reset error state
 *
 * @throws {Error} If required mutations from useJPMCCheckout are missing
 */
export function useDropInPaymentSuccess({
    basket,
    createOrderFn,
    onSuccess,
    fraudDetectionFn,
    onError,
    debug = false
} = {}) {
    const [isProcessing, setIsProcessing] = useState(false)
    const [error, setError] = useState(null)
    
   const currentBasketIdRef = useRef(null)

    // Get required mutations and state from context
    const {
        addPaymentInstrumentToBasket,
        removePaymentInstrumentFromBasket,
        confirmOrderServerSide,
        paymentConfig,
        commerceConfig: jpmcCommerceConfig,
        failOrderWithReopenBasket,
        refetchBasket
    } = useJPMCCheckout()

    

    const clearError = useCallback(() => {
        setError(null)
    }, [])

    /**
     * Main handler - orchestrates the 5-step flow
     */
    const handlePaymentSuccess = useCallback(async (jpmcPayload) => {
        if (!createOrderFn) {
            const err = 'createOrderFn is required'
            setError(err)
            onError?.(err)
            return { success: false, error: err }
        }

        if (!basket?.basketId) {
            const err = 'Basket not available'
            setError(err)
            onError?.(err)
            return { success: false, error: err }
        }

        if (currentBasketIdRef.current === basket.basketId) {
           
            return { success: true }
        }
        
        currentBasketIdRef.current = basket.basketId

        setIsProcessing(true)
        setError(null)

        // Step 0: Normalize payload FIRST
        // This handles all Drop-in SDK variants:
        // 1. Unwraps payResponse strings (3DS or standard)
        // 2. Maps paymentGatewayTransactionId → transactionId
        // 3. Merges nested fields from both outer and inner payloads
        let normalizedPayload
        try {
            normalizedPayload = normalizeDropInPayload(jpmcPayload)
            
        } catch (normErr) {
            const err = `Failed to normalize payload: ${normErr.message}`
            setError(err)
            onError?.(err)
            setIsProcessing(false)
            return { success: false, error: err }
        }

        // Step 1: Validate payment status on NORMALIZED payload
        // Payment status must be 'STATUS_SUCCESS' to proceed
        if (!normalizedPayload || typeof normalizedPayload !== 'object') {
            const err = 'Payment payload is missing or invalid after normalization'
            setError(err)
            onError?.(err)
            setIsProcessing(false)
            return { success: false, error: err }
        }

        if (!normalizedPayload.status) {
            const err = 'Payment status is missing. Cannot verify payment confirmation.'
            setError(err)
            onError?.(err)
            setIsProcessing(false)
            return { success: false, error: err }
        }

        if (normalizedPayload.status !== 'STATUS_SUCCESS') {
            const err = `Payment not confirmed by JPMC. Status: ${normalizedPayload.status}`
            setError(err)
            onError?.(err)
            setIsProcessing(false)
            return { success: false, error: err }
        }

        
        // Step 2: Check if this is a 3DS deferred auth (status-only, no transactionId yet)
        // In deferred flows, transactionId arrives later via server-side notifications
        // This is valid - we proceed with order creation and put it on hold
         const isDeferred = normalizedPayload.status && !normalizedPayload.transactionId && !normalizedPayload.paymentGatewayTransactionId
        if (!isDeferred) {
            // For non-deferred flows, transactionId or paymentGatewayTransactionId must be present
            if (!normalizedPayload.transactionId && !normalizedPayload.paymentGatewayTransactionId) {
                const err = 'Payment transaction ID is missing. Payment cannot be tracked.'
                setError(err)
                onError?.(err)
                setIsProcessing(false)
                return { success: false, error: err }
            }
        }

        let orderNo = null

        try {
            // Step 1: Pre-flight check - billing address must be set (SFRA pattern)
            // Billing address should have been populated during Checkout Address step
            // The Drop-in form's checkbox is just UI - actual address management happens before payment
            if (!basket?.billingAddress) {
                const err = 'Billing address is required. Please complete the address step before proceeding to payment.'
                setError(err)
                onError?.(err)
                setIsProcessing(false)
                return { success: false, error: err }
            }
        
            // Step 2: Ensure payment instrument (SFRA pattern)
            // SFCC needs a payment instrument record to store transaction data
            if (basket?.basketId && addPaymentInstrumentToBasket) {
                // Remove any stale payment instruments first (SFCC allows only one per order)
                if (removePaymentInstrumentFromBasket && basket.paymentInstruments?.length > 0) {
                    for (const pi of basket.paymentInstruments) {
                        await removePaymentInstrumentFromBasket({
                            parameters: { basketId: basket.basketId, paymentInstrumentId: pi.paymentInstrumentId }
                        })
                    }
                }
                await addPaymentInstrumentToBasket({
                    parameters: { basketId: basket.basketId },
                    body: {
                        amount: basket.orderTotal,
                        paymentMethodId: 'JPMC_DROP_IN'
                    }
                })
            }

            // Step 3: Create SFCC order (SFRA pattern)
            // At this point, basket should have all required data from checkout flow
            const order = await createOrderFn({ body: { basketId: basket?.basketId } })
            orderNo = order?.orderNo

            if (!orderNo) {
                const err = 'Order creation failed - no orderNo returned'
                setError(err)
                onError?.(err)
                setIsProcessing(false)
                return { success: false, error: err }
            }
            
            // Step 4: Fraud detection check (optional, SFRA pattern via hooks)
            // If fraudDetectionFn is provided, call it to validate against fraud scoring.
            // This runs AFTER order creation but BEFORE server-side confirmation (step 5).
            // This matches SFRA pattern where fraud is checked after order creation but before placeOrder.
            // If fraud fails, order is failed and basket is reopened - preventing payment commitment.
            if (fraudDetectionFn) {
                try {
                    const fraudResult = await fraudDetectionFn(order, normalizedPayload)
                    
                    if (fraudResult && fraudResult.status === 'fail') {
                        const errorCode = fraudResult.errorCode || 'fraud_detection_failed'
                        const err = `Payment validation failed (${errorCode}). Please contact support.`
                        setError(err)
                        onError?.(err)
                        
                        // Fail the order and reopen basket if available
                        if (failOrderWithReopenBasket && jpmcCommerceConfig) {
                            try {
                                const { proxy, organizationId, siteId } = jpmcCommerceConfig
                                if (proxy && organizationId && siteId) {
                                    await failOrderWithReopenBasket({
                                        orderNo,
                                        reasonCode: 'fraud_detection_failure',
                                        proxy,
                                        organizationId,
                                        siteId
                                    })
                                    await refetchBasket?.()
                                }
                            } catch (failErr) {
                                // Continue - best-effort recovery
                            }
                        }
                        
                        setIsProcessing(false)
                        return { success: false, error: err }
                    }
                    
                 } catch (fraudErr) {
                    const err = `Fraud detection error: ${fraudErr.message}`
                    setError(err)
                    onError?.(err)
                    
                    // Attempt to fail order if fraud check threw an error
                    if (failOrderWithReopenBasket && jpmcCommerceConfig) {
                        try {
                            const { proxy, organizationId, siteId } = jpmcCommerceConfig
                            if (proxy && organizationId && siteId) {
                                await failOrderWithReopenBasket({
                                    orderNo,
                                    reasonCode: 'fraud_detection_error',
                                    proxy,
                                    organizationId,
                                    siteId
                                })
                                await refetchBasket?.()
                            }
                        } catch (failErr) {
                            // Continue - best-effort recovery
                        }
                    }
                    
                    // Don't clear ref - keep basket locked to prevent retries
                    setIsProcessing(false)
                    return { success: false, error: err }
                }
            } 

            // Step 5: Confirm order server-side
            // Patches JPMC payment attributes on the order and payment instrument
            // The server-side endpoint will extract payment metadata from normalizedPayload and persist:
            // - Payment instrument: transactionId, maskedPan, cardType, expiryMonth, expiryYear, accountHolderName
            // - Order custom attributes: jpmcCheckoutMode='DROP_IN', jpmcGatewayTransactionId, jpmcMerchantId, jpmcApprovalCode
            
            const checkoutIntentOrderNumber = basket?.c_jpmcCheckoutIntentOrderNumber
            const confirmPayload = {
                ...normalizedPayload,
                jpmcCheckoutMode: 'DROP_IN',  // Identifies this as a Drop-in order (vs PIE, Apple Pay, Google Pay)
                jpmcCheckoutIntentOrderNumber: checkoutIntentOrderNumber || null  // Reserved order number from basket, falls back to null for server to use orderNo
            }

            if (isDeferred && !confirmPayload.transactionId && !confirmPayload.paymentGatewayTransactionId) {
                confirmPayload.transactionId = 'Awaiting Transaction Id'
            }
            
            
            const paymentInstrumentId = order?.paymentInstruments?.[0]?.paymentInstrumentId
            const captureMethod = paymentConfig?.captureMethod || 'MANUAL'
            const confirmResult = await confirmOrderServerSide(
                orderNo,
                confirmPayload,
                paymentInstrumentId,
                {
                    captureMethod,
                    paymentAmount: order?.orderTotal
                }
            )
            onSuccess?.(orderNo)

            currentBasketIdRef.current = null
            setIsProcessing(false)
            return { success: true }
        } catch (err) {
            
            // If order was created, attempt to fail it and reopen basket
            if (orderNo && failOrderWithReopenBasket && jpmcCommerceConfig) {
                try {
                    const { proxy, organizationId, siteId } = jpmcCommerceConfig
                    if (proxy && organizationId && siteId) {
                        await failOrderWithReopenBasket({
                            orderNo,
                            reasonCode: 'payment_confirm_failure',
                            proxy,
                            organizationId,
                            siteId
                        })
                        await refetchBasket?.()
                    }
                } catch (failErr) {
                    // Continue - best-effort recovery
                }
            }

            const errorMsg = err.message || 'Could not complete your order. Please try again.'
            setError(errorMsg)
            onError?.(errorMsg)
            setIsProcessing(false)
            return {
                success: false,
                error: errorMsg
            }
        }
    }, [
        basket,
        createOrderFn,
        addPaymentInstrumentToBasket,
        removePaymentInstrumentFromBasket,
        confirmOrderServerSide,
        paymentConfig,
        jpmcCommerceConfig,
        failOrderWithReopenBasket,
        refetchBasket,
        onSuccess,
        onError,
        debug
    ])

    return {
        handlePaymentSuccess,
        isProcessing,
        error,
        clearError
    }
}
