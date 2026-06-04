/**
 * JPMC PIE (Page Encryption) Constants
 * 
 * URLs for the JPMC Page Encryption SDK.
 * 
 * @module utils/constants/pie-constants
 */

/**
 * JPMC Page Encryption (PIE) SDK URLs
 * 
 * - encryption.js: Contains ValidatePANChecksum() and ProtectPANandCVV() functions
 * - getkey.js: Retrieves dynamic encryption key (replace {merchantId} with actual ID)
 */
export const JPMC_PIE_URLS = {
    sandbox: {
        encryption: 'https://safetechpageencryptionvar.chasepaymentech.com/pie/v1/encryption.js',
        getKey: 'https://safetechpageencryptionvar.chasepaymentech.com/pie/v1/{merchantId}/getkey.js'
    },
    production: {
        encryption: 'https://safetechpageencryption.chasepaymentech.com/pie/v1/encryption.js',
        getKey: 'https://safetechpageencryption.chasepaymentech.com/pie/v1/{merchantId}/getkey.js'
    }
}

/**
 * Get PIE SDK URLs for environment with merchantId substituted
 * 
 * @param {string} environment - 'sandbox' or 'production'
 * @param {string} merchantId - The merchant ID for getKey URL
 * @returns {object} { encryption: string, getKey: string }
 * 
 * @example
 * getPIEUrls('sandbox', '100000000005')
 * // Returns:
 * // {
 * //   encryption: 'https://safetechpageencryptionvar.chasepaymentech.com/pie/v1/encryption.js',
 * //   getKey: 'https://safetechpageencryptionvar.chasepaymentech.com/pie/v1/100000000005/getkey.js'
 * // }
 */
export const getPIEUrls = (environment = 'sandbox', merchantId = '') => {
    const env = environment === 'production' ? 'production' : 'sandbox'
    const urls = JPMC_PIE_URLS[env]
    
    return {
        encryption: urls.encryption,
        getKey: urls.getKey.replace('{merchantId}', merchantId)
    }
}

/**
 * Get default PIE encryption URL for environment
 * 
 * @param {string} environment - 'sandbox' or 'production'
 * @returns {string} Encryption script URL
 */
export const getDefaultPIEEncryptionUrl = (environment = 'sandbox') => {
    const env = environment === 'production' ? 'production' : 'sandbox'
    return JPMC_PIE_URLS[env].encryption
}

/**
 * Get default PIE getKey URL for environment
 * 
 * @param {string} environment - 'sandbox' or 'production'
 * @param {string} merchantId - Merchant ID
 * @returns {string} GetKey script URL
 */
export const getDefaultPIEGetKeyUrl = (environment = 'sandbox', merchantId = '') => {
    const env = environment === 'production' ? 'production' : 'sandbox'
    return JPMC_PIE_URLS[env].getKey.replace('{merchantId}', merchantId)
}

export default {
    JPMC_PIE_URLS,
    getPIEUrls,
    getDefaultPIEEncryptionUrl,
    getDefaultPIEGetKeyUrl
}
