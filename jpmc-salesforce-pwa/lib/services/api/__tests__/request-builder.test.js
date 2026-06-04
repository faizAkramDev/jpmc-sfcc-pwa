/**
 * Unit Tests for Request Builder
 *
 * @jest-environment node
 */

import {
    buildPaymentRequestBody,
    buildCardPayload,
    buildVerificationRequestBody,
    buildGooglePayRequestBody,
    buildGooglePayAccountHolder,
    formatGooglePayBillingAddress,
    validateGooglePayToken
} from '../request-builder'

// Mock logger
jest.mock('../../../utils/logger', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }
}))

// Mock formatters
jest.mock('../../../utils/formatters/address-formatter', () => ({
    formatBillingAddress: jest.fn((addr) => addr ? {
        line1: addr.line1 || addr.address1,
        city: addr.city,
        state: addr.state || addr.stateCode,
        postalCode: addr.postalCode,
        countryCode: addr.countryCode || 'USA'
    } : null)
}))

jest.mock('../../../utils/formatters/country-codes', () => ({
    convertCountryCode: jest.fn((code) => {
        const map = { 'US': 'USA', 'CA': 'CAN', 'GB': 'GBR' }
        return map[code] || code || 'USA'
    })
}))

// =============================================================================
// Test Data
// =============================================================================

const mockConfig = {
    merchantId: '998482157630',
    enableAVS: true,
    tokenizationType: 'SAFETECH_TOKEN'
}

const mockCardData = {
    encryptedCardNumber: 'encrypted-pan-123',
    encryptedCVV: 'encrypted-cvv-456',
    expiryMonth: 12,
    expiryYear: 2027,
    encryptionIntegrityCheck: 'integrity-check-789'
}

const mockRawCardData = {
    cardNumber: '4111111111111111',
    cvv: '123',
    expiryMonth: 12,
    expiryYear: 2027
}

const mockBillingAddress = {
    line1: '123 Main St',
    line2: 'Apt 4B',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94105',
    countryCode: 'US'
}

const mockAccountHolder = {
    fullName: 'John Doe',
    email: 'john@example.com',
    phone: '5551234567'
}

const mockGooglePayToken = {
    signature: 'MEUCIQCvhQ3...',
    signedMessage: JSON.stringify({
        ephemeralPublicKey: 'BPLpWhiw...',
        encryptedMessage: 'encrypted-data...',
        tag: 'verification-tag'
    }),
    protocolVersion: 'ECv2',
    intermediateSigningKey: {
        signedKey: '{"keyValue":"..."}',
        signatures: ['sig1', 'sig2']
    }
}

// =============================================================================
// buildPaymentRequestBody Tests
// =============================================================================

