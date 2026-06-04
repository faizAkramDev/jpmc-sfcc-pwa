/**
 * useVariantValidation Hook
 * 
 * Handles automatic variant validation for PDP Google Pay flows.
 * Determines if a product is orderable based on variant selection.
 * 
 * @module client/components/hooks/useVariantValidation
 */

import { useMemo, useRef, useLayoutEffect } from 'react'

/**
 * Hook for automatic variant validation
 * 
 * For variant products (those with variationAttributes), a valid variant must be selected.
 * The variant.productId is populated when all required attributes are selected.
 * 
 * This mimics SFRA's behavior of checking if the Add to Cart button is disabled.
 * 
 * @param {Object} options - Hook options
 * @param {boolean} options.isPDPContext - Whether in PDP context
 * @param {Object} [options.product] - Product data
 * @param {Object} [options.variant] - Variant selection
 * @param {boolean} [options.isProductOrderable] - Explicit orderable override
 * @param {string} [options.variantSelectionError] - Explicit error message
 * @returns {Object} Validation state and ref
 */
export const useVariantValidation = ({
    isPDPContext,
    product,
    variant,
    isProductOrderable: isProductOrderableProp,
    variantSelectionError: variantSelectionErrorProp
}) => {
    /**
     * Automatically detect if product is orderable based on variant selection.
     * 
     * Priority:
     * 1. If isProductOrderable prop is explicitly set to false, respect it
     * 2. Otherwise, auto-detect from product.variationAttributes and variant.productId
     */
    const computedIsProductOrderable = useMemo(() => {
        // Only compute for PDP context
        if (!isPDPContext) return true
        
        // Respect explicit prop override (backwards compatibility)
        if (isProductOrderableProp === false) {
            return false
        }
        
        // Auto-detect: Check if product has variation attributes (is a variant product)
        const hasVariationAttributes = product?.variationAttributes?.length > 0
        
        if (!hasVariationAttributes) {
            // Simple product - orderable (stock check happens later)
            return true
        }
        
        // Variant product - orderable only if variant is selected
        return !!(variant?.productId)
    }, [isPDPContext, isProductOrderableProp, product, variant])

    /**
     * Auto-generate error message for missing variant selection.
     * Lists the specific attributes that need to be selected.
     */
    const computedVariantError = useMemo(() => {
        // If explicitly provided, use that
        if (variantSelectionErrorProp) return variantSelectionErrorProp
        
        // Only generate for PDP context with unorderable product
        if (!isPDPContext || computedIsProductOrderable) return null
        
        // Find unselected attributes
        const unselectedAttributes = product?.variationAttributes
            ?.filter(attr => !variant?.variationValues?.[attr.id])
            ?.map(attr => attr.name)
        
        if (unselectedAttributes?.length > 0) {
            return `Please select ${unselectedAttributes.join(', ')}`
        }
        
        return 'Please select all options'
    }, [isPDPContext, computedIsProductOrderable, variantSelectionErrorProp, product, variant])

    // Ref for click handler - initialized with computed values to avoid stale initial state
    // Using a function to compute initial value ensures it's correct from first render
    const validationRef = useRef(null)
    
    // Update ref synchronously with useLayoutEffect to ensure it's ready before click handlers
    // This runs BEFORE the browser paint, so clicks will always see the latest value
    useLayoutEffect(() => {
        validationRef.current = {
            isOrderable: computedIsProductOrderable,
            errorMessage: computedVariantError
        }
    }, [computedIsProductOrderable, computedVariantError])
    
    // Also set during render to handle first render before useLayoutEffect runs
    if (validationRef.current === null) {
        validationRef.current = {
            isOrderable: computedIsProductOrderable,
            errorMessage: computedVariantError
        }
    }

    return {
        computedIsProductOrderable,
        computedVariantError,
        validationRef
    }
}

export default useVariantValidation
