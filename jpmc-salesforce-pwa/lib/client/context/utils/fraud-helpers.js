/**
 * Fraud Check Payload Helpers
 * 
 * Pure functions for building fraud check payloads from SFCC basket data.
 * These are used to construct the fraudShoppingCart and shipTo parameters
 * for JPMC fraud check API calls.
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/client/context/utils/fraud-helpers
 */

import { toMinorUnits } from '../../../utils/currency.js'

// =============================================================================
// Fraud Shopping Cart Builder
// =============================================================================

/**
 * Build fraudCheckShoppingCart string from basket product items.
 * 
 * Format per JPMC spec: T=type&I=itemId&D=description&Q=qty&P=priceMinorUnits&| (max 999 chars)
 * 
 * @param {Array} productItems - basket.productItems array
 * @param {string} currency - ISO 4217 currency code (e.g., 'USD', 'JPY', 'EUR')
 * @returns {string} Formatted cart string for JPMC fraud check
 * 
 * @example
 * const cart = buildFraudShoppingCart(basket.productItems, basket.currency)
 * // Returns: "T=Product&I=prod123&D=Blue%20T-Shirt&Q=2&P=2999&|T=Product&I=prod456&D=Jeans&Q=1&P=4999&|"
 */
export const buildFraudShoppingCart = (productItems, currency) => {
    if (!productItems || productItems.length === 0) {
        return ''
    }
    
    return productItems
        .map((item) => {
            const type = encodeURIComponent('Product')
            const itemId = encodeURIComponent(item.productId || item.itemId || '')
            const desc = encodeURIComponent((item.productName || item.name || '').substring(0, 50))
            const qty = Math.round(item.quantity || 1)
            // Convert price to minor units (cents, yen, millifilses, etc.)
            const price = toMinorUnits(item.adjustedPrice ?? item.price ?? 0, currency)
            return `T=${type}&I=${itemId}&D=${desc}&Q=${qty}&P=${price}&|`
        })
        .join('')
        .substring(0, 999) // JPMC max length
}

// =============================================================================
// Ship To Mapper
// =============================================================================

/**
 * Map SFCC basket shipment to a shipTo object for the fraud check payload.
 * 
 * @param {object} basket - SFCC basket object
 * @returns {object|null} Shipping address object for JPMC fraud check, or null if not available
 * 
 * @example
 * const shipTo = mapShipToForFraud(basket)
 * // Returns: {
 * //   firstName: "John",
 * //   lastName: "Doe",
 * //   address1: "123 Main St",
 * //   city: "New York",
 * //   stateCode: "NY",
 * //   postalCode: "10001",
 * //   countryCode: "US",
 * //   phone: "555-123-4567",
 * //   shippingDescription: "Ground Shipping"
 * // }
 */
export const mapShipToForFraud = (basket) => {
    const addr = basket?.shipments?.[0]?.shippingAddress
    if (!addr) return null
    
    return {
        firstName: addr.firstName,
        lastName: addr.lastName,
        address1: addr.address1,
        address2: addr.address2,
        city: addr.city,
        stateCode: addr.stateCode,
        postalCode: addr.postalCode,
        countryCode: addr.countryCode,
        phone: addr.phone,
        shippingDescription: basket.shipments?.[0]?.shippingMethod?.name
    }
}

export default {
    buildFraudShoppingCart,
    mapShipToForFraud
}
