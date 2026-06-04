/**
 * useKount Hook
 *
 * Initializes the Safetech Fraud Web Client SDK for device fingerprinting.
 * The session ID generated here is passed to the fraud check API as
 * fraudScore.sessionId, enabling Safetech Fraud to correlate device signals with
 * the transaction.
 *
 * SDK package: @kount/kount-web-client-sdk
 * BM preferences: jpmcKountClientId, jpmcKountEnvironment
 *
 * @module hooks/useKount
 */

import { useState, useEffect, useRef } from 'react'

const KOUNT_SESSION_STORAGE_KEY = 'jpmc_kount_session_id'

const saveKountSessionId = (sessionId) => {
    if (typeof globalThis.window !== 'undefined' && sessionId) {
        try {
            sessionStorage.setItem(KOUNT_SESSION_STORAGE_KEY, sessionId)
        } catch (_e) {
            // Storage unavailable - session ID only in memory
        }
    }
}

const getStoredKountSessionId = () => {
    if (typeof globalThis.window !== 'undefined') {
        try {
            return sessionStorage.getItem(KOUNT_SESSION_STORAGE_KEY)
        } catch (e) {
            return null
        }
    }
    return null
}

/**
 * Generate a UUID for the Safetech Fraud session.
 * Uses crypto.randomUUID when available, falls back to crypto.getRandomValues.
 * 
 * Note: This function is only called in browser context (SSR returns null before
 * calling this). All browsers supporting PWA Kit have crypto.getRandomValues.
 */
const generateSessionId = () => {
    // Kount requires session IDs of 32 characters max — strip hyphens from UUID
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID().replaceAll('-', '')
    }
    
    // Fallback using crypto.getRandomValues (IE11+, all modern browsers)
    if (globalThis.crypto?.getRandomValues) {
        const bytes = new Uint8Array(16)
        globalThis.crypto.getRandomValues(bytes)
        // Set version 4 (random) UUID bits
        bytes[6] = (bytes[6] & 0x0f) | 0x40
        bytes[8] = (bytes[8] & 0x3f) | 0x80
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
    }
    
    throw new Error('Crypto API not available')
}

/**
 * Hook to initialize the Safetech Fraud Web Client SDK for device fingerprinting.
 *
 * @param {object} options
 * @param {string} options.clientId - Safetech Fraud client ID (from BM: jpmcKountClientId)
 * @param {string} [options.environment='TEST'] - 'TEST' or 'PROD' (from BM: jpmcKountEnvironment)
 * @param {boolean} [options.enabled=true] - Whether Safetech Fraud is enabled (requires JPMCEnableFraudCheck=true)
 * @returns {{ kountSessionId: string|null, isCollectionComplete: boolean, refreshKount: function }}
 */
const useKount = ({ clientId, environment, enabled = true } = {}) => {
    // Generate (or retrieve) the session ID SYNCHRONOUSLY on mount.
    // This runs immediately — before any effects or async code — so the ID is
    // always available when the fraud check API is called, even if the Kount
    // SDK hasn't finished initialising yet.
    const [kountSessionId, setKountSessionId] = useState(() => {
        if (typeof window === 'undefined') {
            return null
        }
        const stored = getStoredKountSessionId()
        if (stored) {
            return stored
        }
        const newId = generateSessionId()
        saveKountSessionId(newId)   // synchronous write — immediately available
        return newId
    })
    const [isCollectionComplete, setIsCollectionComplete] = useState(!!getStoredKountSessionId())
    const sdkRef = useRef(null)
    const initAttemptedRef = useRef(false)

    useEffect(() => {
        // SDK initialisation is gated on enabled + clientId.
        // The session ID is already generated above — the SDK only needs it to
        // associate device-fingerprint data with this session.
        if (typeof window === 'undefined') {
            return
        }
        if (!enabled) {
            return
        }
        if (!clientId) {
            return
        }
        if (initAttemptedRef.current) {
            return
        }
        initAttemptedRef.current = true

        const initSafetechFraud = async () => {
            try {
                // Re-read from state/sessionStorage so we always use the current ID
                // (may have been refreshed by refreshKount since mount)
                const sessionId = getStoredKountSessionId() || kountSessionId

                // Dynamic import ensures the SDK is only loaded in the browser
                const KountSDKModule = await import('@kount/kount-web-client-sdk')
                // Handle CJS default export or named export
                const KountSDK = KountSDKModule.default || KountSDKModule.Kount || KountSDKModule

                // SDK is called as a function (not constructor) with config + sessionId
                // as the second argument
                const sdk = KountSDK(
                    {
                        clientID: clientId,
                        environment: environment || 'TEST',
                        isSinglePageApp: true,
                        callbacks: {
                            'collect-begin': () => {
                            },
                            'collect-end': () => {
                                setIsCollectionComplete(true)
                            }
                        }
                    },
                    sessionId
                )

                sdkRef.current = sdk
                // SDK init result stored in ref
            } catch (_error) {
                initAttemptedRef.current = false
                // SDK init failed - will retry on next effect run
            }
        }

        initSafetechFraud()
    }, [clientId, environment, enabled, kountSessionId])

    /**
     * Refresh the Kount session ID.
     * Useful for SPA navigation where the session should be renewed.
     * @returns {Promise<string|null>} The current or refreshed session ID
     */
    const refreshKount = async () => {
        const newSessionId = generateSessionId()
        saveKountSessionId(newSessionId)
        setKountSessionId(newSessionId)
        setIsCollectionComplete(false)
        // Allow useEffect to re-run with the new session ID (kountSessionId is now in the deps)
        initAttemptedRef.current = false
        if (sdkRef.current?.NewSession) {
            try {
                sdkRef.current.NewSession(newSessionId)
            } catch (error) {
                setIsCollectionComplete(true)   // fail-open
            }
        }
        return newSessionId
    }

    return { kountSessionId, isCollectionComplete, refreshKount }
}

export { useKount }
export default useKount
