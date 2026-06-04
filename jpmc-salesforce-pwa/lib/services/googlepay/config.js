/**
 * Google Pay Configuration Builder
 * 
 * Builds the configuration objects required by Google Pay API.
 * Follows Google Pay Web API specifications and JP Morgan gateway requirements.
 * 
 * @module services/googlepay/config
 */

import {
    GOOGLE_PAY_API_VERSION,
    GOOGLE_PAY_GATEWAY,
    GOOGLE_PAY_ALLOWED_NETWORKS,
    GOOGLE_PAY_AUTH_METHODS,
    GOOGLE_PAY_TOKEN_TYPES,
    GOOGLE_PAY_DEFAULTS,
    GOOGLE_PAY_ENVIRONMENTS,
    GOOGLE_PAY_CONTEXT,
    getGooglePayEnvironment,
    getGooglePayIntentsForContext
} from '../../utils/constants.mjs'

// =============================================================================
// Context-aware Constants
// =============================================================================

/**
 * Default total price labels based on context
 * Cart/PDP show estimated total, Checkout shows final total
 */
const TOTAL_PRICE_LABELS = {
    [GOOGLE_PAY_CONTEXT.CART]: 'Est. Total',
    [GOOGLE_PAY_CONTEXT.PDP]: 'Est. Total',
    [GOOGLE_PAY_CONTEXT.CHECKOUT]: 'Total'
}

/**
 * Default total price status based on context
 * Cart/PDP have estimated totals, Checkout has final totals
 */
const TOTAL_PRICE_STATUS = {
    [GOOGLE_PAY_CONTEXT.CART]: 'ESTIMATED',
    [GOOGLE_PAY_CONTEXT.PDP]: 'ESTIMATED',
    [GOOGLE_PAY_CONTEXT.CHECKOUT]: 'FINAL'
}

/**
 * Build the base card payment method configuration
 * 
 * @returns {Object} Base card payment method for Google Pay
 */
export const buildBaseCardPaymentMethod = () => ({
    type: 'CARD',
    parameters: {
        allowedAuthMethods: GOOGLE_PAY_AUTH_METHODS,
        allowedCardNetworks: GOOGLE_PAY_ALLOWED_NETWORKS
    }
})

/**
 * Build tokenization specification for JP Morgan (Chase) gateway
 * 
 * @param {string} gatewayMerchantId - JP Morgan Merchant ID
 * @param {string} [gateway] - Payment gateway name (default: 'chase')
 * @returns {Object} Tokenization specification
 */
export const buildTokenizationSpecification = (gatewayMerchantId, gateway = GOOGLE_PAY_GATEWAY.gateway) => {
    if (!gatewayMerchantId) {
        throw new Error('gatewayMerchantId is required for tokenization specification')
    }

    return {
        type: GOOGLE_PAY_TOKEN_TYPES.PAYMENT_GATEWAY,
        parameters: {
            [GOOGLE_PAY_GATEWAY.gatewayMerchantIdKey]: gatewayMerchantId,
            gateway
        }
    }
}

/**
 * Build card payment method with tokenization for payments
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.gatewayMerchantId - JP Morgan Merchant ID
 * @param {string} [options.gateway] - Payment gateway name (default: 'chase')
 * @param {string[]} [options.allowedNetworks] - Allowed card networks
 * @param {string[]} [options.allowedAuthMethods] - Allowed auth methods
 * @param {boolean} [options.billingAddressRequired] - Require billing address
 * @param {string} [options.billingAddressFormat] - 'MIN' or 'FULL'
 * @param {boolean} [options.phoneNumberRequired] - Require phone number for billing address
 * @returns {Object} Card payment method configuration
 */
export const buildCardPaymentMethod = (options = {}) => {
    const {
        gatewayMerchantId,
        gateway = GOOGLE_PAY_GATEWAY.gateway,
        allowedNetworks = GOOGLE_PAY_ALLOWED_NETWORKS,
        allowedAuthMethods = GOOGLE_PAY_AUTH_METHODS,
        billingAddressRequired = GOOGLE_PAY_DEFAULTS.billingAddressRequired,
        billingAddressFormat = GOOGLE_PAY_DEFAULTS.billingAddressFormat,
        phoneNumberRequired = false
    } = options

    const cardPaymentMethod = {
        type: 'CARD',
        parameters: {
            allowedAuthMethods,
            allowedCardNetworks: allowedNetworks,
            billingAddressRequired,
            billingAddressParameters: {
                format: billingAddressFormat,
                phoneNumberRequired
            }
        },
        tokenizationSpecification: buildTokenizationSpecification(gatewayMerchantId, gateway)
    }

    return cardPaymentMethod
}

