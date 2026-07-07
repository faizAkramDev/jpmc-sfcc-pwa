/**
 * JP Morgan Payment Integration Constants
 * @module constants
 */

import { ENVIRONMENTS } from './constants/misc-constants.js'

// =============================================================================
// Payment Methods & Card Types
// =============================================================================

// Supported Payment Methods
export const PAYMENT_METHODS = {
    CARD: 'card',
    GIFT_CARD: 'giftcard',
    SAVED_CARD: 'savedcard',
    GOOGLE_PAY: 'googlepay',
    APPLE_PAY: 'applepay'
}

// Card Types
// SFCC Shopper Baskets API expects these exact values for paymentCard.cardType
// Values must match card-type attribute in payment-methods.xml (SFCC metadata)
export const CARD_TYPES = {
    VISA: 'Visa',
    MASTERCARD: 'Master Card',
    AMEX: 'Amex',
    DISCOVER: 'Discover',
    JCB: 'JCB',
    DINERS: 'DinersClub',
    MAESTRO: 'Maestro',
    CHINA_UNIONPAY: 'China UnionPay'
}

// Card type short codes (for internal use / pattern matching)
export const CARD_TYPE_CODES = {
    VISA: 'visa',
    MASTERCARD: 'mc',
    AMEX: 'amex',
    DISCOVER: 'discover',
    JCB: 'jcb',
    DINERS: 'diners',
    MAESTRO: 'maestro',
    CHINA_UNIONPAY: 'unionpay'
}

// Card Type Detection Patterns
export const CARD_PATTERNS = {
    visa: /^4\d{12}(?:\d{3})?$/,
    mc: /^5[1-5]\d{14}$/,
    amex: /^3[47]\d{13}$/,
    discover: /^6(?:011|5\d{2})\d{12}$/,
    jcb: /^(?:2131|1800|35\d{3})\d{11}$/,
    diners: /^3(?:0[0-5]|[68]\d)\d{11}$/,
    maestro: /^(?:5[0678]\d\d|6304|6390|67\d\d)\d{8,15}$/,
    unionpay: /^62\d{14,17}$/
}

// CVV Lengths by Card Type
export const CVV_LENGTHS = {
    visa: 3,
    mc: 3,
    amex: 4,
    discover: 3,
    jcb: 3,
    diners: 3,
    maestro: 3,
    unionpay: 3
}

// Transaction Types
export const TRANSACTION_TYPES = {
    AUTHORIZATION: 'authorization',
    CAPTURE: 'capture',
    REFUND: 'refund',
    CANCEL: 'cancel'
}

// Payment States (JPMC Transaction States)
export const PAYMENT_STATES = {
    PENDING: 'PENDING',
    AUTHORIZED: 'AUTHORIZED',
    VOIDED: 'VOIDED',
    DECLINED: 'DECLINED',
    CLOSED: 'CLOSED',
    ERROR: 'ERROR',
    // Legacy lowercase versions
    pending: 'pending',
    authorized: 'authorized',
    captured: 'captured',
    failed: 'failed',
    cancelled: 'cancelled',
    refunded: 'refunded'
}

// JPMC Response Status
export const RESPONSE_STATUS = {
    SUCCESS: 'SUCCESS',
    DENIED: 'DENIED',
    ERROR: 'ERROR'
}

// JPMC Capture Methods
export const CAPTURE_METHODS = {
    NOW: 'NOW',           // Immediate capture (sale)
    DELAYED: 'DELAYED',   // Delayed capture (default 120 min)
    MANUAL: 'MANUAL'      // Manual capture via separate API call
}

/**
 * JPMC Account On File values
 * 
 * Values: 'TO_BE_STORED' | 'STORED' | 'NOT_STORED'
 * - TO_BE_STORED: First-time card, return token for future use (used at verify step)
 * - STORED: Using a previously stored token
 * - NOT_STORED: One-time payment, no token needed (used at auth step with token)
 */
export const ACCOUNT_ON_FILE = {
    TO_BE_STORED: 'TO_BE_STORED',  // For verify - tells JPMC to return a token
    STORED: 'STORED',               // For auth with saved card
    NOT_STORED: 'NOT_STORED'        // For auth - token already obtained
}

/**
 * JPMC Initiator Type - always CARDHOLDER for customer-initiated transactions
 * (Merchant-initiated would be for recurring payments, not supported in this app)
 */
export const INITIATOR_TYPE = 'CARDHOLDER'

/**
 * JPMC Card Encryption Types - account number types
 */
export const CARD_ENCRYPTION_TYPES = {
    SAFETECH_PAGE_ENCRYPTION: 'SAFETECH_PAGE_ENCRYPTION',  // PIE encrypted card
    SAFETECH_TOKEN: 'SAFETECH_TOKEN',                       // SAFETECH token from verify
    PLAIN: undefined                                         // Plain card number (testing only)
}

/**
 * Default lat/long for location-based requests (Google Pay, Apple Pay)
 */
export const DEFAULT_LAT_LONG = '0,0'

/**
 * Phone country codes keyed by ISO 3166 Alpha-2.
 * Covers US, CA, and all EU member states.
 */
export const PHONE_COUNTRY_CODES = {
    US: 1,
    CA: 1,
    AT: 43,
    BE: 32,
    BG: 359,
    HR: 385,
    CY: 357,
    CZ: 420,
    DK: 45,
    EE: 372,
    FI: 358,
    FR: 33,
    DE: 49,
    GR: 30,
    HU: 36,
    IE: 353,
    IT: 39,
    LV: 371,
    LT: 370,
    LU: 352,
    MT: 356,
    NL: 31,
    PL: 48,
    PT: 351,
    RO: 40,
    SK: 421,
    SI: 386,
    ES: 34,
    SE: 46
}

/**
 * Request ID prefixes for different API calls
 */
