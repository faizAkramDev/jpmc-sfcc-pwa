/**
 * Attribute Mapping Tests
 * 
 * Tests for the JPMC response to SFCC attribute mapping functions
 */

import {
    DEFAULT_ATTRIBUTE_MAPPING,
    PAYMENT_TRANSACTION_ATTRIBUTE_MAPPING,
    AUTH_ORDER_ATTRIBUTE_MAPPING,
    FRAUD_CHECK_ORDER_ATTRIBUTE_MAPPING,
    mapJPMCResponseToAttributes,
    mapPaymentTransactionAttributes,
    mapAuthResponseToOrderAttributes,
    mapFraudResponseToOrderAttributes,
    createAttributeMapper,
    validateAttributeMapping
} from '../attribute-mapping'

// Mock logger
jest.mock('../../../utils/logger.js', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}))

import logger from '../../../utils/logger.js'

describe('attribute-mapping', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('DEFAULT_ATTRIBUTE_MAPPING', () => {
        it('contains c_jpmcTransactionId mapping as function', () => {
            expect(DEFAULT_ATTRIBUTE_MAPPING).toHaveProperty('c_jpmcTransactionId')
            expect(typeof DEFAULT_ATTRIBUTE_MAPPING.c_jpmcTransactionId).toBe('function')
        })

        it('c_jpmcTransactionId extracts transaction ID from response', () => {
            const mapper = DEFAULT_ATTRIBUTE_MAPPING.c_jpmcTransactionId

            // Test paymentGatewayTransactionId priority
            expect(mapper({ paymentGatewayTransactionId: 'pgw_12345' })).toBe('pgw_12345')

            // Test transactionId fallback
            expect(mapper({ transactionId: 'txn_67890' })).toBe('txn_67890')

            // Test paymentGatewayTransactionId takes priority
            expect(mapper({ 
                paymentGatewayTransactionId: 'pgw_12345',
                transactionId: 'txn_67890' 
            })).toBe('pgw_12345')

            // Test null return when no transaction ID
            expect(mapper({})).toBeNull()
        })

        it('contains c_jpmcCardTypeName mapping as function', () => {
            expect(DEFAULT_ATTRIBUTE_MAPPING).toHaveProperty('c_jpmcCardTypeName')
            expect(typeof DEFAULT_ATTRIBUTE_MAPPING.c_jpmcCardTypeName).toBe('function')
        })

        it('c_jpmcCardTypeName extracts card type from normalized response (top-level)', () => {
            const mapper = DEFAULT_ATTRIBUTE_MAPPING.c_jpmcCardTypeName

            // Normalized response has cardTypeName at top level
            expect(mapper({ cardTypeName: 'VISA' })).toBe('VISA')
            expect(mapper({ cardTypeName: 'JCB' })).toBe('JCB')
            expect(mapper({ cardTypeName: 'DINERS' })).toBe('DINERS')
        })

        it('c_jpmcCardTypeName extracts card type from raw response (nested)', () => {
            const mapper = DEFAULT_ATTRIBUTE_MAPPING.c_jpmcCardTypeName

            // Raw response has cardTypeName nested in paymentMethodType.card
            expect(mapper({
                paymentMethodType: { card: { cardTypeName: 'VISA' } }
            })).toBe('VISA')

            // Test with JCB
            expect(mapper({
                paymentMethodType: { card: { cardTypeName: 'JCB' } }
            })).toBe('JCB')

            // Test with DINERS
            expect(mapper({
                paymentMethodType: { card: { cardTypeName: 'DINERS' } }
            })).toBe('DINERS')
        })

        it('c_jpmcCardTypeName falls back to cardType (short code) when cardTypeName missing', () => {
            const mapper = DEFAULT_ATTRIBUTE_MAPPING.c_jpmcCardTypeName

            // Fallback to top-level cardType
            expect(mapper({ cardType: 'VI' })).toBe('VI')
            expect(mapper({ cardType: 'MC' })).toBe('MC')
            expect(mapper({ cardType: 'AX' })).toBe('AX')

            // Fallback to nested cardType
            expect(mapper({ paymentMethodType: { card: { cardType: 'VI' } } })).toBe('VI')
            expect(mapper({ paymentMethodType: { card: { cardType: 'MC' } } })).toBe('MC')
        })

        it('c_jpmcCardTypeName prefers cardTypeName over cardType', () => {
            const mapper = DEFAULT_ATTRIBUTE_MAPPING.c_jpmcCardTypeName

            // cardTypeName takes priority
            expect(mapper({ cardTypeName: 'VISA', cardType: 'VI' })).toBe('VISA')
            expect(mapper({ 
                paymentMethodType: { card: { cardTypeName: 'MASTERCARD', cardType: 'MC' } } 
            })).toBe('MASTERCARD')
        })

        it('c_jpmcCardTypeName handles missing card data', () => {
            const mapper = DEFAULT_ATTRIBUTE_MAPPING.c_jpmcCardTypeName

            // Test with missing card data
            expect(mapper({})).toBeNull()
            expect(mapper({ paymentMethodType: {} })).toBeNull()
            expect(mapper({ paymentMethodType: { card: {} } })).toBeNull()
        })
    })

    describe('PAYMENT_TRANSACTION_ATTRIBUTE_MAPPING', () => {
        it('contains required mappings', () => {
            expect(PAYMENT_TRANSACTION_ATTRIBUTE_MAPPING).toHaveProperty('c_jpmcAuthorizationId')
            expect(PAYMENT_TRANSACTION_ATTRIBUTE_MAPPING).toHaveProperty('c_jpmcCaptureMethod')
            expect(PAYMENT_TRANSACTION_ATTRIBUTE_MAPPING).toHaveProperty('c_jpmcAuthTimestamp')
        })

        it('c_jpmcAuthTimestamp is a function', () => {
            expect(typeof PAYMENT_TRANSACTION_ATTRIBUTE_MAPPING.c_jpmcAuthTimestamp).toBe('function')
        })

        it('c_jpmcAuthTimestamp handles timestamp variations', () => {
            const mapper = PAYMENT_TRANSACTION_ATTRIBUTE_MAPPING.c_jpmcAuthTimestamp

            // Test 'timestamp' field
            expect(mapper({ timestamp: '2024-01-15T10:00:00.000Z' })).toBe('2024-01-15T10:00:00.000Z')

            // Test 'transactionDate' fallback
            expect(mapper({ transactionDate: '2024-01-16' })).toBe('2024-01-16')

            // Test '_timestamp' fallback
            expect(mapper({ _timestamp: '2024-01-17' })).toBe('2024-01-17')

            // Returns undefined if none present
            expect(mapper({})).toBeUndefined()
        })

        it('contains c_jpmcCardTypeName mapping', () => {
            expect(PAYMENT_TRANSACTION_ATTRIBUTE_MAPPING).toHaveProperty('c_jpmcCardTypeName')
            expect(typeof PAYMENT_TRANSACTION_ATTRIBUTE_MAPPING.c_jpmcCardTypeName).toBe('function')
        })

        it('c_jpmcCardTypeName extracts card type from normalized and raw response', () => {
            const mapper = PAYMENT_TRANSACTION_ATTRIBUTE_MAPPING.c_jpmcCardTypeName

            // Normalized response (top-level cardTypeName)
            expect(mapper({ cardTypeName: 'VISA' })).toBe('VISA')
            expect(mapper({ cardTypeName: 'JCB' })).toBe('JCB')
            expect(mapper({ cardTypeName: 'DINERS' })).toBe('DINERS')

            // Raw response (nested in paymentMethodType.card)
            expect(mapper({ paymentMethodType: { card: { cardTypeName: 'MASTERCARD' } } })).toBe('MASTERCARD')

            // Missing data
            expect(mapper({})).toBeNull()
        })

        it('c_jpmcCardTypeName falls back to cardType (short code) when cardTypeName missing', () => {
            const mapper = PAYMENT_TRANSACTION_ATTRIBUTE_MAPPING.c_jpmcCardTypeName

            expect(mapper({ cardType: 'VI' })).toBe('VI')
            expect(mapper({ paymentMethodType: { card: { cardType: 'MC' } } })).toBe('MC')

            // cardTypeName takes priority over cardType
            expect(mapper({ cardTypeName: 'VISA', cardType: 'VI' })).toBe('VISA')
        })
    })

    describe('mapJPMCResponseToAttributes', () => {
        it('maps transactionId to c_jpmcTransactionId', () => {
            const response = { transactionId: 'txn_123456' }
            const attributes = mapJPMCResponseToAttributes(response)

            expect(attributes.c_jpmcTransactionId).toBe('txn_123456')
        })

        it('maps cardTypeName to c_jpmcCardTypeName', () => {
            const response = {
                transactionId: 'txn_123456',
                paymentMethodType: {
                    card: {
                        cardTypeName: 'DISCOVER'
                    }
                }
            }
            const attributes = mapJPMCResponseToAttributes(response)

            expect(attributes.c_jpmcTransactionId).toBe('txn_123456')
            expect(attributes.c_jpmcCardTypeName).toBe('DISCOVER')
        })

        it('omits c_jpmcCardTypeName when card type is not present', () => {
            const response = { transactionId: 'txn_123456' }
            const attributes = mapJPMCResponseToAttributes(response)

            expect(attributes.c_jpmcTransactionId).toBe('txn_123456')
            expect(attributes.c_jpmcCardTypeName).toBeUndefined()
        })

        it('returns empty object for null response', () => {
            const attributes = mapJPMCResponseToAttributes(null)

            expect(attributes).toEqual({})
            expect(logger.warn).toHaveBeenCalled()
        })

        it('returns empty object for undefined response', () => {
            const attributes = mapJPMCResponseToAttributes(undefined)

            expect(attributes).toEqual({})
        })

        it('uses custom mapping', () => {
            const response = { transactionId: 'txn_123', customField: 'custom value' }
            const customMapping = {
                c_myCustomField: 'customField'
            }

            const attributes = mapJPMCResponseToAttributes(response, customMapping)

            expect(attributes.c_jpmcTransactionId).toBe('txn_123')
            expect(attributes.c_myCustomField).toBe('custom value')
        })

        it('custom mapping overrides default', () => {
            const response = { transactionId: 'txn_123' }
            const customMapping = {
                c_jpmcTransactionId: () => 'overridden'
            }

            const attributes = mapJPMCResponseToAttributes(response, customMapping)

            expect(attributes.c_jpmcTransactionId).toBe('overridden')
        })

        it('supports function mappers', () => {
            const response = { transactionId: 'txn_123', amount: 100 }
            const customMapping = {
                c_computed: (resp) => `${resp.transactionId}-${resp.amount}`
            }

            const attributes = mapJPMCResponseToAttributes(response, customMapping)

            expect(attributes.c_computed).toBe('txn_123-100')
        })

        it('supports nested property paths', () => {
            const response = {
                transactionId: 'txn_123',
                card: {
                    lastFour: '1234',
                    brand: 'VISA'
                }
            }
            const customMapping = {
                c_cardLastFour: 'card.lastFour',
                c_cardBrand: 'card.brand'
            }

            const attributes = mapJPMCResponseToAttributes(response, customMapping)

            expect(attributes.c_cardLastFour).toBe('1234')
            expect(attributes.c_cardBrand).toBe('VISA')
        })

        it('excludes undefined values', () => {
            const response = { transactionId: 'txn_123' }
            const customMapping = {
                c_missingField: 'nonExistent'
            }

            const attributes = mapJPMCResponseToAttributes(response, customMapping)

            expect(attributes).not.toHaveProperty('c_missingField')
        })

        it('excludes null values', () => {
            const response = { transactionId: 'txn_123', nullField: null }
            const customMapping = {
                c_nullField: 'nullField'
            }

            const attributes = mapJPMCResponseToAttributes(response, customMapping)

            expect(attributes).not.toHaveProperty('c_nullField')
        })

        it('excludes empty string values', () => {
            const response = { transactionId: 'txn_123', emptyField: '' }
            const customMapping = {
                c_emptyField: 'emptyField'
            }

            const attributes = mapJPMCResponseToAttributes(response, customMapping)

            expect(attributes).not.toHaveProperty('c_emptyField')
        })

        it('handles mapper function errors gracefully', () => {
            const response = { transactionId: 'txn_123' }
            const customMapping = {
                c_errorField: () => { throw new Error('Mapper error') }
            }

            const attributes = mapJPMCResponseToAttributes(response, customMapping)

            expect(attributes).not.toHaveProperty('c_errorField')
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Error mapping c_errorField'),
                expect.anything()
            )
        })
    })

    describe('mapPaymentTransactionAttributes', () => {
        const mockResponse = {
            transactionId: 'txn_123',
            timestamp: '2024-01-15T10:30:00.000Z'
        }

        it('returns empty object for null response', () => {
            const attributes = mapPaymentTransactionAttributes(null, 99.99, 'NOW')

            expect(attributes).toEqual({})
            expect(logger.warn).toHaveBeenCalled()
        })

        it('returns empty object for invalid payment amount', () => {
            const attributes = mapPaymentTransactionAttributes(mockResponse, null, 'NOW')

            expect(attributes).toEqual({})
            expect(logger.warn).toHaveBeenCalled()
        })

        it('returns empty object for non-number payment amount', () => {
            const attributes = mapPaymentTransactionAttributes(mockResponse, 'invalid', 'NOW')

            expect(attributes).toEqual({})
        })

        describe('captureMethod = NOW (immediate capture)', () => {
            it('sets payment status to AC', () => {
                const attributes = mapPaymentTransactionAttributes(mockResponse, 99.99, 'NOW')

                expect(attributes.c_jpmcPaymentStatus).toBe('AC')
            })

            it('sets captured amount to full amount', () => {
                const attributes = mapPaymentTransactionAttributes(mockResponse, 99.99, 'NOW')

                expect(attributes.c_jpmcCapturedAmount).toBe(99.99)
            })

            it('sets remaining auth amount to 0', () => {
                const attributes = mapPaymentTransactionAttributes(mockResponse, 99.99, 'NOW')

                expect(attributes.c_jpmcRemainingAuthAmount).toBe(0)
            })

            it('sets remaining refundable amount to full amount', () => {
                const attributes = mapPaymentTransactionAttributes(mockResponse, 99.99, 'NOW')

                expect(attributes.c_jpmcRemainingRefundableAmount).toBe(99.99)
            })

            it('includes authorization ID', () => {
                const attributes = mapPaymentTransactionAttributes(mockResponse, 99.99, 'NOW')

                expect(attributes.c_jpmcAuthorizationId).toBe('txn_123')
            })

            it('includes capture method', () => {
                const attributes = mapPaymentTransactionAttributes(mockResponse, 99.99, 'NOW')

                expect(attributes.c_jpmcCaptureMethod).toBe('NOW')
            })

            it('includes auth timestamp', () => {
                const attributes = mapPaymentTransactionAttributes(mockResponse, 99.99, 'NOW')

                expect(attributes.c_jpmcAuthTimestamp).toBe('2024-01-15T10:30:00.000Z')
            })
        })

        describe('captureMethod = MANUAL (auth only)', () => {
            it('sets payment status to A', () => {
                const attributes = mapPaymentTransactionAttributes(mockResponse, 99.99, 'MANUAL')

                expect(attributes.c_jpmcPaymentStatus).toBe('A')
            })

            it('sets remaining auth amount to full amount', () => {
                const attributes = mapPaymentTransactionAttributes(mockResponse, 99.99, 'MANUAL')

                expect(attributes.c_jpmcRemainingAuthAmount).toBe(99.99)
            })

            it('sets remaining refundable amount to 0', () => {
                const attributes = mapPaymentTransactionAttributes(mockResponse, 99.99, 'MANUAL')

                expect(attributes.c_jpmcRemainingRefundableAmount).toBe(0)
            })

            it('does not set captured amount', () => {
                const attributes = mapPaymentTransactionAttributes(mockResponse, 99.99, 'MANUAL')

                expect(attributes).not.toHaveProperty('c_jpmcCapturedAmount')
            })
        })

        describe('captureMethod = DELAYED', () => {
            it('treats DELAYED same as MANUAL', () => {
                const attributes = mapPaymentTransactionAttributes(mockResponse, 99.99, 'DELAYED')

                expect(attributes.c_jpmcPaymentStatus).toBe('A')
                expect(attributes.c_jpmcRemainingAuthAmount).toBe(99.99)
            })
        })

        it('defaults to MANUAL capture method', () => {
            const attributes = mapPaymentTransactionAttributes(mockResponse, 99.99)

            expect(attributes.c_jpmcPaymentStatus).toBe('A')
            expect(attributes.c_jpmcCaptureMethod).toBe('MANUAL')
        })

        it('accepts custom mapping', () => {
            const customMapping = {
                c_myCustomField: () => 'custom value'
            }

            const attributes = mapPaymentTransactionAttributes(mockResponse, 99.99, 'NOW', customMapping)

            expect(attributes.c_myCustomField).toBe('custom value')
        })
    })

    describe('createAttributeMapper', () => {
        it('creates a reusable mapper function', () => {
            const customMapping = {
                c_provider: () => 'JPMC',
                c_version: () => '1.0'
            }

            const mapper = createAttributeMapper(customMapping)

            const response = { transactionId: 'txn_123' }
            const attributes = mapper(response)

            expect(attributes.c_jpmcTransactionId).toBe('txn_123')
            expect(attributes.c_provider).toBe('JPMC')
            expect(attributes.c_version).toBe('1.0')
        })

        it('works with empty custom mapping', () => {
            const mapper = createAttributeMapper()
            const response = { transactionId: 'txn_123' }

            const attributes = mapper(response)

            expect(attributes.c_jpmcTransactionId).toBe('txn_123')
        })
    })

    describe('validateAttributeMapping', () => {
        it('validates default mapping as valid', () => {
            const result = validateAttributeMapping()

            expect(result.valid).toBe(true)
            expect(result.errors).toHaveLength(0)
        })

        it('validates custom mapping with c_ prefix', () => {
            const mapping = {
                c_validAttribute1: 'path',
                c_validAttribute2: () => 'value'
            }

            const result = validateAttributeMapping(mapping)

            expect(result.valid).toBe(true)
        })

        it('rejects attributes without c_ prefix', () => {
            const mapping = {
                invalidAttribute: 'path'
            }

            const result = validateAttributeMapping(mapping)

            expect(result.valid).toBe(false)
            expect(result.errors.some(e => e.includes('must start with "c_" prefix'))).toBe(true)
        })

        it('rejects attributes with invalid characters', () => {
            const mapping = {
                'c_invalid-name': 'path'  // Hyphen not allowed
            }

            const result = validateAttributeMapping(mapping)

            expect(result.valid).toBe(false)
            expect(result.errors.some(e => e.includes('contains invalid characters'))).toBe(true)
        })

        it('rejects attributes starting with number after c_', () => {
            const mapping = {
                'c_123invalid': 'path'
            }

            const result = validateAttributeMapping(mapping)

            expect(result.valid).toBe(false)
        })

        it('returns list of attribute names', () => {
            const mapping = {
                c_attr1: 'path1',
                c_attr2: 'path2'
            }

            const result = validateAttributeMapping(mapping)

            expect(result.attributes).toContain('c_attr1')
            expect(result.attributes).toContain('c_attr2')
        })
    })

    describe('mapAuthResponseToOrderAttributes', () => {
        it('extracts networkResponse from auth response', () => {
            const authResponse = {
                transactionId: '9bccd38f-f31c-4021-b8fc-0794da76682e',
                paymentMethodType: {
                    card: {
                        networkResponse: {
                            addressVerificationResult: 'ADDRESS_POSTALCODE_MATCH',
                            addressVerificationResultCode: 'I3',
                            cardVerificationResult: 'MATCH',
                            cardVerificationResultCode: 'M',
                            networkTransactionId: '016146692161581',
                            networkResponseCode: '00'
                        }
                    }
                }
            }

            const attributes = mapAuthResponseToOrderAttributes(authResponse)

            expect(attributes).toHaveProperty('c_jpmcCardNetworkResponse')
            expect(typeof attributes.c_jpmcCardNetworkResponse).toBe('string')
            
            const networkResponse = JSON.parse(attributes.c_jpmcCardNetworkResponse)
            expect(networkResponse.addressVerificationResult).toBe('ADDRESS_POSTALCODE_MATCH')
            expect(networkResponse.cardVerificationResult).toBe('MATCH')
            expect(networkResponse.networkTransactionId).toBe('016146692161581')
        })

        it('returns empty object when networkResponse is missing', () => {
            const authResponse = {
                transactionId: '9bccd38f-f31c-4021-b8fc-0794da76682e',
                paymentMethodType: {
                    card: {
                        cardType: 'VI'
                    }
                }
            }

            const attributes = mapAuthResponseToOrderAttributes(authResponse)

            expect(attributes).toEqual({})
        })

        it('returns empty object for null response', () => {
            const attributes = mapAuthResponseToOrderAttributes(null)

            expect(attributes).toEqual({})
            expect(logger.warn).toHaveBeenCalledWith(
                '[AttributeMapping] No auth response to map'
            )
        })

        it('handles missing paymentMethodType gracefully', () => {
            const authResponse = {
                transactionId: '9bccd38f-f31c-4021-b8fc-0794da76682e'
            }

            const attributes = mapAuthResponseToOrderAttributes(authResponse)

            expect(attributes).toEqual({})
        })

        it('supports custom mapping', () => {
            const authResponse = {
                transactionId: '9bccd38f-f31c-4021-b8fc-0794da76682e',
                paymentMethodType: {
                    card: {
                        networkResponse: {
                            networkTransactionId: '016146692161581'
                        }
                    }
                }
            }

            const customMapping = {
                c_customField: (response) => response.transactionId
            }

            const attributes = mapAuthResponseToOrderAttributes(authResponse, customMapping)

            expect(attributes).toHaveProperty('c_jpmcCardNetworkResponse')
            expect(attributes).toHaveProperty('c_customField', '9bccd38f-f31c-4021-b8fc-0794da76682e')
        })

        it('handles stringification errors gracefully', () => {
            const circularRef = {}
            circularRef.self = circularRef

            const authResponse = {
                paymentMethodType: {
                    card: {
                        networkResponse: circularRef
                    }
                }
            }

            const attributes = mapAuthResponseToOrderAttributes(authResponse)

            // Should not have the attribute since JSON.stringify will fail
            expect(attributes.c_jpmcCardNetworkResponse).toBeUndefined()
            expect(logger.warn).toHaveBeenCalled()
        })
    })

    describe('mapFraudResponseToOrderAttributes', () => {
        it('maps fraud response to order attributes', () => {
            const fraudResponse = {
                transactionId: 'fraud_txn_123',
                riskElement: {
                    score: 95,
                    rules: ['rule1', 'rule2']
                },
                riskDecision: {
                    fraudRuleAction: 'R'
                }
            }

            const attributes = mapFraudResponseToOrderAttributes(fraudResponse)

            expect(attributes.c_jpmcFraudTransactionId).toBe('fraud_txn_123')
            expect(attributes.c_jpmcFraudRiskElement).toBeDefined()
            expect(JSON.parse(attributes.c_jpmcFraudRiskElement)).toEqual({
                score: 95,
                rules: ['rule1', 'rule2']
            })
            expect(attributes.c_jpmcFraudRiskDecision).toBeDefined()
            expect(JSON.parse(attributes.c_jpmcFraudRiskDecision)).toEqual({
                fraudRuleAction: 'R'
            })
            expect(attributes.c_jpmcFraudCheckDate).toBeDefined()
            expect(typeof attributes.c_jpmcFraudCheckDate).toBe('string')
        })

        it('returns empty object for null fraud response', () => {
            const attributes = mapFraudResponseToOrderAttributes(null)

            expect(attributes).toEqual({})
            expect(logger.warn).toHaveBeenCalledWith('[AttributeMapping] No fraud response to map')
        })

        it('includes Kount session ID when provided', () => {
            const fraudResponse = {
                transactionId: 'fraud_txn_123'
            }

            const attributes = mapFraudResponseToOrderAttributes(fraudResponse, 'kount_session_456')

            expect(attributes.c_kountSessionId).toBe('kount_session_456')
        })

        it('handles riskElement with null value', () => {
            const fraudResponse = {
                transactionId: 'fraud_txn_123',
                riskElement: null,
                riskDecision: {
                    fraudRuleAction: 'A'
                }
            }

            const attributes = mapFraudResponseToOrderAttributes(fraudResponse)

            expect(attributes.c_jpmcFraudRiskElement).toBeUndefined()
            expect(attributes.c_jpmcFraudRiskDecision).toBeDefined()
        })

        it('handles mapper function errors gracefully', () => {
            const fraudResponse = {
                transactionId: 'fraud_txn_123',
                riskElement: {
                    // Create circular reference to cause JSON.stringify to fail
                    circular: null
                }
            }
            fraudResponse.riskElement.circular = fraudResponse.riskElement

            const attributes = mapFraudResponseToOrderAttributes(fraudResponse)

            // Should still include other attributes
            expect(attributes.c_jpmcFraudTransactionId).toBe('fraud_txn_123')
            // riskElement should be undefined due to JSON.stringify error
            expect(attributes.c_jpmcFraudRiskElement).toBeUndefined()
            expect(logger.warn).toHaveBeenCalled()
        })

        it('supports custom mapping for fraud response', () => {
            const fraudResponse = {
                transactionId: 'fraud_txn_123'
            }
            const customMapping = {
                c_customFraudField: (response) => response.transactionId + '_custom'
            }

            const attributes = mapFraudResponseToOrderAttributes(fraudResponse, null, customMapping)

            expect(attributes.c_customFraudField).toBe('fraud_txn_123_custom')
        })

        it('merges custom mapping with default fraud mapping', () => {
            const fraudResponse = {
                transactionId: 'fraud_txn_123',
                riskDecision: {
                    fraudRuleAction: 'R'
                }
            }
            const customMapping = {
                c_myCustomField: () => 'myValue'
            }

            const attributes = mapFraudResponseToOrderAttributes(fraudResponse, null, customMapping)

            // Should have both default and custom mappings
            expect(attributes.c_jpmcFraudTransactionId).toBe('fraud_txn_123')
            expect(attributes.c_myCustomField).toBe('myValue')
        })
    })

    describe('FRAUD_CHECK_ORDER_ATTRIBUTE_MAPPING', () => {
        it('includes c_jpmcFraudRiskElement as function', () => {
            expect(FRAUD_CHECK_ORDER_ATTRIBUTE_MAPPING).toHaveProperty('c_jpmcFraudRiskElement')
            expect(typeof FRAUD_CHECK_ORDER_ATTRIBUTE_MAPPING.c_jpmcFraudRiskElement).toBe('function')
        })

        it('includes c_jpmcFraudRiskDecision as function', () => {
            expect(FRAUD_CHECK_ORDER_ATTRIBUTE_MAPPING).toHaveProperty('c_jpmcFraudRiskDecision')
            expect(typeof FRAUD_CHECK_ORDER_ATTRIBUTE_MAPPING.c_jpmcFraudRiskDecision).toBe('function')
        })

        it('c_jpmcFraudRiskElement serializes riskElement to JSON', () => {
            const mapper = FRAUD_CHECK_ORDER_ATTRIBUTE_MAPPING.c_jpmcFraudRiskElement
            const riskElement = { score: 90, rules: ['rule1'] }

            const result = mapper({ riskElement })

            expect(result).toBe(JSON.stringify(riskElement))
        })

        it('c_jpmcFraudRiskElement handles null riskElement', () => {
            const mapper = FRAUD_CHECK_ORDER_ATTRIBUTE_MAPPING.c_jpmcFraudRiskElement

            const result = mapper({ riskElement: null })

            expect(result).toBeNull()
        })

        it('c_jpmcFraudRiskDecision serializes riskDecision to JSON', () => {
            const mapper = FRAUD_CHECK_ORDER_ATTRIBUTE_MAPPING.c_jpmcFraudRiskDecision
            const riskDecision = { fraudRuleAction: 'R' }

            const result = mapper({ riskDecision })

            expect(result).toBe(JSON.stringify(riskDecision))
        })

        it('c_jpmcFraudRiskDecision handles null riskDecision', () => {
            const mapper = FRAUD_CHECK_ORDER_ATTRIBUTE_MAPPING.c_jpmcFraudRiskDecision

            const result = mapper({ riskDecision: null })

            expect(result).toBeNull()
        })

        it('c_jpmcFraudCheckDate returns ISO date string', () => {
            const mapper = FRAUD_CHECK_ORDER_ATTRIBUTE_MAPPING.c_jpmcFraudCheckDate

            const result = mapper({})

            expect(typeof result).toBe('string')
            expect(new Date(result).getTime()).not.toBeNaN()
        })
    })
})