/**
 * Build isReadyToPay request
 * 
 * Used to check if Google Pay is available before showing the button.
 * 
 * @param {Object} [options] - Configuration options
 * @param {string[]} [options.allowedNetworks] - Allowed card networks
 * @param {string[]} [options.allowedAuthMethods] - Allowed auth methods
 * @param {boolean} [options.existingPaymentMethodRequired] - Require existing payment method
 * @returns {Object} isReadyToPay request object
 * 
 * @example
 * const request = buildIsReadyToPayRequest()
 * const response = await paymentsClient.isReadyToPay(request)
 * if (response.result) {
 *   // Show Google Pay button
 * }
 */
export const buildIsReadyToPayRequest = (options = {}) => {
    const {
        allowedNetworks = GOOGLE_PAY_ALLOWED_NETWORKS,
        allowedAuthMethods = GOOGLE_PAY_AUTH_METHODS,
        existingPaymentMethodRequired = false
    } = options

    return {
        ...GOOGLE_PAY_API_VERSION,
        allowedPaymentMethods: [{
            type: 'CARD',
            parameters: {
                allowedAuthMethods,
                allowedCardNetworks: allowedNetworks
            }
        }],
        existingPaymentMethodRequired
    }
}

// =============================================================================
// Payment Data Request Helpers
// =============================================================================

/**
 * Build transaction info for payment data request
 */
const buildTransactionInfo = ({ totalPrice, currencyCode, countryCode, checkoutOption, resolvedTotalPriceStatus, resolvedTotalPriceLabel, displayItems, transactionId }) => {
    const info = {
        totalPriceStatus: resolvedTotalPriceStatus,
        totalPrice: String(totalPrice),
        currencyCode,
        countryCode,
        checkoutOption
    }
    if (resolvedTotalPriceLabel) info.totalPriceLabel = resolvedTotalPriceLabel
    if (displayItems?.length > 0) info.displayItems = displayItems
    if (transactionId) info.transactionId = transactionId
    return info
}

/**
 * Build shipping address parameters for payment data request
 */
const buildShippingAddressParams = ({ allowedCountryCodes, countryCode, isCartOrPDPFlow, phoneNumberRequired }) => {
    const params = {
        allowedCountryCodes: allowedCountryCodes?.length > 0 ? allowedCountryCodes : [countryCode]
    }
    if (isCartOrPDPFlow && phoneNumberRequired) {
        params.phoneNumberRequired = true
    }
    return params
}

/**
 * Build payment data request
 * 
 * Used to request payment from the user via loadPaymentData().
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.gatewayMerchantId - JP Morgan Merchant ID
 * @param {string} options.merchantName - Merchant display name
 * @param {string} options.totalPrice - Total amount as string (e.g., '100.00')
 * @param {string} options.currencyCode - Currency code (e.g., 'USD')
 * @param {string} [options.countryCode] - Country code (e.g., 'US')
 * @param {string} [options.merchantId] - Google Merchant ID (production only)
 * @param {string[]} [options.allowedNetworks] - Allowed card networks
 * @param {string[]} [options.allowedAuthMethods] - Allowed auth methods
 * @param {boolean} [options.billingAddressRequired] - Require billing address
 * @param {string} [options.billingAddressFormat] - 'MIN' or 'FULL'
 * @param {boolean} [options.emailRequired] - Require email address
 * @param {boolean} [options.shippingAddressRequired] - Require shipping address
 * @param {boolean} [options.shippingOptionRequired] - Require shipping option selection (cart/pdp only)
 * @param {boolean} [options.phoneNumberRequired] - Require phone number for shipping/billing addresses
 * @param {string[]} [options.callbackIntents] - Callback intents for dynamic updates
 * @param {string} [options.context] - Flow context: 'checkout', 'cart', or 'pdp'
 * @param {string[]} [options.allowedCountryCodes] - Allowed shipping countries (ISO 3166-1 alpha-2)
 * @param {string} [options.totalPriceStatus] - 'FINAL', 'ESTIMATED', or 'NOT_CURRENTLY_KNOWN'
 * @param {string} [options.totalPriceLabel] - Label for total price
 * @param {string} [options.checkoutOption] - 'DEFAULT' or 'COMPLETE_IMMEDIATE_PURCHASE'
 * @param {string} [options.transactionId] - Unique transaction identifier
 * @param {Array} [options.displayItems] - Line items to display (subtotal, shipping, tax)
 * @returns {Object} Payment data request object
 * 
 * @example
 * const request = buildPaymentDataRequest({
 *   gatewayMerchantId: 'your-jpmc-merchant-id',
 *   merchantName: 'Your Store',
 *   totalPrice: '99.99',
 *   currencyCode: 'USD'
 * })
 * const paymentData = await paymentsClient.loadPaymentData(request)
 */
