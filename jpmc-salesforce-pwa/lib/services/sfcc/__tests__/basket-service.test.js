/**
 * Unit Tests for SFCC Basket Service
 *
 * @jest-environment node
 */

const {
    translateGooglePayAddressToSFCC,
    translateSFCCShippingMethodToGooglePay,
    buildDisplayItemsFromBasket,
    buildGooglePayShippingResponse,
    buildGooglePayErrorResponse
} = require('../basket-service')

// =============================================================================
// Mock Setup
// =============================================================================

// Mock fetch
global.fetch = jest.fn()

// Mock logger
jest.mock('../../../utils/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}))

// Mock environment variables
const originalEnv = process.env

beforeEach(() => {
    jest.clearAllMocks()
    process.env = {
        ...originalEnv,
        COMMERCE_API_SHORT_CODE: 'test-short-code',
        COMMERCE_API_ORG_ID: 'test-org-id',
        COMMERCE_API_SITE_ID: 'TestSite'
    }
})

afterEach(() => {
    process.env = originalEnv
})

// =============================================================================
// Address Translator Tests
// =============================================================================

describe('translateGooglePayAddressToSFCC', () => {
    it('should convert Google Pay address to SFCC format', () => {
        const gpayAddress = {
            name: 'John Doe',
            address1: '123 Main St',
            address2: 'Apt 4B',
            locality: 'San Francisco',
            administrativeArea: 'CA',
            countryCode: 'US',
            postalCode: '94105',
            phoneNumber: '+1-555-123-4567'
        }

        const result = translateGooglePayAddressToSFCC(gpayAddress)

        expect(result).toEqual({
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Main St',
            address2: 'Apt 4B',
            city: 'San Francisco',
            stateCode: 'CA',
            countryCode: 'US',
            postalCode: '94105',
            phone: '+1-555-123-4567'
        })
    })

    it('should handle single name (first name only)', () => {
        const gpayAddress = {
            name: 'Madonna',
            address1: '100 Celebrity Lane',
            locality: 'Los Angeles',
            administrativeArea: 'CA',
            countryCode: 'US',
            postalCode: '90001'
        }

        const result = translateGooglePayAddressToSFCC(gpayAddress)

        expect(result.firstName).toBe('Madonna')
        expect(result.lastName).toBe('Pay')
    })

    it('should handle multi-part names', () => {
        const gpayAddress = {
            name: 'Jean Claude Van Damme',
            address1: '456 Action St',
            locality: 'Hollywood',
            administrativeArea: 'CA',
            countryCode: 'US',
            postalCode: '90028'
        }

        const result = translateGooglePayAddressToSFCC(gpayAddress)

        expect(result.firstName).toBe('Jean')
        expect(result.lastName).toBe('Claude Van Damme')
    })

    it('should handle null address', () => {
        expect(translateGooglePayAddressToSFCC(null)).toBeNull()
    })

    it('should handle undefined address', () => {
        expect(translateGooglePayAddressToSFCC(undefined)).toBeNull()
    })

    it('should handle empty name', () => {
        const gpayAddress = {
            name: '',
            address1: '789 Empty Name Rd',
            locality: 'Nowhere',
            administrativeArea: 'TX',
            countryCode: 'US',
            postalCode: '12345'
        }

        const result = translateGooglePayAddressToSFCC(gpayAddress)

        expect(result.firstName).toBe('Google')
        expect(result.lastName).toBe('Pay')
    })

    it('should handle missing optional fields', () => {
        const gpayAddress = {
            name: 'Jane Smith',
            address1: '100 Simple St',
            locality: 'Simple City',
            administrativeArea: 'NY',
            countryCode: 'US',
            postalCode: '10001'
        }

        const result = translateGooglePayAddressToSFCC(gpayAddress)

        expect(result.address2).toBe('')
        expect(result.phone).toBe('')
    })
})

// =============================================================================
// Shipping Method Translator Tests
// =============================================================================

describe('translateSFCCShippingMethodToGooglePay', () => {
    it('should convert SFCC shipping method to Google Pay format', () => {
        const sfccMethod = {
            id: 'standard',
            name: 'Standard Shipping',
            description: '5-7 business days',
            price: 5.99
        }

        const result = translateSFCCShippingMethodToGooglePay(sfccMethod)

        expect(result).toEqual({
            id: 'standard',
            label: 'Standard Shipping',
            description: '5-7 business days - $5.99'
        })
    })

    it('should handle zero price', () => {
        const sfccMethod = {
            id: 'free-shipping',
            name: 'Free Shipping',
            description: '7-10 business days',
            price: 0
        }

        const result = translateSFCCShippingMethodToGooglePay(sfccMethod)

        expect(result).toEqual({
            id: 'free-shipping',
            label: 'Free Shipping',
            description: '7-10 business days - $0.00'
        })
    })

    it('should handle missing description', () => {
        const sfccMethod = {
            id: 'express',
            name: 'Express Shipping',
            price: 15.99
        }

        const result = translateSFCCShippingMethodToGooglePay(sfccMethod)

        expect(result).toEqual({
            id: 'express',
            label: 'Express Shipping',
            description: '$15.99'
        })
    })

    it('should handle missing price', () => {
        const sfccMethod = {
            id: 'pickup',
            name: 'Store Pickup',
            description: 'Available today'
        }

        const result = translateSFCCShippingMethodToGooglePay(sfccMethod)

        expect(result).toEqual({
            id: 'pickup',
            label: 'Store Pickup',
            description: 'Available today'
        })
    })

    it('should use ID as label when name is missing', () => {
        const sfccMethod = {
            id: 'overnight',
            price: 29.99
        }

        const result = translateSFCCShippingMethodToGooglePay(sfccMethod)

        expect(result.label).toBe('overnight')
    })

    it('should handle null method', () => {
        expect(translateSFCCShippingMethodToGooglePay(null)).toBeNull()
    })

    it('should handle undefined method', () => {
        expect(translateSFCCShippingMethodToGooglePay(undefined)).toBeNull()
    })
})

// =============================================================================
// Display Items Builder Tests
// =============================================================================

describe('buildDisplayItemsFromBasket', () => {
    it('should build display items from basket totals', () => {
        const basket = {
            productSubTotal: 89.99,
            shippingTotal: 5.99,
            taxTotal: 7.50
        }

        const result = buildDisplayItemsFromBasket(basket)

        expect(result).toEqual([
            { label: 'Subtotal', type: 'SUBTOTAL', price: '89.99' },
            { label: 'Shipping', type: 'LINE_ITEM', price: '5.99', status: 'FINAL' },
            { label: 'Tax', type: 'TAX', price: '7.5' }
        ])
    })

    it('should mark zero shipping as PENDING and omit status for TAX type', () => {
        const basket = {
            productSubTotal: 89.99,
            shippingTotal: 0,
            taxTotal: 0
        }

        const result = buildDisplayItemsFromBasket(basket)

        expect(result[1]).toEqual({
            label: 'Shipping',
            type: 'LINE_ITEM',
            price: '0',
            status: 'PENDING'
        })
        // TAX type does not support status field per Google Pay API
        expect(result[2]).toEqual({
            label: 'Tax',
            type: 'TAX',
            price: '0'
        })
    })

    it('should include order price adjustments as discounts', () => {
        const basket = {
            productSubTotal: 100.00,
            shippingTotal: 5.99,
            taxTotal: 7.50,
            orderPriceAdjustments: [
                { itemText: '10% Off Coupon', price: -10.00 },
                { price: -5.00 }
            ]
        }

        const result = buildDisplayItemsFromBasket(basket)

        expect(result).toContainEqual({
            label: 'Discount',
            type: 'LINE_ITEM',
            price: '-10'
        })
        expect(result).toContainEqual({
            label: 'Discount',
            type: 'LINE_ITEM',
            price: '-5'
        })
    })

    it('should handle empty basket', () => {
        const basket = {}

        const result = buildDisplayItemsFromBasket(basket)

        expect(result).toEqual([])
    })
})

// =============================================================================
// Shipping Response Builder Tests
// =============================================================================

describe('buildGooglePayShippingResponse', () => {
    it('should build complete shipping response', () => {
        const basket = {
            orderTotal: 103.48,
            productSubTotal: 89.99,
            shippingTotal: 5.99,
            taxTotal: 7.50,
            currency: 'USD'
        }

        const shippingMethods = [
            { id: 'standard', name: 'Standard', description: '5-7 days', price: 5.99 },
            { id: 'express', name: 'Express', description: '2-3 days', price: 15.99 }
        ]

        const result = buildGooglePayShippingResponse(basket, shippingMethods, 'standard', 'ESTIMATED')

        expect(result.newShippingOptionParameters.defaultSelectedOptionId).toBe('standard')
        expect(result.newShippingOptionParameters.shippingOptions).toHaveLength(2)
        expect(result.newTransactionInfo.totalPriceStatus).toBe('ESTIMATED')
        expect(result.newTransactionInfo.totalPrice).toBe('103.48')
        expect(result.newTransactionInfo.totalPriceLabel).toBe('Est. Total')
        expect(result.newTransactionInfo.currencyCode).toBe('USD')
    })

    it('should use FINAL label when totalPriceStatus is FINAL', () => {
        const basket = { orderTotal: 100.00, currency: 'USD' }
        const shippingMethods = [{ id: 'standard', name: 'Standard' }]

        const result = buildGooglePayShippingResponse(basket, shippingMethods, 'standard', 'FINAL')

        expect(result.newTransactionInfo.totalPriceLabel).toBe('Total')
    })

    it('should default to first shipping option when no default specified', () => {
        const basket = { orderTotal: 50.00, currency: 'USD' }
        const shippingMethods = [
            { id: 'standard', name: 'Standard' },
            { id: 'express', name: 'Express' }
        ]

        const result = buildGooglePayShippingResponse(basket, shippingMethods)

        expect(result.newShippingOptionParameters.defaultSelectedOptionId).toBe('standard')
    })

    it('should use productSubTotal when orderTotal is missing', () => {
        const basket = { productSubTotal: 75.00, currency: 'EUR' }
        const shippingMethods = []

        const result = buildGooglePayShippingResponse(basket, shippingMethods)

        expect(result.newTransactionInfo.totalPrice).toBe('75')
    })

    it('should default currency to USD', () => {
        const basket = { orderTotal: 100.00 }
        const shippingMethods = []

        const result = buildGooglePayShippingResponse(basket, shippingMethods)

        expect(result.newTransactionInfo.currencyCode).toBe('USD')
    })
})

// =============================================================================
// Error Response Builder Tests
// =============================================================================

describe('buildGooglePayErrorResponse', () => {
    it('should build error response with all fields', () => {
        const result = buildGooglePayErrorResponse(
            'SHIPPING_ADDRESS_UNSERVICEABLE',
            'Cannot ship to this address',
            'SHIPPING_ADDRESS'
        )

        expect(result).toEqual({
            error: {
                reason: 'SHIPPING_ADDRESS_UNSERVICEABLE',
                message: 'Cannot ship to this address',
                intent: 'SHIPPING_ADDRESS'
            }
        })
    })

    it('should handle shipping option errors', () => {
        const result = buildGooglePayErrorResponse(
            'SHIPPING_OPTION_INVALID',
            'Selected option no longer available',
            'SHIPPING_OPTION'
        )

        expect(result.error.reason).toBe('SHIPPING_OPTION_INVALID')
        expect(result.error.intent).toBe('SHIPPING_OPTION')
    })

    it('should handle payment authorization errors', () => {
        const result = buildGooglePayErrorResponse(
            'PAYMENT_DATA_INVALID',
            'Payment declined',
            'PAYMENT_AUTHORIZATION'
        )

        expect(result.error.intent).toBe('PAYMENT_AUTHORIZATION')
    })
})

// =============================================================================
// Basket API Operation Tests
// =============================================================================

const {
    updateShippingAddress,
    getShippingMethods,
    setShippingMethod,
    getBasket,
    updateCustomerEmail,
    updateBillingAddress
} = require('../basket-service')

describe('updateShippingAddress', () => {
    const mockBasket = {
        basketId: 'basket-123',
        shipments: [{ shipmentId: 'shipment-001' }]
    }
    
    const mockAddress = {
        firstName: 'John',
        lastName: 'Doe',
        address1: '123 Main St',
        city: 'New York',
        stateCode: 'NY',
        postalCode: '10001',
        countryCode: 'US'
    }

    it('should update shipping address on basket', async () => {
        // First call: get basket
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockBasket)
        })
        // Second call: update shipment
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({})
        })
        // Third call: get updated basket
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ ...mockBasket, shipments: [{ shippingAddress: mockAddress }] })
        })

        const result = await updateShippingAddress('basket-123', mockAddress, 'slas-token')

        expect(result.shipments[0].shippingAddress).toEqual(mockAddress)
        expect(global.fetch).toHaveBeenCalledTimes(3)
    })

    it('should use "me" as default shipment ID when no shipments exist', async () => {
        const basketWithoutShipments = { basketId: 'basket-123' }
        
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(basketWithoutShipments)
        })
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({})
        })
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(basketWithoutShipments)
        })

        await updateShippingAddress('basket-123', mockAddress, 'slas-token')

        // Check that /shipments/me was used
        const updateCall = global.fetch.mock.calls[1]
        expect(updateCall[0]).toContain('/shipments/me')
    })

    it('should throw error when basket fetch fails', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            text: () => Promise.resolve('Basket not found')
        })

        await expect(updateShippingAddress('basket-123', mockAddress, 'slas-token'))
            .rejects.toThrow('Failed to fetch basket: 404')
    })

    it('should throw error when shipment update fails', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockBasket)
        })
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            text: () => Promise.resolve('Invalid address')
        })

        await expect(updateShippingAddress('basket-123', mockAddress, 'slas-token'))
            .rejects.toThrow('Failed to update shipping address: 400')
    })

    it('should throw error when fetching updated basket fails', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockBasket)
        })
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({})
        })
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Server error')
        })

        await expect(updateShippingAddress('basket-123', mockAddress, 'slas-token'))
            .rejects.toThrow('Failed to fetch updated basket: 500')
    })
})

