/**
 * useThreeDS Hook
 * 
 * React hook for managing 3D Secure authentication flow.
 * Handles iframe orchestration, postMessage listener, timeout, and cancel.
 * 
 * @module hooks/useThreeDS
 * @see https://developer.payments.jpmorgan.com/docs/commerce/online-payments/capabilities/online-payments/payment-enhancements/3d-secure
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { THREE_DS } from '../utils/constants.mjs'
import { GENERIC_API_ERROR_MESSAGE } from '../utils/constants/error-constants'

const IFRAME_NAME = 'jpmc-3ds-iframe'

/**
 * useThreeDS - Hook for 3D Secure orchestration flow
 * 
 * Manages the complete 3DS challenge flow:
 * 1. Show modal with iframe
 * 2. Submit orchestration URL to iframe
 * 3. Listen for postMessage from SSR callback
 * 4. Handle success, error, denial, timeout, and cancel
 * 
 * @param {Object} options - Hook options
 * @param {Function} options.onSuccess - Called when 3DS completes successfully
 * @param {Function} options.onDenied - Called when 3DS is denied by issuer
 * @param {Function} options.onError - Called on 3DS error
 * @param {Function} options.onCancel - Called when user cancels
 * @param {Function} options.onTimeout - Called when 3DS times out
 * @param {Function} [options.fail3DSOrderFn] - Function to call Fail3DSOrder API
 * @returns {Object} Hook API
 * 
 * @example
 * const {
 *     isModalOpen,
 *     initiateOrchestration,
 *     handleCancel,
 *     setIframeRef
 * } = useThreeDS({
 *     onSuccess: (data) => navigate(data.continueUrl),
 *     onDenied: (data) => showError('Card denied'),
 *     onError: (data) => showError('Error occurred'),
 *     onCancel: () => showError('Cancelled'),
 *     onTimeout: () => showError('Timed out')
 * })
 */
