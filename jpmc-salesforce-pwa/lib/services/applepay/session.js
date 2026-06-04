/**
 * Apple Pay Session Handler
 * 
 * Handles Apple Pay merchant validation session creation.
 * This module is used server-side to validate merchants with Apple Pay servers.
 * 
 * Unlike Google Pay, Apple Pay requires server-side merchant validation.
 * When an Apple Pay session starts, Apple sends a validation URL that must
 * be called from the server with the merchant's identity certificate.
 * 
 * @module services/applepay/session
 * 
 * @see https://developer.apple.com/documentation/apple_pay_on_the_web/apple_pay_js_api/providing_merchant_validation
 */

import https from 'https'
import fs from 'fs'
import { APPLE_PAY_ERROR_CODES } from '../../utils/constants.mjs'

// =============================================================================
// Error Class
// =============================================================================

/**
 * Apple Pay Session Error
 * Custom error class for Apple Pay session/validation errors
 */
export class ApplePaySessionError extends Error {
    constructor(code, message, cause = null) {
        super(message)
        this.name = 'ApplePaySessionError'
        this.code = code
        this.cause = cause
        
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ApplePaySessionError)
        }
    }
}

// =============================================================================
// Session Validation
// =============================================================================

/**
 * Validate merchant with Apple Pay servers
 * 
 * This function calls Apple's validation URL with the merchant's identity
 * certificate to establish a valid Apple Pay session.
 * 
 * @param {Object} options - Validation options
 * @param {string} options.validationURL - URL from Apple's onvalidatemerchant event
 * @param {string} options.merchantId - Apple Pay Merchant ID
 * @param {string} options.merchantName - Merchant display name
 * @param {string} options.domain - Domain where Apple Pay is being used
 * @param {string} options.merchantIdentityCert - Merchant identity certificate (PEM)
 * @param {string} options.merchantIdentityKey - Merchant identity private key (PEM)
 * @param {string} [options.merchantIdentityPassphrase] - Private key passphrase (if encrypted)
 * @returns {Promise<Object>} Merchant session from Apple
 * @throws {ApplePaySessionError} If validation fails
 * 
 * @example
 * const session = await validateMerchant({
 *   validationURL: 'https://apple-pay-gateway.apple.com/paymentservices/startSession',
 *   merchantId: 'merchant.com.yourcompany',
 *   merchantName: 'Your Store',
 *   domain: 'www.yourstore.com',
 *   merchantIdentityCert: fs.readFileSync('/path/to/cert.pem', 'utf8'),
 *   merchantIdentityKey: fs.readFileSync('/path/to/key.pem', 'utf8')
 * })
 */
export const validateMerchant = async (options) => {
    const {
        validationURL,
        merchantId,
        merchantName,
        domain,
        merchantIdentityCert,
        merchantIdentityKey,
        merchantIdentityPassphrase
    } = options

    // Validate required parameters
    if (!validationURL) {
        throw new ApplePaySessionError(
            APPLE_PAY_ERROR_CODES.INVALID_CONFIG,
            'validationURL is required for merchant validation'
        )
    }

    if (!merchantId) {
        throw new ApplePaySessionError(
            APPLE_PAY_ERROR_CODES.INVALID_CONFIG,
            'merchantId is required for merchant validation'
        )
    }

    if (!merchantIdentityCert || !merchantIdentityKey) {
        throw new ApplePaySessionError(
            APPLE_PAY_ERROR_CODES.CERTIFICATE_ERROR,
            'Merchant identity certificate and key are required'
        )
    }

    // Validate the URL is from Apple (security check)
    const validationURLObj = new URL(validationURL)
    if (!validationURLObj.hostname.endsWith('.apple.com')) {
        throw new ApplePaySessionError(
            APPLE_PAY_ERROR_CODES.INVALID_CONFIG,
            'Invalid validation URL: must be from apple.com domain'
        )
    }

    // Build the merchant validation payload
    const merchantValidationPayload = {
        merchantIdentifier: merchantId,
        displayName: merchantName || merchantId,
        initiative: 'web',
        initiativeContext: domain
    }

    return new Promise((resolve, reject) => {
        // Parse the validation URL
        const url = new URL(validationURL)

        // Prepare the request body
        const requestBody = JSON.stringify(merchantValidationPayload)

        // Configure HTTPS request with client certificate
        const requestOptions = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname + url.search,
            method: 'POST',
            cert: merchantIdentityCert,
            key: merchantIdentityKey,
            passphrase: merchantIdentityPassphrase,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody)
            },
            // Apple Pay gateway requires TLS 1.2+
            minVersion: 'TLSv1.2'
        }

        const req = https.request(requestOptions, (res) => {
            let responseData = ''

            res.on('data', (chunk) => {
                responseData += chunk
            })

            res.on('end', () => {
                try {
                    if (res.statusCode !== 200) {
                        reject(new ApplePaySessionError(
                            APPLE_PAY_ERROR_CODES.MERCHANT_VALIDATION_FAILED,
                            `Apple Pay validation failed with status ${res.statusCode}: ${responseData}`
                        ))
                        return
                    }

                    const merchantSession = JSON.parse(responseData)

                    // Validate the merchant session response
                    if (!merchantSession?.merchantSessionIdentifier) {
                        reject(new ApplePaySessionError(
                            APPLE_PAY_ERROR_CODES.MERCHANT_VALIDATION_FAILED,
                            'Invalid merchant session response from Apple'
                        ))
                        return
                    }

                    resolve(merchantSession)
                } catch (err) {
                    reject(new ApplePaySessionError(
                        APPLE_PAY_ERROR_CODES.MERCHANT_VALIDATION_FAILED,
                        `Failed to parse merchant session response: ${err.message}`,
                        err
                    ))
                }
            })
        })

        req.on('error', (err) => {
            reject(new ApplePaySessionError(
                APPLE_PAY_ERROR_CODES.NETWORK_ERROR,
                `Network error during merchant validation: ${err.message}`,
                err
            ))
        })

        // Set timeout
        req.setTimeout(30000, () => {
            req.destroy()
            reject(new ApplePaySessionError(
                APPLE_PAY_ERROR_CODES.SESSION_TIMEOUT,
                'Merchant validation request timed out'
            ))
        })

        // Send the request
        req.write(requestBody)
        req.end()
    })
}

