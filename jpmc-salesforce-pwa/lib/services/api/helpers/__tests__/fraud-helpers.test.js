/**
 * Unit Tests for Fraud Helpers
 */

import { buildFraudCheckPayload } from '../fraud-helpers'

// Mock dependencies
jest.mock('../../../../utils/formatters/country-codes', () => ({
    convertCountryCode: jest.fn((code) => {
        const map = { US: 'USA', CA: 'CAN', GB: 'GBR' }
        return map[code] || code || 'USA'
    })
}))

describe('buildFraudCheckPayload', () => {
    const mockConfig = {
        merchantCategoryCode: '5411'
    }

    const mockCard = {
        accountNumber: 'encrypted_pan_123',
        encryptedCVV: 'encrypted_cvv_456',
        integrityCheck: 'hash789',
        expiryMonth: '12',
        expiryYear: '2027'
    }

    const mockAccountHolder = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '5551234567'
    }

    const mockBillingAddress = {
        line1: '123 Main St',
        line2: 'Apt 4',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        countryCode: 'US'
    }

    it('builds basic fraud payload with required fields', () => {
        const payload = buildFraudCheckPayload({
            config: mockConfig,
            card: mockCard,
            accountNumberType: 'SAFETECH_PAGE_ENCRYPTION',
            accountHolder: mockAccountHolder,
            billingAddress: mockBillingAddress,
            currency: 'USD',
            amount: 9999
        })

        expect(payload.amount).toBe(9999)
        expect(payload.currency).toBe('USD')
        expect(payload.accountHolder.email).toBe('john@example.com')
        expect(payload.accountHolder.fullName).toBe('John Doe')
        expect(payload.paymentMethodType.card.accountNumber).toBe('encrypted_pan_123')
        expect(payload.paymentMethodType.card.expiry.month).toBe(12)
        expect(payload.paymentMethodType.card.expiry.year).toBe(2027)
    })

    it('includes CVV and integrity check for SAFETECH encryption', () => {
        const payload = buildFraudCheckPayload({
            config: mockConfig,
            card: mockCard,
            accountNumberType: 'SAFETECH_PAGE_ENCRYPTION',
            accountHolder: mockAccountHolder,
            billingAddress: mockBillingAddress,
            currency: 'USD',
            amount: 5000
        })

        expect(payload.paymentMethodType.card.cvv).toBe('encrypted_cvv_456')
        expect(payload.paymentMethodType.card.encryptionIntegrityCheck).toBe('hash789')
    })

    it('excludes CVV for non-SAFETECH encryption types', () => {
        const payload = buildFraudCheckPayload({
            config: mockConfig,
            card: { ...mockCard, accountNumber: 'token123' },
            accountNumberType: 'SAFETECH_TOKEN',
            accountHolder: mockAccountHolder,
            billingAddress: mockBillingAddress,
            currency: 'USD',
            amount: 5000
        })

        expect(payload.paymentMethodType.card.cvv).toBeUndefined()
    })

    it('includes shipping info when shipTo provided', () => {
        const shipTo = {
            firstName: 'Jane',
            lastName: 'Smith',
            address1: '456 Oak Ave',
            city: 'Los Angeles',
            stateCode: 'CA',
            postalCode: '90001',
            countryCode: 'US',
            phone: '5559876543'
        }

        const payload = buildFraudCheckPayload({
            config: mockConfig,
            card: mockCard,
            accountNumberType: 'SAFETECH_PAGE_ENCRYPTION',
            accountHolder: mockAccountHolder,
            billingAddress: mockBillingAddress,
            currency: 'USD',
            amount: 5000,
            shipTo
        })

        expect(payload.shipTo).toBeDefined()
        expect(payload.shipTo.shippingAddress.line1).toBe('456 Oak Ave')
        expect(payload.shipTo.firstName).toBe('Jane')
        expect(payload.shipTo.lastName).toBe('Smith')
    })

    it('includes fraud score fields when provided', () => {
        const payload = buildFraudCheckPayload({
            config: mockConfig,
            card: mockCard,
            accountNumberType: 'SAFETECH_PAGE_ENCRYPTION',
            accountHolder: mockAccountHolder,
            billingAddress: mockBillingAddress,
            currency: 'USD',
            amount: 5000,
            kountSessionId: 'kount-session-123',
            userAgent: 'Mozilla/5.0',
            fraudShoppingCart: 'T=1000&I=SKU123&|'
        })

        expect(payload.fraudScore.sessionId).toBe('kount-session-123')
        expect(payload.fraudScore.cardholderBrowserInformation).toBe('Mozilla/5.0')
        expect(payload.fraudScore.fraudCheckShoppingCart).toBe('T=1000&I=SKU123&|')
        expect(payload.fraudScore.isFraudRuleReturn).toBe(true)
    })

    it('includes deviceIPAddress when provided', () => {
        const payload = buildFraudCheckPayload({
            config: mockConfig,
            card: mockCard,
            accountNumberType: 'SAFETECH_PAGE_ENCRYPTION',
            accountHolder: mockAccountHolder,
            billingAddress: mockBillingAddress,
            currency: 'USD',
            amount: 5000,
            deviceIPAddress: '192.168.1.1'
        })

        expect(payload.accountHolder.deviceIPAddress).toBe('192.168.1.1')
    })

    it('defaults to USD currency when not provided', () => {
        const payload = buildFraudCheckPayload({
            config: mockConfig,
            card: mockCard,
            accountNumberType: 'SAFETECH_PAGE_ENCRYPTION',
            accountHolder: mockAccountHolder,
            billingAddress: mockBillingAddress,
            amount: 1000
        })

        expect(payload.currency).toBe('USD')
    })

    it('rounds amount to integer', () => {
        const payload = buildFraudCheckPayload({
            config: mockConfig,
            card: mockCard,
            accountNumberType: 'SAFETECH_PAGE_ENCRYPTION',
            accountHolder: mockAccountHolder,
            billingAddress: mockBillingAddress,
            currency: 'USD',
            amount: 99.99
        })

        expect(payload.amount).toBe(100)
    })

    it('uses alternative card field names', () => {
        const altCard = {
            encryptedCardNumber: 'alt_encrypted_pan',
            expiryMonth: '06',
            expiryYear: '2025'
        }

        const payload = buildFraudCheckPayload({
            config: {},
            card: altCard,
            accountNumberType: 'SAFETECH_PAGE_ENCRYPTION',
            accountHolder: mockAccountHolder,
            billingAddress: mockBillingAddress,
            currency: 'USD',
            amount: 1000
        })

        expect(payload.paymentMethodType.card.accountNumber).toBe('alt_encrypted_pan')
    })
})