export const REQUEST_ID_PREFIXES = {
    VERIFY: 'verify-',
    AUTH: 'auth-',
    CAPTURE: 'capture-',
    REFUND: 'refund-'
}

// =============================================================================
// Encryption & Validation Configuration
// =============================================================================

// Encryption Configuration
export const ENCRYPTION_CONFIG = {
    ALGORITHM: 'RSA-OAEP',
    HASH: 'SHA-256',
    KEY_LENGTH: 2048,
    TIMEOUT: 5000, // 5 seconds
    RETRY_ATTEMPTS: 3
}

// Validation Rules
export const VALIDATION_RULES = {
    CARD_NUMBER: {
        MIN_LENGTH: 13,
        MAX_LENGTH: 19
    },
    CVV: {
        MIN_LENGTH: 3,
        MAX_LENGTH: 4
    },
    EXPIRY_YEAR: {
        MIN_OFFSET: 0, // current year
        MAX_OFFSET: 20 // 20 years from now
    }
}

// =============================================================================
// GOOGLE PAY CONFIGURATION
// =============================================================================

/**
 * Google Pay API Version
 * Must match the version used in Google Pay JS API
 */
export const GOOGLE_PAY_API_VERSION = {
    apiVersion: 2,
    apiVersionMinor: 0
}

/**
 * Google Pay Script URL
 * Official Google Pay JavaScript library
 */
export const GOOGLE_PAY_SCRIPT_URL = 'https://pay.google.com/gp/p/js/pay.js'

/**
 * Google Pay Environment
 * TEST: For development/sandbox (no real transactions)
 * PRODUCTION: For live transactions
 */
export const GOOGLE_PAY_ENVIRONMENTS = {
    TEST: 'TEST',
    PRODUCTION: 'PRODUCTION'
}

/**
 * Allowed Card Networks for Google Pay
 * These must be supported by JP Morgan merchant account
 */
export const GOOGLE_PAY_ALLOWED_NETWORKS = ['AMEX', 'DISCOVER', 'JCB', 'MASTERCARD', 'VISA']

/**
 * Allowed Authentication Methods
 * PAN_ONLY: Cards stored in Google Account
 * CRYPTOGRAM_3DS: Cards from Android device token (Google Wallet)
 */
export const GOOGLE_PAY_AUTH_METHODS = ['PAN_ONLY', 'CRYPTOGRAM_3DS']

/**
 * Google Pay Gateway Configuration for JP Morgan (Chase)
 * 
 * Per JP Morgan documentation:
 * "Use gateway name 'chase' and your J.P. Morgan merchant ID value 
 * for gatewayMerchantId to complete the transaction."
 * 
 * Gateway ID: 'chase'
 * gatewayMerchantId: Your JP Morgan Merchant ID (the same merchant-id used in API headers)
 */
export const GOOGLE_PAY_GATEWAY = {
    gateway: 'chase',
    gatewayMerchantIdKey: 'gatewayMerchantId'
}

/**
 * Google Pay Test Gateway (for development without real merchant account)
 * Per Google: "example is a valid gateway name in the test environment"
 */
export const GOOGLE_PAY_TEST_GATEWAY = {
    gateway: 'example',
    gatewayMerchantId: 'exampleGatewayMerchantId'
}

/**
 * Google Pay Production Gateway for JP Morgan
 */
export const GOOGLE_PAY_CHASE_GATEWAY = {
    gateway: 'chase',
    gatewayMerchantIdKey: 'gatewayMerchantId'
}

/**
 * Google Pay Token Types
 * PAYMENT_GATEWAY: Token for gateway processing
 * DIRECT: Direct integration (not used with JP Morgan)
 */
export const GOOGLE_PAY_TOKEN_TYPES = {
    PAYMENT_GATEWAY: 'PAYMENT_GATEWAY',
    DIRECT: 'DIRECT'
}

/**
 * Google Pay Button Configuration
 * These are passed to Google Pay JS API for button rendering
 */
export const GOOGLE_PAY_BUTTON_CONFIG = {
    // Button types
    BUTTON_TYPES: {
        BUY: 'buy',
        CHECKOUT: 'checkout',
        DONATE: 'donate',
        ORDER: 'order',
        PAY: 'pay',
        PLAIN: 'plain',
        SUBSCRIBE: 'subscribe',
        BOOK: 'book',
        SHORT: 'short',
        LONG: 'long'
    },
    // Button colors
    BUTTON_COLORS: {
        DEFAULT: 'default',
        BLACK: 'black',
        WHITE: 'white'
    },
    // Button size modes
    BUTTON_SIZE_MODES: {
        STATIC: 'static',
        FILL: 'fill'
    },
    // Default button options
    DEFAULT: {
        buttonType: 'buy',
        buttonColor: 'black',
        buttonSizeMode: 'fill',
        buttonLocale: 'en'  // fallback only — override with runtime site locale at initialization
    }
}

/**
 * Google Pay Total Price Status
 * FINAL: Price will not change
 * ESTIMATED: Price may change (e.g., shipping to be calculated)
 * NOT_CURRENTLY_KNOWN: Price is unknown at this time
 */
export const GOOGLE_PAY_PRICE_STATUS = {
    FINAL: 'FINAL',
    ESTIMATED: 'ESTIMATED',
    NOT_CURRENTLY_KNOWN: 'NOT_CURRENTLY_KNOWN'
}

/**
 * Google Pay Checkout Option
 * DEFAULT: Standard checkout flow
 * COMPLETE_IMMEDIATE_PURCHASE: Complete purchase immediately
 */
export const GOOGLE_PAY_CHECKOUT_OPTION = {
    DEFAULT: 'DEFAULT',
    COMPLETE_IMMEDIATE_PURCHASE: 'COMPLETE_IMMEDIATE_PURCHASE'
}

/**
 * Google Pay Callback Intents
 * For dynamic updates during payment flow
 */
