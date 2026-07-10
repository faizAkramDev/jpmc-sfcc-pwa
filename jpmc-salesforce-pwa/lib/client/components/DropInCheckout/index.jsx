import React, { useEffect, useRef, useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import { useJPMCCheckout } from '../../context/JPMCCheckoutProvider'

const DROPIN_CONTAINER_ID = 'jpmc-dropin-container'

const containerStyle = {
    minHeight: '120px',
    width: '100%'
}

const centeredStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '32px 0'
}

const errorStyle = {
    color: '#c53030',
    backgroundColor: '#fff5f5',
    border: '1px solid #fc8181',
    borderRadius: '4px',
    padding: '12px 16px',
    marginBottom: '16px',
    fontSize: '14px'
}

const processingOverlayStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '32px 0',
    fontSize: '14px',
    color: '#4a5568'
}

/**
 * Normalizes the Drop-in SDK PaymentSuccess payload into a flat object.
 * Handles standard payload, 3DS (payResponse string), and alternative SDK versions (payment_response).
 */
function normalizePayload(payload) {
    if (!payload) return {}
    if (payload.paymentGatewayTransactionId) return payload
    if (payload.payResponse && typeof payload.payResponse === 'string') {
        try {
            const inner = JSON.parse(payload.payResponse)
            if (inner) return inner
        } catch (_) { /* fall through */ }
    }
    // Alternative field used by some SDK versions
    if (payload.payment_response && typeof payload.payment_response === 'object') {
        return payload.payment_response
    }
    return payload
}

// Session-storage key used to detect re-entry to the payment step.
// Set after a successful create-session; cleared on unmount after payment failure.
const SESSION_INITIALIZED_KEY = 'jpmcDropInInitialized'
function loadDropInScript(url) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${url}"]`)) {
            waitForDropInUI(resolve, reject)
            return
        }

        const script = document.createElement('script')
        script.type = 'module'
        script.src = url
        script.onload = () => waitForDropInUI(resolve, reject)
        script.onerror = () => reject(new Error('Failed to load JPMC Drop-in UI script.'))
        document.head.appendChild(script)
    })
}

function waitForDropInUI(resolve, reject, tries = 0) {
    if (window.DropInUI) { resolve(window.DropInUI); return }
    if (tries >= 60) { reject(new Error('DropInUI did not register on window after script load.')); return }
    setTimeout(() => waitForDropInUI(resolve, reject, tries + 1), 100)
}

