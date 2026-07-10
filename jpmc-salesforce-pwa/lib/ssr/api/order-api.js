/**
 * JPMC Order API Client
 * 
 * Server-side client for SFCC Orders Data API.
 * Uses Account Manager OAuth (client credentials) for authentication.
 * 
 * Currently supports patching payment instrument custom attributes (c_* prefixed).
 * Status updates (payment, confirmation, export) will be handled by SFRA capture flow.
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/ssr/api/order-api
 */

import logger from '../../utils/logger.js'

/**
 * OrderApiClient - Server-side SFCC Orders API client
 * 
 * Uses the Orders Data API with Account Manager OAuth for secure
 * server-to-server communication.
 * 
 * @example
 * ```javascript
 * const orderApi = new OrderApiClient()
 * const order = await orderApi.getOrder('00001234')
 * await orderApi.patchPaymentInstrument('00001234', 'paymentId', { c_customField: 'value' })
 * ```
 */
/**
 * Parse realmId_instanceId from a SFCC organization ID.
 * 'f_ecom_xxxx_xxx' -> 'xxxx_xxx'
 * Falls back to the explicit env vars if available.
 * @param {string} orgId
 * @returns {string|null}
 */
function parseRealmInstanceFromOrgId(orgId) {
    if (!orgId) return null
    const match = /^f_ecom_(.+)$/.exec(orgId)
    return match ? match[1] : null
}

export class OrderApiClient {
    constructor(config = {}) {
        this.clientId = config.clientId || process.env.COMMERCE_API_CLIENT_ID_PRIVATE
        this.clientSecret = config.clientSecret || process.env.COMMERCE_API_CLIENT_SECRET
        this.orgId = config.orgId || process.env.COMMERCE_API_ORG_ID
        this.shortCode = config.shortCode || process.env.COMMERCE_API_SHORT_CODE
        this.siteId = config.siteId || process.env.COMMERCE_API_SITE_ID
        this.oauthScopes = config.oauthScopes || process.env.SFCC_OAUTH_SCOPES || 'sfcc.orders.rw'

        const derivedRealmInstance = parseRealmInstanceFromOrgId(this.orgId)
        this.realmId = config.realmId || process.env.SFCC_REALM_ID || derivedRealmInstance
        this.instanceId = config.instanceId || process.env.SFCC_INSTANCE_ID
        this._scopeId = (config.realmId || process.env.SFCC_REALM_ID)
            ? `${this.realmId}_${this.instanceId}`
            : (derivedRealmInstance || `${this.realmId}_${this.instanceId}`)
        
        this.tokenUrl = 'https://account.demandware.com/dwsso/oauth2/access_token?grant_type=client_credentials'
        
        this.logger = config.logger || console
        this.debug = config.debug || process.env.JPMC_DEBUG === 'true'
    }