export const buildPaymentDataRequest = (options = {}) => {
    const {
        // Required
        gatewayMerchantId,
        merchantName,
        totalPrice,
        currencyCode,
        // Optional with defaults
        countryCode = 'US',
        merchantId,
        gateway = GOOGLE_PAY_GATEWAY.gateway,
        allowedNetworks = GOOGLE_PAY_ALLOWED_NETWORKS,
        allowedAuthMethods = GOOGLE_PAY_AUTH_METHODS,
        billingAddressRequired = GOOGLE_PAY_DEFAULTS.billingAddressRequired,
        billingAddressFormat = GOOGLE_PAY_DEFAULTS.billingAddressFormat,
        emailRequired = GOOGLE_PAY_DEFAULTS.emailRequired,
        shippingAddressRequired = GOOGLE_PAY_DEFAULTS.shippingAddressRequired,
        checkoutOption = GOOGLE_PAY_DEFAULTS.checkoutOption,
        transactionId,
        // Cart/PDP specific options
        context = GOOGLE_PAY_CONTEXT.CHECKOUT,
        callbackIntents,
        shippingOptionRequired = false,
        phoneNumberRequired = false,
        allowedCountryCodes,
        displayItems,
        // Context-aware defaults (override with explicit values if provided)
        totalPriceStatus,
        totalPriceLabel
    } = options

    // Validate required fields
    if (!gatewayMerchantId) {
        throw new Error('gatewayMerchantId is required')
    }
    if (!merchantName) {
        throw new Error('merchantName is required')
    }
    if (!totalPrice) {
        throw new Error('totalPrice is required')
    }
    if (!currencyCode) {
        throw new Error('currencyCode is required')
    }

    // Determine if this is a cart/pdp flow requiring shipping callbacks
    const isCartOrPDPFlow = context === GOOGLE_PAY_CONTEXT.CART || context === GOOGLE_PAY_CONTEXT.PDP

    // Context-aware defaults
    const resolvedTotalPriceStatus = totalPriceStatus || TOTAL_PRICE_STATUS[context] || GOOGLE_PAY_DEFAULTS.totalPriceStatus
    const resolvedTotalPriceLabel = totalPriceLabel || TOTAL_PRICE_LABELS[context]
    const resolvedCallbackIntents = callbackIntents || getGooglePayIntentsForContext(context)

    // Build merchant info
    const merchantInfo = { merchantName }
    if (merchantId) merchantInfo.merchantId = merchantId

    // Build transaction info using helper
    const transactionInfo = buildTransactionInfo({
        totalPrice, currencyCode, countryCode, checkoutOption,
        resolvedTotalPriceStatus, resolvedTotalPriceLabel,
        displayItems, transactionId
    })

    // Build payment data request
    const paymentDataRequest = {
        ...GOOGLE_PAY_API_VERSION,
        allowedPaymentMethods: [
            buildCardPaymentMethod({
                gatewayMerchantId, gateway, allowedNetworks, allowedAuthMethods,
                billingAddressRequired, billingAddressFormat,
                phoneNumberRequired: isCartOrPDPFlow ? phoneNumberRequired : false
            })
        ],
        merchantInfo,
        transactionInfo,
        emailRequired
    }

    // Add callback intents for cart/pdp flows
    if (resolvedCallbackIntents?.length > 0) {
        paymentDataRequest.callbackIntents = resolvedCallbackIntents
    }

    // Add shipping configuration for cart/pdp flows
    if (shippingAddressRequired || isCartOrPDPFlow) {
        paymentDataRequest.shippingAddressRequired = true
        paymentDataRequest.shippingAddressParameters = buildShippingAddressParams({
            allowedCountryCodes, countryCode, isCartOrPDPFlow, phoneNumberRequired
        })
    }

    if (shippingOptionRequired || isCartOrPDPFlow) {
        paymentDataRequest.shippingOptionRequired = true
    }

    return paymentDataRequest
}

