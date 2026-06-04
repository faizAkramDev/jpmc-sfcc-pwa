/**
 * Google Pay Services
 * 
 * Complete Google Pay integration module for JP Morgan PWA Kit.
 * 
 * @module services/googlepay
 * 
 * @example
 * // Import everything
 * import * as GooglePay from '@jpmorgan/jpmorgan-salesforce-pwa/services/googlepay'
 * 
 * // Or import specific functions
 * import { 
 *   loadGooglePayScript,
 *   buildGooglePayConfig,
 *   parseGooglePayResponse
 * } from '@jpmorgan/jpmorgan-salesforce-pwa/services/googlepay'
 */

// Script Loader
export {
    loadGooglePayScript,
    isGooglePayScriptLoaded,
    getPaymentsClient,
    createPaymentsClient,
    preloadGooglePayScript,
    resetScriptLoader,
    GooglePayScriptError
} from './script-loader.js'

// Configuration Builder
export {
    buildBaseCardPaymentMethod,
    buildTokenizationSpecification,
    buildCardPaymentMethod,
    buildIsReadyToPayRequest,
    buildPaymentDataRequest,
    buildClientOptions,
    buildGooglePayConfig,
    validateGooglePayConfig
} from './config.js'

// Token Parser
export {
    parseGooglePayResponse,
    extractEncryptedPaymentBundle,
    buildJPMorganGooglePayPayload,
    buildAccountHolderFromGooglePay,
    mapGooglePayAddress,
    validateTokenStructure,
    isValidPaymentData,
    GooglePayTokenError
} from './token-parser.js'