export const GOOGLE_PAY_CALLBACK_INTENTS = {
    PAYMENT_AUTHORIZATION: 'PAYMENT_AUTHORIZATION',
    SHIPPING_ADDRESS: 'SHIPPING_ADDRESS',
    SHIPPING_OPTION: 'SHIPPING_OPTION',
    OFFER: 'OFFER'
}

/**
 * Google Pay Callback Trigger Types
 * 
 * These are the trigger values that Google Pay sends in the
 * `intermediatePaymentData.callbackTrigger` field when invoking
 * the `onPaymentDataChanged` callback.
 * 
 * @see https://developers.google.com/pay/api/web/reference/response-objects#IntermediatePaymentData
 */
export const GOOGLE_PAY_CALLBACK_TRIGGERS = {
    /** Triggered when the payment sheet is first displayed */
    INITIALIZE: 'INITIALIZE',
    /** Triggered when user selects or changes shipping address */
    SHIPPING_ADDRESS: 'SHIPPING_ADDRESS',
    /** Triggered when user selects or changes shipping option */
    SHIPPING_OPTION: 'SHIPPING_OPTION',
    /** Triggered when a promotional code is applied */
    OFFER: 'OFFER'
}

/**
 * Google Pay Context Types
 * 
 * Defines the context in which Google Pay is being used.
 * Each context has different callback intents and behaviors.
 */
export const GOOGLE_PAY_CONTEXT = {
    /** Standard checkout flow - payment authorization only */
    CHECKOUT: 'checkout',
    /** Cart page - includes shipping address/option selection */
    CART: 'cart',
    /** Product detail page - includes add-to-cart + shipping flow */
    PDP: 'pdp'
}

/**
 * Google Pay Cart/PDP Intent Array
 * 
 * Callback intents for cart and PDP context.
 * Includes SHIPPING_ADDRESS and SHIPPING_OPTION for dynamic updates.
 * Must be used with `shippingAddressRequired: true` and `shippingOptionRequired: true`
 */
export const GOOGLE_PAY_CART_INTENTS = [
    GOOGLE_PAY_CALLBACK_INTENTS.SHIPPING_ADDRESS,
    GOOGLE_PAY_CALLBACK_INTENTS.SHIPPING_OPTION,
    GOOGLE_PAY_CALLBACK_INTENTS.PAYMENT_AUTHORIZATION
]

/**
 * Google Pay PDP Intent Array
 * 
 * Same as cart intents - PDP flow also requires shipping callbacks.
 * Separated for clarity and potential future customization.
 */
export const GOOGLE_PAY_PDP_INTENTS = [
    GOOGLE_PAY_CALLBACK_INTENTS.SHIPPING_ADDRESS,
    GOOGLE_PAY_CALLBACK_INTENTS.SHIPPING_OPTION,
    GOOGLE_PAY_CALLBACK_INTENTS.PAYMENT_AUTHORIZATION
]

/**
 * Google Pay Checkout Intent Array
 * 
 * Callback intents for standard checkout context.
 * Empty array - checkout flow uses simple token collection without callbacks.
 * The token is returned directly from loadPaymentData for later authorization.
 */
export const GOOGLE_PAY_CHECKOUT_INTENTS = []

/**
 * Get callback intents for a given Google Pay context
 * 
 * @param {string} context - One of GOOGLE_PAY_CONTEXT values
 * @returns {string[]} Array of callback intents for the context
 * @throws {Error} If context is invalid
 * 
 * @example
 * const intents = getGooglePayIntentsForContext('cart')
 * // Returns: ['SHIPPING_ADDRESS', 'SHIPPING_OPTION', 'PAYMENT_AUTHORIZATION']
 */
export const getGooglePayIntentsForContext = (context) => {
    switch (context) {
        case GOOGLE_PAY_CONTEXT.CART:
            return [...GOOGLE_PAY_CART_INTENTS]
        case GOOGLE_PAY_CONTEXT.PDP:
            return [...GOOGLE_PAY_PDP_INTENTS]
        case GOOGLE_PAY_CONTEXT.CHECKOUT:
            return [...GOOGLE_PAY_CHECKOUT_INTENTS]
        default:
            throw new Error(
                `Invalid Google Pay context: "${context}". ` +
                `Valid contexts are: ${Object.values(GOOGLE_PAY_CONTEXT).join(', ')}`
            )
    }
}

/**
 * Google Pay Shipping Error Reasons
 * 
 * Standard error reasons that Google Pay recognizes for shipping-related errors.
 * These are returned in the `error.reason` field of callback responses.
 * 
 * @see https://developers.google.com/pay/api/web/reference/response-objects#PaymentDataError
 */
export const GOOGLE_PAY_SHIPPING_ERROR_REASONS = {
    /** Address is invalid or malformed */
    SHIPPING_ADDRESS_INVALID: 'SHIPPING_ADDRESS_INVALID',
    /** Cannot ship to the selected address */
    SHIPPING_ADDRESS_UNSERVICEABLE: 'SHIPPING_ADDRESS_UNSERVICEABLE',
    /** Selected shipping option is not available */
    SHIPPING_OPTION_INVALID: 'SHIPPING_OPTION_INVALID',
    /** General error */
    OTHER_ERROR: 'OTHER_ERROR'
}

/**
 * Google Pay Display Item Types
 * 
 * Types for items displayed in the Google Pay payment sheet.
 * 
 * @see https://developers.google.com/pay/api/web/reference/request-objects#DisplayItem
 */
export const GOOGLE_PAY_DISPLAY_ITEM_TYPES = {
    /** Subtotal of items */
    SUBTOTAL: 'SUBTOTAL',
    /** Tax amount */
    TAX: 'TAX',
    /** Line item (e.g., shipping) */
    LINE_ITEM: 'LINE_ITEM'
}

/**
 * Google Pay Display Item Status
 * 
 * Status for display items indicating if the price is final or pending.
 */
