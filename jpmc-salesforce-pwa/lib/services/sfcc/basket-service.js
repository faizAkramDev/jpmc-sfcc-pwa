/**
 * SFCC Basket Service
 * 
 * Provides basket and shipping operations for Google Pay cart/PDP flows.
 * Uses SFCC Shopper Baskets API to manage shipping addresses and methods.
 * 
 * @module services/sfcc/basket-service
 */

import logger from '../../utils/logger.js'

// Import shared display items builder (single source of truth)
import { buildDisplayItemsFromBasket } from '../../client/utils/display-items.js'

// =============================================================================
// Constants
// =============================================================================

/**
 * SFCC API configuration
 */
const getApiConfig = () => ({
    shortCode: process.env.COMMERCE_API_SHORT_CODE,
    organizationId: process.env.COMMERCE_API_ORG_ID,
    siteId: process.env.COMMERCE_API_SITE_ID || 'RefArchGlobal'
})

/**
 * Build SCAPI base URL for Shopper Baskets
 * @returns {string} Base URL for Shopper Baskets API
 */
const getBasketApiBaseUrl = () => {
    const { shortCode, organizationId } = getApiConfig()
    return `https://${shortCode}.api.commercecloud.salesforce.com/checkout/shopper-baskets/v1/organizations/${organizationId}/baskets`
}

// =============================================================================
// Address Format Translators
// =============================================================================

/**
 * Convert Google Pay address to SFCC address format
 * 
 * @param {Object} gpayAddress - Google Pay address object
 * @param {string} gpayAddress.name - Full name
 * @param {string} gpayAddress.address1 - Street address line 1
 * @param {string} [gpayAddress.address2] - Street address line 2
 * @param {string} gpayAddress.locality - City
 * @param {string} gpayAddress.administrativeArea - State/Province
 * @param {string} gpayAddress.countryCode - 2-letter country code
 * @param {string} gpayAddress.postalCode - Postal/ZIP code
 * @param {string} [gpayAddress.phoneNumber] - Phone number
 * @returns {Object} SFCC formatted address
 * 
 * @example
 * const sfccAddress = translateGooglePayAddressToSFCC({
 *   name: 'John Doe',
 *   address1: '123 Main St',
 *   locality: 'San Francisco',
 *   administrativeArea: 'CA',
 *   countryCode: 'US',
 *   postalCode: '94105'
 * })
 */
export const translateGooglePayAddressToSFCC = (gpayAddress) => {
    if (!gpayAddress) {
        return null
    }

    // Parse name into first/last (Google Pay provides full name)
 
    const nameParts = (gpayAddress.name || '').trim().split(' ')
    let firstName = nameParts[0] || ''
    let lastName = nameParts.slice(1).join(' ') || ''
    
    // SFCC hooks often require non-empty firstName/lastName
    // Use placeholders for partial addresses (Google Pay doesn't give full details initially)
    if (!firstName) firstName = 'Google'
    if (!lastName) lastName = 'Pay'

    // Google Pay partial addresses may not have street address
    // Use placeholder to prevent SFCC hook failures
    const address1 = gpayAddress.address1 || gpayAddress.addressLines?.[0] || 'Address pending'
    const address2 = gpayAddress.address2 || gpayAddress.addressLines?.[1] || ''

    return {
        firstName,
        lastName,
        address1,
        address2,
        city: gpayAddress.locality || '',
        stateCode: gpayAddress.administrativeArea || '',
        countryCode: gpayAddress.countryCode || '',
        postalCode: gpayAddress.postalCode || '',
        phone: gpayAddress.phoneNumber || ''
    }
}

/**
 * Convert SFCC shipping method to Google Pay shipping option format
 * 
 * @param {Object} sfccMethod - SFCC shipping method object
 * @param {string} sfccMethod.id - Method ID
 * @param {string} sfccMethod.name - Method display name
 * @param {string} [sfccMethod.description] - Method description
 * @param {Object} [sfccMethod.price] - Method price
 * @param {Object} [sfccMethod.shippingPromotions] - Applied promotions
 * @returns {Object} Google Pay shipping option format
 * 
 * @example
 * const gpayOption = translateSFCCShippingMethodToGooglePay({
 *   id: 'standard',
 *   name: 'Standard Shipping',
 *   description: '5-7 business days',
 *   price: 5.99
 * })
 * // Returns: { id: 'standard', label: 'Standard Shipping', description: '5-7 business days - $5.99' }
 */
