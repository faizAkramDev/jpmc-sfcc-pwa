/**
 * Google Pay Prop Validator
 * 
 * Validates context-specific required props for GooglePayButton.
 * Provides clear error messages for missing or invalid props.
 * 
 * @module components/utils/googlepay-prop-validator
 */

import {
    GOOGLE_PAY_CONTEXT,
    GOOGLE_PAY_ERROR_CODES
} from '../../../utils/constants.mjs'

// =============================================================================
// Context-specific Prop Requirements
// =============================================================================

/**
 * Required props for each context (legacy flow without callbacks)
 * @type {Object.<string, string[]>}
 */
const CONTEXT_REQUIRED_PROPS = {
    [GOOGLE_PAY_CONTEXT.CHECKOUT]: [
        'amount',
        'currencyCode'
    ],
    [GOOGLE_PAY_CONTEXT.CART]: [
        'basket',
        'createOrderFn'
    ],
    [GOOGLE_PAY_CONTEXT.PDP]: [
        'productId',
        'quantity',
        'addToBasketFn'
    ]
}

/**
 * Required props when using the callback pattern (onPaymentDataChanged + onPaymentAuthorized)
 * These are minimal requirements since integrator handles everything in callbacks
 * @type {Object.<string, string[]>}
 */
const CALLBACK_FLOW_REQUIRED_PROPS = {
    [GOOGLE_PAY_CONTEXT.CHECKOUT]: [
        'amount',
        'currencyCode'
    ],
    [GOOGLE_PAY_CONTEXT.CART]: [],
    [GOOGLE_PAY_CONTEXT.PDP]: []
}

/**
 * Optional props specific to each context
 * @type {Object.<string, string[]>}
 */
