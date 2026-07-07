/**
 * SFCC Services Index
 * 
 * Exports SFCC-related services for site preferences and configuration.
 * 
 * @module services/sfcc
 */

export {
    getSitePreferences,
    getJPMCPreferences,
    refreshSitePreferences,
    clearPreferencesCache,
    getPreferencesCacheStatus
} from './site-preferences'

export {
    buildJPMCConfigFromPreferences,
    mergeWithEnvironmentConfig,
    mergeConfigWithSPFallback,
    getPreferenceMapping,
    getDefaultValues
} from './preference-mapper'

// Custom Object service for multi-locale configuration
export {
    getCustomObjectConfig,
    clearCustomObjectCache,
    getCustomObjectCacheStatus,
    MULTI_LOCALE_ERROR_CODES
} from './custom-object-service'

// Basket service (for Google Pay cart/pdp flows)
export {
    translateGooglePayAddressToSFCC,
    translateSFCCShippingMethodToGooglePay,
    updateShippingAddress,
    getShippingMethods,
    setShippingMethod,
    getBasket,
    updateCustomerEmail,
    updateBillingAddress,
    buildGooglePayShippingResponse,
    buildGooglePayErrorResponse
} from './basket-service'
