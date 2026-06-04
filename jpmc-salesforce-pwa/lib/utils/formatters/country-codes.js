/**
 * Country Code Utilities
 * 
 * Single source of truth for country code conversions.
 * JPMC API requires ISO 3166-1 alpha-3 (3-letter) country codes.
 * 
 * @module utils/formatters/country-codes
 */

/**
 * Map of ISO 3166-1 alpha-2 to alpha-3 country codes
 * 
 * This is the single source of truth for country code conversion.
 * Extend this map as needed for additional countries.
 */
export const COUNTRY_CODE_2_TO_3 = {
    // North America
    'US': 'USA',
    'CA': 'CAN',
    'MX': 'MEX',
    
    // Europe
    'GB': 'GBR',
    'UK': 'GBR', // Common alias
    'DE': 'DEU',
    'FR': 'FRA',
    'ES': 'ESP',
    'IT': 'ITA',
    'NL': 'NLD',
    'BE': 'BEL',
    'AT': 'AUT',
    'CH': 'CHE',
    'PT': 'PRT',
    'IE': 'IRL',
    'SE': 'SWE',
    'NO': 'NOR',
    'DK': 'DNK',
    'FI': 'FIN',
    'PL': 'POL',
    'GR': 'GRC',
    'CZ': 'CZE',
    'HU': 'HUN',
    'RO': 'ROU',
    'BG': 'BGR',
    
    // Asia Pacific
    'JP': 'JPN',
    'CN': 'CHN',
    'IN': 'IND',
    'AU': 'AUS',
    'NZ': 'NZL',
    'SG': 'SGP',
    'HK': 'HKG',
    'TW': 'TWN',
    'KR': 'KOR',
    'TH': 'THA',
    'MY': 'MYS',
    'ID': 'IDN',
    'PH': 'PHL',
    'VN': 'VNM',
    
    // South America
    'BR': 'BRA',
    'AR': 'ARG',
    'CL': 'CHL',
    'CO': 'COL',
    'PE': 'PER',
    
    // Middle East / Africa
    'AE': 'ARE',
    'SA': 'SAU',
    'IL': 'ISR',
    'ZA': 'ZAF',
    'EG': 'EGY',
    
    // Others
    'RU': 'RUS',
    'TR': 'TUR',
    'UA': 'UKR'
}

/**
 * Convert country code to 3-letter ISO format
 * 
 * Handles:
 * - 2-letter codes: Converts to 3-letter
 * - 3-letter codes: Returns as-is (uppercase)
 * - Invalid/empty: Returns default
 * 
 * @param {string} countryCode - Country code (2 or 3 letter)
 * @returns {string|undefined} 3-letter ISO country code, or undefined if not valid
 * 
 * @example
 * convertCountryCode('US')     // 'USA'
 * convertCountryCode('USA')    // 'USA'
 * convertCountryCode('us')     // 'USA'
 * convertCountryCode('GB')     // 'GBR'
 * convertCountryCode('')       // undefined
 * convertCountryCode('XX')     // undefined (unknown code)
 */
export const convertCountryCode = (countryCode) => {
    if (!countryCode || typeof countryCode !== 'string') {
        return undefined
    }
    
    const code = countryCode.trim().toUpperCase()
    
    // Already 3-letter code
    if (code.length === 3) {
        return code
    }
    
    // Convert 2-letter to 3-letter
    if (code.length === 2) {
        return COUNTRY_CODE_2_TO_3[code]
    }
    
    // Invalid length
    return undefined
}

/**
 * Check if a country code is valid (recognized)
 * 
 * @param {string} countryCode - Country code to check
 * @returns {boolean} True if valid/recognized
 */
export const isValidCountryCode = (countryCode) => {
    if (!countryCode || typeof countryCode !== 'string') {
        return false
    }
    
    const code = countryCode.trim().toUpperCase()
    
    // Check 3-letter codes (values in our map)
    if (code.length === 3) {
        return Object.values(COUNTRY_CODE_2_TO_3).includes(code)
    }
    
    // Check 2-letter codes (keys in our map)
    if (code.length === 2) {
        return code in COUNTRY_CODE_2_TO_3
    }
    
    return false
}

/**
 * Get all supported country codes
 * 
 * @returns {object} { alpha2: string[], alpha3: string[] }
 */
export const getSupportedCountryCodes = () => {
    return {
        alpha2: Object.keys(COUNTRY_CODE_2_TO_3),
        alpha3: [...new Set(Object.values(COUNTRY_CODE_2_TO_3))]
    }
}

export default {
    COUNTRY_CODE_2_TO_3,
    convertCountryCode,
    isValidCountryCode,
    getSupportedCountryCodes
}
