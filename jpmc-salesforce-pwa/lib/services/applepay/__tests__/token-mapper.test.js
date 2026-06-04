/**
 * @fileoverview Unit tests for Apple Pay token mapper service
 * Tests the mapping of Apple Pay tokens to JPMC Online Payments API format
 */

import {
    mapApplePayTokenToJPMC,
    validateApplePayToken,
    isValidApplePayToken,
    buildJPMorganApplePayPayload,
    mapApplePayAddress,
    mapApplePayContactToAccountHolder,
    parseJPMCApplePayResponse,
    getCardNetwork,
    getCardDisplayName,
    isDebitCard,
    ApplePayTokenError
} from '../token-mapper';

// Sample valid Apple Pay token
const createValidApplePayToken = (overrides = {}) => ({
    paymentData: {
        data: 'encryptedPaymentData123456789',
        header: {
            ephemeralPublicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtest123',
            publicKeyHash: 'publicKeyHashValue123',
            transactionId: 'transaction123456',
            applicationData: 'applicationData789'
        },
        signature: 'signatureValue123456789',
        version: 'EC_v1'
    },
    paymentMethod: {
        displayName: 'Visa 1234',
        network: 'Visa',
        type: 'debit'
    },
    transactionIdentifier: 'TRANS123456789',
    ...overrides
});

// Sample valid Apple Pay contact
const createValidApplePayContact = (overrides = {}) => ({
    givenName: 'John',
    familyName: 'Doe',
    addressLines: ['123 Main St', 'Apt 4'],
    locality: 'San Francisco',
    administrativeArea: 'CA',
    postalCode: '94102',
    countryCode: 'US',
    emailAddress: 'john@example.com',
    phoneNumber: '+14155551234',
    ...overrides
});

