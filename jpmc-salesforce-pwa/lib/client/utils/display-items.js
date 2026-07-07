/**
 * Google Pay Display Items Utility
 * 
 * Client-safe utility for building Google Pay displayItems from basket data.
 * This file contains NO server-side dependencies (no logger, no process.env).
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/client/utils/display-items
 */

/**
 * Build Google Pay display items from basket totals
 * 
 * Creates displayItems array for Google Pay payment sheet showing
 * subtotal, shipping, tax, and any discounts.
 * 
 * @param {Object} basket - SFCC basket object
 * @param {number} [basket.productSubTotal] - Product subtotal
 * @param {number} [basket.shippingTotal] - Shipping total
 * @param {number} [basket.taxTotal] - Tax total
 * @param {Array} [basket.orderPriceAdjustments] - Order-level discounts
 * @returns {Array} Google Pay displayItems array
 * 
 * @example
 * const displayItems = buildDisplayItemsFromBasket(basket)
 * // Returns: [
 * //   { label: 'Subtotal', type: 'SUBTOTAL', price: '89.99' },
 * //   { label: 'Shipping', type: 'LINE_ITEM', price: '5.99' },
 * //   { label: 'Tax', type: 'TAX', price: '7.50' }
 * // ]
 */
export const buildDisplayItemsFromBasket = (basket) => {
    if (!basket) {
        return []
    }

    const displayItems = []

    // Subtotal (product total before shipping and tax)
    if (basket.productSubTotal !== undefined) {
        displayItems.push({
            label: 'Subtotal',
            type: 'SUBTOTAL',
            price: String(basket.productSubTotal)
        })
    }

    // Shipping
    if (basket.shippingTotal !== undefined) {
        displayItems.push({
            label: 'Shipping',
            type: 'LINE_ITEM',
            price: String(basket.shippingTotal),
            // status is only valid for LINE_ITEM type
            status: basket.shippingTotal === 0 ? 'PENDING' : 'FINAL'
        })
    }

    // Tax - NOTE: status field is NOT valid for TAX type per Google Pay API
    if (basket.taxTotal !== undefined) {
        displayItems.push({
            label: 'Tax',
            type: 'TAX',
            price: String(basket.taxTotal)
        })
    }

    if (basket.orderPriceAdjustments && basket.orderPriceAdjustments.length > 0) {
        basket.orderPriceAdjustments.forEach(adj => {
            displayItems.push({
                label: 'Discount',
                type: 'LINE_ITEM',
                price: String(adj.price) // Usually negative
            })
        })
    }

    return displayItems
}

export default buildDisplayItemsFromBasket
