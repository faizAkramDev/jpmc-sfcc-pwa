/**
 * GooglePayButton Component
 * 
 * A unified Google Pay button component that handles payment flows for
 * checkout, cart, and PDP contexts through a single `context` prop.
 * 
 * Features:
 * - Official Google Pay button styling
 * - Automatic script loading
 * - Availability detection
 * - Context-aware payment flows:
 *   - checkout: Token collection for checkout page
 *   - cart: Full shipping flow with address/option callbacks
 *   - pdp: Product-to-order flow with add-to-cart and basket restoration
 * 
 * @module components/GooglePayButton
 */

import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useGooglePay } from '../../hooks/useGooglePay'
import { useJPMCCheckout } from '../context/JPMCCheckoutProvider'
import { buildBaseCardPaymentMethod } from '../../services/googlepay/config'
import {
    GOOGLE_PAY_ERROR_CODES,
    GOOGLE_PAY_CONTEXT,
    GOOGLE_PAY_BUTTON_CONFIG
} from '../../utils/constants.mjs'
import {
    validateContextProps,
    formatValidationErrors,
    logValidationWarnings
} from './utils/googlepay-prop-validator'
import { resolveGooglePayConfig, isGooglePayDisabledInBM } from './utils/googlepay-config-resolver'
import { GooglePayButtonPropTypes } from './utils/googlepay-button-proptypes'
import { useVariantValidation } from './hooks/useVariantValidation'
import { useServerConfig } from './hooks/useServerConfig'
import { buildDisplayItemsFromBasket } from '../utils/display-items'

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Build display items for Google Pay sheet price breakdown
 * 
 * Uses shared buildDisplayItemsFromBasket when basket is available (includes discounts).
 * Falls back to manual construction when only individual values are provided.
 * 
 * @param {Object} options - Options for building display items
 * @param {string|number} [options.subtotal] - Product subtotal (fallback when no basket)
 * @param {Object} [options.basket] - Basket object (preferred - uses shared utility)
 * @returns {Array} Array of display item objects for Google Pay
 */
const buildDisplayItems = ({ subtotal, basket } = {}) => {
    // Use shared utility when basket is available (includes discounts, status handling)
    if (basket) {
        return buildDisplayItemsFromBasket(basket)
    }
    
    // Fallback for checkout without basket (just amount)
    return [
        {
            label: 'Subtotal',
            type: 'SUBTOTAL',
            price: String(subtotal ?? '0.00')
        },
        {
            label: 'Shipping',
            type: 'LINE_ITEM',
            price: '0.00'
        },
        {
            label: 'Tax',
            type: 'TAX',
            price: '0.00'
        }
    ]
}

/**
 * Check if should show error state
 * @private
 */
const shouldShowConfigError = (configError) => Boolean(configError)

/**
 * Check if should show validation error (dev only)
 * @private
 */
const shouldShowValidationError = (validationResult) => {
    return !validationResult.valid && process.env.NODE_ENV !== 'production'
}

/**
 * Check if should show loading state
 * @private
 */
const shouldShowLoadingState = ({ isLoading, configLoading, isWaitingForContextConfig, gatewayMerchantId }) => {
    return (isLoading || configLoading || isWaitingForContextConfig) && !gatewayMerchantId
}

/**
 * Check early return state for render section
 * Returns the type of early return needed, or null if normal render should proceed
 * @private
 */
const getEarlyReturnType = ({
    configError, validationResult,
    isLoading, configLoading, isWaitingForContextConfig, gatewayMerchantId,
    isDisabledInBM, isReady, isAvailable, googlePayError
}) => {
    if (shouldShowConfigError(configError)) return 'config-error'
    if (shouldShowValidationError(validationResult)) return 'validation-error'
    if (shouldShowLoadingState({ isLoading, configLoading, isWaitingForContextConfig, gatewayMerchantId })) return 'loading'
    if (isDisabledInBM) return 'hidden'
    if (isReady && !isAvailable) return 'unavailable'
    if (googlePayError && !isAvailable) return 'hidden'
    return null
}

/**
 * Determine disabled reason for the button
 * @private
 */
