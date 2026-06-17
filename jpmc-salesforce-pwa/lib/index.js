/**
 * @jpmorgan/jpmorgan-salesforce-pwa
 * 
 * JP Morgan Payment Integration for Salesforce Commerce Cloud PWA Kit
 * 
 * MINIMAL INTEGRATION (Recommended):
 * ==================================
 * 1. In ssr.js: Use createJPMCHandler() instead of runtime.createHandler()
 * 2. That's it! Routes, CSP, and checkout enhancement are automatic.
 * 
 * MANUAL INTEGRATION (Legacy):
 * ============================
 * 1. Register server routes in ssr.js: registerJPMCRoutes(app)
 * 2. Add CSP headers: jpmorganCSPMiddleware()
 * 3. Wrap checkout with JPMCCheckoutProvider
 * 4. Use useJPMCCheckout hook for payment flow
 * 
 * @version 1.0.0
 * @license MIT
 */

// =============================================================================
// SSR MODULE (RECOMMENDED - Minimal Integration)
// =============================================================================
// Use createJPMCHandler for automatic route registration and CSP
// Or use registerJPMCEndpoints for Adyen-style plug-and-play registration
export {
    createJPMCHandler,
    getJPMCConfig,
    validateConfig,
    registerJPMCRoutes,
    registerJPMCEndpoints,
    jpmorganCSPMiddleware,
    mergeCSPDirectives,
    jpmorganErrorHandler,
    // Order API exports for advanced use
    OrderApiClient,
    DEFAULT_ATTRIBUTE_MAPPING,
    mapJPMCResponseToAttributes,
    createAttributeMapper
} from './ssr'

// =============================================================================
// CLIENT MODULE (For checkout integration)
// =============================================================================
// JPMCCheckoutProvider handles the complete payment flow
export {
    JPMCCheckoutProvider,
    useJPMCCheckout
} from './client'

// =============================================================================
// LOW-LEVEL HOOKS (For custom implementations)
// =============================================================================
export { default as useJPMorganPayment } from './hooks/useJPMorganPayment'
export { default as useGooglePay } from './hooks/useGooglePay'
export { default as useApplePay } from './hooks/useApplePay'
export { useJPMCPlaceOrder } from './hooks/useJPMCPlaceOrder'
export { useAvailablePaymentMethods, checkAvailablePaymentMethods } from './hooks/useAvailablePaymentMethods'


// =============================================================================
// JPMC API SERVICE (Server-Side Only)
// =============================================================================
// Direct API access for server-side operations
export {
    createPayment,
    getPaymentStatus,
    normalizePaymentResponse,
    generateRequestId,
    getJPMCConfig as getJPMCAPIConfig
} from './services'

// =============================================================================
// OAUTH AUTHENTICATION SERVICE (Server-Side Only)
// =============================================================================
// JWT-based OAuth 2.0 authentication for JP Morgan APIs
export {
    loadCertificate,
    loadPrivateKey,
    getCertificateThumbprint,
    generateClientAssertion,
    getAccessToken,
    clearTokenCache,
    isTokenValid,
    getTokenCacheStatus,
    verifyAuthConfiguration
} from './services'

// =============================================================================
// PIE ENCRYPTION (Client-Side)
// =============================================================================
// Page Encryption SDK for secure card data handling
export {
    loadPIESDK,
    isPIEReady,
    isPIEKeyError,
    isPIEEncryptionError,
    validateCardChecksum,
    encryptCardData,
    getPIEState,
    getPIEKeyInfo,
    resetPIEState
} from './services/pie-encryption'

// =============================================================================
// UTILITIES
// =============================================================================
// Card utilities (formatting, display, type detection)
export {
    detectCardType,
    formatCardNumber,
    maskCardNumber,
    luhnCheck
} from './utils/validation'

// Error handling utilities
export {
    JPMorganPaymentError,
    getUserFriendlyMessage,
    parseAPIError,
    handleValidationError,
    handleEncryptionError,
    logError,
    retryWithBackoff
} from './utils/error-handler'

// =============================================================================
// CONSTANTS
// =============================================================================
export {
    CARD_TYPES,
    CARD_PATTERNS,
    PAYMENT_METHODS,
    PAYMENT_STATES,
    RESPONSE_STATUS,
    CAPTURE_METHODS,
    ENVIRONMENTS,
    ERROR_CODES,
    ERROR_MESSAGES,
    GENERIC_API_ERROR_MESSAGE,
    JPMC_HOSTS,
    JPMC_AUTH,
    JPMC_PIE_URLS,
    getPIEUrls,
    HTTP_STATUS,
    VALIDATION_RULES,
    // Apple Pay Constants
    APPLE_PAY_API_VERSION,
    APPLE_PAY_ENVIRONMENTS,
    APPLE_PAY_SUPPORTED_NETWORKS,
    APPLE_PAY_MERCHANT_CAPABILITIES,
    APPLE_PAY_BUTTON_STYLES,
    APPLE_PAY_BUTTON_TYPES,
    APPLE_PAY_ERROR_CODES,
    APPLE_PAY_DEFAULTS,
    APPLE_PAY_CSP_DOMAINS
} from './utils/constants/index'

// =============================================================================
// DEFAULT EXPORT
// =============================================================================
import { createJPMCHandler, registerJPMCEndpoints } from './ssr'
import { JPMCCheckoutProvider, useJPMCCheckout } from './client'
import useJPMorganPayment from './hooks/useJPMorganPayment'

export default {
    // SSR (primary)
    createJPMCHandler,
    registerJPMCEndpoints,
    
    // Client (primary)
    JPMCCheckoutProvider,
    useJPMCCheckout,
    
    // Low-level (advanced)
    useJPMorganPayment
}
