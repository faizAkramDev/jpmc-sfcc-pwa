/**
 * Unit Tests for 3D Secure Helpers
 *
 * @jest-environment node
 */

import {
    is3DSEnabled,
    build3DSAuthenticationParameters,
    requires3DSAuthentication,
    get3DSOrchestrationUrl,
    build3DSInitialOrderPatchPayload,
    extract3DSValues,
    build3DSOrderPatchPayload
} from '../threeds-helpers'
import { THREE_DS } from '../../../../utils/constants.mjs'

describe('3D Secure Helpers', () => {
    
    // =========================================================================
    // is3DSEnabled Tests
    // =========================================================================

    describe('is3DSEnabled', () => {
        it('should return true when resolvedConfig has jpmc3DSEnabled = true', () => {
            const resolvedConfig = { jpmc3DSEnabled: true }
            const sitePrefs = { jpmc3DSEnabled: false }

            expect(is3DSEnabled(resolvedConfig, sitePrefs)).toBe(true)
        })

        it('should return true when sitePrefs has jpmc3DSEnabled = true and resolvedConfig is false', () => {
            const resolvedConfig = { jpmc3DSEnabled: false }
            const sitePrefs = { jpmc3DSEnabled: true }

            expect(is3DSEnabled(resolvedConfig, sitePrefs)).toBe(true)
        })

        it('should return true when sitePrefs has jpmc3DSEnabled = true and resolvedConfig is null', () => {
            const resolvedConfig = null
            const sitePrefs = { jpmc3DSEnabled: true }

            expect(is3DSEnabled(resolvedConfig, sitePrefs)).toBe(true)
        })

        it('should return false when both configs have jpmc3DSEnabled = false', () => {
            const resolvedConfig = { jpmc3DSEnabled: false }
            const sitePrefs = { jpmc3DSEnabled: false }

            expect(is3DSEnabled(resolvedConfig, sitePrefs)).toBe(false)
        })

        it('should return false when both configs are null', () => {
            expect(is3DSEnabled(null, null)).toBe(false)
        })

        it('should return false when both configs are undefined', () => {
            expect(is3DSEnabled(undefined, undefined)).toBe(false)
        })

        it('should return false when jpmc3DSEnabled is not present', () => {
            const resolvedConfig = {}
            const sitePrefs = {}

            expect(is3DSEnabled(resolvedConfig, sitePrefs)).toBe(false)
        })

        it('should handle jpmc3DSEnabled as string (should be false)', () => {
            const resolvedConfig = { jpmc3DSEnabled: 'true' }
            const sitePrefs = {}

            // String 'true' is not strictly equal to boolean true
            expect(is3DSEnabled(resolvedConfig, sitePrefs)).toBe(false)
        })
    })

    // =========================================================================
    // build3DSAuthenticationParameters Tests
    // =========================================================================

    describe('build3DSAuthenticationParameters', () => {
        const baseOptions = {
            resolvedConfig: { jpmc3DSEnabled: true },
            sitePrefs: {},
            returnUrl: 'https://example.com/checkout/3ds-callback?orderNo=123&orderToken=abc'
        }

        it('should return null when 3DS is disabled', () => {
            const options = {
                ...baseOptions,
                resolvedConfig: { jpmc3DSEnabled: false },
                sitePrefs: { jpmc3DSEnabled: false }
            }

            expect(build3DSAuthenticationParameters(options)).toBeNull()
        })

        it('should return authentication parameters when 3DS is enabled', () => {
            const result = build3DSAuthenticationParameters(baseOptions)

            expect(result).not.toBeNull()
            expect(result.channelType).toBeUndefined()
            expect(result.authenticationType).toBeUndefined()
            expect(result.authenticationReturnUrl).toBe(baseOptions.returnUrl)
        })

        it('should include threeDSRequestorAuthenticationInfo', () => {
            const result = build3DSAuthenticationParameters(baseOptions)

            expect(result.threeDSRequestorAuthenticationInfo).toBeDefined()
            expect(result.threeDSRequestorAuthenticationInfo.authenticationPurpose).toBeDefined()
        })

        it('should include threeDSPurchaseInfo with purchaseDate', () => {
            const result = build3DSAuthenticationParameters(baseOptions)

            expect(result.threeDSPurchaseInfo).toBeDefined()
            expect(result.threeDSPurchaseInfo.purchaseDate).toBeDefined()
            // Check ISO format
            expect(() => new Date(result.threeDSPurchaseInfo.purchaseDate)).not.toThrow()
        })

        it('should use hardcoded authenticationPurpose (PAYMENT_TRANSACTION)', () => {
            const result = build3DSAuthenticationParameters(baseOptions)
            expect(result.threeDSRequestorAuthenticationInfo.authenticationPurpose).toBe('PAYMENT_TRANSACTION')
        })

        it('should use hardcoded transactionType (GOODS_SERVICES)', () => {
            const result = build3DSAuthenticationParameters(baseOptions)
            expect(result.threeDSPurchaseInfo.threeDomainSecureTransactionType).toBe('GOODS_SERVICES')
        })

        it('should NOT include threeDSChallengeType', () => {
            const options = {
                ...baseOptions,
                resolvedConfig: {
                    jpmc3DSEnabled: true
                }
            }

            const result = build3DSAuthenticationParameters(options)
            expect(result.threeDSRequestorAuthenticationInfo.threeDSChallengeType).toBeUndefined()
            // Verify other optional fields are NOT added
            expect(result.threeDSRequestorAuthenticationInfo.requestorAuthenticationMethod).toBeUndefined()
            expect(result.threeDSPurchaseInfo.authenticationUseCase).toBeUndefined()
            expect(result.threeDomainSecureRequestorChallengeIndicator).toBeUndefined()
        })

        it('should use hardcoded values for authenticationPurpose and transactionType', () => {
            const options = {
                resolvedConfig: {
                    jpmc3DSEnabled: true,
                    jpmc3DSAuthPurpose: 'RECURRING_TRANSACTION', // Should be ignored
                    jpmc3DSTransactionType: 'CHECK_ACCEPTANCE' // Should be ignored
                },
                sitePrefs: {
                    jpmc3DSEnabled: false
                },
                returnUrl: 'https://example.com/callback'
            }

            const result = build3DSAuthenticationParameters(options)
            // Hardcoded values, not from config
            expect(result.threeDSRequestorAuthenticationInfo.authenticationPurpose).toBe('PAYMENT_TRANSACTION')
            expect(result.threeDSPurchaseInfo.threeDomainSecureTransactionType).toBe('GOODS_SERVICES')
            expect(result.threeDSRequestorAuthenticationInfo.threeDSChallengeType).toBeUndefined()
        })
    })

    // =========================================================================
    // requires3DSAuthentication Tests
    // =========================================================================

    describe('requires3DSAuthentication', () => {
        it('should return true when responseCode is PERFORM_AUTHENTICATION and URL is present', () => {
            const response = {
                responseCode: THREE_DS.RESPONSE_CODE.PERFORM_AUTHENTICATION,
                paymentAuthenticationResult: {
                    authenticationOrchestrationUrl: 'https://jpmc.com/3ds/orchestration'
                }
            }

            expect(requires3DSAuthentication(response)).toBe(true)
        })

        it('should return false when responseCode is not PERFORM_AUTHENTICATION', () => {
            const response = {
                responseCode: 'APPROVED',
                paymentAuthenticationResult: {
                    authenticationOrchestrationUrl: 'https://jpmc.com/3ds/orchestration'
                }
            }

            expect(requires3DSAuthentication(response)).toBe(false)
        })

        it('should return false when authenticationOrchestrationUrl is missing', () => {
            const response = {
                responseCode: THREE_DS.RESPONSE_CODE.PERFORM_AUTHENTICATION,
                paymentAuthenticationResult: {}
            }

            expect(requires3DSAuthentication(response)).toBe(false)
        })

        it('should return false when paymentAuthenticationResult is missing', () => {
            const response = {
                responseCode: THREE_DS.RESPONSE_CODE.PERFORM_AUTHENTICATION
            }

            expect(requires3DSAuthentication(response)).toBe(false)
        })

        it('should return false for null response', () => {
            expect(requires3DSAuthentication(null)).toBe(false)
        })

        it('should return false for undefined response', () => {
            expect(requires3DSAuthentication(undefined)).toBe(false)
        })

        it('should return false for empty response object', () => {
            expect(requires3DSAuthentication({})).toBe(false)
        })

        it('should return false when authenticationOrchestrationUrl is empty string', () => {
            const response = {
                responseCode: THREE_DS.RESPONSE_CODE.PERFORM_AUTHENTICATION,
                paymentAuthenticationResult: {
                    authenticationOrchestrationUrl: ''
                }
            }

            expect(requires3DSAuthentication(response)).toBe(false)
        })
    })

    // =========================================================================
    // get3DSOrchestrationUrl Tests
    // =========================================================================

    describe('get3DSOrchestrationUrl', () => {
        it('should return orchestration URL when present', () => {
            const response = {
                paymentAuthenticationResult: {
                    authenticationOrchestrationUrl: 'https://jpmc.com/3ds/orchestration'
                }
            }

            expect(get3DSOrchestrationUrl(response)).toBe('https://jpmc.com/3ds/orchestration')
        })

        it('should return null when URL is missing', () => {
            const response = {
                paymentAuthenticationResult: {}
            }

            expect(get3DSOrchestrationUrl(response)).toBeNull()
        })

        it('should return null when paymentAuthenticationResult is missing', () => {
            const response = {}

            expect(get3DSOrchestrationUrl(response)).toBeNull()
        })

        it('should return null for null response', () => {
            expect(get3DSOrchestrationUrl(null)).toBeNull()
        })

        it('should return null for undefined response', () => {
            expect(get3DSOrchestrationUrl(undefined)).toBeNull()
        })
    })

    // =========================================================================
    // extract3DSValues Tests
    // =========================================================================

    describe('extract3DSValues', () => {
        it('should extract all 3DS values from payment details', () => {
            const paymentDetails = {
                paymentAuthenticationResult: {
                    authenticationId: 'auth-123',
                    authenticationValue: 'CAVV-xyz',
                    threeDomainSecureCompletion: {
                        threeDSDirectoryServerTransactionId: 'dsTransId-456',
                        threeDSTransactionStatus: 'Y',
                        electronicCommerceIndicator: '05',
                        threeDSTransactionStatusReasonText: null
                    }
                }
            }

            const result = extract3DSValues(paymentDetails)

            expect(result.authenticationId).toBe('auth-123')
            expect(result.authenticationValue).toBe('CAVV-xyz')
            expect(result.transactionId).toBe('dsTransId-456')
            expect(result.transactionStatus).toBe('Y')
            expect(result.eci).toBe('05')
            expect(result.statusReasonText).toBeNull()
        })

        it('should return nulls for missing payment details', () => {
            const result = extract3DSValues(null)

            expect(result.authenticationId).toBeNull()
            expect(result.authenticationValue).toBeNull()
            expect(result.transactionId).toBeNull()
            expect(result.transactionStatus).toBeNull()
            expect(result.eci).toBeNull()
            expect(result.statusReasonText).toBeNull()
        })

        it('should return nulls for empty payment details', () => {
            const result = extract3DSValues({})

            expect(result.authenticationId).toBeNull()
            expect(result.authenticationValue).toBeNull()
            expect(result.transactionId).toBeNull()
            expect(result.transactionStatus).toBeNull()
            expect(result.eci).toBeNull()
            expect(result.statusReasonText).toBeNull()
        })

        it('should handle partial payment authentication result', () => {
            const paymentDetails = {
                paymentAuthenticationResult: {
                    authenticationId: 'auth-123'
                    // Missing other fields
                }
            }

            const result = extract3DSValues(paymentDetails)

            expect(result.authenticationId).toBe('auth-123')
            expect(result.authenticationValue).toBeNull()
            expect(result.transactionId).toBeNull()
        })

        it('should extract statusReasonText for failed authentication', () => {
            const paymentDetails = {
                paymentAuthenticationResult: {
                    authenticationId: 'auth-123',
                    threeDomainSecureCompletion: {
                        threeDSTransactionStatus: 'N',
                        threeDSTransactionStatusReasonText: 'Card not enrolled'
                    }
                }
            }

            const result = extract3DSValues(paymentDetails)

            expect(result.transactionStatus).toBe('N')
            expect(result.statusReasonText).toBe('Card not enrolled')
        })
    })

    // =========================================================================
    // build3DSInitialOrderPatchPayload Tests
    // =========================================================================

    describe('build3DSInitialOrderPatchPayload', () => {
        it('should build initial payload with all fields', () => {
            const result = build3DSInitialOrderPatchPayload({
                merchantId: 'merchant-123',
                transactionId: 'txn-456',
                authenticationId: 'auth-789'
            })

            expect(result.c_jpmcMerchantId).toBe('merchant-123')
            expect(result.c_pending3DSAuthentication).toBe(true)
            expect(result.c_threeDSTransactionId).toBe('txn-456')
            expect(result.c_threeDSAuthenticationId).toBe('auth-789')
        })

        it('should handle null merchantId', () => {
            const result = build3DSInitialOrderPatchPayload({
                merchantId: null,
                transactionId: 'txn-456',
                authenticationId: 'auth-789'
            })

            expect(result.c_jpmcMerchantId).toBeNull()
            expect(result.c_pending3DSAuthentication).toBe(true)
            expect(result.c_threeDSTransactionId).toBe('txn-456')
        })

        it('should handle null authenticationId', () => {
            const result = build3DSInitialOrderPatchPayload({
                merchantId: 'merchant-123',
                transactionId: 'txn-456',
                authenticationId: null
            })

            expect(result.c_jpmcMerchantId).toBe('merchant-123')
            expect(result.c_threeDSAuthenticationId).toBeNull()
        })
    })

    // =========================================================================
    // build3DSOrderPatchPayload Tests
    // =========================================================================

    describe('build3DSOrderPatchPayload', () => {
        const mockThreeDSValues = {
            authenticationId: 'auth-123',
            authenticationValue: 'CAVV-xyz',
            transactionId: 'dsTransId-456',
            transactionStatus: 'Y',
            eci: '05',
            statusReasonText: null
        }

        it('should build success payload correctly', () => {
            const result = build3DSOrderPatchPayload(mockThreeDSValues, true)

            expect(result.c_pending3DSAuthentication).toBe(false)
            expect(result.c_threeDSAuthenticationId).toBe('auth-123')
            expect(result.c_threeDSAuthenticationValue).toBe('CAVV-xyz')
            expect(result.c_threeDSTransactionId).toBe('dsTransId-456')
            expect(result.c_threeDSTransactionStatus).toBe('Y')
            expect(result.c_threeDSEci).toBe('05')
            expect(result.c_threeDSFailureReason).toBeUndefined()
        })

        it('should build failure payload with default status', () => {
            const failedValues = {
                ...mockThreeDSValues,
                transactionStatus: null
            }

            const result = build3DSOrderPatchPayload(failedValues, false)

            expect(result.c_pending3DSAuthentication).toBe(false)
            expect(result.c_threeDSTransactionStatus).toBe(THREE_DS.TRANSACTION_STATUS.FAILED)
        })

        it('should include failureReason when provided', () => {
            const result = build3DSOrderPatchPayload(mockThreeDSValues, false, 'USER_CANCELLED')

            expect(result.c_threeDSFailureReason).toBe('USER_CANCELLED')
        })

        it('should not include failureReason when null', () => {
            const result = build3DSOrderPatchPayload(mockThreeDSValues, true, null)

            expect(result.c_threeDSFailureReason).toBeUndefined()
        })

        it('should use SUCCESS status for successful completion', () => {
            const valuesWithoutStatus = {
                ...mockThreeDSValues,
                transactionStatus: null
            }

            const result = build3DSOrderPatchPayload(valuesWithoutStatus, true)

            expect(result.c_threeDSTransactionStatus).toBe(THREE_DS.TRANSACTION_STATUS.SUCCESS)
        })

        it('should preserve existing transactionStatus when present', () => {
            const result = build3DSOrderPatchPayload(mockThreeDSValues, true)

            expect(result.c_threeDSTransactionStatus).toBe('Y')
        })

        it('should handle empty threeDSValues - only includes attributes with values', () => {
            const emptyValues = {
                authenticationId: null,
                authenticationValue: null,
                transactionId: null,
                transactionStatus: null,
                eci: null,
                statusReasonText: null
            }

            const result = build3DSOrderPatchPayload(emptyValues, false, 'TIMEOUT')

            expect(result.c_pending3DSAuthentication).toBe(false)
            expect(result.c_threeDSTransactionStatus).toBe(THREE_DS.TRANSACTION_STATUS.FAILED)
            expect(result.c_threeDSFailureReason).toBe('TIMEOUT')
            // These should be undefined since values are null (fields are only set if present)
            expect(result.c_threeDSAuthenticationId).toBeUndefined()
            expect(result.c_threeDSTransactionId).toBeUndefined()
            expect(result.c_threeDSAuthenticationValue).toBeUndefined()
            expect(result.c_threeDSEci).toBeUndefined()
        })
    })

    // =========================================================================
    // Default Export Tests
    // =========================================================================

    describe('Default Export', () => {
        it('should export default object with all functions', () => {
            const defaultExport = require('../threeds-helpers').default

            expect(defaultExport).toHaveProperty('is3DSEnabled')
            expect(defaultExport).toHaveProperty('build3DSAuthenticationParameters')
            expect(defaultExport).toHaveProperty('requires3DSAuthentication')
            expect(defaultExport).toHaveProperty('get3DSOrchestrationUrl')
            expect(defaultExport).toHaveProperty('build3DSInitialOrderPatchPayload')
            expect(defaultExport).toHaveProperty('extract3DSValues')
            expect(defaultExport).toHaveProperty('build3DSOrderPatchPayload')
        })
    })
})