const getDisabledReason = (isPDPContext, computedIsProductOrderable, disabled) => {
    if (isPDPContext && !computedIsProductOrderable) return 'variant-required'
    if (disabled) return 'explicitly-disabled'
    return null
}

/**
 * Build validation props based on context
 * @private
 */
const buildValidationProps = ({ isCartContext, isPDPContext, basket, createOrderFn, product, quantity, amount, currencyCode, onPaymentDataChanged, onPaymentAuthorized }) => {
    // Always include callback props so validator can detect callback flow
    const callbackProps = { onPaymentDataChanged, onPaymentAuthorized }
    
    if (isCartContext) return { basket, createOrderFn, ...callbackProps }
    if (isPDPContext) return { productId: product?.id, quantity, addToBasketFn: createOrderFn, ...callbackProps }
    return { amount, currencyCode, ...callbackProps }
}



/**
 * Execute click handler logic for a specific context
 * @private
 */
const executeContextClick = ({ isPDPContext, isCartContext, isDirectCallbackFlow, variantValidationRef, product, basket, loadPaymentData, getPaymentToken, paymentDetailsRef, amount, currencyCode, onError, onSuccess }) => {
    // Direct callback flow (new pattern matching Apple Pay)
    if (isDirectCallbackFlow) {
        const directAmount = amount || paymentDetailsRef?.current?.amount
        const directCurrency = currencyCode || paymentDetailsRef?.current?.currencyCode || 'USD'
        
        const currencyError = validateCurrency(directCurrency, 'Payment')
        if (currencyError) {
            onError?.(currencyError)
            return
        }
        
        loadPaymentData({
            amount: String(directAmount),
            currencyCode: directCurrency,
            displayItems: buildDisplayItems({ subtotal: directAmount }),
            shippingAddressRequired: true,
            callbackIntents: ['SHIPPING_ADDRESS', 'SHIPPING_OPTION', 'PAYMENT_AUTHORIZATION']
        })
        return
    }
    
    // PDP Context: Check variant selection
    if (isPDPContext) {
        const variantError = checkVariantSelection(variantValidationRef)
        if (variantError) {
            onError?.(variantError)
            return
        }
        handlePDPClick({ product, basket, loadPaymentData, onError })
        return
    }

    // Handle cart context
    if (isCartContext) {
        handleCartClick({ basket, loadPaymentData, onError })
        return
    }

    // Handle checkout context
    handleCheckoutClick({ paymentDetailsRef, basket, getPaymentToken, onSuccess })
}

/**
 * Validate currency availability and return error if missing
 * @private
 */
const validateCurrency = (currency, contextName) => {
    if (!currency) {
        return {
            code: 'CURRENCY_MISSING',
            message: `Currency is required for Google Pay. ${contextName} currency is missing.`
        }
    }
    return null
}

/**
 * Build PDP payment data for loadPaymentData
 * @private
 */
const buildPDPPaymentParams = (product, basket) => {
    const pdpAmount = (product?.price ?? 0).toString()
    const pdpCurrency = product?.currency || basket?.currency
    
    return {
        amount: pdpAmount,
        currencyCode: pdpCurrency,
        displayItems: buildDisplayItems({ subtotal: pdpAmount }),
        shippingAddressRequired: true,
        callbackIntents: ['SHIPPING_ADDRESS', 'SHIPPING_OPTION', 'PAYMENT_AUTHORIZATION']
    }
}

/**
 * Build cart payment data for loadPaymentData
 * @private
 */
const buildCartPaymentParams = (basket) => {
    const cartAmount = basket?.orderTotal?.toString() || '0'
    // Default to USD if basket currency is missing to prevent Google Pay errors
    const cartCurrency = basket?.currency || 'USD'
    
    return {
        amount: cartAmount,
        currencyCode: cartCurrency,
        displayItems: buildDisplayItems({ basket }),
        shippingAddressRequired: true,
        callbackIntents: ['SHIPPING_ADDRESS', 'SHIPPING_OPTION', 'PAYMENT_AUTHORIZATION']
    }
}

// =============================================================================
// Click Handler Helpers
// =============================================================================

