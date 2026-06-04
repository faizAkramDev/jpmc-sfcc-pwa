/**
 * Request Builders Tests
 * 
 * Tests for request builder utilities used by payment flows
 */

import {
    resolvePaymentToken,
    resolveBillingAddress,
    buildAccountHolder,
    buildFraudFields,
    resolveCardExpiry,
    buildTokenAuthRequest,
    buildCardAuthRequest
} from '../request-builders.js'

// Mock the session-storage module
jest.mock('../session-storage.js', () => ({
    getTokenFromSession: jest.fn(),
    getFraudCart: jest.fn(),
    getFraudShipTo: jest.fn(),
    getFraudRuleAction: jest.fn(),
    getCardTypeName: jest.fn(),
    getCardType: jest.fn()
}))

// Mock the fraud-helpers module  
jest.mock('../fraud-helpers.js', () => ({
    buildFraudShoppingCart: jest.fn(),
    mapShipToForFraud: jest.fn()
}))

import {
    getTokenFromSession,
    getFraudCart,
    getFraudShipTo,
    getFraudRuleAction,
    getCardTypeName,
    getCardType
} from '../session-storage.js'

import {
    buildFraudShoppingCart,
    mapShipToForFraud
} from '../fraud-helpers.js'

describe('request-builders', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    // ==========================================================================
    // resolvePaymentToken Tests
    // ==========================================================================
    
    describe('resolvePaymentToken', () => {
        it('should return creditCardToken from payment card if available', () => {
            const basket = {
                basketId: 'basket-123',
                paymentInstruments: [{
                    paymentCard: {
                        creditCardToken: 'card-token-123'
                    }
                }]
            }

            const result = resolvePaymentToken({ basket, verificationResult: null })

            expect(result.tokenRef).toBe('card-token-123')
            expect(result.source).toBe('creditCardToken')
            expect(result.paymentInstrument).toBe(basket.paymentInstruments[0])
        })

        it('should return c_jpmcToken if creditCardToken is not available', () => {
            const basket = {
                basketId: 'basket-123',
                paymentInstruments: [{
                    c_jpmcToken: 'jpmc-token-456'
                }]
            }

            const result = resolvePaymentToken({ basket, verificationResult: null })

            expect(result.tokenRef).toBe('jpmc-token-456')
            expect(result.source).toBe('c_jpmcToken')
        })

        it('should return c_jpmcVerificationToken if other tokens not available', () => {
            const basket = {
                basketId: 'basket-123',
                paymentInstruments: [{
                    c_jpmcVerificationToken: 'verification-token-789'
                }]
            }

            const result = resolvePaymentToken({ basket, verificationResult: null })

            expect(result.tokenRef).toBe('verification-token-789')
            expect(result.source).toBe('c_jpmcVerificationToken')
        })

        it('should return storedToken from verificationResult if no basket tokens', () => {
            const basket = {
                basketId: 'basket-123',
                paymentInstruments: [{}]
            }
            const verificationResult = {
                storedToken: 'stored-token-000'
            }

            const result = resolvePaymentToken({ basket, verificationResult })

            expect(result.tokenRef).toBe('stored-token-000')
            expect(result.source).toBe('verificationResult')
        })

        it('should return sessionStorage token as last resort', () => {
            const basket = {
                basketId: 'basket-123',
                paymentInstruments: [{}]
            }
            getTokenFromSession.mockReturnValue('session-token-111')

            const result = resolvePaymentToken({ basket, verificationResult: null })

            expect(result.tokenRef).toBe('session-token-111')
            expect(result.source).toBe('sessionStorage')
            expect(getTokenFromSession).toHaveBeenCalledWith('basket-123')
        })

        it('should return null token if no source has a token', () => {
            const basket = {
                basketId: 'basket-123',
                paymentInstruments: [{}]
            }
            getTokenFromSession.mockReturnValue(null)

            const result = resolvePaymentToken({ basket, verificationResult: null })

            expect(result.tokenRef).toBeNull()
            expect(result.source).toBe('none')
        })

        it('should handle basket with no payment instruments', () => {
            const basket = {
                basketId: 'basket-123'
            }
            getTokenFromSession.mockReturnValue(null)

            const result = resolvePaymentToken({ basket, verificationResult: null })

            expect(result.tokenRef).toBeNull()
            expect(result.source).toBe('none')
            expect(result.paymentInstrument).toBeUndefined()
        })

        it('should handle null basket', () => {
            getTokenFromSession.mockReturnValue(null)

            const result = resolvePaymentToken({ basket: null, verificationResult: null })

            expect(result.tokenRef).toBeNull()
            expect(result.source).toBe('none')
        })
    })

    // ==========================================================================
    // resolveBillingAddress Tests
    // ==========================================================================
    
    describe('resolveBillingAddress', () => {
        const mockBillingAddress = {
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Main St'
        }

        it('should return local billingAddress if available', () => {
            const result = resolveBillingAddress({
                billingAddress: mockBillingAddress,
                basket: { billingAddress: { different: 'address' }}
            })

            expect(result).toBe(mockBillingAddress)
        })

        it('should return basket billingAddress if local is not available', () => {
            const basketAddress = { firstName: 'Jane', address1: '456 Oak Ave' }
            const result = resolveBillingAddress({
                billingAddress: null,
                basket: { billingAddress: basketAddress }
            })

            expect(result).toBe(basketAddress)
        })

        it('should return cardData billingAddress as fallback', () => {
            const cardDataAddress = { firstName: 'Bob', address1: '789 Pine Rd' }
            const result = resolveBillingAddress({
                billingAddress: null,
                basket: {},
                cardData: { billingAddress: cardDataAddress }
            })

            expect(result).toBe(cardDataAddress)
        })

        it('should return overrideBillingAddress as final fallback', () => {
            const overrideAddress = { firstName: 'Override', address1: '000 Override St' }
            const result = resolveBillingAddress({
                billingAddress: null,
                basket: {},
                cardData: {},
                overrideBillingAddress: overrideAddress
            })

            expect(result).toBe(overrideAddress)
        })

        it('should return null if no addresses available', () => {
            const result = resolveBillingAddress({
                billingAddress: null,
                basket: {},
                cardData: {}
            })

            expect(result).toBeNull()
        })
    })

    // ==========================================================================
    // buildAccountHolder Tests
    // ==========================================================================
    
    describe('buildAccountHolder', () => {
        it('should build account holder from payment card', () => {
            const paymentCard = { holder: 'John Doe' }
            const basket = {
                customerInfo: { email: 'john@example.com' },
                billingAddress: { phone: '555-123-4567' }
            }

            const result = buildAccountHolder({
                paymentCard,
                cardData: {},
                basket,
                billingAddress: {}
            })

            expect(result.fullName).toBe('John Doe')
            expect(result.email).toBe('john@example.com')
            expect(result.phone).toBe('5551234567')
        })

        it('should fallback to cardData for holder name', () => {
            const cardData = { holder: 'Jane Smith' }

            const result = buildAccountHolder({
                paymentCard: null,
                cardData,
                basket: {},
                billingAddress: {}
            })

            expect(result.fullName).toBe('Jane Smith')
        })

        it('should get email from billing address if not in customerInfo', () => {
            const billingAddress = { email: 'billing@example.com' }

            const result = buildAccountHolder({
                paymentCard: null,
                cardData: {},
                basket: {},
                billingAddress
            })

            expect(result.email).toBe('billing@example.com')
        })

        it('should get email from cardData billingAddress as last resort', () => {
            const cardData = {
                billingAddress: { email: 'carddata@example.com' }
            }

            const result = buildAccountHolder({
                paymentCard: null,
                cardData,
                basket: {},
                billingAddress: {}
            })

            expect(result.email).toBe('carddata@example.com')
        })

        it('should get phone from billing address first', () => {
            const billingAddress = { phone: '111-111-1111' }
            const basket = { billingAddress: { phone: '222-222-2222' }}

            const result = buildAccountHolder({
                paymentCard: null,
                cardData: {},
                basket,
                billingAddress
            })

            expect(result.phone).toBe('1111111111')
        })

        it('should return null values if nothing available', () => {
            const result = buildAccountHolder({
                paymentCard: null,
                cardData: {},
                basket: {},
                billingAddress: {}
            })

            expect(result.fullName).toBeNull()
            expect(result.email).toBeNull()
            expect(result.phone).toBeNull()
        })
    })

    // ==========================================================================
    // buildFraudFields Tests
    // ==========================================================================
    
    describe('buildFraudFields', () => {
        it('should build fraud fields from live basket data', () => {
            const basket = {
                productItems: [{ productId: 'PROD-1' }]
            }
            buildFraudShoppingCart.mockReturnValue('T=Product&I=PROD-1&|')
            mapShipToForFraud.mockReturnValue({ firstName: 'John', city: 'NYC' })
            getFraudRuleAction.mockReturnValue('A')

            const result = buildFraudFields({ basket, kountSessionId: 'kount-123' })

            expect(result.fraudRuleAction).toBe('A')
            expect(result.kountSessionId).toBe('kount-123')
            expect(result.fraudShoppingCart).toBe('T=Product&I=PROD-1&|')
            expect(result.shipTo).toEqual({ firstName: 'John', city: 'NYC' })
        })

        it('should fallback to persisted fraud cart from session', () => {
            buildFraudShoppingCart.mockReturnValue(null)
            getFraudCart.mockReturnValue('persisted-cart-string')
            mapShipToForFraud.mockReturnValue(null)
            getFraudShipTo.mockReturnValue(null)
            getFraudRuleAction.mockReturnValue(null)

            const result = buildFraudFields({ basket: {}, kountSessionId: null })

            expect(result.fraudShoppingCart).toBe('persisted-cart-string')
        })

        it('should fallback to persisted shipTo from session', () => {
            buildFraudShoppingCart.mockReturnValue(null)
            getFraudCart.mockReturnValue(null)
            mapShipToForFraud.mockReturnValue(null)
            getFraudShipTo.mockReturnValue({ firstName: 'Persisted', city: 'LA' })
            getFraudRuleAction.mockReturnValue(null)

            const result = buildFraudFields({ basket: {}, kountSessionId: null })

            expect(result.shipTo).toEqual({ firstName: 'Persisted', city: 'LA' })
        })

        it('should return undefined for empty values', () => {
            buildFraudShoppingCart.mockReturnValue(null)
            getFraudCart.mockReturnValue(null)
            mapShipToForFraud.mockReturnValue(null)
            getFraudShipTo.mockReturnValue(null)
            getFraudRuleAction.mockReturnValue(null)

            const result = buildFraudFields({ basket: {}, kountSessionId: null })

            expect(result.fraudRuleAction).toBeUndefined()
            expect(result.kountSessionId).toBeUndefined()
            expect(result.fraudShoppingCart).toBeUndefined()
            expect(result.shipTo).toBeUndefined()
        })
    })

    // ==========================================================================
    // resolveCardExpiry Tests
    // ==========================================================================
    
    describe('resolveCardExpiry', () => {
        it('should return expiry from payment card', () => {
            const paymentCard = {
                expirationMonth: 12,
                expirationYear: 2027
            }

            const result = resolveCardExpiry({ paymentCard, cardData: {} })

            expect(result.month).toBe(12)
            expect(result.year).toBe(2027)
        })

        it('should fallback to cardData expiry fields', () => {
            const cardData = {
                expiryMonth: 6,
                expiryYear: 2028
            }

            const result = resolveCardExpiry({ paymentCard: null, cardData })

            expect(result.month).toBe(6)
            expect(result.year).toBe(2028)
        })

        it('should return nulls if no expiry available', () => {
            const result = resolveCardExpiry({ paymentCard: null, cardData: {} })

            expect(result.month).toBeNull()
            expect(result.year).toBeNull()
        })
    })

    // ==========================================================================
    // buildTokenAuthRequest Tests
    // ==========================================================================
    
    describe('buildTokenAuthRequest', () => {
        beforeEach(() => {
            buildFraudShoppingCart.mockReturnValue(null)
            mapShipToForFraud.mockReturnValue(null)
            getFraudCart.mockReturnValue(null)
            getFraudShipTo.mockReturnValue(null)
            getFraudRuleAction.mockReturnValue(null)
        })

        it('should build a complete token auth request', () => {
            const basket = {
                orderTotal: 99.99,
                currency: 'USD',
                paymentInstruments: [{
                    paymentCard: {
                        expirationMonth: 12,
                        expirationYear: 2027
                    }
                }],
                customerInfo: { email: 'test@example.com' }
            }

            const result = buildTokenAuthRequest({
                tokenRef: 'safetech-token-123',
                basket,
                billingAddress: { firstName: 'John' },
                cardData: {},
                paymentConfig: { captureMethod: 'NOW' },
                kountSessionId: 'kount-123',
                overrides: { merchantOrderNumber: 'ORD-00001' }
            })

            expect(result.tokenRef).toBe('safetech-token-123')
            expect(result.amount).toBe(9999) // 99.99 * 100
            expect(result.currency).toBe('USD')
            expect(result.merchantOrderNumber).toBe('ORD-00001')
            expect(result.captureMethod).toBe('NOW')
            expect(result.cardExpiry.month).toBe(12)
            expect(result.cardExpiry.year).toBe(2027)
        })

        it('should throw error if merchantOrderNumber is not provided', () => {
            const basket = {
                orderTotal: 50.00,
                currency: 'USD'
            }

            expect(() => {
                buildTokenAuthRequest({
                    tokenRef: 'token',
                    basket,
                    billingAddress: {},
                    cardData: {},
                    paymentConfig: {},
                    kountSessionId: null,
                    overrides: {} // No merchantOrderNumber
                })
            }).toThrow('merchantOrderNumber (orderNo) is required for authorization')
        })

        it('should use overrides for amount and currency', () => {
            const basket = {
                orderTotal: 100.00,
                currency: 'USD'
            }

            const result = buildTokenAuthRequest({
                tokenRef: 'token',
                basket,
                billingAddress: {},
                cardData: {},
                paymentConfig: {},
                kountSessionId: null,
                overrides: {
                    merchantOrderNumber: 'ORD-123',
                    amount: 5000,
                    currency: 'CAD'
                }
            })

            expect(result.amount).toBe(5000)
            expect(result.currency).toBe('CAD')
        })

        it('should use captureMethod from overrides over paymentConfig', () => {
            const result = buildTokenAuthRequest({
                tokenRef: 'token',
                basket: { orderTotal: 10, currency: 'USD' },
                billingAddress: {},
                cardData: {},
                paymentConfig: { captureMethod: 'NOW' },
                kountSessionId: null,
                overrides: {
                    merchantOrderNumber: 'ORD-123',
                    captureMethod: 'MANUAL'
                }
            })

            expect(result.captureMethod).toBe('MANUAL')
        })
    })

    // ==========================================================================
    // buildCardAuthRequest Tests
    // ==========================================================================
    
    describe('buildCardAuthRequest', () => {
        beforeEach(() => {
            buildFraudShoppingCart.mockReturnValue(null)
            mapShipToForFraud.mockReturnValue(null)
            getFraudCart.mockReturnValue(null)
            getFraudShipTo.mockReturnValue(null)
            getFraudRuleAction.mockReturnValue(null)
        })

        it('should build request with encrypted card data', () => {
            const encryptedCardData = {
                encryptedCardNumber: 'enc-card-123',
                encryptedCVV: 'enc-cvv-456',
                integrityCheck: 'integrity-789',
                expiryMonth: 12,
                expiryYear: 2027,
                isPlain: false
            }
            const basket = {
                orderTotal: 75.50,
                currency: 'USD'
            }

            const result = buildCardAuthRequest({
                encryptedCardData,
                basket,
                billingAddress: {},
                cardData: { holder: 'John Doe' },
                paymentConfig: { captureMethod: 'NOW' },
                kountSessionId: 'kount-456',
                overrides: { merchantOrderNumber: 'ORD-00002' }
            })

            expect(result.card.encryptedCardNumber).toBe('enc-card-123')
            expect(result.card.encryptedCVV).toBe('enc-cvv-456')
            expect(result.card.integrityCheck).toBe('integrity-789')
            expect(result.card.expiryMonth).toBe(12)
            expect(result.card.expiryYear).toBe(2027)
            expect(result.amount).toBe(7550)
            expect(result.merchantOrderNumber).toBe('ORD-00002')
        })

        it('should build request with plain card data when isPlain is true', () => {
            const encryptedCardData = {
                cardNumber: '4111111111111111',
                cvv: '123',
                expiryMonth: 6,
                expiryYear: 2028,
                isPlain: true
            }
            const basket = {
                orderTotal: 25.00,
                currency: 'USD'
            }

            const result = buildCardAuthRequest({
                encryptedCardData,
                basket,
                billingAddress: {},
                cardData: {},
                paymentConfig: {},
                kountSessionId: null,
                overrides: { merchantOrderNumber: 'ORD-00003' }
            })

            expect(result.card.cardNumber).toBe('4111111111111111')
            expect(result.card.cvv).toBe('123')
            expect(result.card.expiryMonth).toBe(6)
            expect(result.card.expiryYear).toBe(2028)
            expect(result.card.encryptedCardNumber).toBeUndefined()
        })

        it('should throw error if merchantOrderNumber is not provided', () => {
            const encryptedCardData = {
                encryptedCardNumber: 'enc-123',
                expiryMonth: 12,
                expiryYear: 2027
            }

            expect(() => {
                buildCardAuthRequest({
                    encryptedCardData,
                    basket: { orderTotal: 10, currency: 'USD' },
                    billingAddress: {},
                    cardData: {},
                    paymentConfig: {},
                    kountSessionId: null,
                    overrides: {} // No merchantOrderNumber
                })
            }).toThrow('merchantOrderNumber (orderNo) is required for authorization')
        })

        it('should include account holder with null paymentCard', () => {
            const encryptedCardData = {
                cardNumber: '4111111111111111',
                cvv: '123',
                expiryMonth: 6,
                expiryYear: 2028,
                isPlain: true
            }
            const cardData = { holder: 'Jane Doe' }
            const basket = {
                orderTotal: 50.00,
                currency: 'USD',
                customerInfo: { email: 'jane@example.com' }
            }

            const result = buildCardAuthRequest({
                encryptedCardData,
                basket,
                billingAddress: {},
                cardData,
                paymentConfig: {},
                kountSessionId: null,
                overrides: { merchantOrderNumber: 'ORD-00004' }
            })

            expect(result.accountHolder.fullName).toBe('Jane Doe')
            expect(result.accountHolder.email).toBe('jane@example.com')
        })
    })
})