describe('getShippingMethods', () => {
    it('should fetch shipping methods for a basket', async () => {
        const mockShippingMethods = {
            applicableShippingMethods: [
                { id: 'standard', name: 'Standard Shipping' },
                { id: 'express', name: 'Express Shipping' }
            ],
            defaultShippingMethodId: 'standard'
        }

        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockShippingMethods)
        })

        const result = await getShippingMethods('basket-123', 'slas-token')

        expect(result.applicableShippingMethods).toHaveLength(2)
        expect(result.defaultShippingMethodId).toBe('standard')
    })

    it('should use custom shipment ID when provided', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ applicableShippingMethods: [] })
        })

        await getShippingMethods('basket-123', 'slas-token', 'custom-shipment-id')

        expect(global.fetch.mock.calls[0][0]).toContain('/shipments/custom-shipment-id/shipping-methods')
    })

    it('should throw error when fetch fails', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            text: () => Promise.resolve('Basket not found')
        })

        await expect(getShippingMethods('basket-123', 'slas-token'))
            .rejects.toThrow('Failed to fetch shipping methods: 404')
    })
})

describe('setShippingMethod', () => {
    it('should set shipping method on a basket', async () => {
        // First call: PATCH to set method
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({})
        })
        // Second call: GET updated basket
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                basketId: 'basket-123',
                shipments: [{ shippingMethod: { id: 'express' } }]
            })
        })

        const result = await setShippingMethod('basket-123', 'express', 'slas-token')

        expect(result.shipments[0].shippingMethod.id).toBe('express')
    })

    it('should throw error when PATCH fails', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            text: () => Promise.resolve('Invalid shipping method')
        })

        await expect(setShippingMethod('basket-123', 'invalid-method', 'slas-token'))
            .rejects.toThrow('Failed to set shipping method: 400')
    })

    it('should throw error when fetching updated basket fails', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({})
        })
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Server error')
        })

        await expect(setShippingMethod('basket-123', 'express', 'slas-token'))
            .rejects.toThrow('Failed to fetch updated basket: 500')
    })
})

