import { currencyDecimals } from '../../utils/currency'

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
 * subtotal, shipping, tax, and any discounts. Amounts are formatted
 * using currency-aware decimal places (e.g. 2 for USD, 0 for JPY, 3 for KWD).
 * 
 * @param {Object} basket - SFCC basket object
 * @param {number} [basket.productSubTotal] - Product subtotal
 * @param {number} [basket.shippingTotal] - Shipping total
 * @param {number} [basket.taxTotal] - Tax total
 * @param {Array} [basket.orderPriceAdjustments] - Order-level discounts
 * @param {string} currency - ISO 4217 currency code (e.g. 'USD', 'JPY')
 * @param {Object} [labels] - Optional custom labels (uses English defaults if not provided)
 * @param {string} [labels.subtotal] - Subtotal label (default: 'Subtotal')
 * @param {string} [labels.shipping] - Shipping label (default: 'Shipping')
 * @param {string} [labels.tax] - Tax label (default: 'Tax')
 * @param {string} [labels.discount] - Discount label (default: 'Discount')
 * @returns {Array} Google Pay displayItems array
 * 
 * @example
 * const displayItems = buildDisplayItemsFromBasket(basket, 'USD')
 * // Returns: [
 * //   { label: 'Subtotal', type: 'SUBTOTAL', price: '89.99' },
 * //   { label: 'Shipping', type: 'LINE_ITEM', price: '5.99' },
 * //   { label: 'Tax', type: 'TAX', price: '7.50' }
 * // ]
 * 
 * // With French labels:
 * const frenchItems = buildDisplayItemsFromBasket(basket, 'EUR', {
 *     subtotal: 'Sous-total',
 *     shipping: 'Livraison',
 *     tax: 'Taxes',
 *     discount: 'Réduction'
 * })
 */
export const buildDisplayItemsFromBasket = (basket, currency, labels = {}) => {
    if (!basket) {
        return []
    }

    const {
        subtotal: subtotalLabel = 'Subtotal',
        shipping: shippingLabel = 'Shipping',
        tax: taxLabel = 'Tax',
        discount: discountLabel = 'Discount'
    } = labels

    const decimals = currencyDecimals(currency)
    const displayItems = []

    // Subtotal (product total before shipping and tax)
    if (basket.productSubTotal !== undefined) {
        displayItems.push({
            label: subtotalLabel,
            type: 'SUBTOTAL',
            price: Number(basket.productSubTotal).toFixed(decimals)
        })
    }

    // Shipping
    if (basket.shippingTotal !== undefined) {
        displayItems.push({
            label: shippingLabel,
            type: 'LINE_ITEM',
            price: Number(basket.shippingTotal).toFixed(decimals),
            // status is only valid for LINE_ITEM type
            status: basket.shippingTotal === 0 ? 'PENDING' : 'FINAL'
        })
    }

    // Tax - NOTE: status field is NOT valid for TAX type per Google Pay API
    if (basket.taxTotal !== undefined) {
        displayItems.push({
            label: taxLabel,
            type: 'TAX',
            price: Number(basket.taxTotal).toFixed(decimals)
        })
    }

    if (basket.orderPriceAdjustments && basket.orderPriceAdjustments.length > 0) {
        basket.orderPriceAdjustments.forEach(adj => {
            displayItems.push({
                label: discountLabel,
                type: 'LINE_ITEM',
                price: Number(adj.price).toFixed(decimals)
            })
        })
    }

    return displayItems
}

export default buildDisplayItemsFromBasket