export const translateSFCCShippingMethodToGooglePay = (sfccMethod) => {
    if (!sfccMethod) {
        return null
    }

    // Build description with price if available
    let description = sfccMethod.description || ''
    
    // Add price to description if available
    if (sfccMethod.price !== undefined && sfccMethod.price !== null) {
        // Ensure price is formatted as currency string
        const numericPrice = typeof sfccMethod.price === 'number' 
            ? sfccMethod.price 
            : Number(sfccMethod.price)
        const priceStr = !Number.isNaN(numericPrice) 
            ? `$${numericPrice.toFixed(2)}`
            : ''
        if (priceStr) {
            description = description 
                ? `${description} - ${priceStr}`
                : priceStr
        }
    }

    return {
        id: sfccMethod.id,
        label: sfccMethod.name || sfccMethod.id,
        description: description || undefined
    }
}

// =============================================================================
// Basket Operations
// =============================================================================

/**
 * Update shipping address on basket
 * 
 * Updates the default shipment's shipping address using SCAPI.
 * 
 * @param {string} basketId - Basket ID
 * @param {Object} address - SFCC formatted address
 * @param {string} slasToken - SLAS access token
 * @returns {Promise<Object>} Updated basket
 * @throws {Error} If update fails
 * 
 * @example
 * const basket = await updateShippingAddress(
 *   'abc123',
 *   { firstName: 'John', lastName: 'Doe', ... },
 *   'slas_token'
 * )
 */
export const updateShippingAddress = async (basketId, address, slasToken) => {
    const { siteId } = getApiConfig()
    const baseUrl = getBasketApiBaseUrl()
    
    // First, get the basket to find the default shipment
    const basketUrl = `${baseUrl}/${basketId}?siteId=${siteId}`
    
    const basketResponse = await fetch(basketUrl, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${slasToken}`,
            'Content-Type': 'application/json'
        }
    })

    if (!basketResponse.ok) {
        const errorText = await basketResponse.text()
        logger.error('[BasketService] Failed to fetch basket:', { status: basketResponse.status, error: errorText })
        throw new Error(`Failed to fetch basket: ${basketResponse.status}`)
    }

    const basket = await basketResponse.json()
    
    // Get the default shipment ID (first shipment or 'me')
    const shipmentId = basket.shipments?.[0]?.shipmentId || 'me'
    
    // Update shipping address on the shipment
    const shipmentUrl = `${baseUrl}/${basketId}/shipments/${shipmentId}?siteId=${siteId}`
    
    const updateResponse = await fetch(shipmentUrl, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${slasToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            shippingAddress: address
        })
    })

    if (!updateResponse.ok) {
        const errorText = await updateResponse.text()
        logger.error('[BasketService] Failed to update shipping address:', { status: updateResponse.status, error: errorText })
        throw new Error(`Failed to update shipping address: ${updateResponse.status}`)
    }

    // Fetch updated basket to get latest totals
    const updatedBasketResponse = await fetch(basketUrl, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${slasToken}`,
            'Content-Type': 'application/json'
        }
    })

    if (!updatedBasketResponse.ok) {
        const errorText = await updatedBasketResponse.text()
        logger.error('[BasketService] Failed to fetch updated basket:', { status: updatedBasketResponse.status, error: errorText })
        throw new Error(`Failed to fetch updated basket: ${updatedBasketResponse.status}`)
    }

    return updatedBasketResponse.json()
}

