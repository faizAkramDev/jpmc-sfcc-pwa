/**
 * ApplePayButton Component
 * 
 * A plug-and-play Apple Pay button component that handles
 * the complete payment flow with JP Morgan.
 * 
 * Features:
 * - Official Apple Pay button styling (CSS-based)
 * - Automatic Safari/iOS detection
 * - Availability detection (cards in wallet)
 * - Complete payment flow handling (merchant validation + authorization)
 * - Customizable appearance (black, white, white-outline)
 * - Accessibility support
 * 
 * @module components/ApplePayButton
 */

import React, { useEffect, useCallback, useMemo, useRef } from 'react'
import PropTypes from 'prop-types'
import { useApplePay } from '../../hooks/useApplePay'
import {
    APPLE_PAY_BUTTON_STYLES,
    APPLE_PAY_BUTTON_TYPES,
    APPLE_PAY_DEFAULTS,
    getApplePayButtonClass
} from '../../utils/constants.mjs'

// =============================================================================
// Apple Pay Button CSS Styles (Inline for no external dependencies)
// =============================================================================

const APPLE_PAY_BUTTON_CSS = `
/* Apple Pay Button Base Styles */
.apple-pay-button {
    -webkit-appearance: -apple-pay-button;
    -apple-pay-button-type: buy;
    cursor: pointer;
    display: inline-block;
    border: none;
    background-color: transparent;
    min-width: 150px;
    min-height: 44px;
    height: 44px;
    padding: 0;
    box-sizing: border-box;
    transition: opacity 0.2s ease;
}

/* Button Types */
.apple-pay-button-buy {
    -apple-pay-button-type: buy;
}
.apple-pay-button-pay {
    -apple-pay-button-type: pay;
}
.apple-pay-button-plain {
    -apple-pay-button-type: plain;
}
.apple-pay-button-checkout {
    -apple-pay-button-type: check-out;
}
.apple-pay-button-donate {
    -apple-pay-button-type: donate;
}
.apple-pay-button-subscribe {
    -apple-pay-button-type: subscribe;
}
.apple-pay-button-add-money {
    -apple-pay-button-type: add-money;
}
.apple-pay-button-contribute {
    -apple-pay-button-type: contribute;
}
.apple-pay-button-order {
    -apple-pay-button-type: order;
}
.apple-pay-button-reload {
    -apple-pay-button-type: reload;
}
.apple-pay-button-rent {
    -apple-pay-button-type: rent;
}
.apple-pay-button-support {
    -apple-pay-button-type: support;
}
.apple-pay-button-tip {
    -apple-pay-button-type: tip;
}
.apple-pay-button-top-up {
    -apple-pay-button-type: top-up;
}

/* Button Styles */
.apple-pay-button-black {
    -apple-pay-button-style: black;
}
.apple-pay-button-white {
    -apple-pay-button-style: white;
}
.apple-pay-button-white-outline {
    -apple-pay-button-style: white-outline;
}

/* State Styles */
.apple-pay-button:hover {
    opacity: 0.85;
}
.apple-pay-button:active {
    opacity: 0.7;
}
.apple-pay-button:disabled,
.apple-pay-button.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
}
.apple-pay-button.processing {
    opacity: 0.6;
    cursor: wait;
    pointer-events: none;
}

/* Container Styles */
.apple-pay-button-container {
    position: relative;
    display: inline-block;
}
.apple-pay-button-container.full-width {
    display: block;
    width: 100%;
}
.apple-pay-button-container.full-width .apple-pay-button {
    width: 100%;
}

/* Processing Overlay */
.apple-pay-processing-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: rgba(255, 255, 255, 0.5);
    border-radius: 4px;
}

/* Loading Spinner */
.apple-pay-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(0, 0, 0, 0.1);
    border-top-color: #000;
    border-radius: 50%;
    animation: apple-pay-spin 0.8s linear infinite;
}
@keyframes apple-pay-spin {
    to { transform: rotate(360deg); }
}

/* Loading State */
.apple-pay-button-loading {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 44px;
}

/* Screen Reader Only */
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}
`

// Track if styles have been injected
let stylesInjected = false

/**
 * Inject Apple Pay CSS styles into the document head
 * Only injects once per page load
 */