describe('Apple Pay Token Mapper', () => {
    describe('validateApplePayToken', () => {
        it('should validate a correct Apple Pay token', () => {
            const token = createValidApplePayToken();
            // validateApplePayToken returns true on success or throws on failure
            expect(validateApplePayToken(token)).toBe(true);
        });

        it('should throw error for null token', () => {
            expect(() => validateApplePayToken(null)).toThrow(ApplePayTokenError);
            expect(() => validateApplePayToken(null)).toThrow('Apple Pay token is missing or undefined');
        });

        it('should throw error for undefined token', () => {
            expect(() => validateApplePayToken(undefined)).toThrow(ApplePayTokenError);
            expect(() => validateApplePayToken(undefined)).toThrow('Apple Pay token is missing or undefined');
        });

        it('should throw error for token without paymentData', () => {
            const token = createValidApplePayToken();
            delete token.paymentData;
            
            expect(() => validateApplePayToken(token)).toThrow(ApplePayTokenError);
            expect(() => validateApplePayToken(token)).toThrow('Apple Pay token missing paymentData object');
        });

        it('should throw error for token without paymentData.data', () => {
            const token = createValidApplePayToken();
            delete token.paymentData.data;
            
            expect(() => validateApplePayToken(token)).toThrow(ApplePayTokenError);
            expect(() => validateApplePayToken(token)).toThrow('Apple Pay token missing encrypted data');
        });

        it('should throw error for token without paymentData.header', () => {
            const token = createValidApplePayToken();
            delete token.paymentData.header;
            
            expect(() => validateApplePayToken(token)).toThrow(ApplePayTokenError);
            expect(() => validateApplePayToken(token)).toThrow('Apple Pay token missing header object');
        });

        it('should throw error for token without ephemeralPublicKey (EC_v1)', () => {
            const token = createValidApplePayToken();
            delete token.paymentData.header.ephemeralPublicKey;
            
            expect(() => validateApplePayToken(token)).toThrow(ApplePayTokenError);
            expect(() => validateApplePayToken(token)).toThrow('Apple Pay EC_v1 token missing ephemeralPublicKey');
        });

        it('should throw error for token without publicKeyHash', () => {
            const token = createValidApplePayToken();
            delete token.paymentData.header.publicKeyHash;
            
            expect(() => validateApplePayToken(token)).toThrow(ApplePayTokenError);
            expect(() => validateApplePayToken(token)).toThrow('Apple Pay token missing publicKeyHash');
        });

        it('should throw error for token without transactionId', () => {
            const token = createValidApplePayToken();
            delete token.paymentData.header.transactionId;
            
            expect(() => validateApplePayToken(token)).toThrow(ApplePayTokenError);
            expect(() => validateApplePayToken(token)).toThrow('Apple Pay token missing transactionId');
        });

        it('should throw error for token without signature', () => {
            const token = createValidApplePayToken();
            delete token.paymentData.signature;
            
            expect(() => validateApplePayToken(token)).toThrow(ApplePayTokenError);
            expect(() => validateApplePayToken(token)).toThrow('Apple Pay token missing signature');
        });

        it('should throw error for token without version', () => {
            const token = createValidApplePayToken();
            delete token.paymentData.version;
            
            expect(() => validateApplePayToken(token)).toThrow(ApplePayTokenError);
            expect(() => validateApplePayToken(token)).toThrow('Apple Pay token missing protocol version');
        });
    });

    describe('isValidApplePayToken', () => {
        it('should return true for valid token', () => {
            const token = createValidApplePayToken();
            expect(isValidApplePayToken(token)).toBe(true);
        });

        it('should return false for null token', () => {
            expect(isValidApplePayToken(null)).toBe(false);
        });

        it('should return false for undefined token', () => {
            expect(isValidApplePayToken(undefined)).toBe(false);
        });

        it('should return false for token without paymentData', () => {
            const token = createValidApplePayToken();
            delete token.paymentData;
            expect(isValidApplePayToken(token)).toBe(false);
        });

        it('should return false for empty object', () => {
            expect(isValidApplePayToken({})).toBe(false);
        });
    });

    describe('mapApplePayTokenToJPMC', () => {
        it('should map Apple Pay token to JPMC format with encryptedPaymentBundle', () => {
            const token = createValidApplePayToken();
            const mapped = mapApplePayTokenToJPMC(token);
            
            expect(mapped).toHaveProperty('encryptedPaymentBundle');
        });

        it('should include encryptedPayload in bundle', () => {
            const token = createValidApplePayToken();
            const mapped = mapApplePayTokenToJPMC(token);
            
            expect(mapped.encryptedPaymentBundle.encryptedPayload).toBe('encryptedPaymentData123456789');
        });

        it('should include encryptedPaymentHeader with all required fields', () => {
            const token = createValidApplePayToken();
            const mapped = mapApplePayTokenToJPMC(token);
            
            const header = mapped.encryptedPaymentBundle.encryptedPaymentHeader;
            expect(header.ephemeralPublicKey).toBe('MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtest123');
            expect(header.publicKeyHash).toBe('publicKeyHashValue123');
            expect(header.walletTransactionId).toBe('transaction123456');
        });

        it('should include signature', () => {
            const token = createValidApplePayToken();
            const mapped = mapApplePayTokenToJPMC(token);
            
            expect(mapped.encryptedPaymentBundle.signature).toBe('signatureValue123456789');
        });

        it('should include protocolVersion', () => {
            const token = createValidApplePayToken();
            const mapped = mapApplePayTokenToJPMC(token);
            
            expect(mapped.encryptedPaymentBundle.protocolVersion).toBe('EC_v1');
        });

        it('should include walletApplicationData when present', () => {
            const token = createValidApplePayToken();
            const mapped = mapApplePayTokenToJPMC(token);
            
            expect(mapped.encryptedPaymentBundle.encryptedPaymentHeader.walletApplicationData)
                .toBe('applicationData789');
        });

        it('should omit walletApplicationData when applicationData is missing', () => {
            const token = createValidApplePayToken();
            delete token.paymentData.header.applicationData;
            
            const mapped = mapApplePayTokenToJPMC(token);
            
            // walletApplicationData should be omitted entirely when not provided
            // JPMC validates this field content, so we don't use fallback values
            expect(mapped.encryptedPaymentBundle.encryptedPaymentHeader.walletApplicationData)
                .toBeUndefined();
        });

        it('should throw error for invalid token', () => {
            expect(() => mapApplePayTokenToJPMC(null)).toThrow(ApplePayTokenError);
            expect(() => mapApplePayTokenToJPMC({})).toThrow(ApplePayTokenError);
        });
    });

    describe('buildJPMorganApplePayPayload', () => {
        it('should build complete payment payload', () => {
            const token = createValidApplePayToken();
            const billingContact = createValidApplePayContact();
            
            const payload = buildJPMorganApplePayPayload({
                applePayToken: token,
                amount: 9999,
                currency: 'USD',
                billingContact
            });
            
            expect(payload).toHaveProperty('paymentMethodType');
            expect(payload).toHaveProperty('amount');
            expect(payload).toHaveProperty('currency');
            expect(payload).toHaveProperty('captureMethod');
        });

        it('should use hardcoded merchant software info (not configurable)', () => {
            const token = createValidApplePayToken();
            
            // Even when merchant info is provided, the hardcoded constants are used
            const payload = buildJPMorganApplePayPayload({
                applePayToken: token,
                amount: 9999,
                currency: 'USD',
                merchant: {
                    companyName: 'Test Company',
                    productName: 'Test Product',
                    version: '1.0.0'
                }
            });
            
            // Merchant software is hardcoded per JPMC requirements
            expect(payload.merchant.merchantSoftware.companyName).toBe('JPMC Plugin');
            expect(payload.merchant.merchantSoftware.productName).toBe('JPMC SFCC B2C Cartridge');
            expect(payload.merchant.merchantSoftware.version).toBe('1.0');
        });

        it('should use default merchant info when not provided', () => {
            const token = createValidApplePayToken();
            
            const payload = buildJPMorganApplePayPayload({
                applePayToken: token,
                amount: 9999,
                currency: 'USD'
            });
            
            // Uses hardcoded constants from MERCHANT_SOFTWARE
            expect(payload.merchant.merchantSoftware.companyName).toBe('JPMC Plugin');
            expect(payload.merchant.merchantSoftware.productName).toBe('JPMC SFCC B2C Cartridge');
        });

        it('should include amount and currency', () => {
            const token = createValidApplePayToken();
            
            const payload = buildJPMorganApplePayPayload({
                applePayToken: token,
                amount: 12345,
                currency: 'USD'
            });
            
            expect(payload.amount).toBe(12345);
            expect(payload.currency).toBe('USD');
        });

        it('should convert string amount to integer', () => {
            const token = createValidApplePayToken();
            
            const payload = buildJPMorganApplePayPayload({
                applePayToken: token,
                amount: '9999',
                currency: 'USD'
            });
            
            expect(payload.amount).toBe(9999);
        });

        it('should include account holder when billing contact provided', () => {
            const token = createValidApplePayToken();
            const billingContact = createValidApplePayContact();
            
            const payload = buildJPMorganApplePayPayload({
                applePayToken: token,
                amount: 9999,
                currency: 'USD',
                billingContact
            });
            
            expect(payload.accountHolder).toBeDefined();
            expect(payload.accountHolder.fullName).toBe('John Doe');
            expect(payload.accountHolder.email).toBe('john@example.com');
        });

        it('should include shipping info when shipping contact provided', () => {
            const token = createValidApplePayToken();
            const shippingContact = createValidApplePayContact();
            
            const payload = buildJPMorganApplePayPayload({
                applePayToken: token,
                amount: 9999,
                currency: 'USD',
                shippingContact
            });
            
            expect(payload.shipTo).toBeDefined();
            expect(payload.shipTo.shippingAddress).toBeDefined();
            expect(payload.shipTo.fullName).toBe('John Doe');
        });

        it('should handle missing shipping contact', () => {
            const token = createValidApplePayToken();
            
            const payload = buildJPMorganApplePayPayload({
                applePayToken: token,
                amount: 9999,
                currency: 'USD'
            });
            
            expect(payload.shipTo).toBeUndefined();
        });

        it('should set correct captureMethod for MANUAL capture', () => {
            const token = createValidApplePayToken();
            
            const payload = buildJPMorganApplePayPayload({
                applePayToken: token,
                amount: 9999,
                currency: 'USD',
                captureMethod: 'MANUAL'
            });
            
            expect(payload.captureMethod).toBe('MANUAL');
        });

        it('should default captureMethod to NOW', () => {
            const token = createValidApplePayToken();
            
            const payload = buildJPMorganApplePayPayload({
                applePayToken: token,
                amount: 9999,
                currency: 'USD'
            });
            
            expect(payload.captureMethod).toBe('NOW');
        });

        it('should include Apple Pay encrypted payment bundle', () => {
            const token = createValidApplePayToken();
            
            const payload = buildJPMorganApplePayPayload({
                applePayToken: token,
                amount: 9999,
                currency: 'USD'
            });
            
            expect(payload.paymentMethodType.applepay.encryptedPaymentBundle.encryptedPayload)
                .toBe('encryptedPaymentData123456789');
        });

        it('should include latLong', () => {
            const token = createValidApplePayToken();
            
            const payload = buildJPMorganApplePayPayload({
                applePayToken: token,
                amount: 9999,
                currency: 'USD',
                latLong: '37.7749,-122.4194'
            });
            
            expect(payload.paymentMethodType.applepay.latLong).toBe('37.7749,-122.4194');
        });

        it('should use default latLong when not provided', () => {
            const token = createValidApplePayToken();
            
            const payload = buildJPMorganApplePayPayload({
                applePayToken: token,
                amount: 9999,
                currency: 'USD'
            });
            
            // Default latLong from APPLE_PAY_DEFAULTS
            expect(payload.paymentMethodType.applepay.latLong).toBeDefined();
        });

        it('should include merchantOrderNumber when provided', () => {
            const token = createValidApplePayToken();
            
            const payload = buildJPMorganApplePayPayload({
                applePayToken: token,
                amount: 9999,
                currency: 'USD',
                merchantOrderNumber: 'ORDER-123'
            });
            
            expect(payload.merchantOrderNumber).toBe('ORDER-123');
        });

        it('should throw error when token is invalid', () => {
            expect(() => buildJPMorganApplePayPayload({
                applePayToken: null,
                amount: 9999,
                currency: 'USD'
            })).toThrow(ApplePayTokenError);
        });
    });

    describe('mapApplePayAddress', () => {
        it('should map Apple Pay contact to address format with 3-letter country code', () => {
            const contact = createValidApplePayContact();
            const address = mapApplePayAddress(contact);
            
            expect(address.line1).toBe('123 Main St');
            expect(address.line2).toBe('Apt 4');
            expect(address.city).toBe('San Francisco');
            expect(address.state).toBe('CA');
            expect(address.postalCode).toBe('94102');
            // JPMC requires ISO 3166-1 alpha-3 country codes
            expect(address.countryCode).toBe('USA');
        });

        it('should return null for null contact', () => {
            expect(mapApplePayAddress(null)).toBeNull();
        });

        it('should return null for undefined contact', () => {
            expect(mapApplePayAddress(undefined)).toBeNull();
        });

        it('should handle missing address lines by setting line1 to empty and omitting line2', () => {
            const contact = createValidApplePayContact();
            delete contact.addressLines;
            
            const address = mapApplePayAddress(contact);
            
            expect(address.line1).toBe('');
            // line2 is only included when addressLines[1] exists
            expect(address.line2).toBeUndefined();
        });

        it('should handle contact with city fallback', () => {
            const contact = {
                city: 'Los Angeles',
                state: 'CA',
                postalCode: '90001',
                countryCode: 'US'
            };
            
            const address = mapApplePayAddress(contact);
            
            expect(address.city).toBe('Los Angeles');
            expect(address.state).toBe('CA');
        });

        it('should convert 2-letter country code to 3-letter', () => {
            const contact = {
                addressLines: ['123 Main St'],
                locality: 'Boston',
                administrativeArea: 'MA',
                postalCode: '02101',
                country: 'US'
            };
            
            const address = mapApplePayAddress(contact);
            
            // Should convert US to USA
            expect(address.countryCode).toBe('USA');
        });
    });

    describe('mapApplePayContactToAccountHolder', () => {
        it('should map billing contact to account holder format', () => {
            const billingContact = createValidApplePayContact();
            const accountHolder = mapApplePayContactToAccountHolder(billingContact);
            
            expect(accountHolder.fullName).toBe('John Doe');
            expect(accountHolder.firstName).toBe('John');
            expect(accountHolder.lastName).toBe('Doe');
            expect(accountHolder.email).toBe('john@example.com');
        });

        it('should handle phone number formatting', () => {
            const billingContact = createValidApplePayContact();
            const accountHolder = mapApplePayContactToAccountHolder(billingContact);
            
            expect(accountHolder.phone).toBeDefined();
            expect(accountHolder.phone.phoneNumber).toBe('14155551234'); // Non-digit chars removed
            expect(accountHolder.phone.countryCode).toBe('1');
        });

        it('should include billing address', () => {
            const billingContact = createValidApplePayContact();
            const accountHolder = mapApplePayContactToAccountHolder(billingContact);
            
            expect(accountHolder.billingAddress).toBeDefined();
            expect(accountHolder.billingAddress.city).toBe('San Francisco');
        });

        it('should return empty object for null contact', () => {
            const accountHolder = mapApplePayContactToAccountHolder(null);
            expect(accountHolder).toEqual({});
        });

        it('should handle contact with only name', () => {
            const billingContact = {
                givenName: 'Jane',
                familyName: 'Smith'
            };
            const accountHolder = mapApplePayContactToAccountHolder(billingContact);
            
            expect(accountHolder.fullName).toBe('Jane Smith');
            expect(accountHolder.firstName).toBe('Jane');
            expect(accountHolder.lastName).toBe('Smith');
            expect(accountHolder.email).toBeUndefined();
        });
    });

    describe('parseJPMCApplePayResponse', () => {
        it('should parse successful response', () => {
            const response = {
                responseStatus: 'SUCCESS',
                transactionState: 'AUTHORIZED',
                transactionId: 'TXN123',
                requestId: 'REQ123',
                approvalCode: 'APPROVED',
                amount: 9999,
                currency: 'USD',
                paymentMethodType: {
                    card: {
                        cardType: 'VISA',
                        cardTypeName: 'Visa',
                        maskedAccountNumber: '************1234',
                        walletProvider: 'APPLE_PAY'
                    }
                }
            };
            
            const parsed = parseJPMCApplePayResponse(response);
            
            expect(parsed.success).toBe(true);
            expect(parsed.transactionId).toBe('TXN123');
            expect(parsed.cardType).toBe('VISA');
            expect(parsed.lastFour).toBe('1234');
        });

        it('should return failure for failed response', () => {
            const response = {
                responseStatus: 'FAILURE',
                transactionState: 'DECLINED',
                responseCode: '05',
                responseMessage: 'Do not honor'
            };
            
            const parsed = parseJPMCApplePayResponse(response);
            
            expect(parsed.success).toBe(false);
            expect(parsed.responseCode).toBe('05');
        });

        it('should return failure for empty response', () => {
            const parsed = parseJPMCApplePayResponse(null);
            
            expect(parsed.success).toBe(false);
            expect(parsed.error.code).toBe('EMPTY_RESPONSE');
        });

        it('should include raw response for debugging', () => {
            const response = {
                responseStatus: 'SUCCESS',
                transactionState: 'AUTHORIZED'
            };
            
            const parsed = parseJPMCApplePayResponse(response);
            
            expect(parsed.raw).toBe(response);
        });
    });

    describe('getCardNetwork', () => {
        it('should return normalized network name for Visa', () => {
            const payment = { paymentMethod: { network: 'Visa' } };
            expect(getCardNetwork(payment)).toBe('VISA');
        });

        it('should return normalized network name for Mastercard', () => {
            const payment = { paymentMethod: { network: 'mastercard' } };
            expect(getCardNetwork(payment)).toBe('MASTERCARD');
        });

        it('should return normalized network name for Amex', () => {
            const payment = { paymentMethod: { network: 'amex' } };
            expect(getCardNetwork(payment)).toBe('AMEX');
        });

        it('should return null for missing network', () => {
            expect(getCardNetwork({})).toBeNull();
            expect(getCardNetwork(null)).toBeNull();
            expect(getCardNetwork({ paymentMethod: {} })).toBeNull();
        });

        it('should handle unknown networks', () => {
            const payment = { paymentMethod: { network: 'NewCard' } };
            expect(getCardNetwork(payment)).toBe('NEWCARD');
        });
    });

    describe('getCardDisplayName', () => {
        it('should return display name from payment', () => {
            const payment = { paymentMethod: { displayName: 'Visa 1234' } };
            expect(getCardDisplayName(payment)).toBe('Visa 1234');
        });

        it('should return null for missing display name', () => {
            expect(getCardDisplayName({})).toBeNull();
            expect(getCardDisplayName(null)).toBeNull();
        });
    });

    describe('isDebitCard', () => {
        it('should return true for debit card', () => {
            const payment = { paymentMethod: { type: 'debit' } };
            expect(isDebitCard(payment)).toBe(true);
        });

        it('should return false for credit card', () => {
            const payment = { paymentMethod: { type: 'credit' } };
            expect(isDebitCard(payment)).toBe(false);
        });

        it('should return false for missing type', () => {
            expect(isDebitCard({})).toBeFalsy();
            expect(isDebitCard(null)).toBeFalsy();
        });
    });

    describe('ApplePayTokenError', () => {
        it('should be an instance of Error', () => {
            const error = new ApplePayTokenError('CODE', 'Message');
            expect(error).toBeInstanceOf(Error);
        });

        it('should have correct name', () => {
            const error = new ApplePayTokenError('CODE', 'Message');
            expect(error.name).toBe('ApplePayTokenError');
        });

        it('should have code and message', () => {
            const error = new ApplePayTokenError('TEST_CODE', 'Test message');
            expect(error.code).toBe('TEST_CODE');
            expect(error.message).toBe('Test message');
        });

        it('should support cause parameter', () => {
            const cause = new Error('Original error');
            const error = new ApplePayTokenError('CODE', 'Message', cause);
            expect(error.cause).toBe(cause);
        });
    });

    describe('Edge Cases', () => {
        it('should handle token with empty string data', () => {
            const token = createValidApplePayToken();
            token.paymentData.data = '';
            
            expect(() => validateApplePayToken(token)).toThrow(ApplePayTokenError);
        });

        it('should handle very long encrypted data', () => {
            const token = createValidApplePayToken();
            token.paymentData.data = 'x'.repeat(10000);
            
            const mapped = mapApplePayTokenToJPMC(token);
            
            expect(mapped.encryptedPaymentBundle.encryptedPayload).toHaveLength(10000);
        });

        it('should handle special characters in data', () => {
            const token = createValidApplePayToken();
            token.paymentData.data = 'data+/==special';
            token.paymentData.signature = 'sig+/==special';
            
            const mapped = mapApplePayTokenToJPMC(token);
            
            expect(mapped.encryptedPaymentBundle.encryptedPayload).toBe('data+/==special');
            expect(mapped.encryptedPaymentBundle.signature).toBe('sig+/==special');
        });

        it('should handle RSA_v1 protocol version without ephemeralPublicKey', () => {
            const token = createValidApplePayToken();
            token.paymentData.version = 'RSA_v1';
            // RSA_v1 uses wrappedKey instead of ephemeralPublicKey
            delete token.paymentData.header.ephemeralPublicKey;
            token.paymentData.header.wrappedKey = 'wrappedKeyValue123';
            
            // RSA_v1 does not require ephemeralPublicKey, so it should validate
            expect(validateApplePayToken(token)).toBe(true);
        });

        it('should handle EC_v1 protocol version requiring ephemeralPublicKey', () => {
            const token = createValidApplePayToken();
            token.paymentData.version = 'EC_v1';
            // EC_v1 requires ephemeralPublicKey
            delete token.paymentData.header.ephemeralPublicKey;
            
            expect(() => validateApplePayToken(token)).toThrow('ephemeralPublicKey');
        });

        it('should map EC_v2 protocol version correctly', () => {
            const token = createValidApplePayToken();
            token.paymentData.version = 'EC_v2';
            
            const mapped = mapApplePayTokenToJPMC(token);
            
            expect(mapped.encryptedPaymentBundle.protocolVersion).toBe('EC_v2');
        });
    });
});