describe('buildPaymentRequestBody', () => {
    describe('Token-based payments', () => {
        it('should build payment request with payment token', () => {
            const paymentData = {
                amount: 1050,
                currency: 'USD',
                paymentToken: 'token-123',
                cardExpiry: { month: 12, year: 2027 },
                merchantOrderNumber: 'ORDER-001'
            }

            const result = buildPaymentRequestBody(paymentData, mockConfig)

            expect(result.amount).toBe(1050)
            expect(result.currency).toBe('USD')
            expect(result.merchantOrderNumber).toBe('ORDER-001')
            expect(result.paymentMethodType.card.accountNumber).toBe('token-123')
            expect(result.paymentMethodType.card.expiry.month).toBe(12)
            expect(result.paymentMethodType.card.expiry.year).toBe(2027)
            expect(result.captureMethod).toBe('NOW')
            expect(result.accountOnFile).toBe('NOT_STORED')
        })

        it('should use config tokenizationType', () => {
            const paymentData = {
                amount: 1050,
                currency: 'USD',
                paymentToken: 'token-123'
            }

            const result = buildPaymentRequestBody(paymentData, mockConfig)

            expect(result.paymentMethodType.card.accountNumberType).toBe('SAFETECH_TOKEN')
        })
    })

    describe('Card-based payments', () => {
        it('should build payment request with encrypted card data', () => {
            const paymentData = {
                amount: 2500,
                currency: 'USD',
                card: mockCardData,
                merchantOrderNumber: 'ORDER-002'
            }

            const result = buildPaymentRequestBody(paymentData, {})

            expect(result.amount).toBe(2500)
            expect(result.paymentMethodType.card.accountNumber).toBe('encrypted-pan-123')
            expect(result.paymentMethodType.card.cvv).toBe('encrypted-cvv-456')
            expect(result.paymentMethodType.card.encryptionIntegrityCheck).toBe('integrity-check-789')
        })

        it('should include billing address when AVS is enabled', () => {
            const paymentData = {
                amount: 1000,
                currency: 'USD',
                card: mockCardData,
                billingAddress: mockBillingAddress,
                accountHolder: mockAccountHolder
            }

            const result = buildPaymentRequestBody(paymentData, { enableAVS: true })

            expect(result.accountHolder.billingAddress).toBeDefined()
            expect(result.accountHolder.billingAddress.line1).toBe('123 Main St')
        })

        it('should NOT include billing address when AVS is disabled', () => {
            const paymentData = {
                amount: 1000,
                currency: 'USD',
                card: mockCardData,
                billingAddress: mockBillingAddress,
                accountHolder: mockAccountHolder
            }

            const result = buildPaymentRequestBody(paymentData, { enableAVS: false })

            expect(result.accountHolder.billingAddress).toBeUndefined()
        })

        it('should include clientIp in accountHolder', () => {
            const paymentData = {
                amount: 1000,
                currency: 'USD',
                card: mockCardData,
                clientIp: '192.168.1.1'
            }

            const result = buildPaymentRequestBody(paymentData, {})

            expect(result.accountHolder.IPAddress).toBe('192.168.1.1')
        })

        it('should include accountHolder with only IPAddress when no other holder data', () => {
            const paymentData = {
                amount: 1000,
                currency: 'USD',
                card: mockCardData,
                clientIp: '10.0.0.1'
            }

            const result = buildPaymentRequestBody(paymentData, {})

            expect(result.accountHolder).toEqual({ IPAddress: '10.0.0.1' })
        })
    })

    describe('Google Pay payments', () => {
        it('should delegate to Google Pay builder when googlePayToken is present', () => {
            const paymentData = {
                googlePayToken: mockGooglePayToken,
                amount: 5000,
                currency: 'USD'
            }

            const result = buildPaymentRequestBody(paymentData, {})

            expect(result.paymentMethodType.googlepay).toBeDefined()
            expect(result.paymentMethodType.googlepay.encryptedPaymentBundle).toBeDefined()
        })

        it('should delegate to Google Pay builder when isGooglePay flag is set', () => {
            const paymentData = {
                isGooglePay: true,
                googlePayToken: mockGooglePayToken,
                amount: 5000,
                currency: 'USD'
            }

            const result = buildPaymentRequestBody(paymentData, {})

            expect(result.paymentMethodType.googlepay).toBeDefined()
        })
    })

    describe('Capture method handling', () => {
        it('should default to NOW capture method', () => {
            const paymentData = {
                amount: 1000,
                currency: 'USD',
                paymentToken: 'token-123'
            }

            const result = buildPaymentRequestBody(paymentData, {})

            expect(result.captureMethod).toBe('NOW')
        })

        it('should use MANUAL capture method when specified', () => {
            const paymentData = {
                amount: 1000,
                currency: 'USD',
                paymentToken: 'token-123',
                captureMethod: 'MANUAL'
            }

            const result = buildPaymentRequestBody(paymentData, {})

            expect(result.captureMethod).toBe('MANUAL')
        })
    })

    describe('Amount handling', () => {
        it('should round decimal amounts to nearest integer', () => {
            const paymentData = {
                amount: 1050.6,
                currency: 'USD',
                paymentToken: 'token-123'
            }

            const result = buildPaymentRequestBody(paymentData, {})

            expect(result.amount).toBe(1051)
        })

        it('should handle string amounts', () => {
            const paymentData = {
                amount: '2599',
                currency: 'USD',
                paymentToken: 'token-123'
            }

            const result = buildPaymentRequestBody(paymentData, {})

            expect(result.amount).toBe(2599)
        })
    })

    describe('3DS authentication', () => {
        const mockBrowserInfo = {
            browserAcceptHeader: 'text/html',
            browserLanguage: 'en-US',
            browserColorDepth: '24',
            browserScreenHeight: '1080',
            browserScreenWidth: '1920',
            deviceLocalTimeZone: '-300',
            browserUserAgent: 'Mozilla/5.0',
            javaEnabled: 'false',
            javaScriptEnabled: 'true',
            challengeWindowSize: 'FULL_SCREEN'
        }

        it('should include root-level browserInfo when 3DS enabled', () => {
            const paymentData = {
                amount: 1000,
                currency: 'USD',
                card: mockCardData,
                browserInfo: mockBrowserInfo,
                clientIp: '192.168.1.1',
                cardTypeName: 'VISA'
            }

            const config3DS = {
                jpmc3DSEnabled: true,
                threeDSEnabled: true,
                merchantId: 'test-merchant'
            }

            const result = buildPaymentRequestBody(paymentData, config3DS)

            expect(result.browserInfo).toBeDefined()
            expect(result.browserInfo.browserLanguage).toBe('en-US')
            expect(result.browserInfo.browserUserAgent).toBe('Mozilla/5.0')
            expect(result.browserInfo.javaEnabled).toBe(false)
            expect(result.browserInfo.javaScriptEnabled).toBe(true)
            expect(result.browserInfo.deviceLocalTimeZone).toBe(-300)
            expect(result.browserInfo.deviceIPAddress).toBe('192.168.1.1')
            expect(result.browserInfo.challengeWindowSize).toBe('FULL_SCREEN')
        })

        it('should include paymentAuthenticationRequest in card payload when 3DS enabled', () => {
            const paymentData = {
                amount: 1000,
                currency: 'USD',
                card: mockCardData,
                browserInfo: mockBrowserInfo,
                cardTypeName: 'VISA'
            }

            const config3DS = {
                jpmc3DSEnabled: true,
                threeDSEnabled: true,
                merchantId: 'test-merchant',
                threeDSReturnUrl: 'https://example.com/3ds-callback'
            }

            const result = buildPaymentRequestBody(paymentData, config3DS)

            expect(result.paymentMethodType.card.paymentAuthenticationRequest).toBeDefined()
        })

        it('should not include browserInfo when 3DS disabled', () => {
            const paymentData = {
                amount: 1000,
                currency: 'USD',
                card: mockCardData,
                browserInfo: mockBrowserInfo
            }

            const result = buildPaymentRequestBody(paymentData, { jpmc3DSEnabled: false })

            expect(result.browserInfo).toBeUndefined()
        })

        it('should not include browserInfo when browserInfo not provided', () => {
            const paymentData = {
                amount: 1000,
                currency: 'USD',
                card: mockCardData
            }

            const config3DS = {
                jpmc3DSEnabled: true,
                threeDSEnabled: true
            }

            const result = buildPaymentRequestBody(paymentData, config3DS)

            expect(result.browserInfo).toBeUndefined()
        })

        it('should skip 3DS for unsupported card types (DISCOVER)', () => {
            const paymentData = {
                amount: 1000,
                currency: 'USD',
                card: mockCardData,
                browserInfo: mockBrowserInfo,
                cardTypeName: 'DISCOVER'
            }

            const config3DS = {
                jpmc3DSEnabled: true,
                threeDSEnabled: true
            }

            const result = buildPaymentRequestBody(paymentData, config3DS)

            expect(result.browserInfo).toBeUndefined()
            expect(result.paymentMethodType.card.paymentAuthenticationRequest).toBeUndefined()
        })

        it('should use default IP address when clientIp not provided', () => {
            const paymentData = {
                amount: 1000,
                currency: 'USD',
                card: mockCardData,
                browserInfo: mockBrowserInfo,
                cardTypeName: 'VISA'
            }

            const config3DS = {
                jpmc3DSEnabled: true,
                threeDSEnabled: true,
                merchantId: 'test-merchant'
            }

            const result = buildPaymentRequestBody(paymentData, config3DS)

            expect(result.browserInfo.deviceIPAddress).toBe('0.0.0.0')
        })

        it('should handle javaEnabled true value', () => {
            const paymentData = {
                amount: 1000,
                currency: 'USD',
                card: mockCardData,
                browserInfo: { ...mockBrowserInfo, javaEnabled: true },
                cardTypeName: 'VISA'
            }

            const config3DS = {
                jpmc3DSEnabled: true,
                threeDSEnabled: true,
                merchantId: 'test-merchant'
            }

            const result = buildPaymentRequestBody(paymentData, config3DS)

            expect(result.browserInfo.javaEnabled).toBe(true)
        })
    })
})

