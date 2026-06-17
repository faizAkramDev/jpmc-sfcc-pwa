/**
 * Miscellaneous Constants
 * 
 * Environment types, storage keys, component names, and defaults.
 * 
 * @module utils/constants/misc-constants
 */

// =============================================================================
// Environment Types
// =============================================================================

export const ENVIRONMENTS = {
    PRODUCTION: 'production',
    SANDBOX: 'sandbox',
    TEST: 'test',
    DEVELOPMENT: 'development',
    MOCK: 'mock'
}

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_CONFIG = {
    environment: ENVIRONMENTS.SANDBOX,
    locale: 'en-US',
    showPayButton: true,
    enableStoreDetails: true,
    enableAutoComplete: false,
    maxRetries: 3,
    timeout: 30000,
    analytics: {
        enabled: false
    }
}

// =============================================================================
// Storage Keys
// =============================================================================

export const STORAGE_KEYS = {
    PAYMENT_METHOD: 'jpmorgan_payment_method',
    SAVED_CARDS: 'jpmorgan_saved_cards',
    SESSION_ID: 'jpmorgan_session_id'
}

// =============================================================================
// Component Names
// =============================================================================

export const COMPONENT_NAMES = {
    CHECKOUT_PROVIDER: 'JPMorganCheckoutProvider',
    CHECKOUT: 'JPMorganCheckout',
    ENCRYPTED_CARD: 'EncryptedCard',
    PAYMENT_METHODS: 'PaymentMethods'
}

// =============================================================================
// JPMC OAuth Token Endpoint (same for all environments)
// =============================================================================

/**
 * JP Morgan OAuth 2.0 token endpoint.
 * This is the same for both sandbox (TEST/CAT) and production environments.
 * Used as both the token request URL and the JWT `aud` claim.
 */
export const JPMC_TOKEN_URI = 'https://idag2.jpmorganchase.com/adfs/oauth2/token'

// =============================================================================
// Token Configuration
// =============================================================================

export const TOKEN_CONFIG = {
    // JWT expiry in seconds (5 minutes for client assertion)
    JWT_EXPIRY_SECONDS: 300,
    
    // Default access token validity (8 hours)
    DEFAULT_TOKEN_VALIDITY_SECONDS: 28800,
    
    // Buffer time before token expiry to trigger refresh (5 minutes)
    TOKEN_BUFFER_MS: 5 * 60 * 1000
}

// =============================================================================
// Retry Configuration
// =============================================================================

export const RETRY_CONFIG = {
    MAX_RETRIES: 3,
    BASE_DELAY_MS: 1000,
    MAX_DELAY_MS: 30000,
    RETRYABLE_STATUS_CODES: [500, 502, 503, 504]
}

// =============================================================================
// Merchant Software Identification (Fixed values - not configurable)
// =============================================================================

/**
 * Fixed merchant software identification values for JPMC API requests.
 * These are hardcoded constants and NOT configurable via Business Manager.
 */
export const MERCHANT_SOFTWARE = {
    companyName: 'JPMC Plugin',
    productName: 'JPMC SFCC PWA Cartridge',
    version: '1.0'
}

export default {
    ENVIRONMENTS,
    DEFAULT_CONFIG,
    STORAGE_KEYS,
    COMPONENT_NAMES,
    JPMC_TOKEN_URI,
    TOKEN_CONFIG,
    RETRY_CONFIG,
    MERCHANT_SOFTWARE
}
