/**
 * Apple Pay Services
 * 
 * Complete Apple Pay integration module for JP Morgan PWA Kit.
 * 
 * This module provides:
 * - Token mapping (Apple Pay → JP Morgan format)
 * - Merchant session validation (server-side)
 * - Address/contact mapping
 * - Response parsing
 * 
 * @module services/applepay
 * 
 * @example
 * // Import everything
 * import * as ApplePay from '@jpmorgan/jpmorgan-salesforce-pwa/services/applepay'
 * 
 * // Or import specific functions
 * import { 
 *   mapApplePayTokenToJPMC,
 *   buildJPMorganApplePayPayload,
 *   validateMerchant
 * } from '@jpmorgan/jpmorgan-salesforce-pwa/services/applepay'
 */

// Token Mapper
export {
    // Validation
    validateApplePayToken,
    isValidApplePayToken,
    
    // Token mapping
    mapApplePayTokenToJPMC,
    extractEncryptedPaymentBundle,
    
    // Address mapping
    mapApplePayAddress,
    mapApplePayContactToAccountHolder,
    
    // Payload building
    buildJPMorganApplePayPayload,
    
    // Response parsing
    parseJPMCApplePayResponse,
    
    // Utilities
    getCardNetwork,
    getCardDisplayName,
    isDebitCard,
    
    // Error class
    ApplePayTokenError
} from './token-mapper.js'

// Session Handler
export {
    // Merchant validation
    validateMerchant,
    
    // Certificate utilities
    loadCertificate,
    validateCertificateFormat,
    
    // Session configuration
    createSessionConfig,
    
    // Error class
    ApplePaySessionError
} from './session.js'