// =============================================================================
// buildCardPayload Tests
// =============================================================================

describe('buildCardPayload', () => {
    it('should build encrypted card payload', () => {
        const result = buildCardPayload(mockCardData)

        expect(result.accountNumberType).toBe('SAFETECH_PAGE_ENCRYPTION')
        expect(result.accountNumber).toBe('encrypted-pan-123')
        expect(result.cvv).toBe('encrypted-cvv-456')
        expect(result.encryptionIntegrityCheck).toBe('integrity-check-789')
        expect(result.expiry.month).toBe(12)
        expect(result.expiry.year).toBe(2027)
        expect(result.isBillPayment).toBeUndefined()
    })

    it('should build raw card payload for testing', () => {
        const result = buildCardPayload(mockRawCardData)

        expect(result.accountNumber).toBe('4111111111111111')
        expect(result.cvv).toBe('123')
        expect(result.expiry.month).toBe(12)
        expect(result.expiry.year).toBe(2027)
        expect(result.accountNumberType).toBeUndefined()
    })

    it('should strip non-digit characters from card number', () => {
        const cardWithSpaces = {
            cardNumber: '4111 1111 1111 1111',
            cvv: '123',
            expiryMonth: 12,
            expiryYear: 2027
        }

        const result = buildCardPayload(cardWithSpaces)

        expect(result.accountNumber).toBe('4111111111111111')
    })

    it('should handle nested expiry object', () => {
        const cardWithNestedExpiry = {
            cardNumber: '4111111111111111',
            expiry: { month: 6, year: 2028 }
        }

        const result = buildCardPayload(cardWithNestedExpiry)

        expect(result.expiry.month).toBe(6)
        expect(result.expiry.year).toBe(2028)
    })
})

