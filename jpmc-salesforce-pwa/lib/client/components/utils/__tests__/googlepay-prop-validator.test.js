/**
 * Unit Tests for googlepay-prop-validator
 * 
 * @jest-environment jsdom
 */

import {
    isValidContext,
    validateContextProps,
    getRequiredPropsForContext,
    getOptionalPropsForContext,
    getAllPropsForContext,
    formatValidationErrors
} from '../googlepay-prop-validator'
import { GOOGLE_PAY_CONTEXT } from '../../../../utils/constants.mjs'

describe('googlepay-prop-validator', () => {
    // =========================================================================
    // isValidContext
    // =========================================================================

    describe('isValidContext', () => {
        it('should return true for valid contexts', () => {
            expect(isValidContext('checkout')).toBe(true)
            expect(isValidContext('cart')).toBe(true)
            expect(isValidContext('pdp')).toBe(true)
        })

        it('should return false for invalid contexts', () => {
            expect(isValidContext('invalid')).toBe(false)
            expect(isValidContext('')).toBe(false)
            expect(isValidContext(null)).toBe(false)
            expect(isValidContext(undefined)).toBe(false)
        })
    })

    // =========================================================================
    // validateContextProps
    // =========================================================================

    describe('validateContextProps', () => {
        describe('checkout context', () => {
            it('should pass with valid props', () => {
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.CHECKOUT, {
                    amount: '99.99',
                    currencyCode: 'USD'
                })

                expect(result.valid).toBe(true)
                expect(result.errors).toHaveLength(0)
            })

            it('should fail with missing amount', () => {
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.CHECKOUT, {
                    currencyCode: 'USD'
                })

                expect(result.valid).toBe(false)
                expect(result.errors.some(e => e.field === 'amount')).toBe(true)
            })

            it('should fail with missing currencyCode', () => {
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.CHECKOUT, {
                    amount: '99.99'
                })

                expect(result.valid).toBe(false)
                expect(result.errors.some(e => e.field === 'currencyCode')).toBe(true)
            })

            it('should fail with invalid amount (negative)', () => {
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.CHECKOUT, {
                    amount: '-10',
                    currencyCode: 'USD'
                })

                expect(result.valid).toBe(false)
                expect(result.errors.some(e => e.field === 'amount')).toBe(true)
            })

            it('should warn for invalid currencyCode format', () => {
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.CHECKOUT, {
                    amount: '99.99',
                    currencyCode: 'usd' // lowercase
                })

                expect(result.valid).toBe(true) // Still valid, just a warning
                expect(result.warnings.some(w => w.field === 'currencyCode')).toBe(true)
            })
        })

        describe('cart context', () => {
            it('should pass with valid props', () => {
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.CART, {
                    basket: { basketId: '123', orderTotal: 100, currency: 'USD' },
                    createOrderFn: jest.fn()
                })

                expect(result.valid).toBe(true)
                expect(result.errors).toHaveLength(0)
            })

            it('should fail with missing basket', () => {
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.CART, {
                    createOrderFn: jest.fn()
                })

                expect(result.valid).toBe(false)
                expect(result.errors.some(e => e.field === 'basket')).toBe(true)
            })

            it('should fail with missing createOrderFn', () => {
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.CART, {
                    basket: { basketId: '123' }
                })

                expect(result.valid).toBe(false)
                expect(result.errors.some(e => e.field === 'createOrderFn')).toBe(true)
            })

            it('should fail when createOrderFn is not a function', () => {
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.CART, {
                    basket: { basketId: '123' },
                    createOrderFn: 'not-a-function'
                })

                expect(result.valid).toBe(false)
                expect(result.errors.some(e => e.field === 'createOrderFn')).toBe(true)
            })

            it('should warn when basket.basketId is missing', () => {
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.CART, {
                    basket: { orderTotal: 100 },
                    createOrderFn: jest.fn()
                })

                expect(result.valid).toBe(true) // Still valid
                expect(result.warnings.some(w => w.field === 'basket.basketId')).toBe(true)
            })
        })

        describe('pdp context', () => {
            it('should pass with valid props', () => {
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.PDP, {
                    productId: 'prod-123',
                    quantity: 1,
                    addToBasketFn: jest.fn()
                })

                expect(result.valid).toBe(true)
                expect(result.errors).toHaveLength(0)
            })

            it('should fail with missing productId', () => {
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.PDP, {
                    quantity: 1,
                    addToBasketFn: jest.fn()
                })

                expect(result.valid).toBe(false)
                expect(result.errors.some(e => e.field === 'productId')).toBe(true)
            })

            it('should fail with invalid quantity (negative)', () => {
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.PDP, {
                    productId: 'prod-123',
                    quantity: -1,
                    addToBasketFn: jest.fn()
                })

                expect(result.valid).toBe(false)
                expect(result.errors.some(e => e.field === 'quantity')).toBe(true)
            })

            it('should fail when addToBasketFn is not a function', () => {
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.PDP, {
                    productId: 'prod-123',
                    quantity: 1,
                    addToBasketFn: 'not-a-function'
                })

                expect(result.valid).toBe(false)
                expect(result.errors.some(e => e.field === 'addToBasketFn')).toBe(true)
            })

            it('should not warn when isProductOrderable is not provided but auto-detection is available', () => {
                // With variationAttributes, auto-detection can work
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.PDP, {
                    productId: 'prod-123',
                    quantity: 1,
                    addToBasketFn: jest.fn(),
                    product: { variationAttributes: [{ id: 'size', name: 'Size' }] }
                })

                expect(result.valid).toBe(true)
                expect(result.warnings.some(w => w.field === 'isProductOrderable')).toBe(false)
            })

            it('should not warn when isProductOrderable is explicitly provided', () => {
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.PDP, {
                    productId: 'prod-123',
                    quantity: 1,
                    addToBasketFn: jest.fn(),
                    isProductOrderable: true
                })

                expect(result.valid).toBe(true)
                expect(result.warnings.some(w => w.field === 'isProductOrderable')).toBe(false)
            })

            it('should not warn when variant has attributes but product has variationAttributes for auto-detection', () => {
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.PDP, {
                    productId: 'prod-123',
                    quantity: 1,
                    addToBasketFn: jest.fn(),
                    isProductOrderable: false,
                    product: { variationAttributes: [{ id: 'size', name: 'Size' }] },
                    variant: { size: 'M', color: 'Blue' } // No productId but auto-detection works
                })

                expect(result.valid).toBe(true)
                expect(result.warnings.some(w => w.field === 'variant.productId')).toBe(false)
            })

            it('should not warn when variant has productId', () => {
                const result = validateContextProps(GOOGLE_PAY_CONTEXT.PDP, {
                    productId: 'prod-123',
                    quantity: 1,
                    addToBasketFn: jest.fn(),
                    isProductOrderable: true,
                    variant: { size: 'M', color: 'Blue', productId: 'variant-456' }
                })

                expect(result.valid).toBe(true)
                expect(result.warnings.some(w => w.field === 'variant.productId')).toBe(false)
            })
        })

        describe('invalid context', () => {
            it('should fail with invalid context', () => {
                const result = validateContextProps('invalid', {})

                expect(result.valid).toBe(false)
                expect(result.errors.some(e => e.field === 'context')).toBe(true)
            })
        })
    })

    // =========================================================================
    // getRequiredPropsForContext
    // =========================================================================

    describe('getRequiredPropsForContext', () => {
        it('should return checkout required props', () => {
            const props = getRequiredPropsForContext(GOOGLE_PAY_CONTEXT.CHECKOUT)
            expect(props).toContain('amount')
            expect(props).toContain('currencyCode')
        })

        it('should return cart required props', () => {
            const props = getRequiredPropsForContext(GOOGLE_PAY_CONTEXT.CART)
            expect(props).toContain('basket')
            expect(props).toContain('createOrderFn')
        })

        it('should return pdp required props', () => {
            const props = getRequiredPropsForContext(GOOGLE_PAY_CONTEXT.PDP)
            expect(props).toContain('productId')
            expect(props).toContain('quantity')
            expect(props).toContain('addToBasketFn')
        })

        it('should return empty array for unknown context', () => {
            const props = getRequiredPropsForContext('unknown')
            expect(props).toEqual([])
        })
    })

    // =========================================================================
    // getOptionalPropsForContext
    // =========================================================================

    describe('getOptionalPropsForContext', () => {
        it('should return checkout optional props', () => {
            const props = getOptionalPropsForContext(GOOGLE_PAY_CONTEXT.CHECKOUT)
            expect(props).toContain('merchantOrderNumber')
        })

        it('should return cart optional props', () => {
            const props = getOptionalPropsForContext(GOOGLE_PAY_CONTEXT.CART)
            expect(props).toContain('onShippingOptionsUpdate')
            expect(props).toContain('slasToken')
        })

        it('should return pdp optional props', () => {
            const props = getOptionalPropsForContext(GOOGLE_PAY_CONTEXT.PDP)
            expect(props).toContain('variant')
            expect(props).toContain('options')
        })
    })

    // =========================================================================
    // getAllPropsForContext
    // =========================================================================

    describe('getAllPropsForContext', () => {
        it('should return all props (required + optional)', () => {
            const allProps = getAllPropsForContext(GOOGLE_PAY_CONTEXT.CART)
            const requiredProps = getRequiredPropsForContext(GOOGLE_PAY_CONTEXT.CART)
            const optionalProps = getOptionalPropsForContext(GOOGLE_PAY_CONTEXT.CART)

            expect(allProps).toEqual([...requiredProps, ...optionalProps])
        })
    })

    // =========================================================================
    // formatValidationErrors
    // =========================================================================

    describe('formatValidationErrors', () => {
        it('should format errors into readable string', () => {
            const errors = [
                { field: 'amount', message: 'Required prop "amount" is missing' },
                { field: 'currencyCode', message: 'Required prop "currencyCode" is missing' }
            ]

            const formatted = formatValidationErrors(errors)

            expect(formatted).toContain('GooglePayButton prop validation failed')
            expect(formatted).toContain('amount')
            expect(formatted).toContain('currencyCode')
        })

        it('should return empty string for no errors', () => {
            expect(formatValidationErrors([])).toBe('')
            expect(formatValidationErrors(null)).toBe('')
        })
    })
})
