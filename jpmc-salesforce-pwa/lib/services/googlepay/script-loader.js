/**
 * Google Pay Script Loader
 * 
 * Dynamically loads the Google Pay JavaScript library with automatic
 * caching, timeout handling, and error recovery.
 * 
 * @module services/googlepay/script-loader
 */

import {
    GOOGLE_PAY_SCRIPT_URL,
    GOOGLE_PAY_DEFAULTS,
    GOOGLE_PAY_ERROR_CODES
} from '../../utils/constants.mjs'

// Script loading state
let scriptLoadPromise = null
let isScriptLoaded = false

/**
 * Load the Google Pay JavaScript library
 * 
 * This function ensures the script is only loaded once and returns a promise
 * that resolves when the script is ready. It handles:
 * - Single script load (prevents duplicate script tags)
 * - Timeout handling
 * - Error recovery
 * - SSR safety (no-op on server)
 * 
 * @param {Object} options - Loading options
 * @param {number} [options.timeout] - Script load timeout in milliseconds
 * @returns {Promise<boolean>} Resolves to true when script is loaded
 * @throws {Error} If script fails to load or times out
 * 
 * @example
 * // Basic usage
 * await loadGooglePayScript()
 * const client = new google.payments.api.PaymentsClient({ environment: 'TEST' })
 * 
 * @example
 * // With custom timeout
 * await loadGooglePayScript({ timeout: 15000 })
 */
export const loadGooglePayScript = async (options = {}) => {
    const { timeout = GOOGLE_PAY_DEFAULTS.scriptLoadTimeout } = options

    // SSR safety check - skip on server
    if (typeof window === 'undefined') {
        return false
    }

    // Return immediately if already loaded
    if (isScriptLoaded && globalThis.google?.payments?.api?.PaymentsClient) {
        return true
    }

    // Return existing promise if script is currently loading
    if (scriptLoadPromise) {
        return scriptLoadPromise
    }

    // Check if script tag already exists (maybe loaded by another source)
    const existingScript = document.querySelector(`script[src="${GOOGLE_PAY_SCRIPT_URL}"]`)
    if (existingScript && globalThis.google?.payments?.api?.PaymentsClient) {
        isScriptLoaded = true
        return true
    }

    // Create and load script
    scriptLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = GOOGLE_PAY_SCRIPT_URL
        script.async = true
        script.defer = true
        script.id = 'google-pay-script'

        // Timeout handler
        const timeoutId = setTimeout(() => {
            script.remove()
            scriptLoadPromise = null
            reject(new GooglePayScriptError(
                GOOGLE_PAY_ERROR_CODES.SCRIPT_LOAD_TIMEOUT,
                `Google Pay script failed to load within ${timeout}ms`
            ))
        }, timeout)

        // Success handler
        script.onload = () => {
            clearTimeout(timeoutId)
            if (globalThis.google?.payments?.api?.PaymentsClient) {
                isScriptLoaded = true
                resolve(true)
            } else {
                scriptLoadPromise = null
                reject(new GooglePayScriptError(
                    GOOGLE_PAY_ERROR_CODES.SCRIPT_LOAD_FAILED,
                    'Google Pay script loaded but PaymentsClient not available'
                ))
            }
        }

        // Error handler
        script.onerror = (event) => {
            clearTimeout(timeoutId)
            script.remove()
            scriptLoadPromise = null
            reject(new GooglePayScriptError(
                GOOGLE_PAY_ERROR_CODES.SCRIPT_LOAD_FAILED,
                'Failed to load Google Pay script',
                event
            ))
        }

        // Append to document
        document.head.appendChild(script)
    })

    return scriptLoadPromise
}

/**
 * Check if Google Pay script is loaded
 * 
 * @returns {boolean} True if script is loaded and ready
 */
export const isGooglePayScriptLoaded = () => {
    if (typeof window === 'undefined') {
        return false
    }
    return isScriptLoaded && !!globalThis.google?.payments?.api?.PaymentsClient
}

/**
 * Get the Google Pay PaymentsClient constructor
 * 
 * @returns {Function|null} PaymentsClient constructor or null if not loaded
 */
export const getPaymentsClient = () => {
    if (typeof window === 'undefined' || !isScriptLoaded) {
        return null
    }
    return globalThis.google?.payments?.api?.PaymentsClient || null
}

/**
 * Create a new Google Pay PaymentsClient instance
 * 
 * @param {Object} options - Client options
 * @param {string} options.environment - 'TEST' or 'PRODUCTION'
 * @param {Function} [options.paymentDataCallback] - Callback for payment data changes
 * @returns {Object|null} PaymentsClient instance or null if not loaded
 * 
 * @example
 * const client = createPaymentsClient({ environment: 'TEST' })
 * if (client) {
 *   const isReady = await client.isReadyToPay(isReadyToPayRequest)
 * }
 */
export const createPaymentsClient = (options = {}) => {
    const PaymentsClient = getPaymentsClient()
    if (!PaymentsClient) {
        return null
    }
    return new PaymentsClient(options)
}

/**
 * Preload Google Pay script
 * 
 * Adds a preload link to start fetching the script early.
 * Call this as early as possible (e.g., on checkout page load).
 * 
 * @example
 * // In checkout page component
 * useEffect(() => {
 *   preloadGooglePayScript()
 * }, [])
 */
export const preloadGooglePayScript = () => {
    if (typeof window === 'undefined') {
        return
    }

    // Check if preload link already exists
    const existingPreload = document.querySelector(
        `link[rel="preload"][href="${GOOGLE_PAY_SCRIPT_URL}"]`
    )
    if (existingPreload) {
        return
    }

    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'script'
    link.href = GOOGLE_PAY_SCRIPT_URL
    document.head.appendChild(link)
}

/**
 * Reset script loader state
 * Used for testing or when needing to reload the script
 */
export const resetScriptLoader = () => {
    scriptLoadPromise = null
    isScriptLoaded = false

    if (typeof window !== 'undefined') {
        const script = document.getElementById('google-pay-script')
        if (script) {
            script.remove()
        }
    }
}

/**
 * Google Pay Script Error
 * Custom error class for script loading failures
 */
export class GooglePayScriptError extends Error {
    /**
     * @param {string} code - Error code from GOOGLE_PAY_ERROR_CODES
     * @param {string} message - Error message
     * @param {Error|Event} [cause] - Original error or event
     */
    constructor(code, message, cause = null) {
        super(message)
        this.name = 'GooglePayScriptError'
        this.code = code
        this.cause = cause
        
        // Maintain proper stack trace (only in V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, GooglePayScriptError)
        }
    }
}
