/**
 * Verification Helpers Tests
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/client/context/utils/__tests__/verification-helpers.test
 */

import {
    encryptCardForVerification,
    buildVerifyRequest,
    buildPaymentInstrumentForBasket
} from '../verification-helpers'

describe('verification-helpers', () => {
    describe('encryptCardForVerification', () => {
        const mockCardData = {
            cardNumber: '4111111111111111',
            cvv: '123',
            expiryMonth: 12,
            expiryYear: 2025,
            holder: 'John Doe'
        }

        it('should return plain card data when PIE is not ready', () => {
            const result = encryptCardForVerification({
                cardData: mockCardData,
                isPIEReady: false,
                pieEncrypt: null
            })

            expect(result).toEqual({
                cardNumber: '4111111111111111',
                cvv: '123',
                expiryMonth: 12,
                expiryYear: 2025,
                isPlain: true
            })
        })

        it('should encrypt card data when PIE is ready', () => {
            const mockPieEncrypt = jest.fn().mockReturnValue({
                encryptedCardNumber: 'encrypted_card',
                encryptedCVV: 'encrypted_cvv',
                integrityCheck: 'check123'
            })

            const result = encryptCardForVerification({
                cardData: mockCardData,
                isPIEReady: true,
                pieEncrypt: mockPieEncrypt
            })

            expect(mockPieEncrypt).toHaveBeenCalledWith({
                cardNumber: '4111111111111111',
                cvv: '123'
            })

            expect(result).toEqual({
                encryptedCardNumber: 'encrypted_card',
                encryptedCVV: 'encrypted_cvv',
                integrityCheck: 'check123',
                expiryMonth: 12,
                expiryYear: 2025,
                isEncrypted: true
            })
        })

        it('should throw error when PIE encryption fails', () => {
            const mockPieEncrypt = jest.fn().mockReturnValue(null)

            expect(() => {
                encryptCardForVerification({
                    cardData: mockCardData,
                    isPIEReady: true,
                    pieEncrypt: mockPieEncrypt
                })
            }).toThrow('Failed to encrypt card data')
        })
    })

    describe('buildVerifyRequest', () => {
        const mockEncryptedData = {
            encryptedCardNumber: 'encrypted_card',
            encryptedCVV: 'encrypted_cvv',
            integrityCheck: 'check123',
            expiryMonth: 12,
            expiryYear: 2025,
            isEncrypted: true
        }

        const mockCardData = {
            holder: 'John Doe',
            billingAddress: {
                address1: '123 Main St',
                address2: 'Apt 1',
                city: 'New York',
                stateCode: 'NY',
                postalCode: '10001',
                countryCode: 'US',
                phone: '555-1234',
                email: 'john@example.com'
            }
        }

        const mockBasket = {
            currency: 'USD',
            orderTotal: 99.99,
            customerInfo: {
                email: 'basket@example.com'
            }
        }

        it('should build verify request with encrypted card data', () => {
            const result = buildVerifyRequest({
                encryptedData: mockEncryptedData,
                cardData: mockCardData,
                basket: mockBasket,
                billingAddress: null,
                kountSessionId: 'kount123'
            })

            expect(result.card).toEqual({
                encryptedCardNumber: 'encrypted_card',
                encryptedCVV: 'encrypted_cvv',
                integrityCheck: 'check123',
                expiryMonth: 12,
                expiryYear: 2025
            })

            expect(result.accountHolder.fullName).toBe('John Doe')
            expect(result.currency).toBe('USD')
            expect(result.amount).toBe(9999) // cents
            expect(result.kountSessionId).toBe('kount123')
        })

        it('should build verify request with plain card data', () => {
            const plainData = {
                cardNumber: '4111111111111111',
                cvv: '123',
                expiryMonth: 12,
                expiryYear: 2025,
                isPlain: true
            }

            const result = buildVerifyRequest({
                encryptedData: plainData,
                cardData: mockCardData,
                basket: mockBasket,
                billingAddress: null
            })

            expect(result.card).toEqual({
                cardNumber: '4111111111111111',
                cvv: '123',
                expiryMonth: 12,
                expiryYear: 2025
            })
        })

        it('should use basket email if cardData billing email is missing', () => {
            const cardDataNoEmail = {
                holder: 'John Doe',
                billingAddress: {
                    address1: '123 Main St'
                }
            }

            const result = buildVerifyRequest({
                encryptedData: mockEncryptedData,
                cardData: cardDataNoEmail,
                basket: mockBasket,
                billingAddress: null
            })

            expect(result.accountHolder.email).toBe('basket@example.com')
        })
    })

    describe('buildPaymentInstrumentForBasket', () => {
        const mockCardData = {
            cardNumber: '4111111111111111',
            holder: 'John Doe',
            cardType: 'Visa',
            expiryMonth: 12,
            expiryYear: 2025
        }

        it('should build payment instrument with card data', () => {
            const result = buildPaymentInstrumentForBasket({
                cardData: mockCardData,
                token: 'token123',
                creditCardPaymentMethodId: 'CREDIT_CARD',
                orderAmount: 99.99
            })

            expect(result).toEqual({
                paymentMethodId: 'CREDIT_CARD',
                amount: 99.99,
                c_jpmcToken: 'token123',
                paymentCard: {
                    holder: 'John Doe',
                    cardType: 'Visa',
                    creditCardToken: 'token123',
                    maskedNumber: '************1111',
                    expirationMonth: 12,
                    expirationYear: 2025
                }
            })
        })

        it('should build payment instrument without card details when no card number', () => {
            const cardDataNoNumber = {
                holder: 'John Doe'
            }

            const result = buildPaymentInstrumentForBasket({
                cardData: cardDataNoNumber,
                token: 'token123',
                creditCardPaymentMethodId: 'CREDIT_CARD',
                orderAmount: 99.99
            })

            expect(result).toEqual({
                paymentMethodId: 'CREDIT_CARD',
                amount: 99.99,
                c_jpmcToken: 'token123'
            })
            expect(result.paymentCard).toBeUndefined()
        })
    })
})