const injectStyles = () => {
    if (stylesInjected || typeof document === 'undefined') {
        return
    }

    const styleElement = document.createElement('style')
    styleElement.id = 'apple-pay-button-styles'
    styleElement.textContent = APPLE_PAY_BUTTON_CSS
    document.head.appendChild(styleElement)
    stylesInjected = true
}

// =============================================================================
// Component
// =============================================================================

/**
 * Apple Pay Button Component
 * 
 * @param {Object} props - Component props
 * @param {string} props.merchantId - Apple Pay Merchant ID (e.g., 'merchant.com.yourcompany')
 * @param {string} props.merchantName - Merchant display name
 * @param {string|number} props.amount - Payment amount
 * @param {string} [props.currency] - Currency code (default: 'USD')
 * @param {string} [props.countryCode] - Country code (default: 'US')
 * @param {string} [props.environment] - 'sandbox' or 'production'
 * @param {string} [props.merchantOrderNumber] - Order reference number
 * @param {string} [props.buttonStyle] - Button style: 'black', 'white', 'white-outline'
 * @param {string} [props.buttonType] - Button type: 'buy', 'pay', 'checkout', etc.
 * @param {string} [props.buttonLocale] - Button locale (e.g., 'en-US')
 * @param {boolean} [props.billingAddressRequired] - Require billing address
 * @param {boolean} [props.shippingAddressRequired] - Require shipping address
 * @param {boolean} [props.emailRequired] - Require email address
 * @param {boolean} [props.phoneRequired] - Require phone number
 * @param {Array} [props.lineItems] - Line items to display
 * @param {Array} [props.shippingMethods] - Available shipping methods
 * @param {Function} [props.onSuccess] - Callback on successful payment
 * @param {Function} [props.onError] - Callback on payment error
 * @param {Function} [props.onCancel] - Callback on user cancellation
 * @param {Function} [props.onReady] - Callback when Apple Pay is ready
 * @param {Function} [props.onClick] - Callback before payment starts
 * @param {Function} [props.onShippingMethodSelected] - Callback when shipping method selected
 * @param {Function} [props.onShippingContactSelected] - Callback when shipping contact selected
 * @param {boolean} [props.disabled] - Disable the button
 * @param {boolean} [props.fullWidth] - Make button full width
 * @param {string} [props.className] - Additional CSS class name
 * @param {Object} [props.style] - Additional inline styles
 * @param {React.ReactNode} [props.loadingComponent] - Custom loading component
 * @param {React.ReactNode} [props.unavailableComponent] - Component when Apple Pay unavailable
 * 
 * @example
 * // Basic usage
 * <ApplePayButton
 *   merchantId="merchant.com.yourcompany"
 *   merchantName="Your Store"
 *   amount={99.99}
 *   onSuccess={(result) => console.log('Success!', result)}
 *   onError={(error) => console.error('Error:', error)}
 * />
 * 
 * @example
 * // With custom styling
 * <ApplePayButton
 *   merchantId="merchant.com.yourcompany"
 *   merchantName="Your Store"
 *   amount={total}
 *   buttonStyle="white-outline"
 *   buttonType="checkout"
 *   fullWidth
 *   className="my-apple-pay-button"
 * />
 */
