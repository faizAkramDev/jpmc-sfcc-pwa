/**
 * Fraud Helpers Tests
 * 
 * Tests for fraud check payload builder functions
 */

import {
    buildFraudShoppingCart,
    mapShipToForFraud
} from '../fraud-helpers.js'

describe('fraud-helpers', () => {
    // ==========================================================================
    // buildFraudShoppingCart Tests
    // ==========================================================================
    
    describe('buildFraudShoppingCart', () => {
        it('should build cart string from product items', () => {
            const productItems = [
                {
                    productId: 'PROD-001',
                    productName: 'Blue T-Shirt',
                    quantity: 2,
                    adjustedPrice: 29.99
                },
                {
                    productId: 'PROD-002',
                    productName: 'Jeans',
                    quantity: 1,
                    price: 49.99
                }
            ]

            const result = buildFraudShoppingCart(productItems)

            // T=type&I=itemId&D=description&Q=qty&P=priceCents&|
            expect(result).toContain('T=Product')
            expect(result).toContain('I=PROD-001')
            expect(result).toContain('D=Blue%20T-Shirt')
            expect(result).toContain('Q=2')
            expect(result).toContain('P=2999') // 29.99 * 100 = 2999 cents
            expect(result).toContain('I=PROD-002')
            expect(result).toContain('D=Jeans')
            expect(result).toContain('Q=1')
            expect(result).toContain('P=4999') // 49.99 * 100 = 4999 cents
        })

        it('should use itemId if productId is not available', () => {
            const productItems = [
                {
                    itemId: 'ITEM-123',
                    productName: 'Widget',
                    quantity: 1,
                    price: 10.00
                }
            ]

            const result = buildFraudShoppingCart(productItems)

            expect(result).toContain('I=ITEM-123')
        })

        it('should use name if productName is not available', () => {
            const productItems = [
                {
                    productId: 'PROD-001',
                    name: 'Gadget',
                    quantity: 1,
                    price: 15.00
                }
            ]

            const result = buildFraudShoppingCart(productItems)

            expect(result).toContain('D=Gadget')
        })

        it('should truncate description to 50 characters', () => {
            const productItems = [
                {
                    productId: 'PROD-001',
                    productName: 'This is a very long product name that exceeds the maximum allowed length for fraud check',
                    quantity: 1,
                    price: 10.00
                }
            ]

            const result = buildFraudShoppingCart(productItems)

            // Get the D= portion and decode it
            const match = result.match(/D=([^&]+)/)
            expect(match).toBeTruthy()
            const decodedDesc = decodeURIComponent(match[1])
            expect(decodedDesc.length).toBeLessThanOrEqual(50)
        })

        it('should default quantity to 1 if not provided', () => {
            const productItems = [
                {
                    productId: 'PROD-001',
                    productName: 'Widget',
                    price: 10.00
                }
            ]

            const result = buildFraudShoppingCart(productItems)

            expect(result).toContain('Q=1')
        })

        it('should use adjustedPrice over price when both are available', () => {
            const productItems = [
                {
                    productId: 'PROD-001',
                    productName: 'Sale Item',
                    quantity: 1,
                    adjustedPrice: 7.99,
                    price: 9.99
                }
            ]

            const result = buildFraudShoppingCart(productItems)

            // adjustedPrice of 7.99 = 799 cents
            expect(result).toContain('P=799')
        })

        it('should default price to 0 if not provided', () => {
            const productItems = [
                {
                    productId: 'PROD-001',
                    productName: 'Free Item',
                    quantity: 1
                }
            ]

            const result = buildFraudShoppingCart(productItems)

            expect(result).toContain('P=0')
        })

        it('should return empty string for null productItems', () => {
            const result = buildFraudShoppingCart(null)
            expect(result).toBe('')
        })

        it('should return empty string for undefined productItems', () => {
            const result = buildFraudShoppingCart(undefined)
            expect(result).toBe('')
        })

        it('should return empty string for empty array', () => {
            const result = buildFraudShoppingCart([])
            expect(result).toBe('')
        })

        it('should truncate result to 999 characters (JPMC max length)', () => {
            // Create many items to exceed 999 chars
            const productItems = Array.from({ length: 50 }, (_, i) => ({
                productId: `PROD-${String(i).padStart(3, '0')}`,
                productName: `Product Number ${i} with a longer name`,
                quantity: i + 1,
                price: 99.99
            }))

            const result = buildFraudShoppingCart(productItems)

            expect(result.length).toBeLessThanOrEqual(999)
        })

        it('should handle empty strings in fields gracefully', () => {
            const productItems = [
                {
                    productId: '',
                    productName: '',
                    quantity: 1,
                    price: 10.00
                }
            ]

            const result = buildFraudShoppingCart(productItems)

            expect(result).toContain('T=Product')
            expect(result).toContain('I=')
            expect(result).toContain('D=')
            expect(result).toContain('P=1000')
        })

        it('should URL encode special characters in product name', () => {
            const productItems = [
                {
                    productId: 'PROD-001',
                    productName: 'T-Shirt & Jeans (Set)',
                    quantity: 1,
                    price: 50.00
                }
            ]

            const result = buildFraudShoppingCart(productItems)

            // Should be URL encoded
            expect(result).toContain('T-Shirt%20%26%20Jeans%20(Set)')
        })

        it('should round quantity to integer', () => {
            const productItems = [
                {
                    productId: 'PROD-001',
                    productName: 'Item',
                    quantity: 2.7,
                    price: 10.00
                }
            ]

            const result = buildFraudShoppingCart(productItems)

            expect(result).toContain('Q=3')
        })

        it('should round price to integer cents', () => {
            const productItems = [
                {
                    productId: 'PROD-001',
                    productName: 'Item',
                    quantity: 1,
                    price: 10.555
                }
            ]

            const result = buildFraudShoppingCart(productItems)

            // 10.555 * 100 = 1055.5, rounded to 1056
            expect(result).toContain('P=1056')
        })
    })

    // ==========================================================================
    // mapShipToForFraud Tests
    // ==========================================================================
    
    describe('mapShipToForFraud', () => {
        it('should map basket shipping address to fraud shipTo format', () => {
            const basket = {
                shipments: [
                    {
                        shippingAddress: {
                            firstName: 'John',
                            lastName: 'Doe',
                            address1: '123 Main St',
                            address2: 'Apt 4B',
                            city: 'New York',
                            stateCode: 'NY',
                            postalCode: '10001',
                            countryCode: 'US',
                            phone: '555-123-4567'
                        },
                        shippingMethod: {
                            name: 'Ground Shipping'
                        }
                    }
                ]
            }

            const result = mapShipToForFraud(basket)

            expect(result).toEqual({
                firstName: 'John',
                lastName: 'Doe',
                address1: '123 Main St',
                address2: 'Apt 4B',
                city: 'New York',
                stateCode: 'NY',
                postalCode: '10001',
                countryCode: 'US',
                phone: '555-123-4567',
                shippingDescription: 'Ground Shipping'
            })
        })

        it('should handle missing address2', () => {
            const basket = {
                shipments: [
                    {
                        shippingAddress: {
                            firstName: 'Jane',
                            lastName: 'Smith',
                            address1: '456 Oak Ave',
                            city: 'Los Angeles',
                            stateCode: 'CA',
                            postalCode: '90001',
                            countryCode: 'US'
                        },
                        shippingMethod: {
                            name: 'Express'
                        }
                    }
                ]
            }

            const result = mapShipToForFraud(basket)

            expect(result.address2).toBeUndefined()
            expect(result.firstName).toBe('Jane')
        })

        it('should handle missing shipping method', () => {
            const basket = {
                shipments: [
                    {
                        shippingAddress: {
                            firstName: 'Bob',
                            lastName: 'Johnson',
                            address1: '789 Pine St',
                            city: 'Chicago',
                            stateCode: 'IL',
                            postalCode: '60601',
                            countryCode: 'US'
                        }
                    }
                ]
            }

            const result = mapShipToForFraud(basket)

            expect(result.shippingDescription).toBeUndefined()
        })

        it('should return null if basket is null', () => {
            const result = mapShipToForFraud(null)
            expect(result).toBeNull()
        })

        it('should return null if basket is undefined', () => {
            const result = mapShipToForFraud(undefined)
            expect(result).toBeNull()
        })

        it('should return null if basket has no shipments', () => {
            const basket = {}
            const result = mapShipToForFraud(basket)
            expect(result).toBeNull()
        })

        it('should return null if shipments array is empty', () => {
            const basket = { shipments: [] }
            const result = mapShipToForFraud(basket)
            expect(result).toBeNull()
        })

        it('should return null if first shipment has no shipping address', () => {
            const basket = {
                shipments: [
                    {
                        shippingMethod: { name: 'Standard' }
                    }
                ]
            }
            const result = mapShipToForFraud(basket)
            expect(result).toBeNull()
        })

        it('should use first shipment when multiple exist', () => {
            const basket = {
                shipments: [
                    {
                        shippingAddress: {
                            firstName: 'First',
                            lastName: 'Shipment',
                            address1: '111 First St',
                            city: 'Boston',
                            stateCode: 'MA',
                            postalCode: '02101',
                            countryCode: 'US'
                        },
                        shippingMethod: { name: 'Priority' }
                    },
                    {
                        shippingAddress: {
                            firstName: 'Second',
                            lastName: 'Shipment',
                            address1: '222 Second St',
                            city: 'Miami',
                            stateCode: 'FL',
                            postalCode: '33101',
                            countryCode: 'US'
                        },
                        shippingMethod: { name: 'Standard' }
                    }
                ]
            }

            const result = mapShipToForFraud(basket)

            expect(result.firstName).toBe('First')
            expect(result.address1).toBe('111 First St')
            expect(result.shippingDescription).toBe('Priority')
        })
    })
})