// =============================================================================
// buildVerificationRequestBody Tests
// =============================================================================

describe('buildVerificationRequestBody', () => {
    const verificationData = {
        card: mockCardData,
        accountHolder: mockAccountHolder,
        billingAddress: mockBillingAddress,
        currency: 'USD'
    }

    it('should build encrypted verification request', () => {
        const result = buildVerificationRequestBody(verificationData, false, mockConfig)

        expect(result.currency).toBe('USD')
        expect(result.paymentMethodType.card.accountNumberType).toBe('SAFETECH_PAGE_ENCRYPTION')
        expect(result.paymentMethodType.card.accountNumber).toBe('encrypted-pan-123')
        expect(result.paymentMethodType.card.cvv).toBe('encrypted-cvv-456')
        expect(result.accountOnFile).toBe('TO_BE_STORED')
        expect(result.initiatorType).toBe('CARDHOLDER')
    })

    it('should build plain card verification request when usePlainCard is true', () => {
        const plainCardData = {
            card: { cardNumber: '4111111111111111', cvv: '123', expiryMonth: 12, expiryYear: 2027 },
            accountHolder: mockAccountHolder,
            currency: 'USD'
        }

        const result = buildVerificationRequestBody(plainCardData, true, {})

        expect(result.paymentMethodType.card.accountNumber).toBe('4111111111111111')
        expect(result.paymentMethodType.card.cvv).toBe('123')
        expect(result.paymentMethodType.card.accountNumberType).toBeUndefined()
    })

    it('should include billing address when AVS enabled', () => {
        const result = buildVerificationRequestBody(verificationData, false, { enableAVS: true })

        expect(result.accountHolder).toBeDefined()
    })

    it('should NOT include billing address when AVS disabled', () => {
        const result = buildVerificationRequestBody(verificationData, false, { enableAVS: false })

        expect(result.accountHolder.billingAddress).toBeUndefined()
    })

    it('should include merchant software', () => {
        const result = buildVerificationRequestBody(verificationData, false, {})

        expect(result.merchant).toBeDefined()
        expect(result.merchant.merchantSoftware).toBeDefined()
    })
})

// =============================================================================
// buildGooglePayRequestBody Tests
// =============================================================================

