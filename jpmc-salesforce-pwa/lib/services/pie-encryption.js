/**
 * JP Morgan Page Encryption (PIE) SDK Loader
 * 
 * This module handles loading the JPMC PIE scripts dynamically on the client-side:
 * 1. encryption.js - Provides ValidatePANChecksum() and ProtectPANandCVV() functions
 * 2. getkey.js - Retrieves the dynamic encryption key for the merchant
 * 
 * The merchantId is retrieved from SFCC config and used to construct the getkey.js URL.
 * 
 * @module pie-encryption
 */

import { getPIEUrls } from '../utils/constants/index'
import { luhnCheck } from '../utils/validation/luhn'

// =============================================================================
// State Management
// =============================================================================

let pieState = {
    isLoaded: false,
    isLoading: false,
    error: null,
    merchantId: null,
    environment: 'sandbox'
}

// =============================================================================
// Script Loading
// =============================================================================

/**
 * Load a script dynamically
 * @param {string} src - Script URL
 * @param {string} id - Script element ID
 * @returns {Promise<void>}
 */
const loadScript = (src, id) => {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (document.getElementById(id)) {
            resolve()
            return
        }

        const script = document.createElement('script')
        script.id = id
        script.src = src
        script.async = true

        script.onload = () => {
            resolve()
        }

        script.onerror = () => {
            reject(new Error(`Failed to load JPMC PIE script: ${id}`))
        }

        document.head.appendChild(script)
    })
}

/**
 * Load JPMC Page Encryption SDK
 * 
 * This loads both encryption.js and getkey.js scripts.
 * The getkey.js URL requires the merchantId to be substituted.
 * 
 * @param {object} config - { merchantId, environment, pieUrls }
 * @param {string} config.merchantId - Merchant ID for PIE
 * @param {string} config.environment - 'sandbox' or 'production'
 * @param {object} config.pieUrls - Optional custom PIE URLs { encryption, getKey }
 * @returns {Promise<boolean>} True if loaded successfully
 * 
 * @example
 * await loadPIESDK({
 *   merchantId: '100000000005',
 *   environment: 'sandbox',
 *   pieUrls: {
 *     encryption: 'https://custom-pie-server.com/pie/v1/encryption.js',
 *     getKey: 'https://custom-pie-server.com/pie/v1/100000000005/getkey.js'
 *   }
 * })
 * 
 * // Then use:
 * const result = ProtectPANandCVV(cardNumber, cvv, false)
 */
export const loadPIESDK = async (config) => {
    const { merchantId, environment = 'sandbox', pieUrls } = config


    // Server-side guard
    if (typeof window === 'undefined') {
        return false
    }

    // Already loaded check
    if (pieState.isLoaded && pieState.merchantId === merchantId) {
        return true
    }

    // Already loading check
    if (pieState.isLoading) {
        // Wait for current loading to complete
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (!pieState.isLoading) {
                    clearInterval(checkInterval)
                    resolve(pieState.isLoaded)
                }
            }, 100)
        })
    }

    if (!merchantId) {
        pieState.error = new Error('merchantId is required')
        return false
    }


    pieState.isLoading = true
    pieState.error = null
    pieState.merchantId = merchantId
    pieState.environment = environment

    try {
        // Use custom PIE URLs if provided, otherwise use defaults
        const urls = pieUrls || getPIEUrls(environment, merchantId)


        // Load encryption.js first (contains the encryption functions)
        await loadScript(urls.encryption, 'jpmc-pie-encryption')

        // Then load getkey.js (contains the encryption key)
        await loadScript(urls.getKey, 'jpmc-pie-getkey')

        // Wait for PIE object to be available
        await waitForPIE()

        pieState.isLoaded = true
        pieState.isLoading = false

        return true
    } catch (error) {
        pieState.isLoaded = false
        pieState.isLoading = false
        pieState.error = error

        return false
    }
}

/**
 * Wait for PIE object to be available
 * @param {number} timeout - Maximum wait time in ms
 * @returns {Promise<void>}
 */
const waitForPIE = (timeout = 5000) => {
    return new Promise((resolve, reject) => {
        const startTime = Date.now()

        const checkPIE = () => {
            if (isPIEReady()) {
                resolve()
                return
            }

            if (Date.now() - startTime > timeout) {
                reject(new Error('PIE SDK initialization timeout'))
                return
            }

            setTimeout(checkPIE, 100)
        }

        checkPIE()
    })
}

/**
 * Check if PIE SDK is fully loaded and ready
 * @returns {boolean}
 */
export const isPIEReady = () => {
    if (typeof window === 'undefined') return false

    // Check for PIE key object
    const hasPIE = typeof globalThis.PIE !== 'undefined' &&
        typeof globalThis.PIE.K !== 'undefined' &&
        typeof globalThis.PIE.L !== 'undefined' &&
        typeof globalThis.PIE.E !== 'undefined' &&
        typeof globalThis.PIE.key_id !== 'undefined' &&
        typeof globalThis.PIE.phase !== 'undefined'

    // Check for encryption functions
    const hasEncryption = typeof globalThis.ValidatePANChecksum === 'function' &&
        typeof globalThis.ProtectPANandCVV === 'function'

    return hasPIE && hasEncryption
}