const ApplePayButton = ({
    // Required
    merchantId,
    merchantName,
    amount,
    // Configuration
    currency = APPLE_PAY_DEFAULTS.currencyCode,
    countryCode = APPLE_PAY_DEFAULTS.countryCode,
    environment = 'sandbox',
    merchantOrderNumber,
    // Multi-MID support
    locale,
    getAccessToken,
    // Button appearance
    buttonStyle = APPLE_PAY_DEFAULTS.buttonStyle,
    buttonType = APPLE_PAY_DEFAULTS.buttonType,
    buttonLocale,
    // Address/contact requirements
    billingAddressRequired = true,
    shippingAddressRequired = false,
    emailRequired = true,
    phoneRequired = false,
    // Line items and shipping
    lineItems = [],
    shippingMethods = [],
    // Callbacks
    onSuccess,
    onError,
    onCancel,
    onReady,
    onClick,
    // When provided, completely overrides the click handler and skips the
    // component's own initiatePayment call. Use this when the parent (e.g.
    // JPMCCheckoutProvider) drives the full Apple Pay session lifecycle.
    onClickOverride,
    onShippingMethodSelected,
    onShippingContactSelected,
    // UI control
    disabled = false,
    fullWidth = false,
    className = '',
    style = {},
    loadingComponent,
    unavailableComponent,
    // Accessibility
    ariaLabel = 'Pay with Apple Pay'
}) => {
    // Refs for payment details to prevent stale closures
    const paymentDetailsRef = useRef({
        amount,
        currency,
        merchantOrderNumber,
        lineItems,
        shippingMethods
    })

    // Update refs when values change
    useEffect(() => {
        paymentDetailsRef.current = {
            amount,
            currency,
            merchantOrderNumber,
            lineItems,
            shippingMethods
        }
    }, [amount, currency, merchantOrderNumber, lineItems, shippingMethods])

    // Initialize Apple Pay hook
    const {
        isReady,
        isAvailable,
        isLoading,
        isProcessing,
        error,
        initiatePayment
    } = useApplePay({
        merchantId,
        merchantName,
        environment,
        countryCode,
        currencyCode: currency,
        billingAddressRequired,
        shippingAddressRequired,
        emailRequired,
        phoneRequired,
        locale,
        getAccessToken,
        onSuccess,
        onError,
        onCancel,
        onReady,
        onShippingMethodSelected,
        onShippingContactSelected
    })

    // Inject styles on mount
    useEffect(() => {
        injectStyles()
    }, [])

    /**
     * Build button CSS classes
     */
    const buttonClasses = useMemo(() => {
        const classes = ['apple-pay-button']
        
        // Add type class
        const typeClass = getApplePayButtonClass(buttonType, buttonStyle)
        classes.push(typeClass)
        
        // Add style class
        if (buttonStyle === APPLE_PAY_BUTTON_STYLES.BLACK) {
            classes.push('apple-pay-button-black')
        } else if (buttonStyle === APPLE_PAY_BUTTON_STYLES.WHITE) {
            classes.push('apple-pay-button-white')
        } else if (buttonStyle === APPLE_PAY_BUTTON_STYLES.WHITE_OUTLINE) {
            classes.push('apple-pay-button-white-outline')
        }

        // Add state classes
        if (disabled) {
            classes.push('disabled')
        }
        if (isProcessing) {
            classes.push('processing')
        }

        return classes.join(' ')
    }, [buttonType, buttonStyle, disabled, isProcessing])

    /**
     * Handle button click
     * CRITICAL: Must be synchronous to maintain user gesture context
     */
    const handleClick = useCallback(() => {
        if (disabled || isProcessing) {
            return
        }

        // If an override is provided, delegate entirely to it and skip the
        // component's own session (used when JPMCCheckoutProvider drives the flow)
        if (onClickOverride) {
            onClickOverride()
            return
        }

        // Call onClick callback before starting payment
        onClick?.()

        // Read latest values from ref
        const {
            amount: currentAmount,
            currency: _currentCurrency, // eslint-disable-line no-unused-vars
            merchantOrderNumber: currentOrderNum,
            lineItems: currentLineItems,
            shippingMethods: currentShippingMethods
        } = paymentDetailsRef.current

        // Initiate payment - this will open the Apple Pay sheet
        initiatePayment({
            amount: currentAmount,
            label: merchantName,
            merchantOrderNumber: currentOrderNum,
            lineItems: currentLineItems,
            shippingMethods: currentShippingMethods
        })
    }, [disabled, isProcessing, onClickOverride, onClick, merchantName, initiatePayment])

    // ==========================================================================
    // Render
    // ==========================================================================

    // Loading state — skip when parent manages via onClickOverride (don't block render)
    if (!onClickOverride && isLoading) {
        if (loadingComponent) {
            return loadingComponent
        }
        return (
            <output 
                className={`apple-pay-button-loading ${className}`}
                style={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    minHeight: '44px',
                    ...style 
                }}
                aria-label="Loading Apple Pay"
            >
                <span className="apple-pay-spinner" aria-hidden="true" />
                <span className="sr-only">Loading Apple Pay...</span>
            </output>
        )
    }

    // Not available (not Safari, no cards, etc.)
    // When onClickOverride is provided, the parent manages availability — skip this gate.
    if (!onClickOverride && isReady && !isAvailable) {
        if (unavailableComponent) {
            return unavailableComponent
        }
        // Return null to hide when not available (as per Apple Pay guidelines)
        return null
    }

    // When parent manages via onClickOverride, hide initialization error state
    if (!onClickOverride && error && !isAvailable) {
        return null
    }

    // Button container
    return (
        <div 
            className={`apple-pay-button-container ${fullWidth ? 'full-width' : ''} ${className}`}
            style={style}
        >
            {/* Apple Pay Button */}
            <button
                type="button"
                className={buttonClasses}
                onClick={handleClick}
                disabled={disabled || isProcessing}
                aria-label={ariaLabel}
                aria-disabled={disabled || isProcessing}
                lang={buttonLocale}
                style={{
                    width: fullWidth ? '100%' : undefined,
                    borderRadius: style.borderRadius
                }}
            />

            {/* Processing overlay */}
            {isProcessing && (
                <output 
                    className="apple-pay-processing-overlay"
                    aria-label="Processing payment"
                >
                    <span className="apple-pay-spinner" aria-hidden="true" />
                </output>
            )}
        </div>
    )
}

