/**
 * Unit Tests for useVariantValidation Hook
 *
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react'
import { useVariantValidation } from '../useVariantValidation'

describe('useVariantValidation', () => {
    describe('non-PDP context', () => {
        it('returns orderable=true when not in PDP context', () => {
            const { result } = renderHook(() =>
                useVariantValidation({ isPDPContext: false })
            )
            expect(result.current.computedIsProductOrderable).toBe(true)
            expect(result.current.computedVariantError).toBeNull()
        })
    })

    describe('PDP context - simple product', () => {
        it('returns orderable=true for product without variation attributes', () => {
            const { result } = renderHook(() =>
                useVariantValidation({
                    isPDPContext: true,
                    product: { id: 'simple-product' },
                    variant: null
                })
            )
            expect(result.current.computedIsProductOrderable).toBe(true)
            expect(result.current.computedVariantError).toBeNull()
        })

        it('returns orderable=true for product with empty variation attributes', () => {
            const { result } = renderHook(() =>
                useVariantValidation({
                    isPDPContext: true,
                    product: { id: 'product', variationAttributes: [] },
                    variant: null
                })
            )
            expect(result.current.computedIsProductOrderable).toBe(true)
        })
    })

    describe('PDP context - variant product', () => {
        const mockProduct = {
            id: 'master-product',
            variationAttributes: [
                { id: 'color', name: 'Color' },
                { id: 'size', name: 'Size' }
            ]
        }

        it('returns orderable=false when no variant selected', () => {
            const { result } = renderHook(() =>
                useVariantValidation({
                    isPDPContext: true,
                    product: mockProduct,
                    variant: null
                })
            )
            expect(result.current.computedIsProductOrderable).toBe(false)
            expect(result.current.computedVariantError).toBe('Please select Color, Size')
        })

        it('returns orderable=false with specific error when partial selection', () => {
            const { result } = renderHook(() =>
                useVariantValidation({
                    isPDPContext: true,
                    product: mockProduct,
                    variant: {
                        productId: null,
                        variationValues: { color: 'red' }
                    }
                })
            )
            expect(result.current.computedIsProductOrderable).toBe(false)
            expect(result.current.computedVariantError).toBe('Please select Size')
        })

        it('returns orderable=true when variant fully selected', () => {
            const { result } = renderHook(() =>
                useVariantValidation({
                    isPDPContext: true,
                    product: mockProduct,
                    variant: {
                        productId: 'variant-123',
                        variationValues: { color: 'red', size: 'M' }
                    }
                })
            )
            expect(result.current.computedIsProductOrderable).toBe(true)
            expect(result.current.computedVariantError).toBeNull()
        })
    })

    describe('explicit overrides', () => {
        it('respects isProductOrderable=false prop', () => {
            const { result } = renderHook(() =>
                useVariantValidation({
                    isPDPContext: true,
                    product: { id: 'simple' },
                    variant: null,
                    isProductOrderable: false
                })
            )
            expect(result.current.computedIsProductOrderable).toBe(false)
        })

        it('uses explicit variantSelectionError when provided', () => {
            const customError = 'Custom error message'
            const { result } = renderHook(() =>
                useVariantValidation({
                    isPDPContext: true,
                    product: { variationAttributes: [{ id: 'color', name: 'Color' }] },
                    variant: null,
                    variantSelectionError: customError
                })
            )
            expect(result.current.computedVariantError).toBe(customError)
        })
    })

    describe('validationRef', () => {
        it('provides a ref with current validation state', () => {
            const { result } = renderHook(() =>
                useVariantValidation({
                    isPDPContext: true,
                    product: { id: 'simple' },
                    variant: null
                })
            )
            expect(result.current.validationRef.current).toEqual({
                isOrderable: true,
                errorMessage: null
            })
        })
    })
})