export const GOOGLE_PAY_DISPLAY_ITEM_STATUS = {
    /** Price is final */
    FINAL: 'FINAL',
    /** Price is estimated/pending calculation */
    PENDING: 'PENDING'
}

/**
 * Google Pay Error Codes
 * Specific error codes for Google Pay integration
 */
export const GOOGLE_PAY_ERROR_CODES = {
    // Script/SDK errors
    SCRIPT_LOAD_FAILED: 'GPAY_SCRIPT_LOAD_FAILED',
    SCRIPT_LOAD_TIMEOUT: 'GPAY_SCRIPT_LOAD_TIMEOUT',
    CLIENT_NOT_INITIALIZED: 'GPAY_CLIENT_NOT_INITIALIZED',
    // Availability errors
    NOT_READY_TO_PAY: 'GPAY_NOT_READY_TO_PAY',
    NOT_AVAILABLE: 'GPAY_NOT_AVAILABLE',
    NOT_SUPPORTED: 'GPAY_NOT_SUPPORTED',
    // Payment flow errors
    PAYMENT_CANCELLED: 'GPAY_PAYMENT_CANCELLED',
    PAYMENT_FAILED: 'GPAY_PAYMENT_FAILED',
    PAYMENT_DATA_INVALID: 'GPAY_PAYMENT_DATA_INVALID',
    // Token errors
    TOKEN_PARSE_ERROR: 'GPAY_TOKEN_PARSE_ERROR',
    TOKEN_MISSING: 'GPAY_TOKEN_MISSING',
    TOKEN_EXPIRED: 'GPAY_TOKEN_EXPIRED',
    // Configuration errors
    INVALID_CONFIG: 'GPAY_INVALID_CONFIG',
    MERCHANT_ID_MISSING: 'GPAY_MERCHANT_ID_MISSING',
    // Server-side errors
    AUTHORIZATION_FAILED: 'GPAY_AUTHORIZATION_FAILED',
    SERVER_ERROR: 'GPAY_SERVER_ERROR'
}

/**
 * Google Pay Error Messages
 * User-friendly error messages for each error code
 */
export const GOOGLE_PAY_ERROR_MESSAGES = {
    [GOOGLE_PAY_ERROR_CODES.SCRIPT_LOAD_FAILED]:
        'Failed to load Google Pay. Please refresh the page and try again.',
    [GOOGLE_PAY_ERROR_CODES.SCRIPT_LOAD_TIMEOUT]:
        'Google Pay is taking too long to load. Please check your connection.',
    [GOOGLE_PAY_ERROR_CODES.CLIENT_NOT_INITIALIZED]:
        'Google Pay is not ready. Please wait a moment and try again.',
    [GOOGLE_PAY_ERROR_CODES.NOT_READY_TO_PAY]:
        'Google Pay is not available for this transaction.',
    [GOOGLE_PAY_ERROR_CODES.NOT_AVAILABLE]:
        'Google Pay is not available in your browser. Please try a different browser.',
    [GOOGLE_PAY_ERROR_CODES.NOT_SUPPORTED]:
        'Google Pay is not supported in this context.',
    [GOOGLE_PAY_ERROR_CODES.PAYMENT_CANCELLED]:
        'Google Pay payment was cancelled.',
    [GOOGLE_PAY_ERROR_CODES.PAYMENT_FAILED]:
        'Google Pay payment failed. Please try again or use a different payment method.',
    [GOOGLE_PAY_ERROR_CODES.PAYMENT_DATA_INVALID]:
        'Invalid payment data received. Please try again.',
    [GOOGLE_PAY_ERROR_CODES.TOKEN_PARSE_ERROR]:
        'Failed to process Google Pay token. Please try again.',
    [GOOGLE_PAY_ERROR_CODES.TOKEN_MISSING]:
        'No payment token received. Please try again.',
    [GOOGLE_PAY_ERROR_CODES.TOKEN_EXPIRED]:
        'Payment token has expired. Please try again.',
    [GOOGLE_PAY_ERROR_CODES.INVALID_CONFIG]:
        'Google Pay configuration error. Please contact support.',
    [GOOGLE_PAY_ERROR_CODES.MERCHANT_ID_MISSING]:
        'Google Pay merchant configuration is incomplete.',
    [GOOGLE_PAY_ERROR_CODES.AUTHORIZATION_FAILED]:
        'Google Pay payment authorization failed. Please try again.',
    [GOOGLE_PAY_ERROR_CODES.SERVER_ERROR]:
        'Server error processing Google Pay. Please try again later.'
}

/**
 * Google Pay Default Configuration
 * Sensible defaults for quick integration
 */
export const GOOGLE_PAY_DEFAULTS = {
    environment: GOOGLE_PAY_ENVIRONMENTS.TEST,
    allowedNetworks: GOOGLE_PAY_ALLOWED_NETWORKS,
    allowedAuthMethods: GOOGLE_PAY_AUTH_METHODS,
    billingAddressRequired: true,
    billingAddressFormat: 'FULL',
    shippingAddressRequired: false,
    emailRequired: true,
    buttonType: GOOGLE_PAY_BUTTON_CONFIG.DEFAULT.buttonType,
    buttonColor: GOOGLE_PAY_BUTTON_CONFIG.DEFAULT.buttonColor,
    buttonSizeMode: GOOGLE_PAY_BUTTON_CONFIG.DEFAULT.buttonSizeMode,
    totalPriceStatus: GOOGLE_PAY_PRICE_STATUS.FINAL,
    checkoutOption: GOOGLE_PAY_CHECKOUT_OPTION.DEFAULT,
    scriptLoadTimeout: 10000 // 10 seconds
}

/**
 * Google Pay Protocol Version
 * ECv2 is the current version used by JP Morgan
 */
export const GOOGLE_PAY_PROTOCOL_VERSION = 'ECv2'

/**
 * Helper function to get Google Pay environment from app environment
 * @param {string} environment - 'production', 'sandbox', 'test', etc.
 * @returns {string} 'PRODUCTION' or 'TEST'
 */
