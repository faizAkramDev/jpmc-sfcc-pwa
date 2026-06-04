/**
 * useAvailablePaymentMethods Hook
 * 
 * A utility hook that analyzes SFCC payment methods from Business Manager
 * and determines which JPMC-supported payment types are active.
 * 
 * This hook checks payment method IDs for known patterns:
 * - Credit Card: contains 'credit_card', 'creditcard', or 'card'
 * - Apple Pay: contains 'apple_pay', 'applepay', 'dw_apple_pay'
 * - Google Pay: contains 'google_pay', 'googlepay', 'gpay', 'jpmc_google_pay'
 * 
 * Usage:
 * ```jsx
 * import { useAvailablePaymentMethods } from '@jpmorgan/jpmorgan-salesforce-pwa/client'
 * import { usePaymentMethodsForBasket } from '@salesforce/commerce-sdk-react'
 * 
 * const { data: paymentMethodsData } = usePaymentMethodsForBasket({ parameters: { basketId } })
 * const { 
 *   isCreditCardActive, 
 *   isApplePayActive, 
 *   isGooglePayActive,
 *   availablePaymentMethods,
 *   creditCardPaymentMethodId,
 *   applePayPaymentMethodId,
 *   googlePayPaymentMethodId
 * } = useAvailablePaymentMethods(paymentMethodsData?.applicablePaymentMethods)
 * ```
 * 
 * @module useAvailablePaymentMethods
 */

import { useMemo } from 'react'

// =============================================================================
// Payment Method Patterns
// =============================================================================

/**
 * Patterns to match payment method IDs (case-insensitive)
 */
const PAYMENT_METHOD_PATTERNS = {
    creditCard: [
        'credit_card',
        'creditcard',
        'card'
    ],
    applePay: [
        'apple_pay',
        'applepay',
        'dw_apple_pay'
    ],
    googlePay: [
        'google_pay',
        'googlepay',
        'gpay',
        'jpmc_google_pay'
    ]
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a payment method ID matches any of the given patterns
 * @param {string} paymentMethodId - The payment method ID to check
 * @param {string[]} patterns - Array of patterns to match against
 * @returns {boolean} - True if the ID matches any pattern
 */
const matchesPattern = (paymentMethodId, patterns) => {
    if (!paymentMethodId) return false
    const lowerId = paymentMethodId.toLowerCase()
    return patterns.some(pattern => lowerId.includes(pattern.toLowerCase()))
}

/**
 * Find the first matching payment method for a type
 * @param {Array} paymentMethods - Array of payment method objects
 * @param {string[]} patterns - Patterns to match
 * @returns {object|null} - The matching payment method or null
 */
const findPaymentMethod = (paymentMethods, patterns) => {
    if (!paymentMethods || !Array.isArray(paymentMethods)) return null
    return paymentMethods.find(pm => matchesPattern(pm.id, patterns)) || null
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to analyze SFCC payment methods and determine active payment types
 * 
 * @param {Array} paymentMethods - Array of payment method objects from SFCC
 *        Each object should have at least an `id` property
 * @returns {object} Payment method availability info
 * @returns {boolean} returns.isCreditCardActive - True if credit card payment is available
 * @returns {boolean} returns.isApplePayActive - True if Apple Pay is available
 * @returns {boolean} returns.isGooglePayActive - True if Google Pay is available
 * @returns {Array} returns.availablePaymentMethods - The original payment methods array
 * @returns {string|null} returns.creditCardPaymentMethodId - The matched credit card payment method ID
 * @returns {string|null} returns.applePayPaymentMethodId - The matched Apple Pay payment method ID
 * @returns {string|null} returns.googlePayPaymentMethodId - The matched Google Pay payment method ID
 * @returns {boolean} returns.isLoading - True if payment methods are still loading (array is null/undefined)
 */
export const useAvailablePaymentMethods = (paymentMethods) => {
    return useMemo(() => {
        // Handle loading state
        const isLoading = paymentMethods === undefined || paymentMethods === null
        
        // Find matching payment methods
        const creditCard = findPaymentMethod(paymentMethods, PAYMENT_METHOD_PATTERNS.creditCard)
        const applePay = findPaymentMethod(paymentMethods, PAYMENT_METHOD_PATTERNS.applePay)
        const googlePay = findPaymentMethod(paymentMethods, PAYMENT_METHOD_PATTERNS.googlePay)
        
        const result = {
            // Boolean flags for easy conditional rendering
            isCreditCardActive: !!creditCard,
            isApplePayActive: !!applePay,
            isGooglePayActive: !!googlePay,
            
            // The original payment methods for reference
            availablePaymentMethods: paymentMethods || [],
            
            // The specific matched payment method IDs
            creditCardPaymentMethodId: creditCard?.id || null,
            applePayPaymentMethodId: applePay?.id || null,
            googlePayPaymentMethodId: googlePay?.id || null,
            
            // Loading state
            isLoading
        }
        
        // Payment method detection complete
        
        return result
    }, [paymentMethods])
}

/**
 * Standalone utility function (non-hook) for checking payment methods
 * Useful when you need to check outside of a React component
 * 
 * @param {Array} paymentMethods - Array of payment method objects from SFCC
 * @returns {object} Same structure as useAvailablePaymentMethods return value
 */
export const checkAvailablePaymentMethods = (paymentMethods) => {
    const creditCard = findPaymentMethod(paymentMethods, PAYMENT_METHOD_PATTERNS.creditCard)
    const applePay = findPaymentMethod(paymentMethods, PAYMENT_METHOD_PATTERNS.applePay)
    const googlePay = findPaymentMethod(paymentMethods, PAYMENT_METHOD_PATTERNS.googlePay)
    
    return {
        isCreditCardActive: !!creditCard,
        isApplePayActive: !!applePay,
        isGooglePayActive: !!googlePay,
        availablePaymentMethods: paymentMethods || [],
        creditCardPaymentMethodId: creditCard?.id || null,
        applePayPaymentMethodId: applePay?.id || null,
        googlePayPaymentMethodId: googlePay?.id || null,
        isLoading: paymentMethods === undefined || paymentMethods === null
    }
}

// Default export
export default useAvailablePaymentMethods