const CONTEXT_OPTIONAL_PROPS = {
    [GOOGLE_PAY_CONTEXT.CHECKOUT]: [
        'merchantOrderNumber'
    ],
    [GOOGLE_PAY_CONTEXT.CART]: [
        'onShippingOptionsUpdate',
        'onTotalsUpdate',
        'slasToken'
    ],
    [GOOGLE_PAY_CONTEXT.PDP]: [
        'variant',
        'options',
        'onAddToBasket',
        'slasToken',
        'isProductOrderable',
        'variantSelectionError'
    ]
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validates that a context value is valid
 * 
 * @param {string} context - Context to validate
 * @returns {boolean} True if valid
 */
export function isValidContext(context) {
    return Object.values(GOOGLE_PAY_CONTEXT).includes(context)
}

/**
 * Validates props for a given context
 * 
 * @param {string} context - The Google Pay context
 * @param {object} props - Component props to validate
 * @returns {object} Validation result with { valid, errors, warnings }
 */
export function validateContextProps(context, props) {
    const result = {
        valid: true,
        errors: [],
        warnings: []
    }

    // Validate context itself
    if (!isValidContext(context)) {
        result.valid = false
        result.errors.push({
            code: GOOGLE_PAY_ERROR_CODES.CONFIGURATION_ERROR,
            field: 'context',
            message: `Invalid context "${context}". Must be one of: ${Object.values(GOOGLE_PAY_CONTEXT).join(', ')}`
        })
        return result
    }

    // Check if using callback pattern (callbacks handle everything)
    const isCallbackFlow = typeof props.onPaymentDataChanged === 'function' && 
                          typeof props.onPaymentAuthorized === 'function'

    // Get required props for this context based on flow type
    const requiredProps = isCallbackFlow 
        ? (CALLBACK_FLOW_REQUIRED_PROPS[context] || [])
        : (CONTEXT_REQUIRED_PROPS[context] || [])

    // Check each required prop
    for (const propName of requiredProps) {
        const propValue = props[propName]
        
        if (propValue === undefined || propValue === null) {
            result.valid = false
            result.errors.push({
                code: GOOGLE_PAY_ERROR_CODES.CONFIGURATION_ERROR,
                field: propName,
                message: `Required prop "${propName}" is missing for context="${context}"`
            })
        } else if (typeof propValue === 'string' && propValue.trim() === '') {
            result.valid = false
            result.errors.push({
                code: GOOGLE_PAY_ERROR_CODES.CONFIGURATION_ERROR,
                field: propName,
                message: `Required prop "${propName}" cannot be empty for context="${context}"`
            })
        }
    }

    // Special validation for specific props (only for legacy flow, not callback flow)
    // In callback flow, integrator handles everything so we don't validate legacy props
    if (!isCallbackFlow) {
        if (context === GOOGLE_PAY_CONTEXT.CART) {
            validateCartContextProps(props, result)
        } else if (context === GOOGLE_PAY_CONTEXT.PDP) {
            validatePDPContextProps(props, result)
        } else if (context === GOOGLE_PAY_CONTEXT.CHECKOUT) {
            validateCheckoutContextProps(props, result)
        }
    }

    return result
}

/**
 * Validates cart-specific props
 * 
 * @param {object} props - Component props
 * @param {object} result - Validation result to update
 */
function validateCartContextProps(props, result) {
    const { basket, createOrderFn } = props

    // Validate basket structure
    if (basket && typeof basket === 'object') {
        if (!basket.basketId) {
            result.warnings.push({
                field: 'basket.basketId',
                message: 'basket.basketId is recommended for cart context'
            })
        }
    }

    // Validate createOrderFn is a function
    if (createOrderFn && typeof createOrderFn !== 'function') {
        result.valid = false
        result.errors.push({
            code: GOOGLE_PAY_ERROR_CODES.CONFIGURATION_ERROR,
            field: 'createOrderFn',
            message: 'createOrderFn must be a function'
        })
    }
}

/**
 * Validates PDP-specific props
 * 
 * @param {object} props - Component props
 * @param {object} result - Validation result to update
 */
function validatePDPContextProps(props, result) {
    const { quantity, addToBasketFn, variant, isProductOrderable, product } = props

    // Validate quantity is positive
    if (quantity !== undefined) {
        const numQuantity = Number(quantity)
        if (Number.isNaN(numQuantity) || numQuantity < 1) {
            result.valid = false
            result.errors.push({
                code: GOOGLE_PAY_ERROR_CODES.CONFIGURATION_ERROR,
                field: 'quantity',
                message: 'quantity must be a positive number'
            })
        }
    }

    // Validate addToBasketFn is a function
    if (addToBasketFn && typeof addToBasketFn !== 'function') {
        result.valid = false
        result.errors.push({
            code: GOOGLE_PAY_ERROR_CODES.CONFIGURATION_ERROR,
            field: 'addToBasketFn',
            message: 'addToBasketFn must be a function'
        })
    }

    // Only warn if isProductOrderable is not provided AND auto-detection cannot work
    // Auto-detection works when product.variationAttributes is provided
    const canAutoDetect = product?.variationAttributes?.length > 0 || variant?.productId
    const isSimpleProduct = !product?.variationAttributes?.length
    
    if (isProductOrderable === undefined && !canAutoDetect && !isSimpleProduct) {
        result.warnings.push({
            field: 'isProductOrderable',
            message: 'isProductOrderable prop not provided. Either pass this prop, or provide product.variationAttributes for auto-detection.'
        })
    }

    // Warn if variant has properties but no productId (incomplete selection)
    // Only warn if auto-detection is NOT available (no variationAttributes)
    if (variant && typeof variant === 'object' && !product?.variationAttributes?.length) {
        const hasVariantAttributes = variant.size || variant.color
        if (hasVariantAttributes && !variant.productId) {
            result.warnings.push({
                field: 'variant.productId',
                message: 'variant has attributes (size/color) but no productId. This usually means variant selection is incomplete.'
            })
        }
    }
}

/**
 * Validates checkout-specific props
 * 
 * @param {object} props - Component props
 * @param {object} result - Validation result to update
 */
function validateCheckoutContextProps(props, result) {
    const { amount, currencyCode } = props

    // Validate amount is a valid number
    if (amount !== undefined) {
        const numAmount = Number(amount)
        if (Number.isNaN(numAmount) || numAmount < 0) {
            result.valid = false
            result.errors.push({
                code: GOOGLE_PAY_ERROR_CODES.CONFIGURATION_ERROR,
                field: 'amount',
                message: 'amount must be a non-negative number'
            })
        }
    }

    // Validate currencyCode format (ISO 4217)
    if (currencyCode && typeof currencyCode === 'string') {
        if (!/^[A-Z]{3}$/.test(currencyCode)) {
            result.warnings.push({
                field: 'currencyCode',
                message: 'currencyCode should be a 3-letter ISO 4217 code (e.g., "USD")'
            })
        }
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets required props for a context
 * 
 * @param {string} context - The Google Pay context
 * @returns {string[]} Array of required prop names
 */
export function getRequiredPropsForContext(context) {
    return CONTEXT_REQUIRED_PROPS[context] || []
}

/**
 * Gets optional props for a context
 * 
 * @param {string} context - The Google Pay context
 * @returns {string[]} Array of optional prop names
 */
export function getOptionalPropsForContext(context) {
    return CONTEXT_OPTIONAL_PROPS[context] || []
}

/**
 * Gets all relevant props for a context (required + optional)
 * 
 * @param {string} context - The Google Pay context
 * @returns {string[]} Array of all prop names
 */
export function getAllPropsForContext(context) {
    return [
        ...getRequiredPropsForContext(context),
        ...getOptionalPropsForContext(context)
    ]
}

/**
 * Formats validation errors for console output
 * 
 * @param {object[]} errors - Array of error objects
 * @returns {string} Formatted error message
 */
export function formatValidationErrors(errors) {
    if (!errors || errors.length === 0) {
        return ''
    }

    const lines = errors.map(err => `  - ${err.field}: ${err.message}`)
    return `GooglePayButton prop validation failed:\n${lines.join('\n')}`
}

/**
 * Logs validation warnings to console (development only)
 * 
 * @param {object[]} warnings - Array of warning objects
 */
export function logValidationWarnings(warnings) {
    if (!warnings || warnings.length === 0 || process.env.NODE_ENV === 'production') {
        return
    }

    warnings.forEach(_warning => {
    })
}

// =============================================================================
// Exports
// =============================================================================

export default {
    isValidContext,
    validateContextProps,
    getRequiredPropsForContext,
    getOptionalPropsForContext,
    getAllPropsForContext,
    formatValidationErrors,
    logValidationWarnings
}