// PropTypes
ApplePayButton.propTypes = {
    // Required
    merchantId: PropTypes.string.isRequired,
    merchantName: PropTypes.string,
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    // Configuration
    currency: PropTypes.string,
    countryCode: PropTypes.string,
    environment: PropTypes.oneOf(['sandbox', 'production']),
    merchantOrderNumber: PropTypes.string,
    // Multi-MID support
    locale: PropTypes.string,
    getAccessToken: PropTypes.func,
    // Button appearance
    buttonStyle: PropTypes.oneOf(Object.values(APPLE_PAY_BUTTON_STYLES)),
    buttonType: PropTypes.oneOf(Object.values(APPLE_PAY_BUTTON_TYPES)),
    buttonLocale: PropTypes.string,
    // Address/contact requirements
    billingAddressRequired: PropTypes.bool,
    shippingAddressRequired: PropTypes.bool,
    emailRequired: PropTypes.bool,
    phoneRequired: PropTypes.bool,
    // Line items and shipping
    lineItems: PropTypes.arrayOf(PropTypes.shape({
        label: PropTypes.string.isRequired,
        amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        type: PropTypes.oneOf(['final', 'pending'])
    })),
    shippingMethods: PropTypes.arrayOf(PropTypes.shape({
        identifier: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
        amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        detail: PropTypes.string
    })),
    // Callbacks
    onSuccess: PropTypes.func,
    onError: PropTypes.func,
    onCancel: PropTypes.func,
    onReady: PropTypes.func,
    onClick: PropTypes.func,
    onClickOverride: PropTypes.func,
    onShippingMethodSelected: PropTypes.func,
    onShippingContactSelected: PropTypes.func,
    // UI control
    disabled: PropTypes.bool,
    fullWidth: PropTypes.bool,
    className: PropTypes.string,
    style: PropTypes.object,
    loadingComponent: PropTypes.node,
    unavailableComponent: PropTypes.node,
    // Accessibility
    ariaLabel: PropTypes.string
}

// Default props
ApplePayButton.defaultProps = {
    merchantName: undefined,
    currency: APPLE_PAY_DEFAULTS.currencyCode,
    countryCode: APPLE_PAY_DEFAULTS.countryCode,
    environment: 'sandbox',
    merchantOrderNumber: undefined,
    locale: undefined,
    getAccessToken: undefined,
    buttonStyle: APPLE_PAY_DEFAULTS.buttonStyle,
    buttonType: APPLE_PAY_DEFAULTS.buttonType,
    buttonLocale: undefined,
    billingAddressRequired: true,
    shippingAddressRequired: false,
    emailRequired: true,
    phoneRequired: false,
    lineItems: [],
    shippingMethods: [],
    onSuccess: undefined,
    onError: undefined,
    onCancel: undefined,
    onReady: undefined,
    onClick: undefined,
    onShippingMethodSelected: undefined,
    onShippingContactSelected: undefined,
    disabled: false,
    fullWidth: false,
    className: '',
    style: {},
    loadingComponent: undefined,
    unavailableComponent: undefined,
    ariaLabel: 'Pay with Apple Pay'
}

// Default export
export default ApplePayButton
