/**
 * Google Pay Configuration Resolver
 * 
 * Resolves Google Pay configuration from multiple sources:
 * 1. Component props (highest priority)
 * 2. Context config (from JPMC provider - authenticated fetch for multi-MID)
 * 3. Server config (from autoFetchConfig - may be unauthenticated)
 * 
 * IMPORTANT: Context config takes priority over server config because:
 * - Context config is fetched with authentication via JPMCCheckoutProvider
 * - Server config (autoFetchConfig) may be fetched without auth, getting wrong Site Preferences
 * 
 * @module components/utils/googlepay-config-resolver
 */

/**
 * Helper to determine config source for debugging
 * @private
 */
const getConfigSource = (propValue, paymentConfig, serverConfig) => {
    if (propValue) return 'props'
    if (paymentConfig?.googlePay?.gatewayMerchantId) return 'context'
    if (serverConfig?.gatewayMerchantId) return 'serverConfig'
    return 'none'
}

/**
 * Resolve Google Pay configuration from props, server config, and context
 * 
 * @param {Object} options - Resolution options
 * @param {Object} options.props - Component props
 * @param {Object} [options.serverConfig] - Config from server API
 * @param {Object} [options.paymentConfig] - Config from JPMC context
 * @param {boolean} [options.isCartOrPDPContext] - Deprecated: no longer used, context config is now used for all contexts
 * @returns {Object} Resolved configuration
 */
export const resolveGooglePayConfig = ({
    props,
    serverConfig,
    paymentConfig,
    isCartOrPDPContext // eslint-disable-line no-unused-vars
}) => {
    const {
        gatewayMerchantId: gatewayMerchantIdProp,
        merchantName: merchantNameProp,
        merchantId: merchantIdProp,
        environment: environmentProp,
        allowedCountryCodes
    } = props

    // Resolve gatewayMerchantId: props > context > serverConfig
    // Context config takes priority over serverConfig
    // because context is fetched with auth (multi-MID), serverConfig may not be
    const gatewayMerchantId = gatewayMerchantIdProp 
        || paymentConfig?.googlePay?.gatewayMerchantId
        || serverConfig?.gatewayMerchantId
    
    // Resolve merchantName: props > context > serverConfig
    const merchantName = merchantNameProp 
        || paymentConfig?.googlePay?.merchantName 
        || paymentConfig?.merchantName
        || serverConfig?.merchantInfo?.merchantName
    
    // Resolve merchantId: props > context > serverConfig
    const merchantId = merchantIdProp 
        || paymentConfig?.googlePay?.merchantId
        || serverConfig?.merchantInfo?.merchantId
    
    // Resolve environment: props > context > serverConfig
    // Helper to convert JPMC environment string to Google Pay format
    const convertEnvironment = (env) => {
        if (env === 'PRODUCTION') return 'production'
        if (env === 'TEST') return 'sandbox'
        return null
    }
    const environment = environmentProp 
        || convertEnvironment(paymentConfig?.environment)
        || convertEnvironment(serverConfig?.environment)
        || 'sandbox'

    // Extract gateway, allowedNetworks, and allowedAuthMethods (context > serverConfig)
    const gateway = paymentConfig?.googlePay?.gateway
        || serverConfig?.gateway

    const allowedNetworks = paymentConfig?.googlePay?.allowedNetworks
        || serverConfig?.allowedCardNetworks

    const allowedAuthMethods = paymentConfig?.googlePay?.allowedAuthMethods
        || serverConfig?.allowedAuthMethods

    // Resolve allowedCountryCodes: prop > context > serverConfig (strictly from BM)
    const resolvedAllowedCountryCodes = allowedCountryCodes 
        || paymentConfig?.googlePay?.allowedShippingCountries
        || serverConfig?.allowedShippingCountries

    // Resolve billingAddressRequired - strictly from BM (no fallbacks)
    const resolvedBillingAddressRequired = paymentConfig?.googlePay?.billingAddressRequired
        ?? serverConfig?.billingAddressRequired

    const resolvedConfig = {
        gatewayMerchantId,
        merchantName,
        merchantId,
        environment,
        gateway,
        allowedNetworks,
        allowedAuthMethods,
        resolvedAllowedCountryCodes,
        resolvedBillingAddressRequired,
        // Track which source provided the config
        _configSource: getConfigSource(gatewayMerchantIdProp, paymentConfig, serverConfig)
    }

    return resolvedConfig
}

/**
 * Check if Google Pay is disabled in Business Manager
 * 
 * Strictly reads from BM site preferences:
 * - JPMCGooglePayCartEnabled: Controls Google Pay on cart page
 * - JPMCGooglePayPDPEnabled: Controls Google Pay on PDP page
 * 
 * @param {Object} options - Check options
 * @param {boolean} options.isCartContext - Is cart context
 * @param {boolean} options.isPDPContext - Is PDP context
 * @param {Object} [options.paymentConfig] - Payment config from context
 * @param {Object} [options.serverConfig] - Server config from autoFetchConfig (has cartEnabled/pdpEnabled at top level)
 * @returns {boolean} True if disabled in BM (preference is false or not set)
 */
export const isGooglePayDisabledInBM = ({
    isCartContext,
    isPDPContext,
    paymentConfig,
    serverConfig
}) => {
    // Strictly enforce BM preferences - no fallbacks
    // If preference is not explicitly true, Google Pay is disabled
    // When autoFetchConfig is used, serverConfig has cartEnabled/pdpEnabled at top level
    // When using context, paymentConfig has it nested under googlePay
    if (isCartContext) {
        const cartEnabled = serverConfig?.cartEnabled ?? paymentConfig?.googlePay?.cartEnabled
        return cartEnabled !== true
    }
    if (isPDPContext) {
        const pdpEnabled = serverConfig?.pdpEnabled ?? paymentConfig?.googlePay?.pdpEnabled
        return pdpEnabled !== true
    }
    // Default context (checkout page) - always enabled if Google Pay is configured
    return false
}

export default {
    resolveGooglePayConfig,
    isGooglePayDisabledInBM
}
