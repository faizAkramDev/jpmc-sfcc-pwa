/**
 * Label Fetcher Utility
 * 
 * Centralized i18n label resolution for Google Pay display items.
 * Works on both client-side (with react-intl) and server-side (fallback to English).
 * 
 * @module utils/label-fetcher
 */

/**
 * Get localized labels for Google Pay display items
 * 
 * Fetches labels from PWA Kit i18n if available (client-side with useIntl hook),
 * otherwise returns English defaults (server-side or when intl is unavailable).
 * 
 * @param {Object} [intl] - react-intl IntlShape object from useIntl hook (optional)
 * @returns {Object} Labels object with subtotal, shipping, tax, discount keys
 * 
 * @example
 * // Client-side with react-intl
 * const intl = useIntl()
 * const labels = getDisplayItemLabels(intl)
 * // Returns: { subtotal: "Subtotal", shipping: "Shipping", tax: "Tax", discount: "Discount" }
 * // (or localized values if intl provided)
 * 
 * @example
 * // Server-side without intl (graceful fallback to English)
 * const labels = getDisplayItemLabels()
 * // Returns: { subtotal: "Subtotal", shipping: "Shipping", tax: "Tax", discount: "Discount" }
 */
export const getDisplayItemLabels = (intl) => {
    // Fallback to English if intl not provided (server-side or hook not available)
    if (!intl) {
        return {
            subtotal: 'Subtotal',
            shipping: 'Shipping',
            tax: 'Tax',
            discount: 'Discount'
        }
    }

    // Fetch from i18n using react-intl (client-side)
    return {
        subtotal: intl.formatMessage({ id: 'checkout_confirmation.label.subtotal' }),
        shipping: intl.formatMessage({ id: 'checkout_confirmation.label.shipping' }),
        tax: intl.formatMessage({ id: 'checkout_confirmation.label.tax' }),
        discount: intl.formatMessage({ id: 'checkout_confirmation.label.discount' })
    }
}
