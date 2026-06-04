/**
 * Unit Tests for Google Pay Token Parser
 *
 * @jest-environment node
 */

import {
    parseGooglePayResponse,
    extractEncryptedPaymentBundle,
    buildJPMorganGooglePayPayload,
    buildAccountHolderFromGooglePay,
    mapGooglePayAddress,
    validateTokenStructure,
    isValidPaymentData,
    GooglePayTokenError
} from '../token-parser.js'

import {
    GOOGLE_PAY_ERROR_CODES
} from '../../../utils/constants.mjs'

describe('Google Pay Token Parser', () => {
    // Mock valid Google Pay response
    const mockToken = {
        signature: 'MEYCIQDtest...',
        intermediateSigningKey: {
            signedKey: '{"keyValue":"test...","keyExpiration":"1234567890"}',
            signatures: ['MEUCIQDtest...']
        },
        protocolVersion: 'ECv2',
        signedMessage: '{"encryptedMessage":"test...","ephemeralPublicKey":"test-ephemeral-key","tag":"test..."}'
    }

    // Expected JP Morgan formatted bundle structure
    const expectedJpmcPaymentBundle = {
        encryptedPayload: mockToken.signedMessage,
        protocolVersion: 'ECv2',
        signature: 'MEYCIQDtest...',
        encryptedPaymentHeader: {
            ephemeralPublicKey: 'test-ephemeral-key'
        }
    }

    const mockBillingAddress = {
        name: 'John Doe',
        address1: '123 Main St',
        address2: 'Apt 4',
        address3: '',
        locality: 'San Francisco',
        administrativeArea: 'CA',
        postalCode: '94105',
        countryCode: 'US',
        phoneNumber: '+14155551234'
    }

    const mockPaymentData = {
        apiVersion: 2,
        apiVersionMinor: 0,
        paymentMethodData: {
            type: 'CARD',
            description: 'Visa •••• 1234',
            info: {
                cardNetwork: 'VISA',
                cardDetails: '1234',
                billingAddress: mockBillingAddress
            },
            tokenizationData: {
                type: 'PAYMENT_GATEWAY',
                token: JSON.stringify(mockToken)
            }
        },
        email: 'john.doe@example.com'
    }

    describe('parseGooglePayResponse', () => {
        it('should parse valid payment data and transform to JP Morgan format', () => {
            const result = parseGooglePayResponse(mockPaymentData)
            
            // encryptedPaymentBundle is transformed to JP Morgan format, not raw token
            expect(result.encryptedPaymentBundle).toEqual(expectedJpmcPaymentBundle)
            expect(result.tokenizationType).toBe('PAYMENT_GATEWAY')
            expect(result.cardNetwork).toBe('VISA')
            expect(result.cardDetails).toBe('1234')
            expect(result.email).toBe('john.doe@example.com')
        })

        it('should throw error for null payment data', () => {
            expect(() => parseGooglePayResponse(null))
                .toThrow(GooglePayTokenError)
        })

        it('should throw error for undefined payment data', () => {
            expect(() => parseGooglePayResponse(undefined))
                .toThrow(GooglePayTokenError)
        })

        it('should throw error for missing paymentMethodData', () => {
            expect(() => parseGooglePayResponse({}))
                .toThrow(GooglePayTokenError)
        })

        it('should throw error for missing tokenization data', () => {
            expect(() => parseGooglePayResponse({
                paymentMethodData: {}
            })).toThrow(GooglePayTokenError)
        })

        it('should throw error for invalid token JSON', () => {
            const invalidData = {
                paymentMethodData: {
                    tokenizationData: {
                        token: 'not valid json'
                    }
                }
            }
            
            expect(() => parseGooglePayResponse(invalidData))
                .toThrow(GooglePayTokenError)
        })

        it('should include error code in thrown error', () => {
            try {
                parseGooglePayResponse(null)
            } catch (error) {
                expect(error.code).toBe(GOOGLE_PAY_ERROR_CODES.PAYMENT_DATA_INVALID)
            }
        })

        it('should map billing address correctly', () => {
            const result = parseGooglePayResponse(mockPaymentData)
            
            expect(result.billingAddress.name).toBe('John Doe')
            expect(result.billingAddress.line1).toBe('123 Main St')
            expect(result.billingAddress.city).toBe('San Francisco')
            expect(result.billingAddress.state).toBe('CA')
            expect(result.billingAddress.postalCode).toBe('94105')
        })

        it('should include raw payment data', () => {
            const result = parseGooglePayResponse(mockPaymentData)
            expect(result.raw).toBe(mockPaymentData)
        })
    })

    describe('extractEncryptedPaymentBundle', () => {
        it('should extract the encrypted payment bundle in JP Morgan format', () => {
            const bundle = extractEncryptedPaymentBundle(mockPaymentData)
            expect(bundle).toEqual(expectedJpmcPaymentBundle)
        })

        it('should throw for invalid data', () => {
            expect(() => extractEncryptedPaymentBundle(null))
                .toThrow(GooglePayTokenError)
        })
    })

    describe('buildJPMorganGooglePayPayload', () => {
        const orderDetails = {
            amount: '99.99',
            currency: 'USD',
            merchantOrderNumber: 'ORDER-123'
        }

        it('should build valid JP Morgan payload with transformed bundle', () => {
            const payload = buildJPMorganGooglePayPayload(mockPaymentData, orderDetails)
            
            expect(payload.paymentMethodType.googlepay.encryptedPaymentBundle).toEqual(expectedJpmcPaymentBundle)
            expect(payload.amount).toBe('99.99')
            expect(payload.currency).toBe('USD')
            expect(payload.merchantOrderNumber).toBe('ORDER-123')
        })

        it('should include card network', () => {
            const payload = buildJPMorganGooglePayPayload(mockPaymentData, orderDetails)
            expect(payload.cardNetwork).toBe('VISA')
        })

        it('should include billing address', () => {
            const payload = buildJPMorganGooglePayPayload(mockPaymentData, orderDetails)
            expect(payload.billingAddress).toBeDefined()
            expect(payload.billingAddress.line1).toBe('123 Main St')
        })

        it('should include account holder', () => {
            const payload = buildJPMorganGooglePayPayload(mockPaymentData, orderDetails)
            expect(payload.accountHolder).toBeDefined()
            expect(payload.accountHolder.emailAddress).toBe('john.doe@example.com')
        })
    })

    describe('buildAccountHolderFromGooglePay', () => {
        it('should build account holder from parsed data', () => {
            const parsedData = {
                billingAddress: {
                    name: 'John Doe',
                    line1: '123 Main St',
                    city: 'San Francisco',
                    state: 'CA',
                    postalCode: '94105',
                    countryCode: 'US'
                },
                email: 'john@example.com'
            }
            
            const accountHolder = buildAccountHolderFromGooglePay(parsedData)
            
            expect(accountHolder.fullName).toBe('John Doe')
            expect(accountHolder.emailAddress).toBe('john@example.com')
            expect(accountHolder.billingAddress.city).toBe('San Francisco')
        })

        it('should handle missing billing address', () => {
            const parsedData = {
                billingAddress: null,
                email: 'john@example.com'
            }
            
            const accountHolder = buildAccountHolderFromGooglePay(parsedData)
            
            expect(accountHolder.emailAddress).toBe('john@example.com')
            expect(accountHolder.billingAddress).toBeUndefined()
        })

        it('should handle missing email', () => {
            const parsedData = {
                billingAddress: { name: 'John Doe' },
                email: null
            }
            
            const accountHolder = buildAccountHolderFromGooglePay(parsedData)
            
            expect(accountHolder.fullName).toBe('John Doe')
            expect(accountHolder.emailAddress).toBeUndefined()
        })
    })

    describe('mapGooglePayAddress', () => {
        it('should map Google Pay address format', () => {
            const result = mapGooglePayAddress(mockBillingAddress)
            
            expect(result.name).toBe('John Doe')
            expect(result.line1).toBe('123 Main St')
            expect(result.line2).toBe('Apt 4')
            expect(result.city).toBe('San Francisco')
            expect(result.state).toBe('CA')
            expect(result.postalCode).toBe('94105')
            expect(result.countryCode).toBe('US')
            expect(result.phoneNumber).toBe('+14155551234')
        })

        it('should return null for null input', () => {
            expect(mapGooglePayAddress(null)).toBeNull()
        })

        it('should return null for undefined input', () => {
            expect(mapGooglePayAddress(undefined)).toBeNull()
        })

        it('should handle alternative field names', () => {
            const altAddress = {
                name: 'Jane Doe',
                line1: '456 Oak Ave',
                city: 'Los Angeles',
                state: 'CA'
            }
            
            const result = mapGooglePayAddress(altAddress)
            expect(result.line1).toBe('456 Oak Ave')
            expect(result.city).toBe('Los Angeles')
        })
    })

    describe('validateTokenStructure', () => {
        it('should return valid for correct token', () => {
            const result = validateTokenStructure(mockToken)
            
            expect(result.valid).toBe(true)
            expect(result.errors).toHaveLength(0)
        })

        it('should return errors for null token', () => {
            const result = validateTokenStructure(null)
            
            expect(result.valid).toBe(false)
            expect(result.errors).toContain('Token is null or undefined')
        })

        it('should detect missing signature', () => {
            const invalidToken = { ...mockToken }
            delete invalidToken.signature
            
            const result = validateTokenStructure(invalidToken)
            
            expect(result.valid).toBe(false)
            expect(result.errors).toContain('Token missing required field: signature')
        })

        it('should detect missing signedMessage', () => {
            const invalidToken = { ...mockToken }
            delete invalidToken.signedMessage
            
            const result = validateTokenStructure(invalidToken)
            
            expect(result.valid).toBe(false)
            expect(result.errors).toContain('Token missing required field: signedMessage')
        })

        it('should detect wrong protocol version', () => {
            const invalidToken = { ...mockToken, protocolVersion: 'ECv1' }
            
            const result = validateTokenStructure(invalidToken)
            
            expect(result.valid).toBe(false)
            expect(result.errors[0]).toContain('ECv1')
        })

        it('should detect missing intermediateSigningKey', () => {
            const invalidToken = { ...mockToken }
            delete invalidToken.intermediateSigningKey
            
            const result = validateTokenStructure(invalidToken)
            
            expect(result.valid).toBe(false)
            expect(result.errors).toContain('Token missing required field: intermediateSigningKey')
        })
    })

    describe('isValidPaymentData', () => {
        it('should return true for valid payment data', () => {
            expect(isValidPaymentData(mockPaymentData)).toBe(true)
        })

        it('should return false for invalid payment data', () => {
            expect(isValidPaymentData(null)).toBe(false)
            expect(isValidPaymentData({})).toBe(false)
            expect(isValidPaymentData({ paymentMethodData: {} })).toBe(false)
        })
    })

    describe('GooglePayTokenError', () => {
        it('should have correct properties', () => {
            const cause = new Error('original error')
            const error = new GooglePayTokenError(
                GOOGLE_PAY_ERROR_CODES.TOKEN_PARSE_ERROR,
                'Test error',
                cause
            )
            
            expect(error.name).toBe('GooglePayTokenError')
            expect(error.code).toBe(GOOGLE_PAY_ERROR_CODES.TOKEN_PARSE_ERROR)
            expect(error.message).toBe('Test error')
            expect(error.cause).toBe(cause)
        })

        it('should extend Error', () => {
            const error = new GooglePayTokenError('CODE', 'message')
            expect(error).toBeInstanceOf(Error)
        })
    })
})