export const getGooglePayEnvironment = (environment) => {
    return environment === ENVIRONMENTS.PRODUCTION
        ? GOOGLE_PAY_ENVIRONMENTS.PRODUCTION
        : GOOGLE_PAY_ENVIRONMENTS.TEST
}

/**
 * Helper function to get error message for Google Pay error code
 * @param {string} errorCode - Error code from GOOGLE_PAY_ERROR_CODES
 * @returns {string} User-friendly error message
 */
export const getGooglePayErrorMessage = (errorCode) => {
    return GOOGLE_PAY_ERROR_MESSAGES[errorCode] || 'An unexpected error occurred with Google Pay.'
}

// =============================================================================
// APPLE PAY CONFIGURATION
// =============================================================================

/**
 * Apple Pay API Version
 * Version 14 is the latest as of 2025, supporting all modern features
 * Reference: https://developer.apple.com/documentation/apple_pay_on_the_web/apple_pay_on_the_web_version_history
 */
export const APPLE_PAY_API_VERSION = 14

/**
 * Apple Pay Supported Versions (minimum supported)
 * Version 3 is the minimum required for basic functionality
 * Version 6+ required for some advanced features
 */
export const APPLE_PAY_MIN_VERSION = 3

/**
 * Apple Pay Environments
 * Maps to JPMC environment configuration
 */
export const APPLE_PAY_ENVIRONMENTS = {
    SANDBOX: 'sandbox',
    PRODUCTION: 'production'
}

/**
 * Apple Pay Supported Networks
 * These must align with your JP Morgan merchant account capabilities
 * Reference: https://developer.payments.jpmorgan.com/docs/commerce/online-payments/capabilities/online-payments/payment-methods/applepay
 */
export const APPLE_PAY_SUPPORTED_NETWORKS = [
    'visa',
    'masterCard',
    'amex',
    'discover',
    'jcb',
    'chinaUnionPay'
]

/**
 * Apple Pay Merchant Capabilities
 * - supports3DS: Required for 3D Secure authentication (most common)
 * - supportsDebit: Accept debit cards
 * - supportsCredit: Accept credit cards
 * - supportsEMV: Accept EMV chip cards (in-app only)
 */
export const APPLE_PAY_MERCHANT_CAPABILITIES = [
    'supports3DS',
    'supportsDebit',
    'supportsCredit'
]

/**
 * Apple Pay Protocol Versions
 * EC_v1: ECC-encrypted data (most common for web)
 * RSA_v1: RSA-encrypted data (legacy)
 * Reference: JPMC documentation specifies encryptedPaymentBundle.protocolVersion
 */
export const APPLE_PAY_PROTOCOL_VERSIONS = {
    EC_V1: 'EC_v1',
    RSA_V1: 'RSA_v1'
}

/**
 * Apple Pay Button Styles
 * Reference: https://developer.apple.com/documentation/apple_pay_on_the_web/applepaybuttonstyle
 */
export const APPLE_PAY_BUTTON_STYLES = {
    BLACK: 'black',
    WHITE: 'white',
    WHITE_OUTLINE: 'white-outline'
}

/**
 * Apple Pay Button Types
 * Reference: https://developer.apple.com/documentation/apple_pay_on_the_web/applepaybuttontype
 */
export const APPLE_PAY_BUTTON_TYPES = {
    PLAIN: 'plain',
    BUY: 'buy',
    PAY: 'pay',
    CHECKOUT: 'checkout',
    BOOK: 'book',
    SUBSCRIBE: 'subscribe',
    DONATE: 'donate',
    ADD_MONEY: 'add-money',
    TOP_UP: 'top-up',
    ORDER: 'order',
    RENT: 'rent',
    SUPPORT: 'support',
    CONTRIBUTE: 'contribute',
    TIP: 'tip',
    RELOAD: 'reload',
    SET_UP: 'set-up'
}

/**
 * Apple Pay Session Status Codes
 * Used in ApplePaySession callbacks
 */
export const APPLE_PAY_STATUS = {
    SUCCESS: 0,  // ApplePaySession.STATUS_SUCCESS
    FAILURE: 1,  // ApplePaySession.STATUS_FAILURE
    INVALID_BILLING_POSTAL_ADDRESS: 2,
    INVALID_SHIPPING_POSTAL_ADDRESS: 3,
    INVALID_SHIPPING_CONTACT: 4,
    PIN_REQUIRED: 5,
    PIN_INCORRECT: 6,
    PIN_LOCKOUT: 7
}

/**
 * Apple Pay Contact Fields
 * Fields that can be requested from the user
 */
export const APPLE_PAY_CONTACT_FIELDS = {
    EMAIL: 'email',
    NAME: 'name',
    PHONE: 'phone',
    POSTAL_ADDRESS: 'postalAddress',
    PHONE_NUMBER: 'phoneNumber'
}

/**
 * Apple Pay Shipping Types
 */
export const APPLE_PAY_SHIPPING_TYPES = {
    SHIPPING: 'shipping',
    DELIVERY: 'delivery',
    STORE_PICKUP: 'storePickup',
    SERVICE_PICKUP: 'servicePickup'
}

/**
 * Apple Pay Line Item Types
 */
export const APPLE_PAY_LINE_ITEM_TYPES = {
    FINAL: 'final',
    PENDING: 'pending'
}

/**
 * Apple Pay Error Codes
 * Specific error codes for Apple Pay integration
 */
