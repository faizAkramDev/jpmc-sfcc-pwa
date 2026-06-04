/**
 * Google Pay Button PropTypes
 * 
 * Centralized PropTypes definitions for GooglePayButton component.
 * 
 * @module components/utils/googlepay-button-proptypes
 */

import PropTypes from 'prop-types'
import { GOOGLE_PAY_BUTTON_CONFIG } from '../../../utils/constants.mjs'

/**
 * PropTypes for GooglePayButton component
 */
export const GooglePayButtonPropTypes = {
    // Context
    context: PropTypes.oneOf(['checkout', 'cart', 'pdp']),
    
    // Checkout context props
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    currencyCode: PropTypes.string,
    merchantOrderNumber: PropTypes.string,
    
    // Cart context props
    basket: PropTypes.shape({
        basketId: PropTypes.string,
        orderTotal: PropTypes.number,
        currency: PropTypes.string
    }),
    createOrderFn: PropTypes.func,
    slasToken: PropTypes.string,
    isGuest: PropTypes.bool,
    customerEmail: PropTypes.string,
    onShippingOptionsUpdate: PropTypes.func,
    onTotalsUpdate: PropTypes.func,
    allowedCountryCodes: PropTypes.arrayOf(PropTypes.string),
    phoneNumberRequired: PropTypes.bool,
    
    // PDP context props
    product: PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        price: PropTypes.number,
        currency: PropTypes.string,
        // For automatic variant validation
        variationAttributes: PropTypes.arrayOf(PropTypes.shape({
            id: PropTypes.string,
            name: PropTypes.string
        }))
    }),
    quantity: PropTypes.number,
    variant: PropTypes.shape({
        // From useVariant hook - productId exists when variant is fully selected
        productId: PropTypes.string,
        variationValues: PropTypes.object,
        // Legacy shape properties
        size: PropTypes.string,
        color: PropTypes.string,
        sku: PropTypes.string
    }),
    validateStock: PropTypes.bool,
    // @deprecated - Auto-detected from product.variationAttributes and variant.productId
    isProductOrderable: PropTypes.bool,
    // @deprecated - Auto-generated from unselected variation attributes
    variantSelectionError: PropTypes.string,
    refreshBasket: PropTypes.func,
    onProductAdded: PropTypes.func,
    onBasketRestored: PropTypes.func,

    // Configuration
    autoFetchConfig: PropTypes.bool,
    apiBasePath: PropTypes.string,
    gatewayMerchantId: PropTypes.string,
    merchantName: PropTypes.string,
    merchantId: PropTypes.string,
    environment: PropTypes.oneOf(['sandbox', 'production', 'test']),
    countryCode: PropTypes.string,
    
    // Address requirements
    billingAddressRequired: PropTypes.bool,
    billingAddressFormat: PropTypes.oneOf(['MIN', 'FULL']),
    emailRequired: PropTypes.bool,
    shippingAddressRequired: PropTypes.bool,
    
    // Callbacks
    onSuccess: PropTypes.func,
    onError: PropTypes.func,
    onCancel: PropTypes.func,
    onReady: PropTypes.func,
    onClick: PropTypes.func,
    onClickOverride: PropTypes.func,
    // Direct callback props for custom flows (like Apple Pay pattern)
    onPaymentDataChanged: PropTypes.func,
    onPaymentAuthorized: PropTypes.func,
    
    // Button appearance
    buttonType: PropTypes.oneOf(Object.values(GOOGLE_PAY_BUTTON_CONFIG.BUTTON_TYPES)),
    buttonColor: PropTypes.oneOf(Object.values(GOOGLE_PAY_BUTTON_CONFIG.BUTTON_COLORS)),
    buttonSizeMode: PropTypes.oneOf(Object.values(GOOGLE_PAY_BUTTON_CONFIG.BUTTON_SIZE_MODES)),
    buttonLocale: PropTypes.string,
    buttonRadius: PropTypes.number,
    
    // UI control
    disabled: PropTypes.bool,
    className: PropTypes.string,
    style: PropTypes.object,
    loadingComponent: PropTypes.node,
    unavailableComponent: PropTypes.node,
    
    // Accessibility
    ariaLabel: PropTypes.string
}

/**
 * Default props for GooglePayButton component
 */
export const GooglePayButtonDefaultProps = {
    context: 'checkout',
    countryCode: 'US',
    quantity: 1,
    isGuest: true,
    validateStock: true,
    isProductOrderable: true,
    autoFetchConfig: false,
    apiBasePath: '/api/jpmorgan',
    billingAddressRequired: true,
    billingAddressFormat: 'MIN',
    emailRequired: true,
    shippingAddressRequired: false,
    phoneNumberRequired: false,
    buttonType: GOOGLE_PAY_BUTTON_CONFIG.BUTTON_TYPES.BUY,
    buttonColor: GOOGLE_PAY_BUTTON_CONFIG.BUTTON_COLORS.BLACK,
    buttonSizeMode: GOOGLE_PAY_BUTTON_CONFIG.BUTTON_SIZE_MODES.FILL,
    disabled: false,
    className: '',
    style: {},
    ariaLabel: 'Pay with Google Pay'
}

export default GooglePayButtonPropTypes