/**
 * Check validation and return error if invalid
 * @private
 */
const checkValidation = (validationResult) => {
    if (!validationResult.valid) {
        return {
            code: GOOGLE_PAY_ERROR_CODES.CONFIGURATION_ERROR,
            message: formatValidationErrors(validationResult.errors)
        }
    }
    return null
}

/**
 * Check variant selection for PDP context
 * @private
 */
const checkVariantSelection = (variantValidationRef) => {
    const { isOrderable, errorMessage } = variantValidationRef.current
    if (!isOrderable) {
        return {
            code: 'VARIANT_SELECTION_REQUIRED',
            reason: 'VARIANT_SELECTION_REQUIRED',
            message: errorMessage || 'Please select all product options before purchasing'
        }
    }
    return null
}

/**
 * Handle PDP context click - validate currency and load payment data
 * @private
 */
const handlePDPClick = ({ product, basket, loadPaymentData, onError }) => {
    const params = buildPDPPaymentParams(product, basket)
    const currencyError = validateCurrency(params.currencyCode, 'Product')
    if (currencyError) {
        onError?.(currencyError)
        return
    }
    loadPaymentData(params)
}

/**
 * Handle cart context click - validate currency and load payment data
 * @private
 */
const handleCartClick = ({ basket, loadPaymentData, onError }) => {
    const params = buildCartPaymentParams(basket)
    const currencyError = validateCurrency(params.currencyCode, 'Basket')
    if (currencyError) {
        onError?.(currencyError)
        return
    }
    loadPaymentData(params)
}

/**
 * Handle checkout context click - get payment token
 * @private
 */
const handleCheckoutClick = ({ paymentDetailsRef, basket, getPaymentToken, onSuccess }) => {
    const { amount: currentAmount, currencyCode: currentCurrency } = paymentDetailsRef.current
    const checkoutDisplayItems = basket 
        ? buildDisplayItems({ basket })
        : buildDisplayItems({ subtotal: currentAmount })

    getPaymentToken({
        amount: currentAmount,
        currencyCode: currentCurrency,
        displayItems: checkoutDisplayItems
    }).then((tokenResult) => {
        if (tokenResult.success) {
            onSuccess?.(tokenResult)
        }
    })
}

/**
 * Build context-specific Google Pay options
 * @private
 */
const buildContextOptions = ({
    isCartContext, isPDPContext, baseOptions,
    resolvedBillingAddressRequired, resolvedAllowedCountryCodes, phoneNumberRequired,
    onPaymentDataChanged, onPaymentAuthorized,
    billingAddressRequired, billingAddressFormat, emailRequired, shippingAddressRequired
}) => {
    // Cart/PDP contexts use direct callback pattern (like Apple Pay)
    if (isCartContext) {
        return {
            ...baseOptions, context: GOOGLE_PAY_CONTEXT.CART, shippingAddressRequired: true,
            billingAddressRequired: resolvedBillingAddressRequired, emailRequired: true,
            allowedCountryCodes: resolvedAllowedCountryCodes, phoneNumberRequired,
            onPaymentDataChanged,
            onPaymentAuthorized
        }
    }
    if (isPDPContext) {
        return {
            ...baseOptions, context: GOOGLE_PAY_CONTEXT.PDP, shippingAddressRequired: true,
            billingAddressRequired: resolvedBillingAddressRequired, emailRequired: true,
            allowedCountryCodes: resolvedAllowedCountryCodes, phoneNumberRequired,
            onPaymentDataChanged,
            onPaymentAuthorized
        }
    }
    // Checkout context - standard token collection flow
    return { ...baseOptions, context: GOOGLE_PAY_CONTEXT.CHECKOUT, billingAddressRequired, billingAddressFormat, emailRequired, shippingAddressRequired }
}

// =============================================================================
// Component
// =============================================================================