export function useThreeDS({
    onSuccess,
    onDenied,
    onError,
    onCancel,
    onTimeout,
    fail3DSOrderFn
}) {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isModalVisible, setIsModalVisible] = useState(false)
    
    const orderInfoRef = useRef(null)
    
    const iframeRef = useRef(null)
    const timeoutIdRef = useRef(null)
    const hasRespondedRef = useRef(false)
    const messageHandlerRef = useRef(null)
    
    const pendingOrchestrationUrlRef = useRef(null)
    
    // Delay before showing modal - allows frictionless flows to complete without showing spinner
    const modalShowDelayRef = useRef(null)
    const MODAL_SHOW_DELAY_MS = 800

    /**
     * Cleanup function - removes listeners and clears timeout
     */
    const cleanup = useCallback(() => {
        if (timeoutIdRef.current) {
            clearTimeout(timeoutIdRef.current)
            timeoutIdRef.current = null
        }

        if (messageHandlerRef.current) {
            window.removeEventListener('message', messageHandlerRef.current)
            messageHandlerRef.current = null
        }
        
        if (modalShowDelayRef.current) {
            clearTimeout(modalShowDelayRef.current)
            modalShowDelayRef.current = null
        }

    }, [])

    useEffect(() => {
        return cleanup
    }, [cleanup])

    /**
     * Show the 3DS modal (render it, but visibility is controlled separately)
     */
    const showModal = useCallback(() => {
        setIsModalOpen(true)
        // Start delayed visibility - for frictionless, response may come before this fires
        modalShowDelayRef.current = setTimeout(() => {
            if (!hasRespondedRef.current) {
                setIsModalVisible(true)
            }
        }, MODAL_SHOW_DELAY_MS)
    }, [])

    /**
     * Hide the 3DS modal
     */
    const hideModal = useCallback(() => {
        setIsModalOpen(false)
        setIsModalVisible(false)
        cleanup()
    }, [cleanup])

    /**
     * Setup postMessage listener for 3DS completion
     */
    const setupPostMessageListener = useCallback(() => {
        const messageHandler = (event) => {
             const isSameOrigin = event.origin === window.location.origin
            const isExplicitJpmcOrigin = THREE_DS.JPMC_ORIGINS.includes(event.origin)
            const isJpmcSuffix = event.origin.endsWith(THREE_DS.JPMC_DOMAIN_SUFFIX)
            const isJpmcOrigin = isExplicitJpmcOrigin || isJpmcSuffix

            if (!isSameOrigin && !isJpmcOrigin) {
                return
            }

            const data = event.data
            if (!data || data.type !== THREE_DS.POSTMESSAGE_TYPE) {
                return
            }

            hasRespondedRef.current = true

            cleanup()

            hideModal()

            if (data.responseStatus === THREE_DS.RESPONSE_STATUS.SUCCESS) {
                onSuccess?.(data)
            } else if (data.responseStatus === THREE_DS.RESPONSE_STATUS.DENIED) {
                if (fail3DSOrderFn && orderInfoRef.current) {
                    fail3DSOrderFn(
                        orderInfoRef.current.orderNo,
                        orderInfoRef.current.orderToken,
                        THREE_DS.FAILURE_REASON.DENIED
                    )
                }
                onDenied?.(data)
            } else {
                if (fail3DSOrderFn && orderInfoRef.current) {
                    fail3DSOrderFn(
                        orderInfoRef.current.orderNo,
                        orderInfoRef.current.orderToken,
                        THREE_DS.FAILURE_REASON.ERROR
                    )
                }
                onError?.(data)
            }
        }

        messageHandlerRef.current = messageHandler
        window.addEventListener('message', messageHandler)
    }, [cleanup, hideModal, onSuccess, onDenied, onError])

    /**
     * Setup timeout handler
     */
    const setupTimeoutHandler = useCallback(() => {
        timeoutIdRef.current = setTimeout(() => {
            if (hasRespondedRef.current) {
                return
            }

            hasRespondedRef.current = true

            cleanup()
            hideModal()

            if (fail3DSOrderFn && orderInfoRef.current) {
                fail3DSOrderFn(
                    orderInfoRef.current.orderNo,
                    orderInfoRef.current.orderToken,
                    THREE_DS.FAILURE_REASON.TIMEOUT
                )
            }

            onTimeout?.({
                error: THREE_DS.FAILURE_REASON.TIMEOUT,
                message: 'Authentication timed out.'
            })
        }, THREE_DS.TIMEOUT_MS)
    }, [cleanup, hideModal, fail3DSOrderFn, onTimeout])

    /**
     * Submit orchestration URL to iframe via form
     * Per JPMC documentation - extracts query params and submits as form
     */
    const submitOrchestrationUrl = useCallback((orchestrationUrl) => {
        if (!iframeRef.current) {
            onError?.({ error: 'IFRAME_ERROR', message: 'Iframe not available' })
            return false
        }

        try {
            const form = document.createElement('form')
            form.action = orchestrationUrl

            const signedUrl = new URL(orchestrationUrl)
            signedUrl.searchParams.forEach((value, key) => {
                const input = document.createElement('input')
                input.type = 'hidden'
                input.name = key
                input.value = value
                form.appendChild(input)
            })

            form.method = 'GET'
            form.target = IFRAME_NAME

            document.body.appendChild(form)
            form.submit()
            document.body.removeChild(form)

            return true
        } catch (error) {
            onError?.({ error: 'IFRAME_ERROR', message: GENERIC_API_ERROR_MESSAGE })
            return false
        }
    }, [onError])

    /**
     * Initiate 3DS orchestration flow
     * 
     * @param {string} orchestrationUrl - URL from JPMC response
     * @param {string} orderNo - Order number
     * @param {string} orderToken - Order token for validation
     */
    const initiateOrchestration = useCallback((orchestrationUrl, orderNo, orderToken) => {
        hasRespondedRef.current = false
        orderInfoRef.current = { orderNo, orderToken }
        pendingOrchestrationUrlRef.current = null

        showModal()

        setupPostMessageListener()
        setupTimeoutHandler()

        if (iframeRef.current) {
            setTimeout(() => {
                submitOrchestrationUrl(orchestrationUrl)
            }, 0)
        } else {
            pendingOrchestrationUrlRef.current = orchestrationUrl
        }
    }, [showModal, setupPostMessageListener, setupTimeoutHandler, submitOrchestrationUrl])

    /**
     * Handle user cancellation
     */
    const handleCancel = useCallback(() => {
        if (hasRespondedRef.current) {
            return
        }

        hasRespondedRef.current = true

        cleanup()
        hideModal()

        if (fail3DSOrderFn && orderInfoRef.current) {
            fail3DSOrderFn(
                orderInfoRef.current.orderNo,
                orderInfoRef.current.orderToken,
                THREE_DS.FAILURE_REASON.USER_CANCELLED
            )
        }

        onCancel?.()
    }, [cleanup, hideModal, fail3DSOrderFn, onCancel])

    /**
     * Set iframe reference (called from ThreeDSModal)
     * Also submits pending orchestration URL if one is waiting
     */
    const setIframeRef = useCallback((ref) => {
        iframeRef.current = ref
        
        if (ref && pendingOrchestrationUrlRef.current) {
            const pendingUrl = pendingOrchestrationUrlRef.current
            pendingOrchestrationUrlRef.current = null
            setTimeout(() => {
                submitOrchestrationUrl(pendingUrl)
            }, 0)
        }
    }, [submitOrchestrationUrl])

    return {
        isModalOpen,
        isModalVisible,
        iframeName: IFRAME_NAME,
        
        initiateOrchestration,
        handleCancel,
        hideModal,
        
        setIframeRef
    }
}

export default useThreeDS
