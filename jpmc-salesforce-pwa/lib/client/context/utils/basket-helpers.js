/**
 * Basket Helpers
 * 
 * Shared helper functions for basket operations.
 * Used by JPMCCheckoutProvider for checkout page Google Pay flows.
 * For PDP/Cart express checkout, integrators handle basket operations directly.
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/client/context/utils/basket-helpers
 * @internal
 */

/**
 * Prepare basket for order creation by removing existing payment instruments
 * and adding a new one for Google Pay
 * 
 * @param {object} options
 * @param {object} options.basket - Current basket data
 * @param {function} options.removePaymentInstrumentFromBasket - Function to remove PI
 * @param {function} options.updateBillingAddressForBasket - Function to update billing address
 * @param {function} options.addPaymentInstrumentToBasket - Function to add PI
 * @param {string} options.googlePayPaymentMethodId - Payment method ID for Google Pay
 * @returns {Promise<string|null>} Payment instrument ID or null
 */
export const prepareBasketForOrder = async ({
    basket,
    removePaymentInstrumentFromBasket,
    updateBillingAddressForBasket,
    addPaymentInstrumentToBasket,
    googlePayPaymentMethodId
}) => {
    // Remove any existing payment instruments (SFCC allows one per basket)
    if (removePaymentInstrumentFromBasket && basket.paymentInstruments?.length > 0) {
        for (const pi of basket.paymentInstruments) {
            await removePaymentInstrumentFromBasket({
                parameters: {
                    basketId: basket.basketId,
                    paymentInstrumentId: pi.paymentInstrumentId
                }
            })
        }
    }
    
    // Copy billing address from shipping if available
    if (updateBillingAddressForBasket && basket.shipments?.[0]?.shippingAddress) {
        const shippingAddress = basket.shipments[0].shippingAddress
        await updateBillingAddressForBasket({
            parameters: { basketId: basket.basketId },
            body: {
                firstName: shippingAddress.firstName,
                lastName: shippingAddress.lastName,
                address1: shippingAddress.address1,
                city: shippingAddress.city,
                stateCode: shippingAddress.stateCode,
                postalCode: shippingAddress.postalCode,
                countryCode: shippingAddress.countryCode,
                phone: shippingAddress.phone
            }
        })
    }
    
    // Add payment instrument and return the ID
    const piResult = await addPaymentInstrumentToBasket({
        parameters: { basketId: basket.basketId },
        body: {
            amount: basket.orderTotal,
            paymentMethodId: googlePayPaymentMethodId
        }
    })
    
    return piResult?.paymentInstruments?.[0]?.paymentInstrumentId || null
}
