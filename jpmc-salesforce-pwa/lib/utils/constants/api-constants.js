/**
 * JPMC API Constants
 * 
 * Host URLs and endpoint paths for JPMC APIs.
 * Note: API Host is configured via BM Site Preferences (JPMCApiHost)
 * 
 * @module utils/constants/api-constants
 */

/**
 * JPMC API Hosts by environment (Reference Only)
 * Actual host is configured via BM Site Preferences: JPMCApiHost
 */
export const JPMC_HOSTS = {
    mock: 'api-mock.payments.jpmorgan.com',
    sandbox: 'api-ms-test.payments.jpmorgan.com',
    production: 'api-ms.payments.jpmorgan.com'
}

/**
 * JPMC OAuth Configuration
 */
export const JPMC_AUTH = {
    TOKEN_URL: 'https://id.payments.jpmorgan.com/am/oauth2/alpha/access_token',
    GRANT_TYPE: 'client_credentials',
    SCOPES: {
        sandbox: 'jpm:payments:sandbox',
        production: 'jpm:payments:production'
    }
}

/**
 * JPMC API Endpoints
 */
export const JPMC_ENDPOINTS = {
    // OAuth
    ACCESS_TOKEN: '/am/oauth2/alpha/access_token',
    // Online Payments API (v2)
    PAYMENTS: '/api/v2/payments',
    CAPTURES: '/api/v2/captures',
    REFUNDS: '/api/v2/refunds',
    VERIFICATIONS: '/api/v2/verifications',
    // Tokenization API (v1)
    TOKENS: '/payments/v1/tokens',
    // Checkout API (v1)
    CHECKOUT_SESSIONS: '/v1/checkout-sessions',
    // Fraud Check API (v2)
    FRAUD_CHECK: '/api/v2/fraudcheck'
}

export default {
    JPMC_HOSTS,
    JPMC_AUTH,
    JPMC_ENDPOINTS
}