/**
 * Build Google Pay client options
 * 
 * Creates the options object for initializing Google PaymentsClient.
 * For cart/pdp contexts, includes callbacks for dynamic shipping updates.
 * 
 * @param {Object} options - Configuration options
 * @param {string} [options.environment] - Application environment ('sandbox', 'production')
 * @param {string} [options.context] - Flow context: 'checkout', 'cart', or 'pdp'
 * @param {Function} [options.onPaymentDataChanged] - Callback for shipping address/option changes
 * @param {Function} [options.onPaymentAuthorized] - Callback for payment authorization
 * @returns {Object} PaymentsClient options
 * 
 * @example
 * // Checkout context (simple flow)
 * const options = buildClientOptions({ environment: 'sandbox' })
 * 
 * @example
 * // Cart context (with shipping callbacks)
 * const options = buildClientOptions({
 *   environment: 'sandbox',
 *   context: 'cart',
 *   onPaymentDataChanged: handleShippingChange,
 *   onPaymentAuthorized: handlePayment
 * })
 */
export const buildClientOptions = (options = {}) => {
    const { 
        environment, 
        context = GOOGLE_PAY_CONTEXT.CHECKOUT,
        onPaymentDataChanged,
        onPaymentAuthorized
    } = options

    const clientOptions = {
        environment: getGooglePayEnvironment(environment)
    }

    const isCartOrPDPFlow = context === GOOGLE_PAY_CONTEXT.CART || context === GOOGLE_PAY_CONTEXT.PDP

    // Add payment data callbacks for cart/pdp flows
    if (isCartOrPDPFlow || onPaymentDataChanged || onPaymentAuthorized) {
        const callbacks = {}

        if (onPaymentDataChanged) {
            callbacks.onPaymentDataChanged = onPaymentDataChanged
        }

        if (onPaymentAuthorized) {
            callbacks.onPaymentAuthorized = onPaymentAuthorized
        }

        if (Object.keys(callbacks).length > 0) {
            clientOptions.paymentDataCallbacks = callbacks
        }
    }

    return clientOptions
}

/**
 * Build complete Google Pay configuration
 * 
 * Convenience function to build all required configurations at once.
 * Supports context-aware defaults for checkout, cart, and pdp flows.
 * 
 * @param {Object} config - Configuration options
 * @param {string} config.gatewayMerchantId - JP Morgan Merchant ID
 * @param {string} config.merchantName - Merchant display name
 * @param {string} [config.merchantId] - Google Merchant ID (production)
 * @param {string} [config.environment] - Application environment
 * @param {string} [config.context] - Flow context: 'checkout', 'cart', or 'pdp'
 * @param {Function} [config.onPaymentDataChanged] - Callback for shipping changes (cart/pdp)
 * @param {Function} [config.onPaymentAuthorized] - Callback for payment authorization
 * @param {string[]} [config.allowedCountryCodes] - Allowed shipping countries
 * @param {boolean} [config.phoneNumberRequired] - Require phone number for addresses
 * @returns {Object} Complete configuration object
 * 
 * @example
 * // Checkout context (simple flow)
 * const config = buildGooglePayConfig({
 *   gatewayMerchantId: 'your-jpmc-merchant-id',
 *   merchantName: 'Your Store'
 * })
 * 
 * @example
 * // Cart context (with shipping)
 * const config = buildGooglePayConfig({
 *   gatewayMerchantId: 'your-jpmc-merchant-id',
 *   merchantName: 'Your Store',
 *   context: 'cart',
 *   allowedCountryCodes: ['US', 'CA', 'MX'],
 *   onPaymentDataChanged: handleShipping,
 *   onPaymentAuthorized: handlePayment
 * })
 */
