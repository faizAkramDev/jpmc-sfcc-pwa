/**
 * Currency Conversion Utilities
 * 
 * Converts amounts between major units (e.g. USD 89.99) and minor units (e.g. 8999 cents)
 * using ISO 4217 currency exponents.
 * 
 * @module utils/currency
 */

/**
 * ISO 4217 exponent table — currencies with non-standard decimal places
 * Most currencies (USD, EUR, GBP, etc.) have 2 decimal places (exponent 2)
 * Zero-decimal currencies: JPY, KRW, etc. (exponent 0)
 * Three-decimal currencies: KWD, BHD, etc. (exponent 3)
 */
const ISO_4217_EXPONENTS = {
    // Zero-decimal currencies (no subunits)
    JPY: 0, KRW: 0, VND: 0, BIF: 0, CLP: 0, GNF: 0, ISK: 0,
    KMF: 0, MGA: 0, PYG: 0, RWF: 0, UGX: 0, XAF: 0, XOF: 0, XPF: 0,
    // Three-decimal currencies (millifilses, fils, etc.)
    KWD: 3, BHD: 3, OMR: 3, JOD: 3, TND: 3,
    // Two-decimal currencies (default — most currencies)
}

/**
 * Get the exponent (number of decimal places) for a currency
 * @param {string} currency - ISO 4217 currency code (e.g. 'USD', 'JPY')
 * @returns {number} Exponent (0, 2, or 3)
 */
const getCurrencyExponent = (currency) => {
    if (!currency) return 2 // default to 2 decimal places
    return ISO_4217_EXPONENTS[currency.toUpperCase()] ?? 2
}

/**
 * Convert amount from major units to minor units
 * 
 * Examples:
 * - USD 89.99 → 8999 cents (exponent 2)
 * - JPY 10000 → 10000 (exponent 0, no conversion)
 * - KWD 100 → 100000 millifilfils (exponent 3)
 * 
 * @param {number|string} amount - Amount in major units
 * @param {string} currency - ISO 4217 currency code
 * @returns {number} Amount in minor units, rounded
 */
export const toMinorUnits = (amount, currency) => {
    const n = Number.parseFloat(amount) || 0
    const exponent = getCurrencyExponent(currency)
    return Math.round(n * Math.pow(10, exponent))
}

/**
 * Convert amount from minor units to major units
 * 
 * Examples:
 * - 8999 cents → USD 89.99 (exponent 2)
 * - 10000 → JPY 10000 (exponent 0, no conversion)
 * - 100000 millifilses → KWD 100 (exponent 3)
 * 
 * @param {number|string} minorAmount - Amount in minor units
 * @param {string} currency - ISO 4217 currency code
 * @returns {number} Amount in major units
 */
export const fromMinorUnits = (minorAmount, currency) => {
    const n = Number(minorAmount) || 0
    const exponent = getCurrencyExponent(currency)
    return n / Math.pow(10, exponent)
}

/**
 * Get the number of decimal places for a currency
 * Useful for Number.prototype.toFixed() when formatting currency strings
 * 
 * @param {string} currency - ISO 4217 currency code
 * @returns {number} Decimal places (0, 2, or 3)
 */
export const currencyDecimals = (currency) => getCurrencyExponent(currency)
