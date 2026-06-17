/**
 * Server-side Logger with PII Masking
 * 
 * This logger masks sensitive data before logging to prevent PII leakage.
 * Mirrors SFRA's maskSensitiveData implementation.
 * 
 * @module utils/logger
 */

import crypto from 'crypto'

/**
 * Token fields that should use SHA-256 fingerprinting instead of substring masking
 * These fields contain tokens/credentials that must be protected more securely
 */
const TOKEN_FIELDS = [
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'client_assertion',
    'slasToken',
    'authorization',
    'token',
    'paymentToken'
]

/**
 * Generate SHA-256 fingerprint of a token
 * Used instead of substring masking for better security
 * to prevent partial token exposure in logs
 * 
 * @param {string} token - Token to fingerprint
 * @returns {string} SHA256 fingerprint in format "sha256:hexdigest"
 */
const generateTokenFingerprint = (token) => {
    if (!token || typeof token !== 'string') return '****'
    try {
        const hash = crypto.createHash('sha256').update(token).digest('hex')
        return `sha256:${hash.substring(0, 16)}`
    } catch {
        return '****'
    }
}

/**
 * Check if a key is a token field
 */
const isTokenField = (key) =>
    TOKEN_FIELDS.some(field => field.toLowerCase() === key.toLowerCase())

/**
 * List of sensitive fields to mask in logs
 * These fields will have their values partially masked (first 4 chars shown)
 * 
 * NOTE: Field names are case-insensitive during matching.
 * Include all variations used in the codebase (e.g., 'phone' and 'phoneNumber').
 */
const SENSITIVE_FIELDS = [
    // Card/Payment data
    'accountNumber',
    'cardNumber',
    'maskedAccountNumber',
    'cvv',
    'encryptionIntegrityCheck',
    'tokenNumber',
    'expirationMonth',
    'expirationYear',
    'encryptedCardNumber',
    'encryptedCVV',
    'integrityCheck',
    'securityCode',
    
    // Personal data - names
    'firstName',
    'lastName',
    'fullName',
    'name',
    
    // Personal data - contact (include all variations)
    'email',
    'emailAddress',
    'phone',
    'phoneNumber',
    'IPAddress',
    'ipAddress',
    'deviceIPAddress',
    
    // Address fields (include all variations)
    'line1',
    'line2',
    'address1',
    'address2',
    'city',
    'state',
    'stateCode',
    'postalCode',
    'zipCode',
    'countryCode',
    'country',
    
    // Auth/Security tokens
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'client_assertion',
    'client_id',
    'clientId',
    'clientSecret',
    'client_secret',
    'token',
    'paymentToken',
    'creditCardToken',
    'slasToken',
    'authorization',
    
    // Google Pay / Apple Pay encrypted data
    'encryptedPayload',
    'ephemeralPublicKey',
    'signature',
    'paymentData',
    'googlePayToken',
    'applePayToken',
    'walletApplicationData'
]

/**
 * Mask sensitive data in a message string
 * Handles both JSON format ("field": "value") and form format (field=value)
 * 
 * @param {string} msg - The message to mask
 * @returns {string} Message with sensitive data masked
 */
const maskSensitiveData = (msg) => {
    if (typeof msg !== 'string') {
        return msg
    }
    
    let masked = msg
    
    for (const field of SENSITIVE_FIELDS) {
        // Match JSON format: "fieldName": "value" or "fieldName":"value"
        const jsonPattern = new RegExp(`("${field}"\\s*:\\s*)"([^"]+)"`, 'gi')
        masked = masked.replace(jsonPattern, (match, prefix, value) => {
            if (value.length > 4) {
                return `${prefix}"${value.substring(0, 4)}****"`
            }
            return `${prefix}"****"`
        })
        
        // Match JSON format with numbers: "fieldName": 123
        const jsonNumberPattern = new RegExp(`("${field}"\\s*:\\s*)(\\d+)`, 'gi')
        masked = masked.replace(jsonNumberPattern, (match, prefix, value) => {
            if (value.length > 2) {
                return `${prefix}${value.substring(0, 2)}**`
            }
            return `${prefix}**`
        })
        
        // Match form/URL format: fieldName=value
        const formPattern = new RegExp(`(${field}=)([^&\\s]+)`, 'gi')
        masked = masked.replace(formPattern, (match, prefix, value) => {
            if (value.length > 4) {
                return `${prefix}${value.substring(0, 4)}****`
            }
            return `${prefix}****`
        })
    }
    
    return masked
}

/**
 * Check if a key matches any sensitive field (case-insensitive)
 */