export function DropInCheckout({ onPaymentSuccess, basket }) {
    
    const { locale, paymentConfig, getAccessToken } = useJPMCCheckout()

    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)
    const [isProcessingOrder, setIsProcessingOrder] = useState(false)
    const mountedRef = useRef(true)
    const instanceRef = useRef(null)
    const hasStartedRef = useRef(false)
    const onPaymentSuccessRef = useRef(onPaymentSuccess)

    useEffect(() => {
        onPaymentSuccessRef.current = onPaymentSuccess
    }, [onPaymentSuccess])

    const handleRetry = useCallback(() => {
        setError(null)
        setIsProcessingOrder(false)
    }, [])

    useEffect(() => {
        mountedRef.current = true
        if (hasStartedRef.current) return
        hasStartedRef.current = true

        const bootstrap = async () => {
            try {
                if (!basket?.basketId) {
                    throw new Error('No active basket. Please review your cart and try again.')
                }
                if (!basket?.orderTotal || basket.orderTotal <= 0) {
                    throw new Error('Cart total is invalid. Please verify your cart items.')
                }
                if (!basket?.currency) {
                    throw new Error('Currency is not set. Please refresh and try again.')
                }

                const localeParam = locale ? `?locale=${encodeURIComponent(locale)}` : ''
                const sessionHeaders = { 'Content-Type': 'application/json' }
                if (getAccessToken) {
                    try {
                        const token = await getAccessToken()
                        if (token) sessionHeaders['Authorization'] = `Bearer ${token}`
                    } catch (_err) {
                        // Non-fatal: proceed without authorization
                    }
                }

                const isReEntry = sessionStorage.getItem(SESSION_INITIALIZED_KEY) === basket.basketId
                let checkoutSessionToken, reservedOrderNo

                if (isReEntry) {


                    const intentRes = await fetch(
                        `/api/jpmorgan/dropin/get-intent${localeParam}`,
                        {
                            method: 'POST',
                            headers: sessionHeaders,
                            body: JSON.stringify({ basketId: basket.basketId })
                        }
                    )

                    if (!intentRes.ok) {
                        const errorBody = await intentRes.text()
                        const errorData = (() => { try { return JSON.parse(errorBody) } catch (_) { return {} } })()
                        // If basket validation failed (e.g. no shipping), surface stage error to caller
                        if (errorData?.errorStage) {
                            throw Object.assign(
                                new Error(errorData.error || 'Checkout validation failed.'),
                                { errorStage: errorData.errorStage }
                            )
                        }
                        throw new Error(`get-intent returned ${intentRes.status}: ${errorBody.substring(0, 100)}`)
                    }

                    const intentData = await intentRes.json()
                    if (!intentData.checkoutSessionToken) {
                        throw new Error('No checkoutSessionToken in get-intent response.')
                    }
                    checkoutSessionToken = intentData.checkoutSessionToken
                    reservedOrderNo = intentData.reservedOrderNo

                } else {


                    const requestBody = {
                        basketId: basket.basketId,
                        currencyCode: basket.currency,
                        totalTransactionAmount: Math.round(basket.orderTotal * 100)
                    }
                    if (basket?.totals?.subtotal) {
                        requestBody.subtotalAmount = Math.round(basket.totals.subtotal * 100)
                    } else if (basket?.orderTotal && basket?.totals) {
                        const totalTax = basket?.totals?.totalTax || 0
                        const totalShipping = basket?.totals?.totalShipping || 0
                        const calculated = basket.orderTotal - totalTax - totalShipping
                        if (calculated > 0) {
                            requestBody.subtotalAmount = Math.round(calculated * 100)
                        }
                    }
                    if (basket?.totals?.totalTax) {
                        requestBody.totalTaxAmount = Math.round(basket.totals.totalTax * 100)
                    }
                    if (basket?.totals?.totalShipping) {
                        requestBody.totalShippingAmount = Math.round(basket.totals.totalShipping * 100)
                    } else if (basket?.shipments?.[0]?.shippingCost) {
                        requestBody.totalShippingAmount = Math.round(basket.shipments[0].shippingCost * 100)
                    }

                    const sessionRes = await fetch(
                        `/api/jpmorgan/dropin/create-session${localeParam}`,
                        {
                            method: 'POST',
                            headers: sessionHeaders,
                            body: JSON.stringify(requestBody)
                        }
                    )

                    if (!sessionRes.ok) {
                        const errorBody = await sessionRes.text()
                        throw new Error(`create-session returned ${sessionRes.status}: ${errorBody.substring(0, 100)}`)
                    }

                    const sessionData = await sessionRes.json()
                    if (!sessionData.checkoutSessionToken) {
                        throw new Error('No checkoutSessionToken in create-session response.')
                    }
                    if (!sessionData.reservedOrderNo) {
                        throw new Error('No reservedOrderNo in create-session response.')
                    }

                    checkoutSessionToken = sessionData.checkoutSessionToken
                    reservedOrderNo = sessionData.reservedOrderNo
                    sessionStorage.setItem(SESSION_INITIALIZED_KEY, basket.basketId)
                }
                sessionStorage.setItem('jpmcReservedOrderNo', reservedOrderNo)

                if (!mountedRef.current) return

                const scriptUrl = paymentConfig?.dropInScriptUrl
                if (!scriptUrl) throw new Error('Drop-in script URL is not configured. Please contact support.')
                await loadDropInScript(scriptUrl)

                if (!mountedRef.current) return

                // ── Step 3: Instantiate & mount ───────────────────────────────
                // eslint-disable-next-line no-undef
                instanceRef.current = new window.DropInUI({ checkoutSessionToken })

                instanceRef.current.subscribe(async (announcement) => {
                    const { namespace, level, message, payload } = announcement
                    
                    if (namespace === 'payment') {
                        if (message === 'PaymentSuccess') {
                            if (!mountedRef.current) return
                            setIsProcessingOrder(true)
                            setError(null)
                            const normalizedPayload = normalizePayload(payload)

                            if (onPaymentSuccessRef.current) {
                                try {
                                    const result = await onPaymentSuccessRef.current(normalizedPayload)
                                    if (result && !result.success && mountedRef.current) {
                                        setError(result.error || 'Could not complete your order. Please try again.')
                                        setIsProcessingOrder(false)
                                    }
                                } catch (err) {
                                    if (mountedRef.current) {
                                        setError(err.message || 'Could not complete your order. Please try again.')
                                        setIsProcessingOrder(false)
                                    }
                                }
                            }
                        }
                        if (message === 'PaymentUnsuccessful' || level === 'error') {
                            if (mountedRef.current) {
                                setError('Payment was not successful. Please try again.')
                                setIsProcessingOrder(false)
                            }
                        }
                    }
                })

                instanceRef.current.mount(DROPIN_CONTAINER_ID)

                if (mountedRef.current) setIsLoading(false)
            } catch (err) {
                if (mountedRef.current) {
                    setError(err.message || 'Could not load payment form. Please refresh the page.')
                    setIsLoading(false)
                }
            }
        }

        bootstrap()

        return () => {
            mountedRef.current = false
            if (instanceRef.current) {
                try { instanceRef.current.unmount?.() } catch (_e) {
                    // Non-fatal: cleanup on unmount
                }
                instanceRef.current = null
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <div style={containerStyle}>
            {error && (
                <div style={errorStyle}>
                    <div style={{ marginBottom: '12px' }}>{error}</div>
                    <button
                        onClick={handleRetry}
                        style={{
                            backgroundColor: '#2d3748',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '8px 16px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '500'
                        }}
                    >
                        Try Again
                    </button>
                </div>
            )}

            {isProcessingOrder && !error && (
                <div style={processingOverlayStyle}>
                    <span>Processing your order…</span>
                </div>
            )}

            {isLoading && !error && !isProcessingOrder && (
                <div style={centeredStyle}>
                    <span>Loading payment form…</span>
                </div>
            )}

            <div id={DROPIN_CONTAINER_ID} style={isProcessingOrder ? {display: 'none'} : undefined} />
        </div>
    )
}

DropInCheckout.propTypes = {
    onPaymentSuccess: PropTypes.func,
    basket: PropTypes.object
}

export default DropInCheckout
