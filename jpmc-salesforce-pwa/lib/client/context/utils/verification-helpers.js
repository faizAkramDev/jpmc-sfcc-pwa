/**
 * Verification Helpers
 * 
 * Shared helper functions for card verification flow.
 * Used by both useVerifyPayment hook and JPMCCheckoutProvider.
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/client/context/utils/verification-helpers
 * @internal
 */

/**
 * Encrypt card data using PIE SDK or return plain card data
 * 
 * @param {object} options
 * @param {object} options.cardData - Card data to encrypt
 * @param {boolean} options.isPIEReady - Whether PIE SDK is ready
 * @param {function} options.pieEncrypt - PIE SDK encrypt function
 * @returns {object} Encrypted or plain card data
 * @throws {Error} If encryption fails
 */
export const encryptCardForVerification = ({ cardData, isPIEReady, pieEncrypt }) => {
    if (isPIEReady) {
        const encrypted = pieEncrypt({
            cardNumber: cardData.cardNumber,
            cvv: cardData.cvv
        })
        
        if (!encrypted) {
            throw new Error('Failed to encrypt card data')
        }
        
        return {
            encryptedCardNumber: encrypted.encryptedCardNumber,
            encryptedCVV: encrypted.encryptedCVV,
            integrityCheck: encrypted.integrityCheck,
            expiryMonth: cardData.expiryMonth,
            expiryYear: cardData.expiryYear,
            isEncrypted: true
        }
    }
    
    return {
        cardNumber: cardData.cardNumber,
        cvv: cardData.cvv,
        expiryMonth: cardData.expiryMonth,
        expiryYear: cardData.expiryYear,
        isPlain: true
    }
}

/**
 * Build verification request object
 * 
 * @param {object} options
 * @param {object} options.encryptedData - Encrypted/plain card data
 * @param {object} options.cardData - Original card form data
 * @param {object} options.basket - Basket data
 * @param {object} options.billingAddress - Billing address
 * @param {string} options.kountSessionId - Kount session ID
 * @param {object} options.fraudCart - Fraud shopping cart data
 * @param {object} options.fraudShipTo - Fraud shipTo data
 * @returns {object} Verification request payload
 */
export const buildVerifyRequest = ({ encryptedData, cardData, basket, billingAddress, kountSessionId, fraudCart, fraudShipTo }) => {
    const card = encryptedData.isPlain ? {
        cardNumber: encryptedData.cardNumber,
        cvv: encryptedData.cvv,
        expiryMonth: encryptedData.expiryMonth,
        expiryYear: encryptedData.expiryYear
    } : {
        encryptedCardNumber: encryptedData.encryptedCardNumber,
        encryptedCVV: encryptedData.encryptedCVV,
        integrityCheck: encryptedData.integrityCheck,
        expiryMonth: encryptedData.expiryMonth,
        expiryYear: encryptedData.expiryYear
    }
    
    return {
        card,
        accountHolder: {
            fullName: cardData.holder,
            email: basket?.customerInfo?.email || cardData.billingAddress?.email,
            phone: cardData.billingAddress?.phone || basket?.billingAddress?.phone
        },
        billingAddress: cardData.billingAddress ? {
            line1: cardData.billingAddress.address1,
            line2: cardData.billingAddress.address2,
            city: cardData.billingAddress.city,
            state: cardData.billingAddress.stateCode,
            postalCode: cardData.billingAddress.postalCode,
            countryCode: cardData.billingAddress.countryCode
        } : billingAddress,
        currency: basket?.currency,
        amount: Math.round((basket?.orderTotal || 0) * 100),
        kountSessionId: kountSessionId || undefined,
        fraudShoppingCart: fraudCart,
        shipTo: fraudShipTo
    }
}