    /**
     * Get OAuth access token from Account Manager
     * @returns {Promise<{access_token: string}>}
     */
    async getAdminAuthToken() {
        const base64Credentials = Buffer.from(
            `${this.clientId}:${this.clientSecret}`
        ).toString('base64')

        const scope = `SALESFORCE_COMMERCE_API:${this._scopeId} ${this.oauthScopes}`
        
        if (this.debug) {
            this.logger.info('[OrderApiClient] Requesting auth token with scope:', scope)
        }

        const response = await fetch(this.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${base64Credentials}`
            },
            body: new URLSearchParams({ scope })
        })

        if (!response.ok) {
            const error = await response.text()
            this.logger.error('[OrderApiClient] Auth token request failed:', response.status, error)
            throw new Error(`Auth failed: ${response.status} ${response.statusText}`, { cause: error })
        }

        return response.json()
    }

    /**
     * Base method for Orders Data API requests
     * 
     * @param {string} method - HTTP method
     * @param {string} path - API path (appended to base orders URL)
     * @param {object} options - Request options
     * @returns {Promise<Response>}
     */
    async request(method, path, options = {}) {
        const token = await this.getAdminAuthToken()
        
        const baseUrl = `https://${this.shortCode}.api.commercecloud.salesforce.com/checkout/orders/v1/organizations/${this.orgId}/orders/${path}?siteId=${this.siteId}`

        return fetch(baseUrl, {
            method,
            body: options.body ? JSON.stringify(options.body) : null,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token.access_token}`,
                ...options.headers
            }
        })
    }

    /**
     * Get order details
     * @param {string} orderNo - Order number
     * @returns {Promise<object>}
     */
    async getOrder(orderNo) {
        const response = await this.request('GET', orderNo)
        
        if (!response.ok) {
            const error = await response.text()
            this.logger.error('[OrderApiClient] Get order failed:', response.status, error)
            throw new Error(`Get order failed: ${response.status} ${response.statusText}`, { cause: error })
        }
        
        return response.json()
    }

    /**
     * Update order status
     * 
     * Changes order from 'created' to 'new' which is required before
     * the Orders Data API allows access to payment instruments.
     * 
     * @param {string} orderNo - Order number
     * @param {string} status - Order status ('new', 'open', 'completed', 'cancelled', 'failed')
     * @returns {Promise<{success: boolean}>}
     */
    async updateOrderStatus(orderNo, status = 'new') {
        const response = await this.request('PUT', `${orderNo}/status`, {
            body: { status }
        })

        if (!response.ok) {
            const error = await response.text()
            this.logger.error('[OrderApiClient] Update order status failed:', response.status, error)
            throw new Error(`Update order status failed: ${response.status}`, { cause: error })
        }

        return { success: true }
    }

    /**
     * Patch payment instrument with custom attributes
     * 
     * @param {string} orderNo - Order number
     * @param {string} paymentInstrumentId - Payment instrument ID
     * @param {object} data - Data to patch (only c_* custom attributes accepted)
     * @returns {Promise<{success: boolean}>}
     */
    async patchPaymentInstrument(orderNo, paymentInstrumentId, data) {
        const response = await this.request(
            'PATCH', 
            `${orderNo}/payment-instruments/${paymentInstrumentId}`,
            { body: data }
        )

        if (!response.ok) {
            const errorText = await response.text()
            this.logger.error('[OrderApiClient] Patch failed with status:', response.status)
            this.logger.error('[OrderApiClient] Patch error response:', errorText)
            throw new Error(`Patch payment instrument failed: ${response.status}`, { cause: errorText })
        }

        return { success: true }
    }

    /**
     * Patch order with custom attributes
     * 
     * Uses Orders Data API to update order-level custom attributes.
     * 3DS attributes (c_threeDS*) are stored at order level for audit trail.
     * 
     * @param {string} orderNo - Order number
     * @param {object} data - Data to patch (c_* custom attributes)
     * @returns {Promise<{success: boolean}>}
     * 
     * @example
     * await orderApi.patchOrder('00001234', {
     *     c_pending3DSAuthentication: true,
     *     c_threeDSTransactionId: 'txn-123'
     * })
     */
    async patchOrder(orderNo, data) {
        const response = await this.request('PATCH', orderNo, { body: data })

        if (!response.ok) {
            const errorText = await response.text()
            this.logger.error('[OrderApiClient] Order patch failed with status:', response.status)
            this.logger.error('[OrderApiClient] Patch error response:', errorText)
            throw new Error(`Patch order failed: ${response.status}`, { cause: errorText })
        }

        return { success: true }
    }

    /**
     * Patch payment transaction with attributes
     * 
     * @param {string} orderNo - Order number
     * @param {string} paymentInstrumentId - Payment instrument ID
     * @param {object} data - Data to patch (standard fields like transactionId + c_* custom attributes)
     * @returns {Promise<{success: boolean}>}
     */
    async patchPaymentTransaction(orderNo, paymentInstrumentId, data) {
        const response = await this.request(
            'PATCH', 
            `${orderNo}/payment-instruments/${paymentInstrumentId}/transaction`,
            { body: data }
        )

        if (!response.ok) {
            const errorText = await response.text()
            this.logger.error('[OrderApiClient] Payment transaction patch failed with status:', response.status)
            this.logger.error('[OrderApiClient] Patch error response:', errorText)
            throw new Error(`Patch payment transaction failed: ${response.status}`, { cause: errorText })
        }

        return { success: true }
    }

    /**
     * Update order payment status
     * 
     * Sets the payment status of the order. Used to hold orders (payment_status='not_paid')
     * until JPMC confirms payment server-to-server via notifications.
     * 
     * NOTE: SFCC Orders Data API doesn't support dedicated /payment-status endpoint.
     * Instead, store the hold state in custom order attributes for internal tracking.
     * The actual payment hold in SFCC is managed through order status and custom flags.
     * 
     * @param {string} orderNo - Order number
     * @param {strin~g} paymentStatus - Payment status ('not_paid', 'paid', 'verified', etc.)
     * @returns {Promise<{success: boolean}>}
     */
    async updateOrderPaymentStatus(orderNo, paymentStatus) {
        // SFCC Orders Data API: Store payment hold as custom order attribute
        // This is internal tracking - the actual hold is enforced through order status and business rules
        const response = await this.request('PATCH', orderNo, {
            body: { 
                c_jpmcPaymentStatus: paymentStatus,
                c_jpmcPaymentHoldTimestamp: new Date().toISOString()
            }
        })

        if (!response.ok) {
            const errorText = await response.text()
            this.logger.error('[OrderApiClient] Update payment status failed:', response.status, errorText)
            throw new Error(`Update order payment status failed: ${response.status}`, { cause: errorText })
        }

        return { success: true }
    }

    /**
     * Update order confirmation status
     * 
     * @param {string} orderNo - Order number
     * @param {string} confirmationStatus - Confirmation status ('confirmed', 'pending', etc.)
     * @returns {Promise<{success: boolean}>}
     */
    async updateOrderConfirmationStatus(orderNo, confirmationStatus) {
        const response = await this.request('PUT', `${orderNo}/confirmation-status`, {
            body: { confirmationStatus }
        })

        if (!response.ok) {
            const errorText = await response.text()
            this.logger.error('[OrderApiClient] Update confirmation status failed:', response.status, errorText)
            throw new Error(`Update order confirmation status failed: ${response.status}`, { cause: errorText })
        }

        return { success: true }
    }

    /**
     * Update order export status
     * 
     * Sets the export status of the order. Used to hold orders (export_status='not_exported')
     * until JPMC confirms payment server-to-server via notifications.
     * 
     * Prevents warehouse fulfillment system from processing fraudulent orders
     * that passed frontend validation but may fail server-side verification.
     * 
     * NOTE: SFCC Orders Data API doesn't support dedicated /export-status endpoint.
     * Instead, store the hold state in custom order attributes for internal tracking.
     * The actual export hold in SFCC is managed through order status and custom flags.
     * 
     * @param {string} orderNo - Order number
     * @param {string} exportStatus - Export status ('not_exported', 'exported', 'ready', etc.)
     * @returns {Promise<{success: boolean}>}
     */
    async updateOrderExportStatus(orderNo, exportStatus) {
        // SFCC Orders Data API: Store export hold as custom order attribute
        // This is internal tracking - the actual hold is enforced through order status and business rules
        const response = await this.request('PATCH', orderNo, {
            body: { 
                c_jpmcExportStatus: exportStatus,
                c_jpmcExportHoldTimestamp: new Date().toISOString()
            }
        })

        if (!response.ok) {
            const errorText = await response.text()
            this.logger.error('[OrderApiClient] Update export status failed:', response.status, errorText)
            throw new Error(`Update order export status failed: ${response.status}`, { cause: errorText })
        }

        return { success: true }
    }
}

export default OrderApiClient