/**
 * Get available shipping methods for a basket
 * 
 * Fetches shipping methods applicable to the basket's shipping address.
 * 
 * @param {string} basketId - Basket ID
 * @param {string} slasToken - SLAS access token
 * @param {string} [shipmentId='me'] - Shipment ID (defaults to 'me' for default shipment)
 * @returns {Promise<Object>} Shipping methods response
 * @throws {Error} If fetch fails
 * 
 * @example
 * const methods = await getShippingMethods('abc123', 'slas_token')
 * // Returns: { applicableShippingMethods: [...], defaultShippingMethodId: '...' }
 */
export const getShippingMethods = async (basketId, slasToken, shipmentId = 'me') => {
    const { siteId } = getApiConfig()
    const baseUrl = getBasketApiBaseUrl()
    
    const url = `${baseUrl}/${basketId}/shipments/${shipmentId}/shipping-methods?siteId=${siteId}`
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${slasToken}`,
            'Content-Type': 'application/json'
        }
    })

    if (!response.ok) {
        const errorText = await response.text()
        logger.error('[BasketService] Failed to fetch shipping methods:', { status: response.status, error: errorText })
        throw new Error(`Failed to fetch shipping methods: ${response.status}`)
    }

    return response.json()
}

/**
 * Set shipping method on a basket
 * 
 * Updates the basket with the selected shipping method.
 * 
 * @param {string} basketId - Basket ID
 * @param {string} shippingMethodId - Shipping method ID to apply
 * @param {string} slasToken - SLAS access token
 * @param {string} [shipmentId='me'] - Shipment ID
 * @returns {Promise<Object>} Updated basket
 * @throws {Error} If update fails
 * 
 * @example
 * const basket = await setShippingMethod('abc123', 'express_shipping', 'slas_token')
 */
export const setShippingMethod = async (basketId, shippingMethodId, slasToken, shipmentId = 'me') => {
    const { siteId } = getApiConfig()
    const baseUrl = getBasketApiBaseUrl()
    
    const url = `${baseUrl}/${basketId}/shipments/${shipmentId}?siteId=${siteId}`
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${slasToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            shippingMethod: {
                id: shippingMethodId
            }
        })
    })

    if (!response.ok) {
        const errorText = await response.text()
        logger.error('[BasketService] Failed to set shipping method:', { status: response.status, error: errorText })
        throw new Error(`Failed to set shipping method: ${response.status}`)
    }

    // Fetch updated basket to get latest totals
    const basketUrl = `${baseUrl}/${basketId}?siteId=${siteId}`
    const basketResponse = await fetch(basketUrl, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${slasToken}`,
            'Content-Type': 'application/json'
        }
    })

    if (!basketResponse.ok) {
        const errorText = await basketResponse.text()
        logger.error('[BasketService] Failed to fetch updated basket:', { status: basketResponse.status, error: errorText })
        throw new Error(`Failed to fetch updated basket: ${basketResponse.status}`)
    }

    return basketResponse.json()
}

/**
 * Get basket details
 * 
 * Fetches complete basket information including totals.
 * 
 * @param {string} basketId - Basket ID
 * @param {string} slasToken - SLAS access token
 * @returns {Promise<Object>} Basket object
 * @throws {Error} If fetch fails
 */