// =============================================================================
// Certificate Utilities
// =============================================================================

/**
 * Load merchant identity certificate from file or environment
 * 
 * @param {string} certPath - Path to certificate file or certificate content
 * @returns {string} Certificate content
 */
export const loadCertificate = (certPath) => {
    // If it looks like a certificate (starts with -----BEGIN), return as-is
    if (certPath?.includes('-----BEGIN')) {
        return certPath
    }

    // If it's a Base64-encoded certificate, decode it
    if (certPath && !certPath.includes('/') && !certPath.includes('\\')) {
        try {
            const decoded = Buffer.from(certPath, 'base64').toString('utf8')
            if (decoded.includes('-----BEGIN')) {
                return decoded
            }
        } catch {
            // Not base64, continue
        }
    }

    // Try to load from file system
    try {
        return fs.readFileSync(certPath, 'utf8')
    } catch (err) {
        throw new ApplePaySessionError(
            APPLE_PAY_ERROR_CODES.CERTIFICATE_ERROR,
            `Failed to load certificate: ${err.message}`,
            err
        )
    }
}

/**
 * Validate certificate format
 * 
 * @param {string} cert - Certificate content
 * @param {string} type - 'certificate' or 'key'
 * @returns {boolean} True if valid format
 */
export const validateCertificateFormat = (cert, type = 'certificate') => {
    if (!cert || typeof cert !== 'string') {
        return false
    }

    if (type === 'certificate') {
        return cert.includes('-----BEGIN CERTIFICATE-----') &&
               cert.includes('-----END CERTIFICATE-----')
    }

    if (type === 'key') {
        return (cert.includes('-----BEGIN PRIVATE KEY-----') ||
                cert.includes('-----BEGIN RSA PRIVATE KEY-----') ||
                cert.includes('-----BEGIN EC PRIVATE KEY-----')) &&
               (cert.includes('-----END PRIVATE KEY-----') ||
                cert.includes('-----END RSA PRIVATE KEY-----') ||
                cert.includes('-----END EC PRIVATE KEY-----'))
    }

    return false
}

// =============================================================================
// Session Configuration
// =============================================================================

/**
 * Create Apple Pay session configuration
 * 
 * @param {Object} options - Configuration options
 * @returns {Object} Session configuration
 */
export const createSessionConfig = (options) => {
    const {
        merchantId,
        merchantName,
        merchantIdentityCert,
        merchantIdentityKey,
        merchantIdentityPassphrase,
        environment = 'sandbox'
    } = options

    // Validate required fields
    if (!merchantId) {
        throw new ApplePaySessionError(
            APPLE_PAY_ERROR_CODES.INVALID_CONFIG,
            'merchantId is required'
        )
    }

    // Load certificates
    let cert = merchantIdentityCert
    let key = merchantIdentityKey

    if (typeof merchantIdentityCert === 'string' && !merchantIdentityCert.includes('-----BEGIN')) {
        cert = loadCertificate(merchantIdentityCert)
    }

    if (typeof merchantIdentityKey === 'string' && !merchantIdentityKey.includes('-----BEGIN')) {
        key = loadCertificate(merchantIdentityKey)
    }

    // Validate certificate formats
    if (!validateCertificateFormat(cert, 'certificate')) {
        throw new ApplePaySessionError(
            APPLE_PAY_ERROR_CODES.CERTIFICATE_ERROR,
            'Invalid merchant identity certificate format'
        )
    }

    if (!validateCertificateFormat(key, 'key')) {
        throw new ApplePaySessionError(
            APPLE_PAY_ERROR_CODES.CERTIFICATE_ERROR,
            'Invalid merchant identity key format'
        )
    }

    return {
        merchantId,
        merchantName: merchantName || merchantId,
        merchantIdentityCert: cert,
        merchantIdentityKey: key,
        merchantIdentityPassphrase,
        environment,
        // Helper method for validation
        validate: (validationURL, domain) => validateMerchant({
            validationURL,
            merchantId,
            merchantName: merchantName || merchantId,
            domain,
            merchantIdentityCert: cert,
            merchantIdentityKey: key,
            merchantIdentityPassphrase
        })
    }
}

// =============================================================================
// Exports (default object for convenience)
// =============================================================================

export default {
    validateMerchant,
    loadCertificate,
    validateCertificateFormat,
    createSessionConfig,
    ApplePaySessionError
}