/**
 * Google Pay Button Component
 * 
 * A single component that handles all Google Pay contexts through the `context` prop.
 * 
 * @param {Object} props - Component props
 * @param {string} [props.context='checkout'] - Payment context: 'checkout', 'cart', or 'pdp'
 * 
 * === CHECKOUT CONTEXT (default) ===
 * @param {string|number} props.amount - Payment amount (required for checkout)
 * @param {string} props.currencyCode - Currency code e.g., 'USD' (required for checkout)
 * @param {string} [props.merchantOrderNumber] - Order reference number
 * 
 * === CART CONTEXT ===
 * @param {Object} props.basket - PWA Kit basket object (required for cart)
 * @param {Function} props.createOrderFn - Async function to create SFCC order (required for cart/pdp)
 * @param {string} [props.slasToken] - SLAS access token for API calls
 * @param {boolean} [props.isGuest=true] - Whether checkout is guest mode
 * @param {string} [props.customerEmail] - Logged-in customer email
 * @param {Function} [props.onShippingOptionsUpdate] - Called when shipping options change
 * @param {Function} [props.onTotalsUpdate] - Called when totals change
 * @param {string[]} [props.allowedCountryCodes] - Allowed shipping countries
 * @param {boolean} [props.phoneNumberRequired=false] - Require phone number
 *
 * === PDP CONTEXT ===
 * @param {Object} props.product - Full product data object from SCAPI (required for pdp)
 * @param {string} props.product.id - Product ID
 * @param {string} [props.product.name] - Product name
 * @param {number} [props.product.price] - Product price
 * @param {Array} [props.product.variationAttributes] - Variation attributes (auto-detected for variant validation)
 * @param {number} [props.quantity=1] - Quantity to purchase
 * @param {Object} [props.variant] - Variant selection from useVariant hook
 * @param {string} [props.variant.productId] - Selected variant product ID (auto-detected for orderability)
 * @param {Object} [props.variant.variationValues] - Selected variation values
 * @param {boolean} [props.validateStock=true] - Validate stock before flow
 * @param {Function} [props.refreshBasket] - Function to refresh basket after changes
 * 
 * NOTE: Variant validation is automatic. For variant products (those with variationAttributes),
 * the button will automatically disable and show an error if no variant is selected.
 * This mimics SFRA's behavior of checking if Add to Cart is disabled.
 * 
 * === COMMON PROPS ===
 * @param {boolean} [props.autoFetchConfig=false] - Auto-fetch config from BM
 * @param {string} [props.apiBasePath='/api/jpmorgan'] - API base path
 * @param {string} [props.gatewayMerchantId] - JP Morgan Merchant ID
 * @param {string} [props.merchantName] - Merchant display name
 * @param {string} [props.merchantId] - Google Merchant ID
 * @param {string} [props.environment] - 'sandbox' or 'production'
 * @param {string} [props.countryCode='US'] - Country code
 * @param {Function} [props.onSuccess] - Callback on success
 * @param {Function} [props.onError] - Callback on error
 * @param {Function} [props.onCancel] - Callback on cancellation
 * @param {Function} [props.onReady] - Callback when ready
 * @param {Function} [props.onClick] - Callback before payment starts
 * @param {boolean} [props.disabled=false] - Disable the button
 * @param {string} [props.buttonType] - Button type: 'buy', 'checkout', 'pay', etc.
 * @param {string} [props.buttonColor] - Button color: 'black', 'white', 'default'
 * @param {string} [props.buttonSizeMode] - Size mode: 'fill' or 'static'
 * @param {string} [props.buttonLocale] - Button locale
 * @param {number} [props.buttonRadius] - Button border radius
 * @param {string} [props.className] - Additional CSS class
 * @param {Object} [props.style] - Additional inline styles
 * @param {React.ReactNode} [props.loadingComponent] - Custom loading component
 * @param {React.ReactNode} [props.unavailableComponent] - Component when unavailable
 * @param {string} [props.ariaLabel] - Accessibility label
 * 
 * @example
 * // Checkout context (default) - token collection
 * <GooglePayButton
 *   amount="99.99"
 *   currencyCode="USD"
 *   onSuccess={(result) => handlePayment(result)}
 * />
 * 
 * @example
 * // Cart context - full shipping flow
 * <GooglePayButton
 *   context="cart"
 *   basket={basket}
 *   createOrderFn={() => createOrder({ body: { basketId } })}
 *   onSuccess={(result) => navigate(`/confirmation/${result.orderNo}`)}
 *   allowedCountryCodes={['US', 'CA']}
 * />
 *
 * @example
 * // PDP context - add to cart + purchase flow
 * <GooglePayButton
 *   context="pdp"
 *   product={{ id: 'PROD-001', name: 'Widget', price: 99.99 }}
 *   quantity={1}
 *   variant={{ size: 'M' }}
 *   createOrderFn={({ basketId }) => createOrder({ body: { basketId } })}
 *   onSuccess={(result) => navigate(`/confirmation/${result.orderNo}`)}
 * />
 */