export const buildGooglePayConfig = (config = {}) => {
    const {
        gatewayMerchantId,
        merchantName,
        merchantId,
        environment,
        gateway = GOOGLE_PAY_GATEWAY.gateway,
        allowedNetworks = GOOGLE_PAY_ALLOWED_NETWORKS,
        allowedAuthMethods = GOOGLE_PAY_AUTH_METHODS,
        billingAddressRequired = GOOGLE_PAY_DEFAULTS.billingAddressRequired,
        billingAddressFormat = GOOGLE_PAY_DEFAULTS.billingAddressFormat,
        emailRequired = GOOGLE_PAY_DEFAULTS.emailRequired,
        shippingAddressRequired = GOOGLE_PAY_DEFAULTS.shippingAddressRequired,
        // Cart/PDP specific
        context = GOOGLE_PAY_CONTEXT.CHECKOUT,
        onPaymentDataChanged,
        onPaymentAuthorized,
        allowedCountryCodes,
        phoneNumberRequired = false
    } = config

    const isCartOrPDPFlow = context === GOOGLE_PAY_CONTEXT.CART || context === GOOGLE_PAY_CONTEXT.PDP

    return {
        // Client configuration (context-aware)
        clientOptions: buildClientOptions({ 
            environment,
            context,
            onPaymentDataChanged,
            onPaymentAuthorized
        }),

        // Ready to pay check
        isReadyToPayRequest: buildIsReadyToPayRequest({
            allowedNetworks,
            allowedAuthMethods
        }),

        // Factory function to build payment data request with amount
        buildPaymentDataRequest: (totalPrice, currencyCode, additionalOptions = {}) => 
            buildPaymentDataRequest({
                gatewayMerchantId,
                merchantName,
                merchantId,
                totalPrice,
                currencyCode,
                gateway,
                allowedNetworks,
                allowedAuthMethods,
                billingAddressRequired,
                billingAddressFormat,
                emailRequired,
                shippingAddressRequired: isCartOrPDPFlow || shippingAddressRequired,
                context,
                allowedCountryCodes,
                phoneNumberRequired,
                ...additionalOptions
            }),

        // Raw configuration for custom builds
        raw: {
            gatewayMerchantId,
            merchantName,
            merchantId,
            gateway,
            environment: getGooglePayEnvironment(environment),
            allowedNetworks,
            allowedAuthMethods,
            billingAddressRequired,
            billingAddressFormat,
            emailRequired,
            shippingAddressRequired,
            context,
            allowedCountryCodes,
            phoneNumberRequired
        }
    }
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate required Google Pay config fields
 */
const validateRequiredGooglePayFields = (config, errors) => {
    if (!config.gatewayMerchantId) errors.push('gatewayMerchantId is required')
    if (!config.merchantName) errors.push('merchantName is required')
    
    const validContexts = Object.values(GOOGLE_PAY_CONTEXT)
    if (config.context && !validContexts.includes(config.context)) {
        errors.push(`Invalid context "${config.context}". Valid contexts are: ${validContexts.join(', ')}`)
    }
}

/**
 * Validate production-specific Google Pay config
 */
const validateProductionConfig = (config, errors) => {
    const isProduction = config.environment === 'production' || 
        getGooglePayEnvironment(config.environment) === GOOGLE_PAY_ENVIRONMENTS.PRODUCTION
    if (isProduction && !config.merchantId) {
        errors.push('merchantId (Google Merchant ID) is required for production')
    }
}

/**
 * Validate cart/pdp context-specific Google Pay config
 */
const validateCartPDPConfig = (config, warnings, errors) => {
    if (!config.onPaymentDataChanged) {
        warnings.push('onPaymentDataChanged callback recommended for cart/pdp context to handle shipping updates')
    }
    if (!config.onPaymentAuthorized) {
        warnings.push('onPaymentAuthorized callback recommended for cart/pdp context to handle payment authorization')
    }
    
    if (config.allowedCountryCodes) {
        if (!Array.isArray(config.allowedCountryCodes)) {
            errors.push('allowedCountryCodes must be an array')
        } else {
            const invalidCodes = config.allowedCountryCodes.filter(code => !/^[A-Z]{2}$/.test(code))
            if (invalidCodes.length > 0) {
                warnings.push(`Invalid country codes: ${invalidCodes.join(', ')}. Expected ISO 3166-1 alpha-2 format`)
            }
        }
    }
}

/**
 * Validate Google Pay configuration
 * 
 * Validates required and context-specific configuration options.
 * 
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result { valid: boolean, errors: string[], warnings: string[] }
 */
export const validateGooglePayConfig = (config = {}) => {
    const errors = []
    const warnings = []

    validateRequiredGooglePayFields(config, errors)
    validateProductionConfig(config, errors)
    
    const isCartOrPDPFlow = config.context === GOOGLE_PAY_CONTEXT.CART || config.context === GOOGLE_PAY_CONTEXT.PDP
    if (isCartOrPDPFlow) {
        validateCartPDPConfig(config, warnings, errors)
    }

    return { valid: errors.length === 0, errors, warnings }
}