/**
 * Check if PIE key download had an error
 * @returns {boolean}
 */
export const isPIEKeyError = () => {
    if (typeof window === 'undefined') return true

    return typeof globalThis.PIE === 'undefined' ||
        typeof globalThis.PIE.K === 'undefined' ||
        typeof globalThis.PIE.L === 'undefined' ||
        typeof globalThis.PIE.E === 'undefined' ||
        typeof globalThis.PIE.key_id === 'undefined' ||
        typeof globalThis.PIE.phase === 'undefined'
}

/**
 * Check if encryption.js download had an error
 * @returns {boolean}
 */
export const isPIEEncryptionError = () => {
    if (typeof window === 'undefined') return true

    return typeof globalThis.ValidatePANChecksum !== 'function' ||
        typeof globalThis.ProtectPANandCVV !== 'function'
}

// =============================================================================
// Encryption Functions
// =============================================================================

/**
 * Validate card number checksum (Luhn/MOD 10)
 * 
 * @param {string} cardNumber - Card number to validate
 * @returns {boolean} True if valid
 */
export const validateCardChecksum = (cardNumber) => {
    if (typeof window === 'undefined' || !globalThis.ValidatePANChecksum) {
        return luhnCheck(cardNumber)
    }

    return globalThis.ValidatePANChecksum(cardNumber)
}

/**
 * Encrypt card data using JPMC PIE
 * 
 * @param {string} cardNumber - Card number (PAN)
 * @param {string} cvv - Card CVV/CVC
 * @returns {object|null} Encrypted data or null on error
 * 
 * @example
 * const encrypted = encryptCardData('4012000033330026', '123')
 * // Returns:
 * // {
 * //   encryptedCardNumber: '401200jpLWkYXHd1112',
 * //   encryptedCVV: '5D4C3B',
 * //   integrityCheck: 'ABCDFKEJGJTHFHG',
 * //   keyId: 'key-123',
 * //   phase: '1'
 * // }
 */
export const encryptCardData = (cardNumber, cvv) => {
    if (typeof window === 'undefined') {
        return null
    }

    if (!isPIEReady()) {
        return null
    }

    // Validate inputs
    if (!cardNumber || typeof cardNumber !== 'string') {
        return null
    }

    if (!cvv || typeof cvv !== 'string') {
        return null
    }


    // Clean card number (remove spaces/dashes)
    const cleanCardNumber = cardNumber.replace(/\D/g, '')

    // Validate checksum before encrypting
    if (!validateCardChecksum(cleanCardNumber)) {
        return null
    }

    try {
        // Call JPMC encryption function
        // Parameters: cardNumber, cvv, embedFlag (false = don't embed key in encrypted value)
        const result = globalThis.ProtectPANandCVV(cleanCardNumber, cvv, false)

        if (result === null) {
            return null
        }

        // Result is an array: [encryptedCard, encryptedCVV, integrityCheck]
        const [encryptedCardNumber, encryptedCVV, integrityCheck] = result


        return {
            encryptedCardNumber,
            encryptedCVV,
            integrityCheck: integrityCheck || '',
            keyId: globalThis.PIE.key_id,
            phase: globalThis.PIE.phase
        }
    } catch (error) {
        return null
    }
}

// =============================================================================
// State Getters
// =============================================================================

/**
 * Get current PIE SDK state
 * @returns {object} Current state
 */
export const getPIEState = () => ({
    ...pieState,
    isReady: isPIEReady()
})

/**
 * Get PIE key info
 * @returns {object|null} Key info or null if not loaded
 */
export const getPIEKeyInfo = () => {
    if (typeof window === 'undefined' || !globalThis.PIE) {
        return null
    }

    return {
        keyId: globalThis.PIE.key_id,
        phase: globalThis.PIE.phase
    }
}

/**
 * Reset PIE state (useful for testing or re-initialization)
 */
export const resetPIEState = () => {
    pieState = {
        isLoaded: false,
        isLoading: false,
        error: null,
        merchantId: null,
        environment: 'sandbox'
    }

    // Remove scripts if loaded
    if (typeof document !== 'undefined') {
        const encryptionScript = document.getElementById('jpmc-pie-encryption')
        const getkeyScript = document.getElementById('jpmc-pie-getkey')
        
        if (encryptionScript) encryptionScript.remove()
        if (getkeyScript) getkeyScript.remove()
    }
}

/**
 * Set PIE state (useful for testing)
 * @param {object} newState - State properties to set
 */
export const setPIEState = (newState) => {
    pieState = { ...pieState, ...newState }
}

/**
 * Get configuration for PIE SDK
 * @returns {object} Configuration
 */
export const getConfig = () => ({
    merchantId: pieState.merchantId,
    environment: pieState.environment
})

// =============================================================================
// Exports
// =============================================================================

export default {
    loadPIESDK,
    isPIEReady,
    isPIEKeyError,
    isPIEEncryptionError,
    validateCardChecksum,
    encryptCardData,
    getPIEState,
    getPIEKeyInfo,
    resetPIEState,
    setPIEState,
    getConfig
}