export const APPLE_PAY_ERROR_CODES = {
    // Availability errors
    NOT_AVAILABLE: 'APPLEPAY_NOT_AVAILABLE',
    NOT_SUPPORTED: 'APPLEPAY_NOT_SUPPORTED',
    NOT_SAFARI: 'APPLEPAY_NOT_SAFARI',
    NO_ACTIVE_CARD: 'APPLEPAY_NO_ACTIVE_CARD',
    
    // Session errors
    SESSION_ERROR: 'APPLEPAY_SESSION_ERROR',
    SESSION_TIMEOUT: 'APPLEPAY_SESSION_TIMEOUT',
    SESSION_CANCELLED: 'APPLEPAY_SESSION_CANCELLED',
    
    // Merchant validation errors
    MERCHANT_VALIDATION_FAILED: 'APPLEPAY_MERCHANT_VALIDATION_FAILED',
    INVALID_MERCHANT_ID: 'APPLEPAY_INVALID_MERCHANT_ID',
    INVALID_CERTIFICATE: 'APPLEPAY_INVALID_CERTIFICATE',
    DOMAIN_NOT_VERIFIED: 'APPLEPAY_DOMAIN_NOT_VERIFIED',
    
    // Payment errors
    PAYMENT_CANCELLED: 'APPLEPAY_PAYMENT_CANCELLED',
    PAYMENT_FAILED: 'APPLEPAY_PAYMENT_FAILED',
    PAYMENT_NOT_AUTHORIZED: 'APPLEPAY_PAYMENT_NOT_AUTHORIZED',
    
    // Token errors
    TOKEN_ERROR: 'APPLEPAY_TOKEN_ERROR',
    TOKEN_MAPPING_FAILED: 'APPLEPAY_TOKEN_MAPPING_FAILED',
    TOKEN_MISSING_FIELDS: 'APPLEPAY_TOKEN_MISSING_FIELDS',
    
    // Configuration errors
    INVALID_CONFIG: 'APPLEPAY_INVALID_CONFIG',
    MISSING_MERCHANT_ID: 'APPLEPAY_MISSING_MERCHANT_ID',
    MISSING_CERTIFICATE: 'APPLEPAY_MISSING_CERTIFICATE',
    
    // Server errors
    SERVER_ERROR: 'APPLEPAY_SERVER_ERROR',
    AUTHORIZATION_FAILED: 'APPLEPAY_AUTHORIZATION_FAILED',
    NETWORK_ERROR: 'APPLEPAY_NETWORK_ERROR'
}

/**
 * Apple Pay Error Messages
 * User-friendly error messages for each error code
 */
export const APPLE_PAY_ERROR_MESSAGES = {
    [APPLE_PAY_ERROR_CODES.NOT_AVAILABLE]:
        'Apple Pay is not available on this device or browser.',
    [APPLE_PAY_ERROR_CODES.NOT_SUPPORTED]:
        'Apple Pay is not supported in this context.',
    [APPLE_PAY_ERROR_CODES.NOT_SAFARI]:
        'Apple Pay is only available in Safari browser.',
    [APPLE_PAY_ERROR_CODES.NO_ACTIVE_CARD]:
        'No payment cards are set up in Apple Wallet.',
    [APPLE_PAY_ERROR_CODES.SESSION_ERROR]:
        'Apple Pay session error. Please try again.',
    [APPLE_PAY_ERROR_CODES.SESSION_TIMEOUT]:
        'Apple Pay session timed out. Please try again.',
    [APPLE_PAY_ERROR_CODES.SESSION_CANCELLED]:
        'Apple Pay session was cancelled.',
    [APPLE_PAY_ERROR_CODES.MERCHANT_VALIDATION_FAILED]:
        'Merchant validation failed. Please contact support.',
    [APPLE_PAY_ERROR_CODES.INVALID_MERCHANT_ID]:
        'Invalid Apple Pay merchant configuration.',
    [APPLE_PAY_ERROR_CODES.INVALID_CERTIFICATE]:
        'Apple Pay certificate error. Please contact support.',
    [APPLE_PAY_ERROR_CODES.DOMAIN_NOT_VERIFIED]:
        'This domain is not verified for Apple Pay.',
    [APPLE_PAY_ERROR_CODES.PAYMENT_CANCELLED]:
        'Apple Pay payment was cancelled.',
    [APPLE_PAY_ERROR_CODES.PAYMENT_FAILED]:
        'Apple Pay payment failed. Please try again.',
    [APPLE_PAY_ERROR_CODES.PAYMENT_NOT_AUTHORIZED]:
        'Apple Pay payment was not authorized.',
    [APPLE_PAY_ERROR_CODES.TOKEN_ERROR]:
        'Error processing Apple Pay payment token.',
    [APPLE_PAY_ERROR_CODES.TOKEN_MAPPING_FAILED]:
        'Failed to process payment data. Please try again.',
    [APPLE_PAY_ERROR_CODES.TOKEN_MISSING_FIELDS]:
        'Incomplete payment data received.',
    [APPLE_PAY_ERROR_CODES.INVALID_CONFIG]:
        'Apple Pay configuration error. Please contact support.',
    [APPLE_PAY_ERROR_CODES.MISSING_MERCHANT_ID]:
        'Apple Pay merchant ID is not configured.',
    [APPLE_PAY_ERROR_CODES.MISSING_CERTIFICATE]:
        'Apple Pay certificate is not configured.',
    [APPLE_PAY_ERROR_CODES.SERVER_ERROR]:
        'Server error processing Apple Pay. Please try again.',
    [APPLE_PAY_ERROR_CODES.AUTHORIZATION_FAILED]:
        'Apple Pay authorization failed. Please try again.',
    [APPLE_PAY_ERROR_CODES.NETWORK_ERROR]:
        'Network error. Please check your connection.'
}

/**
 * Apple Pay CSP (Content Security Policy) Domains
 * Required for Apple Pay to function correctly
 * Reference: Apple Pay on the Web documentation
 */