describe('buildGooglePayRequestBody', () => {
    it('should build Google Pay request from token object', () => {
        const paymentData = {
            googlePayToken: mockGooglePayToken,
            amount: 9999,
            currency: 'USD',
            merchantOrderNumber: 'GPAY-001'
        }

        const result = buildGooglePayRequestBody(paymentData)

        expect(result.amount).toBe(9999)
        expect(result.currency).toBe('USD')
        expect(result.merchantOrderNumber).toBe('GPAY-001')
        expect(result.paymentMethodType.googlepay).toBeDefined()
        expect(result.paymentMethodType.googlepay.latLong).toBe('0,0')
        expect(result.accountOnFile).toBe('NOT_STORED')
    })

    it('should parse Google Pay token string', () => {
        const paymentData = {
            googlePayToken: JSON.stringify(mockGooglePayToken),
            amount: 5000,
            currency: 'USD'
        }

        const result = buildGooglePayRequestBody(paymentData)

        expect(result.paymentMethodType.googlepay.encryptedPaymentBundle).toBeDefined()
        expect(result.paymentMethodType.googlepay.encryptedPaymentBundle.protocolVersion).toBe('ECv2')
    })

    it('should use custom latLong when provided', () => {
        const paymentData = {
            googlePayToken: mockGooglePayToken,
            amount: 5000,
            currency: 'USD',
            latLong: '37.7749,-122.4194'
        }

        const result = buildGooglePayRequestBody(paymentData)

        expect(result.paymentMethodType.googlepay.latLong).toBe('37.7749,-122.4194')
    })

    it('should throw error when googlePayToken is missing', () => {
        const paymentData = {
            amount: 5000,
            currency: 'USD'
        }

        expect(() => buildGooglePayRequestBody(paymentData)).toThrow('googlePayToken is required')
    })

    it('should throw error when amount is missing', () => {
        const paymentData = {
            googlePayToken: mockGooglePayToken,
            currency: 'USD'
        }

        expect(() => buildGooglePayRequestBody(paymentData)).toThrow('amount is required')
    })

    it('should include email in accountHolder', () => {
        const paymentData = {
            googlePayToken: mockGooglePayToken,
            amount: 5000,
            currency: 'USD',
            email: 'test@example.com'
        }

        const result = buildGooglePayRequestBody(paymentData)

        expect(result.accountHolder.email).toBe('test@example.com')
    })

    it('should include billing address when AVS enabled through buildPaymentRequestBody', () => {
        // buildGooglePayRequestBody is called internally via buildPaymentRequestBody with config
        const paymentData = {
            googlePayToken: mockGooglePayToken,
            amount: 5000,
            currency: 'USD',
            billingAddress: mockBillingAddress,
            email: 'test@example.com'
        }

        const result = buildPaymentRequestBody(paymentData, { enableAVS: true })

        expect(result.paymentMethodType.googlepay).toBeDefined()
        expect(result.accountHolder.email).toBe('test@example.com')
    })

    it('should include clientIp in accountHolder', () => {
        const paymentData = {
            googlePayToken: mockGooglePayToken,
            amount: 5000,
            currency: 'USD',
            clientIp: '192.168.1.100'
        }

        const result = buildGooglePayRequestBody(paymentData)

        expect(result.accountHolder.IPAddress).toBe('192.168.1.100')
    })

    it('should handle malformed token string gracefully', () => {
        const paymentData = {
            googlePayToken: 'not-valid-json',
            amount: 5000,
            currency: 'USD'
        }

        // Should not throw - uses original token
        const result = buildGooglePayRequestBody(paymentData)
        expect(result.paymentMethodType.googlepay.encryptedPaymentBundle).toBe('not-valid-json')
    })

    it('should use MANUAL capture method when specified', () => {
        const paymentData = {
            googlePayToken: mockGooglePayToken,
            amount: 5000,
            currency: 'USD',
            captureMethod: 'MANUAL'
        }

        const result = buildGooglePayRequestBody(paymentData)

        expect(result.captureMethod).toBe('MANUAL')
    })
})

// =============================================================================
// buildGooglePayAccountHolder Tests
// =============================================================================