const GooglePayButton = ({
    // Context determines which flow to use
    context = GOOGLE_PAY_CONTEXT.CHECKOUT,
    
    // === CHECKOUT CONTEXT PROPS ===
    amount,
    currencyCode,
    merchantOrderNumber,
    
    // === CART CONTEXT PROPS ===
    basket,
    createOrderFn,
    allowedCountryCodes,
    phoneNumberRequired = false,
    
    // === PDP CONTEXT PROPS ===
    product,
    quantity = 1,
    variant,
    isProductOrderable = true,
    variantSelectionError,
    
    // === CONFIGURATION ===
    autoFetchConfig = false,
    apiBasePath = '/api/jpmorgan',
    gatewayMerchantId: gatewayMerchantIdProp,
    merchantName: merchantNameProp,
    merchantId: merchantIdProp,
    environment: environmentProp,
    countryCode = 'US',
    
    // === ADDRESS REQUIREMENTS (checkout context) ===
    billingAddressRequired = true,
    billingAddressFormat = 'FULL',
    emailRequired = true,
    shippingAddressRequired = false,
    
    // === CALLBACKS ===
    onSuccess,
    onError,
    onCancel,
    onReady,
    onClick,
    onClickOverride,
    // Direct callback props for custom flows (like Apple Pay pattern)
    // When provided, these are used directly without internal flow hooks
    onPaymentDataChanged: onPaymentDataChangedProp,
    onPaymentAuthorized: onPaymentAuthorizedProp,
    
    // === BUTTON APPEARANCE ===
    buttonType = GOOGLE_PAY_BUTTON_CONFIG.DEFAULT.buttonType,
    buttonColor = GOOGLE_PAY_BUTTON_CONFIG.DEFAULT.buttonColor,
    buttonSizeMode = GOOGLE_PAY_BUTTON_CONFIG.DEFAULT.buttonSizeMode,
    buttonLocale = GOOGLE_PAY_BUTTON_CONFIG.DEFAULT.buttonLocale,
    buttonRadius,
    
    // === UI CONTROL ===
    disabled = false,
    className = '',
    style = {},
    loadingComponent,
    unavailableComponent,
    
    // === ACCESSIBILITY ===
    ariaLabel = 'Pay with Google Pay'
}) => {
    // =========================================================================
    // Refs and State
    // =========================================================================
    
    const buttonContainerRef = useRef(null)
    const googlePayButtonRef = useRef(null)
    const [buttonRendered, setButtonRendered] = useState(false)
    
    // Payment details ref for checkout context (prevents button re-render)
    const paymentDetailsRef = useRef({ amount, currencyCode, merchantOrderNumber })
    useEffect(() => {
        paymentDetailsRef.current = { amount, currencyCode, merchantOrderNumber }
    }, [amount, currencyCode, merchantOrderNumber])

    // =========================================================================
    // Context Detection
    // =========================================================================
    
    const isCartContext = context === GOOGLE_PAY_CONTEXT.CART
    const isPDPContext = context === GOOGLE_PAY_CONTEXT.PDP
    const isCartOrPDPContext = isCartContext || isPDPContext
    
    // NEW PATTERN: Direct callback flow (like Apple Pay)
    // When onPaymentDataChanged and onPaymentAuthorized are provided directly,
    // the integrator handles all business logic via callbacks (basket, shipping, order creation)
    const isDirectCallbackFlow = !!(onPaymentDataChangedProp && onPaymentAuthorizedProp)

    // =========================================================================
    // Variant Validation (Auto-computed for PDP context)
    // =========================================================================
    
    const { 
        computedIsProductOrderable, 
        computedVariantError, 
        validationRef: variantValidationRef 
    } = useVariantValidation({
        isPDPContext,
        product,
        variant,
        isProductOrderable,
        variantSelectionError
    })

    // =========================================================================
    // JPMC Checkout Context (for cart context)
    // =========================================================================
    
    const jpmcCheckout = useJPMCCheckout()
    const {
        paymentConfig,
        googlePayConfig: contextGooglePayConfig,
        // Multi-MID support: locale and getAccessToken for authenticated config fetch
        locale: contextLocale,
        getAccessToken: contextGetAccessToken
    } = jpmcCheckout || {}

    // =========================================================================
    // Server Config (for autoFetchConfig - skips if context has googlePayConfig)
    // =========================================================================
    
    const { serverConfig, configLoading, configError } = useServerConfig({
        autoFetchConfig,
        apiBasePath,
        contextGooglePayConfig,  // Pass context google pay config to skip duplicate fetch
        // Multi-MID: Pass locale and getAccessToken for authenticated CO lookup
        locale: contextLocale,
        getAccessToken: contextGetAccessToken
    })

    // =========================================================================
    // Resolve Configuration
    // =========================================================================
    
    const resolvedConfig = useMemo(() => resolveGooglePayConfig({
        props: {
            gatewayMerchantId: gatewayMerchantIdProp,
            merchantName: merchantNameProp,
            merchantId: merchantIdProp,
            environment: environmentProp,
            allowedCountryCodes,
            billingAddressRequired
        },
        serverConfig,
        // Wrap contextGooglePayConfig in googlePay key to match expected structure
        paymentConfig: contextGooglePayConfig ? { googlePay: contextGooglePayConfig } : paymentConfig,
        isCartOrPDPContext
    }), [
        gatewayMerchantIdProp, merchantNameProp, merchantIdProp, environmentProp,
        allowedCountryCodes, billingAddressRequired,
        serverConfig, contextGooglePayConfig, paymentConfig, isCartOrPDPContext
    ])

    const {
        gatewayMerchantId,
        merchantName,
        merchantId,
        environment,
        gateway,
        allowedNetworks,
        allowedAuthMethods,
        resolvedAllowedCountryCodes,
        resolvedBillingAddressRequired
    } = resolvedConfig

    // Check if disabled in BM - use contextGooglePayConfig if available
    const isDisabledInBM = isGooglePayDisabledInBM({
        isCartContext,
        isPDPContext,
        // Wrap contextGooglePayConfig in googlePay key to match expected structure
        paymentConfig: contextGooglePayConfig ? { googlePay: contextGooglePayConfig } : paymentConfig,
        serverConfig
    })

    // =========================================================================
    // Prop Validation
    // =========================================================================
    
    const validationResult = useMemo(() => {
        // Skip validation when onClickOverride is provided - user handles the entire flow
        if (onClickOverride) {
            return { valid: true, errors: [], warnings: [] }
        }
        
        const propsToValidate = buildValidationProps({
            isCartContext, isPDPContext, basket, createOrderFn, product, quantity, amount, currencyCode,
            // Include callback props so validator can detect callback flow
            onPaymentDataChanged: onPaymentDataChangedProp,
            onPaymentAuthorized: onPaymentAuthorizedProp
        })
        
        const result = validateContextProps(context, propsToValidate)
        logValidationWarnings(result.warnings)
        return result
    }, [context, isCartContext, isPDPContext, basket, createOrderFn, product, quantity, amount, currencyCode, onClickOverride, onPaymentDataChangedProp, onPaymentAuthorizedProp])

    useEffect(() => {
        if (!validationResult.valid && process.env.NODE_ENV !== 'production') {
            // Validation errors logged in development
        }
    }, [validationResult])

    // =========================================================================
    // Google Pay Hook
    // =========================================================================
    
    const googlePayOptions = useMemo(() => {
        const baseOptions = {
            gatewayMerchantId, merchantName, merchantId, environment, countryCode,
            gateway, allowedNetworks, allowedAuthMethods,
            onError, onCancel, onReady
        }
        
        const options = buildContextOptions({
            isCartContext, isPDPContext, baseOptions,
            resolvedBillingAddressRequired, resolvedAllowedCountryCodes, phoneNumberRequired,
            onPaymentDataChanged: onPaymentDataChangedProp,
            onPaymentAuthorized: onPaymentAuthorizedProp,
            billingAddressRequired, billingAddressFormat, emailRequired, shippingAddressRequired
        })

        return options
    }, [
        gatewayMerchantId, merchantName, merchantId, environment, countryCode,
        gateway, allowedNetworks, allowedAuthMethods,
        isCartContext, isPDPContext, billingAddressRequired, billingAddressFormat, emailRequired,
        shippingAddressRequired, resolvedAllowedCountryCodes, resolvedBillingAddressRequired, phoneNumberRequired,
        onPaymentDataChangedProp, onPaymentAuthorizedProp,
        onError, onCancel, onReady
    ])

    const {
        isReady,
        isAvailable,
        isLoading,
        isProcessing: isGooglePayProcessing,
        error: googlePayError,
        paymentsClient,
        loadPaymentData,
        getPaymentToken
    } = useGooglePay(googlePayOptions)

    // Processing state from Google Pay hook
    const isProcessing = isGooglePayProcessing

    // =========================================================================
    // Click Handler
    // =========================================================================
    
    const handleClick = useCallback(() => {
        if (disabled || isProcessing) {
            return
        }

        // Custom click override (for Adyen-style flows)
        if (onClickOverride) {
            onClick?.()
            onClickOverride()
            return
        }

        onClick?.()

        // Validate config before proceeding
        const validationError = checkValidation(validationResult)
        if (validationError) {
            onError?.(validationError)
            return
        }

        // Execute context-specific click logic
        executeContextClick({
            isPDPContext, isCartContext, isDirectCallbackFlow, variantValidationRef,
            product, basket, loadPaymentData, getPaymentToken,
            paymentDetailsRef, amount, currencyCode, onError, onSuccess
        })
    }, [
        disabled,
        isProcessing,
        isCartContext,
        isPDPContext,
        isDirectCallbackFlow,
        validationResult,
        variantValidationRef,
        basket,
        product,
        amount,
        currencyCode,
        loadPaymentData,
        getPaymentToken,
        onClick,
        onClickOverride,
        onSuccess,
        onError
    ])

    // =========================================================================
    // Render Google Pay Button
    // =========================================================================
    
    const renderGooglePayButton = useCallback(() => {
        // Check container exists AND is in the DOM (not detached from previous render)
        if (!paymentsClient || !buttonContainerRef.current || buttonRendered) {
            return
        }
        
        // Ensure container is actually in the document
        if (!document.body.contains(buttonContainerRef.current)) {
            return
        }

        buttonContainerRef.current.innerHTML = ''

        try {
            const buttonOptions = {
                onClick: handleClick,
                buttonType,
                buttonColor,
                buttonSizeMode,
                buttonLocale,
                allowedPaymentMethods: [buildBaseCardPaymentMethod()]
            }

            if (buttonRadius !== undefined) {
                buttonOptions.buttonRadius = buttonRadius
            }

            const button = paymentsClient.createButton(buttonOptions)
            buttonContainerRef.current.appendChild(button)
            googlePayButtonRef.current = button
            setButtonRendered(true)
        } catch (err) {
            onError?.({
                code: GOOGLE_PAY_ERROR_CODES.PAYMENT_FAILED,
                message: 'Failed to render Google Pay button'
            })
        }
    }, [
        paymentsClient,
        buttonRendered,
        handleClick,
        buttonType,
        buttonColor,
        buttonSizeMode,
        buttonLocale,
        buttonRadius,
        onError
    ])

    useEffect(() => {
        if (isReady && isAvailable && paymentsClient && !buttonRendered) {
            renderGooglePayButton()
        }
    }, [isReady, isAvailable, paymentsClient, buttonRendered, renderGooglePayButton])

    // Reset buttonRendered when paymentsClient changes
    useEffect(() => {
        setButtonRendered(false)
    }, [paymentsClient])

    // Reset buttonRendered when product or variant changes (PDP navigation)
    // This ensures the button re-renders with updated handleClick closure
    useEffect(() => {
        if (isPDPContext) {
            setButtonRendered(false)
        }
    }, [isPDPContext, product?.id, variant?.productId])

    // =========================================================================
    // Render
    // =========================================================================

    // For cart/pdp context, if config is not yet available, show loading
    // This handles the case where JPMCCheckoutProvider is still fetching config
    const isWaitingForContextConfig = isCartOrPDPContext && !gatewayMerchantId && !autoFetchConfig

    // Get early return type using consolidated helper
    const earlyReturnType = getEarlyReturnType({
        configError, validationResult,
        isLoading, configLoading, isWaitingForContextConfig, gatewayMerchantId,
        isDisabledInBM, isReady, isAvailable, googlePayError
    })

    // Handle early returns based on type
    switch (earlyReturnType) {
        case 'config-error':
        case 'validation-error':
            return (
                <div 
                    className={`gpay-button-error ${className}`}
                    style={{ 
                        display: 'flex', 
                        justifyContent: 'center', 
                        alignItems: 'center',
                        minHeight: '40px',
                        color: '#d32f2f',
                        fontSize: '14px',
                        ...style 
                    }}
                    role="alert"
                >
                    {earlyReturnType === 'config-error' 
                        ? 'Google Pay configuration error' 
                        : 'Google Pay configuration error - check console'}
                </div>
            )
        case 'loading':
            return loadingComponent || (
                <output 
                    className={`gpay-button-loading ${className}`}
                    style={{ 
                        display: 'flex', 
                        justifyContent: 'center', 
                        alignItems: 'center',
                        minHeight: '40px',
                        ...style 
                    }}
                    aria-label="Loading Google Pay"
                >
                    <span className="gpay-loading-spinner" aria-hidden="true" />
                    <span className="sr-only">Loading Google Pay...</span>
                </output>
            )
        case 'hidden':
            return null
        case 'unavailable':
            return unavailableComponent || null
        default:
            // Normal render - continue below
    }

    // Calculate effective disabled state
    // For PDP context, also consider if product is orderable (variant selected)
    const isEffectivelyDisabled = disabled || (isPDPContext && !computedIsProductOrderable)
    const disabledReason = getDisabledReason(isPDPContext, computedIsProductOrderable, disabled)

    // Build className components separately to avoid nested template literals
    const containerClasses = [
        'gpay-button-container',
        className,
        isProcessing ? 'gpay-processing' : '',
        isEffectivelyDisabled ? 'gpay-disabled' : '',
        disabledReason ? `gpay-disabled-${disabledReason}` : ''
    ].filter(Boolean).join(' ')

    // Button container
    return (
        <div 
            className={containerClasses}
            style={{
                position: 'relative',
                ...style
            }}
        >
            <div 
                ref={buttonContainerRef}
                className="gpay-button-wrapper"
                style={{
                    opacity: isEffectivelyDisabled || isProcessing ? 0.6 : 1,
                    pointerEvents: isEffectivelyDisabled || isProcessing ? 'none' : 'auto',
                    transition: 'opacity 0.2s ease'
                }}
                aria-label={ariaLabel}
                aria-disabled={isEffectivelyDisabled || isProcessing}
                title={isPDPContext && !computedIsProductOrderable ? (computedVariantError || 'Please select all product options') : undefined}
            />

            {/* Processing overlay */}
            {isProcessing && (
                <output 
                    className="gpay-processing-overlay"
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: 'rgba(255, 255, 255, 0.5)',
                        borderRadius: buttonRadius || '4px'
                    }}
                    aria-label="Processing payment"
                >
                    <span className="gpay-processing-spinner" aria-hidden="true" />
                </output>
            )}
        </div>
    )
}

// =============================================================================
// PropTypes
// =============================================================================

GooglePayButton.propTypes = GooglePayButtonPropTypes
// Default export
export default GooglePayButton