export const APPLE_PAY_CSP_DOMAINS = {
    scripts: [
        'https://applepay.cdn-apple.com'
    ],
    frames: [
        'https://applepay.cdn-apple.com'
    ],
    connect: [
        'https://apple-pay-gateway.apple.com',
        'https://apple-pay-gateway-cert.apple.com',
        // Regional pod endpoints for merchant validation
        'https://apple-pay-gateway-nc-pod1.apple.com',
        'https://apple-pay-gateway-nc-pod2.apple.com',
        'https://apple-pay-gateway-nc-pod3.apple.com',
        'https://apple-pay-gateway-nc-pod4.apple.com',
        'https://apple-pay-gateway-nc-pod5.apple.com',
        'https://apple-pay-gateway-pr-pod1.apple.com',
        'https://apple-pay-gateway-pr-pod2.apple.com',
        'https://apple-pay-gateway-pr-pod3.apple.com',
        'https://apple-pay-gateway-pr-pod4.apple.com',
        'https://apple-pay-gateway-pr-pod5.apple.com'
    ]
}

/**
 * Apple Pay Default Configuration
 * Sensible defaults for quick integration
 */
export const APPLE_PAY_DEFAULTS = {
    environment: APPLE_PAY_ENVIRONMENTS.SANDBOX,
    supportedNetworks: APPLE_PAY_SUPPORTED_NETWORKS,
    merchantCapabilities: APPLE_PAY_MERCHANT_CAPABILITIES,
    countryCode: 'US',
    currencyCode: 'USD',
    buttonStyle: APPLE_PAY_BUTTON_STYLES.BLACK,
    buttonType: APPLE_PAY_BUTTON_TYPES.BUY,
    requiredBillingContactFields: [
        APPLE_PAY_CONTACT_FIELDS.POSTAL_ADDRESS,
        APPLE_PAY_CONTACT_FIELDS.NAME
    ],
    requiredShippingContactFields: [],
    shippingType: APPLE_PAY_SHIPPING_TYPES.SHIPPING,
    // JPMC specific: latLong is required, use default placeholder
    defaultLatLong: '1,1'
}

/**
 * Apple Pay JPMC Token Mapping
 * Maps Apple Pay token fields to JPMC Online Payments API fields
 * Reference: https://developer.payments.jpmorgan.com/docs/commerce/online-payments/capabilities/online-payments/payment-methods/applepay
 */
export const APPLE_PAY_JPMC_TOKEN_MAPPING = {
    // Apple Pay field -> JPMC field
    'paymentData.data': 'encryptedPaymentBundle.encryptedPayload',
    'paymentData.signature': 'encryptedPaymentBundle.signature',
    'paymentData.version': 'encryptedPaymentBundle.protocolVersion',
    'paymentData.header.ephemeralPublicKey': 'encryptedPaymentBundle.encryptedPaymentHeader.ephemeralPublicKey',
    'paymentData.header.publicKeyHash': 'encryptedPaymentBundle.encryptedPaymentHeader.publicKeyHash',
    'paymentData.header.transactionId': 'encryptedPaymentBundle.encryptedPaymentHeader.walletTransactionId',
    'paymentData.header.applicationData': 'encryptedPaymentBundle.encryptedPaymentHeader.walletApplicationData'
}

/**
 * Apple Pay Required JPMC Fields
 * All required fields for JPMC Online Payments API applepay object
 */
export const APPLE_PAY_JPMC_REQUIRED_FIELDS = [
    'latLong',
    'encryptedPaymentBundle.encryptedPayload',
    'encryptedPaymentBundle.encryptedPaymentHeader.ephemeralPublicKey',
    'encryptedPaymentBundle.encryptedPaymentHeader.publicKeyHash',
    'encryptedPaymentBundle.encryptedPaymentHeader.walletTransactionId',
    'encryptedPaymentBundle.protocolVersion',
    'encryptedPaymentBundle.signature'
]

/**
 * Helper function to get Apple Pay environment from app environment
 * @param {string} environment - 'production', 'sandbox', 'test', etc.
 * @returns {string} 'production' or 'sandbox'
 */
export const getApplePayEnvironment = (environment) => {
    return environment === ENVIRONMENTS.PRODUCTION
        ? APPLE_PAY_ENVIRONMENTS.PRODUCTION
        : APPLE_PAY_ENVIRONMENTS.SANDBOX
}

/**
 * Helper function to get error message for Apple Pay error code
 * @param {string} errorCode - Error code from APPLE_PAY_ERROR_CODES
 * @returns {string} User-friendly error message
 */
export const getApplePayErrorMessage = (errorCode) => {
    return APPLE_PAY_ERROR_MESSAGES[errorCode] || 'An unexpected error occurred with Apple Pay.'
}

/**
 * Helper function to check if Apple Pay is potentially available
 * This is a quick check - actual availability depends on user's device and wallet
 * @returns {boolean} True if ApplePaySession API exists
 */
export const isApplePaySupported = () => {
    return typeof globalThis.window !== 'undefined' && 
           typeof globalThis.ApplePaySession !== 'undefined' &&
           typeof globalThis.ApplePaySession.canMakePayments === 'function'
}

/**
 * Helper function to get Apple Pay button CSS class
 * @param {string} style - Button style from APPLE_PAY_BUTTON_STYLES
 * @param {string} type - Button type from APPLE_PAY_BUTTON_TYPES
 * @returns {string} CSS class for Apple Pay button
 */
export const getApplePayButtonClass = (
    style = APPLE_PAY_BUTTON_STYLES.BLACK,
    type = APPLE_PAY_BUTTON_TYPES.BUY
) => {
    return `apple-pay-button apple-pay-button-${style} apple-pay-button-${type}`
}

// =============================================================================
// 3D Secure (3DS) Constants
// =============================================================================

/**
 * 3D Secure Constants
 * Used for orchestrated 3DS authentication flow with JP Morgan
 * 
 * @see https://developer.payments.jpmorgan.com/docs/commerce/online-payments/capabilities/online-payments/payment-enhancements/3d-secure
 */
