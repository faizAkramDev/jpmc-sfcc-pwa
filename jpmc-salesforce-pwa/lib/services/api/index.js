/**
 * API Services Module Index
 * 
 * @module services/api
 */

// Request builder
export {
    buildPaymentRequestBody,
    buildCardPayload,
    buildVerificationRequestBody
} from './request-builder'

// Response normalizer
export {
    normalizePaymentResponse,
    normalizeVerificationResponse,
    buildErrorResponse,
    isRetryableError
} from './response-normalizer'

// Payment API
export {
    generateRequestId,
    createPayment,
    getPaymentStatus
} from './payment-api'

// Handlers (API route handlers)
export {
    handleGetConfig,
    handleGetGooglePayConfig,
    handleGetFraudConfig,
    handleAuthorize,
    handleVerify,
    handleConfirmOrder,
    handlePatchOrderPaymentInstrument,
    handleGetAvailablePaymentMethods
} from './handlers'

// Helpers (shared utilities for handlers)
export {
    buildMerchantSoftware,
    buildMerchant,
    formatPhoneForJPMC,
    getClientIp,
    buildFraudCheckPayload
} from './helpers'

// Default exports
export { default as requestBuilder } from './request-builder'
export { default as responseNormalizer } from './response-normalizer'
export { default as paymentApi } from './payment-api'
