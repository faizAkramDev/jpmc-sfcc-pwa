/**
 * Services Index
 * Exports JP Morgan payment services
 * 
 * @module services
 */

// Authentication Service (Server-Side)
export {
    loadCertificate,
    loadPrivateKey,
    getCertificateThumbprint,
    getCertificateThumbprints,
    generateClientAssertion,
    getAccessToken,
    clearTokenCache,
    isTokenValid,
    getTokenCacheStatus,
    verifyAuthConfiguration
} from './auth'

// SFCC Site Preferences Service (Server-Side)
export {
    getSitePreferences,
    getJPMCPreferences,
    refreshSitePreferences,
    clearPreferencesCache,
    getPreferencesCacheStatus,
    buildJPMCConfigFromPreferences,
    mergeWithEnvironmentConfig
} from './sfcc'

// API Routes (Server-Side)
export {
    registerJPMCRoutes,
    handleAuthorize,
    handleGetConfig,
    handleVerify,
    handleGetGooglePayConfig,
    handleGetFraudConfig,
    handleConfirmOrder,
    handlePatchOrderPaymentInstrument,
    handleGetAvailablePaymentMethods
} from './api-routes'

// JP Morgan API (Server-Side)
export {
    createPayment,
    getPaymentStatus,
    generateRequestId
} from './api/payment-api'

export {
    normalizePaymentResponse
} from './api/response-normalizer'

// 3DS Helpers (Server-Side)
export {
    is3DSEnabled,
    build3DSAuthenticationParameters,
    requires3DSAuthentication,
    get3DSOrchestrationUrl,
    extract3DSValues,
    build3DSOrderPatchPayload
} from './api/helpers'

// Config
export {
    getJPMCConfig
} from '../utils/config/jpmc-config'

// PIE Encryption (Client-Side)
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
} from './pie-encryption'

// Google Pay Services (Client-Side)
export {
    // Script Loader
    loadGooglePayScript,
    isGooglePayScriptLoaded,
    getPaymentsClient,
    createPaymentsClient,
    preloadGooglePayScript,
    resetScriptLoader,
    GooglePayScriptError,
    // Configuration Builder
    buildBaseCardPaymentMethod,
    buildTokenizationSpecification,
    buildCardPaymentMethod,
    buildIsReadyToPayRequest,
    buildPaymentDataRequest,
    buildClientOptions,
    buildGooglePayConfig,
    validateGooglePayConfig,
    // Token Parser
    parseGooglePayResponse,
    extractEncryptedPaymentBundle,
    buildJPMorganGooglePayPayload,
    buildAccountHolderFromGooglePay,
    mapGooglePayAddress,
    validateTokenStructure,
    isValidPaymentData,
    GooglePayTokenError
} from './googlepay'

// Apple Pay Services (Client & Server-Side)
export {
    // Token Validation
    validateApplePayToken,
    isValidApplePayToken,
    // Token Mapping
    mapApplePayTokenToJPMC,
    extractEncryptedPaymentBundle as extractApplePayBundle,
    // Address Mapping
    mapApplePayAddress,
    mapApplePayContactToAccountHolder,
    // Payload Building
    buildJPMorganApplePayPayload,
    // Response Parsing
    parseJPMCApplePayResponse,
    // Utilities
    getCardNetwork,
    getCardDisplayName,
    isDebitCard,
    // Error
    ApplePayTokenError,
    // Session (Server-Side)
    validateMerchant,
    loadCertificate as loadApplePayCertificate,
    validateCertificateFormat,
    createSessionConfig,
    ApplePaySessionError
} from './applepay'