describe('buildGooglePayAccountHolder', () => {
    it('should build account holder with billing address and email', () => {
        const billingAddress = {
            name: 'Jane Smith',
            address1: '456 Oak Ave',
            locality: 'Los Angeles',
            administrativeArea: 'CA',
            countryCode: 'US',
            postalCode: '90001',
            phoneNumber: '3105551234'
        }

        const result = buildGooglePayAccountHolder(billingAddress, 'jane@example.com')

        expect(result.fullName).toBe('Jane Smith')
        expect(result.email).toBe('jane@example.com')
        expect(result.billingAddress).toBeDefined()
        expect(result.phone).toBeDefined()
    })

    it('should handle missing billing address', () => {
        const result = buildGooglePayAccountHolder(null, 'test@example.com')

        expect(result.email).toBe('test@example.com')
        expect(result.billingAddress).toBeUndefined()
    })

    it('should handle missing email', () => {
        const billingAddress = { name: 'Test User' }

        const result = buildGooglePayAccountHolder(billingAddress, null)

        expect(result.fullName).toBe('Test User')
        expect(result.email).toBeUndefined()
    })
})

// =============================================================================
// formatGooglePayBillingAddress Tests
// =============================================================================

describe('formatGooglePayBillingAddress', () => {
    it('should format Google Pay address to JP Morgan format', () => {
        const googlePayAddress = {
            line1: '789 Pine St',
            line2: 'Suite 100',
            city: 'Seattle',
            state: 'WA',
            postalCode: '98101',
            countryCode: 'US'
        }

        const result = formatGooglePayBillingAddress(googlePayAddress)

        expect(result.line1).toBe('789 Pine St')
        expect(result.line2).toBe('Suite 100')
        expect(result.city).toBe('Seattle')
        expect(result.state).toBe('WA')
        expect(result.postalCode).toBe('98101')
        expect(result.country).toBe('US')
    })

    it('should return null for null address', () => {
        expect(formatGooglePayBillingAddress(null)).toBeNull()
    })

    it('should return null when line1 is missing', () => {
        const addressNoLine1 = {
            city: 'Seattle',
            state: 'WA'
        }

        expect(formatGooglePayBillingAddress(addressNoLine1)).toBeNull()
    })

    it('should handle partial address data', () => {
        const partialAddress = {
            line1: '123 Test St',
            city: 'Portland'
        }

        const result = formatGooglePayBillingAddress(partialAddress)

        expect(result.line1).toBe('123 Test St')
        expect(result.city).toBe('Portland')
        expect(result.line2).toBeUndefined()
        expect(result.state).toBeUndefined()
    })
})

// =============================================================================
// validateGooglePayToken Tests
// =============================================================================

describe('validateGooglePayToken', () => {
    it('should validate complete ECv2 token', () => {
        const result = validateGooglePayToken(mockGooglePayToken)

        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
    })

    it('should fail validation when token is null', () => {
        const result = validateGooglePayToken(null)

        expect(result.valid).toBe(false)
        expect(result.errors).toContain('Token is required')
    })

    it('should fail validation when signature is missing', () => {
        const tokenNoSignature = { ...mockGooglePayToken, signature: undefined }

        const result = validateGooglePayToken(tokenNoSignature)

        expect(result.valid).toBe(false)
        expect(result.errors).toContain('Token missing signature field')
    })

    it('should fail validation when signedMessage is missing', () => {
        const tokenNoMessage = { ...mockGooglePayToken, signedMessage: undefined }

        const result = validateGooglePayToken(tokenNoMessage)

        expect(result.valid).toBe(false)
        expect(result.errors).toContain('Token missing signedMessage field')
    })

    it('should fail validation when protocolVersion is missing', () => {
        const tokenNoVersion = { ...mockGooglePayToken, protocolVersion: undefined }

        const result = validateGooglePayToken(tokenNoVersion)

        expect(result.valid).toBe(false)
        expect(result.errors).toContain('Token missing protocolVersion field')
    })

    it('should fail validation when intermediateSigningKey is missing', () => {
        const tokenNoKey = { ...mockGooglePayToken, intermediateSigningKey: undefined }

        const result = validateGooglePayToken(tokenNoKey)

        expect(result.valid).toBe(false)
        expect(result.errors).toContain('Token missing intermediateSigningKey field')
    })

    it('should collect multiple errors', () => {
        const emptyToken = {}

        const result = validateGooglePayToken(emptyToken)

        expect(result.valid).toBe(false)
        expect(result.errors.length).toBeGreaterThan(1)
    })
})