export const THREE_DS = {
    /**
     * Response statuses from JPMC postback
     */
    RESPONSE_STATUS: {
        SUCCESS: 'SUCCESS',
        ERROR: 'ERROR',
        DENIED: 'DENIED',
        CANCELLED: 'CANCELLED'
    },

    /**
     * Transaction authentication statuses (EMVCo 3DS)
     * Y = Successfully authenticated
     * N = Authentication failed
     * A = Authentication attempted
     * U = Authentication unavailable/unknown
     */
    TRANSACTION_STATUS: {
        SUCCESS: 'Y',
        FAILED: 'N',
        ATTEMPTED: 'A',
        UNAVAILABLE: 'U'
    },

    /**
     * Response codes that indicate 3DS is required
     */
    RESPONSE_CODE: {
        PERFORM_AUTHENTICATION: 'PERFORM_AUTHENTICATION'
    },

    /**
     * Failure reasons for 3DS
     */
    FAILURE_REASON: {
        TIMEOUT: 'TIMEOUT',
        USER_CANCELLED: 'USER_CANCELLED',
        IFRAME_ERROR: 'IFRAME_ERROR',
        DENIED: 'DENIED',
        ERROR: 'ERROR'
    },

    /**
     * Challenge window size - hardcoded to FULL_SCREEN per SFRA implementation
     */
    CHALLENGE_WINDOW_SIZE: 'FULL_SCREEN',

    /**
     * Timeout duration in milliseconds (3 minutes per SFRA)
     */
    TIMEOUT_MS: 3 * 60 * 1000,

    /**
     * PostMessage type for 3DS completion
     */
    POSTMESSAGE_TYPE: 'jpmc3dsComplete',

    /**
     * Valid JPMC origin domain suffix for postMessage validation
     */
    JPMC_DOMAIN_SUFFIX: '.payments.jpmorgan.com',

    /**
     * 3DS Challenge Type options
     * Indicates whether a challenge is requested for this transaction
     */
    CHALLENGE_TYPE: {
        NO_PREFERENCE: 'NO_PREFERENCE',
        CHALLENGE_MANDATE: 'CHALLENGE_MANDATE',
        NO_CHALLENGE: 'NO_CHALLENGE',
        CHALLENGE_REQUESTED: 'CHALLENGE_REQUESTED'
    },

    /**
     * 3DS Transaction Type options (ISO 8583)
     * Identifies the type of transaction being authenticated
     */
    TRANSACTION_TYPE: {
        GOODS_SERVICES: 'GOODS_SERVICES',
        CHECK_ACCEPTANCE: 'CHECK_ACCEPTANCE',
        ACCOUNT_FUNDING: 'ACCOUNT_FUNDING',
        QUASI_CASH: 'QUASI_CASH',
        PREPAID_ACTIVATION: 'PREPAID_ACTIVATION'
    },

    /**
     * 3DS Authentication Purpose options
     * Indicates the type of authentication request
     */
    AUTH_PURPOSE: {
        PAYMENT_TRANSACTION: 'PAYMENT_TRANSACTION',
        RECURRING_TRANSACTION: 'RECURRING_TRANSACTION',
        INSTALMENT_TRANSACTION: 'INSTALMENT_TRANSACTION',
        ADD_CARD: 'ADD_CARD',
        MAINTAIN_CARD_INFO: 'MAINTAIN_CARD_INFO',
        CARDHOLDER_VERIFICATION: 'CARDHOLDER_VERIFICATION',
        BILLING_AGREEMENT: 'BILLING_AGREEMENT',
        SPLIT_PAYMENT: 'SPLIT_PAYMENT',
        DELAYED_SHIPPING: 'DELAYED_SHIPPING',
        SPLIT_SHIPMENT: 'SPLIT_SHIPMENT'
    },

    /**
     * 3DS Requestor Authentication Method options
     * How the requestor authenticated the cardholder
     */
    REQUESTOR_AUTH_METHOD: {
        GUEST_NO_LOGIN: 'GUEST_NO_LOGIN',
        OWN_CREDENTIALS: 'OWN_CREDENTIALS',
        FEDERATED_ID: 'FEDERATED_ID',
        ISSUER_CREDENTIALS: 'ISSUER_CREDENTIALS',
        THIRD_PARTY_AUTH: 'THIRD_PARTY_AUTH',
        FIDO_AUTH: 'FIDO_AUTH',
        FIDO_WITH_SIGNED_DATA: 'FIDO_WITH_SIGNED_DATA',
        SRC_ASSURANCE_DATA: 'SRC_ASSURANCE_DATA'
    },

    /**
     * 3DS Authentication Use Case options
     * Codifies the use case for the purchase
     */
    AUTH_USE_CASE: {
        FIRST_TIME_PURCHASE: 'FIRST_TIME_PURCHASE',
        AUTHENTICATION_ONLY: 'AUTHENTICATION_ONLY'
    },

    /**
     * Channel type for browser-based 3DS
     */
    CHANNEL_TYPE: 'BROWSER',

    /**
     * Authentication type for standard 3DS
     */
    AUTHENTICATION_TYPE: 'AUTHENTICATION',

    /**
     * Card types that support 3DS authentication (whitelist approach)
     * Only Visa, Mastercard, and Amex support 3DS
     * Values include: SFCC cardType, JPMC cardTypeName, and JPMC cardType codes
     */
    SUPPORTED_3DS_CARD_TYPES: [
        // SFCC paymentCard.cardType values (uppercased)
        'VISA',
        'MASTER CARD',
        'AMEX',
        // JPMC API cardTypeName values
        'MASTERCARD',
        'AMERICAN_EXPRESS',
        // JPMC API cardType codes
        'VI',
        'MC',
        'AX'
    ],

    /**
     * Allowed JPMC origins for postMessage validation
     * Must match exactly OR end with JPMC_DOMAIN_SUFFIX
     */
    JPMC_ORIGINS: [
        'https://payments.jpmorgan.com',
        'https://api-ms.payments.jpmorgan.com',
        'https://api-ms-test.payments.jpmorgan.com'
    ]
}