const isSensitiveKey = (key) => 
    SENSITIVE_FIELDS.some(field => field.toLowerCase() === key.toLowerCase())

/**
 * Mask a sensitive string value
 */
const maskSensitiveString = (key, value) => {
    if (isTokenField(key)) {
        return generateTokenFingerprint(value)
    }
    return value.length > 4 ? `${value.substring(0, 4)}****` : '****'
}

/**
 * Mask a sensitive number value
 */
const maskSensitiveNumber = (value) => {
    const strValue = String(value)
    return strValue.length > 2 ? `${strValue.substring(0, 2)}**` : '**'
}

/**
 * Mask a value if key is sensitive, otherwise recurse
 */
const maskKeyValue = (key, value) => {
    if (!isSensitiveKey(key)) {
        return typeof value === 'object' ? maskObject(value) : value
    }
    if (typeof value === 'string') return maskSensitiveString(key, value)
    if (typeof value === 'number') return maskSensitiveNumber(value)
    return typeof value === 'object' ? maskObject(value) : value
}

/**
 * Mask sensitive data in an object (recursive)
 * 
 * @param {any} obj - Object to mask
 * @returns {any} Object with sensitive fields masked
 */
const maskObject = (obj) => {
    if (obj === null || obj === undefined) return obj
    if (typeof obj === 'string') return maskSensitiveData(obj)
    if (Array.isArray(obj)) return obj.map(maskObject)
    if (typeof obj !== 'object') return obj
    
    const masked = {}
    for (const [key, value] of Object.entries(obj)) {
        masked[key] = maskKeyValue(key, value)
    }
    return masked
}

/**
 * Format arguments for logging, masking any sensitive data
 * 
 * @param {any[]} args - Arguments to format
 * @returns {any[]} Formatted and masked arguments
 */
const formatArgs = (args) => {
    return args.map(arg => {
        if (typeof arg === 'string') {
            return maskSensitiveData(arg)
        }
        if (typeof arg === 'object') {
            // If it's being JSON stringified, mask it first
            try {
                const masked = maskObject(arg)
                return masked
            } catch {
                return arg
            }
        }
        return arg
    })
}

/**
 * Create a logger instance with PII masking
 * All logs go through masking before being output
 */
const logger = {
    /**
     * Check if debug mode is enabled via JPMC_DEBUG environment variable
     * Debug-level gating: Raw request/response logs are only output when enabled
     * Set JPMC_DEBUG=true to include raw request and response bodies in logs
     */
    isDebugEnabled: () => process.env.JPMC_DEBUG === 'true',

    /**
     * Log info message (masked)
     * @param {...any} args - Arguments to log
     */
    info: (...args) => {
        const maskedArgs = formatArgs(args)
        console.info(...maskedArgs)
    },
    
    /**
     * Log warning message (masked)
     * @param {...any} args - Arguments to log
     */
    warn: (...args) => {
        const maskedArgs = formatArgs(args)
        console.warn(...maskedArgs)
    },
    
    /**
     * Log error message (masked)
     * @param {...any} args - Arguments to log
     */
    error: (...args) => {
        const maskedArgs = formatArgs(args)
        console.error(...maskedArgs)
    },
    
    /**
     * Log debug message (masked)
     * Only logs if JPMC_DEBUG environment variable is set to 'true'
     * 
     * Debug-level gating: Raw request/response logs are only output when enabled
     * Set JPMC_DEBUG=true to include raw request and response bodies in logs
     * 
     * @param {...any} args - Arguments to log
     */
    debug: (...args) => {
        if (!logger.isDebugEnabled()) {
            return
        }
        const maskedArgs = formatArgs(args)
        // eslint-disable-next-line no-console
        console.debug('[DEBUG]', ...maskedArgs)
    },
    
    /**
     * Log message (masked)
     * @param {...any} args - Arguments to log
     */
    log: (...args) => {
        const maskedArgs = formatArgs(args)
        console.log(...maskedArgs)
    }
}

/**
 * Utility to safely stringify objects with masking
 * Use this instead of JSON.stringify for logging
 * 
 * @param {any} obj - Object to stringify
 * @param {number} indent - Indentation (default: 2)
 * @returns {string} Masked JSON string
 */
export const safeStringify = (obj, indent = 2) => {
    try {
        const masked = maskObject(obj)
        return JSON.stringify(masked, null, indent)
    } catch {
        return '[Unable to stringify]'
    }
}

export { maskSensitiveData, maskObject, SENSITIVE_FIELDS }
export default logger
