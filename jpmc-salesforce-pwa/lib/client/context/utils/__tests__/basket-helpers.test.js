/**
 * Basket Helpers Tests
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/client/context/utils/__tests__/basket-helpers.test
 */

import { prepareBasketForOrder } from '../basket-helpers'

describe('basket-helpers', () => {
    describe('prepareBasketForOrder', () => {
        const mockBasket = {
            basketId: 'basket123',
            orderTotal: 99.99,
            paymentInstruments: [
                { paymentInstrumentId: 'pi1' },
                { paymentInstrumentId: 'pi2' }
            ],
            shipments: [{
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'New York',
                    stateCode: 'NY',
                    postalCode: '10001',
                    countryCode: 'US',
                    phone: '555-1234'
                }
            }]
        }

        let mockRemovePI
        let mockUpdateBilling
        let mockAddPI

        beforeEach(() => {
            mockRemovePI = jest.fn().mockResolvedValue({})
            mockUpdateBilling = jest.fn().mockResolvedValue({})
            mockAddPI = jest.fn().mockResolvedValue({
                paymentInstruments: [{ paymentInstrumentId: 'newPI123' }]
            })
        })

        it('should remove existing payment instruments', async () => {
            await prepareBasketForOrder({
                basket: mockBasket,
                removePaymentInstrumentFromBasket: mockRemovePI,
                updateBillingAddressForBasket: mockUpdateBilling,
                addPaymentInstrumentToBasket: mockAddPI,
                googlePayPaymentMethodId: 'GOOGLE_PAY'
            })

            expect(mockRemovePI).toHaveBeenCalledTimes(2)
            expect(mockRemovePI).toHaveBeenCalledWith({
                parameters: {
                    basketId: 'basket123',
                    paymentInstrumentId: 'pi1'
                }
            })
            expect(mockRemovePI).toHaveBeenCalledWith({
                parameters: {
                    basketId: 'basket123',
                    paymentInstrumentId: 'pi2'
                }
            })
        })

        it('should update billing address from shipping address', async () => {
            await prepareBasketForOrder({
                basket: mockBasket,
                removePaymentInstrumentFromBasket: mockRemovePI,
                updateBillingAddressForBasket: mockUpdateBilling,
                addPaymentInstrumentToBasket: mockAddPI,
                googlePayPaymentMethodId: 'GOOGLE_PAY'
            })

            expect(mockUpdateBilling).toHaveBeenCalledWith({
                parameters: { basketId: 'basket123' },
                body: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'New York',
                    stateCode: 'NY',
                    postalCode: '10001',
                    countryCode: 'US',
                    phone: '555-1234'
                }
            })
        })

        it('should add payment instrument and return ID', async () => {
            const result = await prepareBasketForOrder({
                basket: mockBasket,
                removePaymentInstrumentFromBasket: mockRemovePI,
                updateBillingAddressForBasket: mockUpdateBilling,
                addPaymentInstrumentToBasket: mockAddPI,
                googlePayPaymentMethodId: 'GOOGLE_PAY'
            })

            expect(mockAddPI).toHaveBeenCalledWith({
                parameters: { basketId: 'basket123' },
                body: {
                    amount: 99.99,
                    paymentMethodId: 'GOOGLE_PAY'
                }
            })

            expect(result).toBe('newPI123')
        })

        it('should skip remove if no existing payment instruments', async () => {
            const basketNoPI = { ...mockBasket, paymentInstruments: [] }

            await prepareBasketForOrder({
                basket: basketNoPI,
                removePaymentInstrumentFromBasket: mockRemovePI,
                updateBillingAddressForBasket: mockUpdateBilling,
                addPaymentInstrumentToBasket: mockAddPI,
                googlePayPaymentMethodId: 'GOOGLE_PAY'
            })

            expect(mockRemovePI).not.toHaveBeenCalled()
        })

        it('should skip billing update if no shipping address', async () => {
            const basketNoShipping = { ...mockBasket, shipments: [] }

            await prepareBasketForOrder({
                basket: basketNoShipping,
                removePaymentInstrumentFromBasket: mockRemovePI,
                updateBillingAddressForBasket: mockUpdateBilling,
                addPaymentInstrumentToBasket: mockAddPI,
                googlePayPaymentMethodId: 'GOOGLE_PAY'
            })

            expect(mockUpdateBilling).not.toHaveBeenCalled()
        })

        it('should return null if addPaymentInstrumentToBasket returns no instruments', async () => {
            mockAddPI.mockResolvedValue({ paymentInstruments: [] })

            const result = await prepareBasketForOrder({
                basket: mockBasket,
                removePaymentInstrumentFromBasket: mockRemovePI,
                updateBillingAddressForBasket: mockUpdateBilling,
                addPaymentInstrumentToBasket: mockAddPI,
                googlePayPaymentMethodId: 'GOOGLE_PAY'
            })

            expect(result).toBeNull()
        })

        it('should handle missing removePaymentInstrumentFromBasket function', async () => {
            await prepareBasketForOrder({
                basket: mockBasket,
                removePaymentInstrumentFromBasket: null,
                updateBillingAddressForBasket: mockUpdateBilling,
                addPaymentInstrumentToBasket: mockAddPI,
                googlePayPaymentMethodId: 'GOOGLE_PAY'
            })

            // Should not throw, just skip the remove step
            expect(mockAddPI).toHaveBeenCalled()
        })

        it('should handle missing updateBillingAddressForBasket function', async () => {
            await prepareBasketForOrder({
                basket: mockBasket,
                removePaymentInstrumentFromBasket: mockRemovePI,
                updateBillingAddressForBasket: null,
                addPaymentInstrumentToBasket: mockAddPI,
                googlePayPaymentMethodId: 'GOOGLE_PAY'
            })

            // Should not throw, just skip the billing update step
            expect(mockAddPI).toHaveBeenCalled()
        })
    })
})