export const getBasket = async (basketId, slasToken) => {
    const { siteId } = getApiConfig()
    const baseUrl = getBasketApiBaseUrl()
    
    const url = `${baseUrl}/${basketId}?siteId=${siteId}`
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${slasToken}`,
            'Content-Type': 'application/json'
        }
    })

    if (!response.ok) {
        const errorText = await response.text()
        logger.error('[BasketService] Failed to fetch basket:', { status: response.status, error: errorText })
        throw new Error(`Failed to fetch basket: ${response.status}`)
    }

    return response.json()
}

/**
 * Update customer email on basket
 * 
 * Sets the customer email for guest checkout or updates it for cart/pdp flows.
 * 
 * @param {string} basketId - Basket ID
 * @param {string} email - Customer email address
 * @param {string} slasToken - SLAS access token
 * @returns {Promise<Object>} Updated basket
 * @throws {Error} If update fails
 */
export const updateCustomerEmail = async (basketId, email, slasToken) => {
    const { siteId } = getApiConfig()
    const baseUrl = getBasketApiBaseUrl()
    
    const url = `${baseUrl}/${basketId}/customer?siteId=${siteId}`
    
    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${slasToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            email
        })
    })

    if (!response.ok) {
        const errorText = await response.text()
        logger.error('[BasketService] Failed to update customer email:', { status: response.status, error: errorText })
        throw new Error(`Failed to update customer email: ${response.status}`)
    }

    return response.json()
}

/**
 * Update billing address on basket
 * 
 * Sets the billing address for the basket.
 * 
 * @param {string} basketId - Basket ID
 * @param {Object} address - SFCC formatted billing address
 * @param {string} slasToken - SLAS access token
 * @returns {Promise<Object>} Updated basket
 * @throws {Error} If update fails
 */
export const updateBillingAddress = async (basketId, address, slasToken) => {
    const { siteId } = getApiConfig()
    const baseUrl = getBasketApiBaseUrl()
    
    const url = `${baseUrl}/${basketId}/billing-address?siteId=${siteId}`
    
    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${slasToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(address)
    })

    if (!response.ok) {
        const errorText = await response.text()
        logger.error('[BasketService] Failed to update billing address:', { status: response.status, error: errorText })
        throw new Error(`Failed to update billing address: ${response.status}`)
    }

    return response.json()
}

// =============================================================================
// Response Builders
// =============================================================================

/**
 * Build Google Pay shipping response
 * 
 * Constructs the response format expected by Google Pay's onPaymentDataChanged callback.
 * 
 * @param {Object} basket - SFCC basket object
 * @param {Array} shippingMethods - Array of SFCC shipping methods
 * @param {string} [defaultMethodId] - Default selected method ID
 * @param {string} [totalPriceStatus='ESTIMATED'] - 'ESTIMATED' or 'FINAL'
 * @returns {Object} Google Pay formatted response
 */
export const buildGooglePayShippingResponse = (basket, shippingMethods, defaultMethodId, totalPriceStatus = 'ESTIMATED') => {
    // Convert shipping methods to Google Pay format
    const gpayShippingOptions = shippingMethods
        .map(translateSFCCShippingMethodToGooglePay)
        .filter(Boolean)

    // Uses English labels (localization happens at consuming app level)
    const displayItems = buildDisplayItemsFromBasket(basket, basket.currency)

    // Determine default selection
    const selectedMethodId = defaultMethodId || gpayShippingOptions[0]?.id

    return {
        newShippingOptionParameters: {
            defaultSelectedOptionId: selectedMethodId,
            shippingOptions: gpayShippingOptions
        },
        newTransactionInfo: {
            totalPriceStatus,
            totalPrice: String(basket.orderTotal || basket.productSubTotal || '0.00'),
            totalPriceLabel: totalPriceStatus === 'ESTIMATED' ? 'Est. Total' : 'Total',
            currencyCode: basket.currency,
            displayItems
        }
    }
}

/**
 * Build Google Pay error response
 * 
 * Constructs an error format expected by Google Pay.
 * 
 * @param {string} reason - Error reason code (e.g., 'SHIPPING_ADDRESS_UNSERVICEABLE')
 * @param {string} message - Human-readable error message
 * @param {string} intent - Error intent ('SHIPPING_ADDRESS', 'SHIPPING_OPTION', 'PAYMENT_AUTHORIZATION')
 * @returns {Object} Google Pay error response
 */
export const buildGooglePayErrorResponse = (reason, message, intent) => {
    return {
        error: {
            reason,
            message,
            intent
        }
    }
}

// =============================================================================
// Exports
// =============================================================================

export default {
    // Address translators
    translateGooglePayAddressToSFCC,
    translateSFCCShippingMethodToGooglePay,
    // Basket operations
    updateShippingAddress,
    getShippingMethods,
    setShippingMethod,
    getBasket,
    updateCustomerEmail,
    updateBillingAddress,
    // Response builders
    buildGooglePayShippingResponse,
    buildGooglePayErrorResponse
}