describe('getBasket', () => {
    it('should fetch basket details', async () => {
        const mockBasket = {
            basketId: 'basket-123',
            orderTotal: 99.99,
            currency: 'USD'
        }

        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockBasket)
        })

        const result = await getBasket('basket-123', 'slas-token')

        expect(result.basketId).toBe('basket-123')
        expect(result.orderTotal).toBe(99.99)
    })

    it('should throw error when fetch fails', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            text: () => Promise.resolve('Basket not found')
        })

        await expect(getBasket('nonexistent', 'slas-token'))
            .rejects.toThrow('Failed to fetch basket: 404')
    })
})

describe('updateCustomerEmail', () => {
    it('should update customer email on basket', async () => {
        const mockBasket = {
            basketId: 'basket-123',
            customerInfo: { email: 'test@example.com' }
        }

        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockBasket)
        })

        const result = await updateCustomerEmail('basket-123', 'test@example.com', 'slas-token')

        expect(result.customerInfo.email).toBe('test@example.com')
        
        // Verify correct endpoint was called
        expect(global.fetch.mock.calls[0][0]).toContain('/customer')
    })

    it('should throw error when update fails', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            text: () => Promise.resolve('Invalid email')
        })

        await expect(updateCustomerEmail('basket-123', 'invalid-email', 'slas-token'))
            .rejects.toThrow('Failed to update customer email: 400')
    })
})

describe('updateBillingAddress', () => {
    const mockAddress = {
        firstName: 'John',
        lastName: 'Doe',
        address1: '123 Billing St',
        city: 'New York',
        stateCode: 'NY',
        postalCode: '10001',
        countryCode: 'US'
    }

    it('should update billing address on basket', async () => {
        const mockBasket = {
            basketId: 'basket-123',
            billingAddress: mockAddress
        }

        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockBasket)
        })

        const result = await updateBillingAddress('basket-123', mockAddress, 'slas-token')

        expect(result.billingAddress).toEqual(mockAddress)
        expect(global.fetch.mock.calls[0][0]).toContain('/billing-address')
    })

    it('should throw error when update fails', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            text: () => Promise.resolve('Invalid address')
        })

        await expect(updateBillingAddress('basket-123', mockAddress, 'slas-token'))
            .rejects.toThrow('Failed to update billing address: 400')
    })
})