/**
 * Build payment instrument object for basket
 * 
 * @param {object} options
 * @param {object} options.cardData - Card form data
 * @param {string} options.token - JPMC token
 * @param {string} options.creditCardPaymentMethodId - Payment method ID
 * @param {number} options.orderAmount - Order amount
 * @returns {object} Payment instrument payload for SFCC
 */
export const buildPaymentInstrumentForBasket = ({ cardData, token, creditCardPaymentMethodId, orderAmount }) => {
    const paymentInstrument = {
        paymentMethodId: creditCardPaymentMethodId,
        amount: orderAmount,
        c_jpmcToken: token
    }
    
    if (cardData.cardNumber) {
        paymentInstrument.paymentCard = {
            holder: cardData.holder,
            cardType: cardData.cardType,
            creditCardToken: token,
            maskedNumber: `************${cardData.cardNumber.slice(-4)}`,
            expirationMonth: cardData.expiryMonth,
            expirationYear: cardData.expiryYear
        }
    }
    
    return paymentInstrument
}

/**
 * Call verification API endpoint
 * 
 * @param {object} options
 * @param {object} options.verifyRequest - Verification request payload
 * @param {string} options.locale - Locale for multi-MID
 * @param {object} options.headers - HTTP headers
 * @returns {Promise<object>} API response with success/error
 */
export const callVerificationApi = async ({ verifyRequest, locale, headers }) => {
    const verifyUrl = locale
        ? `/api/jpmorgan/verify?locale=${encodeURIComponent(locale)}`
        : '/api/jpmorgan/verify'
    
    const response = await fetch(verifyUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(verifyRequest)
    })
    
    return response.json()
}

/**
 * Process successful verification result
 * 
 * @param {object} options
 * @param {object} options.result - Verification API result
 * @param {object} options.cardData - Card form data
 * @param {object} options.basket - Current basket
 * @param {string} options.creditCardPaymentMethodId - Payment method ID
 * @param {function} options.addPaymentInstrumentFn - Function to add payment instrument
 * @returns {Promise<object>} Processed result with paymentInstrumentId
 */
export const processVerificationSuccess = async ({
    result,
    cardData,
    basket,
    creditCardPaymentMethodId,
    addPaymentInstrumentFn
}) => {
    // Server returns encrypted tokenRef, not plain token
    const tokenRef = result.tokenRef
    const orderAmount = basket?.orderTotal || basket?.productTotal || 0
    
    const paymentInstrument = buildPaymentInstrumentForBasket({
        cardData,
        token: tokenRef, // Store encrypted ref in payment instrument
        creditCardPaymentMethodId,
        orderAmount
    })
    
    const addPaymentResult = await addPaymentInstrumentFn(paymentInstrument)
    const piId = addPaymentResult?.paymentInstruments?.[0]?.paymentInstrumentId
    
    return {
        success: true,
        tokenRef,
        paymentInstrumentId: piId,
        result: { ...result, storedToken: tokenRef, paymentInstrumentId: piId }
    }
}

/**
 * Persist fraud-related data for later authorization
 * 
 * @param {object} options
 * @param {object|undefined} options.fraudCart - Fraud shopping cart data
 * @param {object|undefined} options.fraudShipTo - Fraud shipTo data
 * @param {function} options.saveFraudCart - Function to save fraud cart
 * @param {function} options.saveFraudShipTo - Function to save fraud shipTo
 */
export const persistFraudData = ({ fraudCart, fraudShipTo, saveFraudCart, saveFraudShipTo }) => {
    if (fraudCart) saveFraudCart(fraudCart)
    if (fraudShipTo) saveFraudShipTo(fraudShipTo)
}

/**
 * Build authorization headers with optional Bearer token
 * 
 * @param {function} getAccessToken - Async function to get access token
 * @returns {Promise<object>} Headers object
 */
export const buildVerificationHeaders = async (getAccessToken) => {
    const headers = { 'Content-Type': 'application/json' }
    if (!getAccessToken) return headers
    
    const token = await getAccessToken().catch(() => null)
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
}
