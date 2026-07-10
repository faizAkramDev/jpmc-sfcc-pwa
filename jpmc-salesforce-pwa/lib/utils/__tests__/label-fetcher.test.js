/**
 * Tests for label-fetcher utility
 */

import { getDisplayItemLabels } from '../label-fetcher'

describe('getDisplayItemLabels', () => {
    it('should return English defaults when intl is not provided', () => {
        const result = getDisplayItemLabels()

        expect(result).toEqual({
            subtotal: 'Subtotal',
            shipping: 'Shipping',
            tax: 'Tax',
            discount: 'Discount'
        })
    })

    it('should return English defaults when intl is null', () => {
        const result = getDisplayItemLabels(null)

        expect(result).toEqual({
            subtotal: 'Subtotal',
            shipping: 'Shipping',
            tax: 'Tax',
            discount: 'Discount'
        })
    })

    it('should use intl.formatMessage when intl is provided', () => {
        const mockIntl = {
            formatMessage: jest.fn((msg) => {
                const translations = {
                    'checkout_confirmation.label.subtotal': 'Sous-total',
                    'checkout_confirmation.label.shipping': 'Livraison',
                    'checkout_confirmation.label.tax': 'Impôt',
                    'checkout_confirmation.label.discount': 'Remise'
                }
                return translations[msg.id] || msg.id
            })
        }

        const result = getDisplayItemLabels(mockIntl)

        expect(result).toEqual({
            subtotal: 'Sous-total',
            shipping: 'Livraison',
            tax: 'Impôt',
            discount: 'Remise'
        })
    })

    it('should call formatMessage with correct message IDs', () => {
        const mockIntl = {
            formatMessage: jest.fn(() => 'translated')
        }

        getDisplayItemLabels(mockIntl)

        expect(mockIntl.formatMessage).toHaveBeenCalledWith({
            id: 'checkout_confirmation.label.subtotal'
        })
        expect(mockIntl.formatMessage).toHaveBeenCalledWith({
            id: 'checkout_confirmation.label.shipping'
        })
        expect(mockIntl.formatMessage).toHaveBeenCalledWith({
            id: 'checkout_confirmation.label.tax'
        })
        expect(mockIntl.formatMessage).toHaveBeenCalledWith({
            id: 'checkout_confirmation.label.discount'
        })
    })

    it('should call formatMessage exactly 4 times when intl provided', () => {
        const mockIntl = {
            formatMessage: jest.fn(() => 'translated')
        }

        getDisplayItemLabels(mockIntl)

        expect(mockIntl.formatMessage).toHaveBeenCalledTimes(4)
    })

    it('should return object with all required label keys', () => {
        const result = getDisplayItemLabels()

        expect(result).toHaveProperty('subtotal')
        expect(result).toHaveProperty('shipping')
        expect(result).toHaveProperty('tax')
        expect(result).toHaveProperty('discount')
    })

    it('should return object with all required label keys when intl provided', () => {
        const mockIntl = {
            formatMessage: jest.fn(() => 'label')
        }

        const result = getDisplayItemLabels(mockIntl)

        expect(result).toHaveProperty('subtotal')
        expect(result).toHaveProperty('shipping')
        expect(result).toHaveProperty('tax')
        expect(result).toHaveProperty('discount')
    })
})
