/**
 * Unit Tests for PIE Encryption Service
 *
 * @jest-environment jsdom
 */

// Clear module cache before importing to allow fresh state
beforeEach(() => {
    jest.resetModules()
})

// =============================================================================
// Test Data
// =============================================================================

const mockMerchantId = '996642629285'

// =============================================================================
// Browser Environment Tests
// =============================================================================

describe('PIE Encryption Service (Browser)', () => {
    let pieEncryption

    beforeEach(() => {
        jest.resetModules()
        
        // Clean up window state
        delete window.PIE
        delete window.ValidatePANChecksum
        delete window.ProtectPANandCVV

        // Fresh import
        pieEncryption = require('../pie-encryption')
        pieEncryption.resetPIEState()
    })

    afterEach(() => {
        pieEncryption.resetPIEState()
    })

    // =========================================================================
    // loadPIESDK Tests
    // =========================================================================

    describe('loadPIESDK', () => {
        it('should return false when merchantId is missing', async () => {
            const result = await pieEncryption.loadPIESDK({
                environment: 'sandbox'
            })

            expect(result).toBe(false)
        })

        it('should return true if already loaded with same merchantId', async () => {
            // Manually set state to loaded
            pieEncryption.setPIEState({
                isLoaded: true,
                merchantId: mockMerchantId
            })

            const result = await pieEncryption.loadPIESDK({
                merchantId: mockMerchantId,
                environment: 'sandbox'
            })

            expect(result).toBe(true)
        })

        it('should update state when loading starts', async () => {
            // Set up mock script elements
            const mockScript = {
                id: '',
                src: '',
                async: false,
                onload: null,
                onerror: null
            }
            
            const originalCreateElement = document.createElement
            document.createElement = jest.fn((tag) => {
                if (tag === 'script') {
                    return { ...mockScript }
                }
                return originalCreateElement.call(document, tag)
            })

            const originalAppendChild = document.head.appendChild
            document.head.appendChild = jest.fn((el) => {
                // Don't actually load the script, trigger error after short delay
                setTimeout(() => {
                    if (el.onerror) el.onerror(new Error('Test'))
                }, 10)
            })

            try {
                // Don't await - just start loading
                pieEncryption.loadPIESDK({
                    merchantId: mockMerchantId,
                    environment: 'sandbox'
                }).catch(() => {})

                // Check state immediately after starting
                const state = pieEncryption.getPIEState()
                expect(state.isLoading).toBe(true)
            } finally {
                document.createElement = originalCreateElement
                document.head.appendChild = originalAppendChild
            }
        })
    })

    // =========================================================================
    // isPIEReady Tests
    // =========================================================================

    describe('isPIEReady', () => {
        it('should return false when PIE object is missing', () => {
            window.PIE = undefined

            const result = pieEncryption.isPIEReady()

            expect(result).toBe(false)
        })

        it('should return false when PIE object is incomplete', () => {
            window.PIE = { K: 'k' } // Missing L, E, key_id, phase

            const result = pieEncryption.isPIEReady()

            expect(result).toBe(false)
        })

        it('should return false when encryption functions are missing', () => {
            window.PIE = { K: 'k', L: 'l', E: 'e', key_id: '123', phase: '1' }
            window.ValidatePANChecksum = undefined
            window.ProtectPANandCVV = undefined

            const result = pieEncryption.isPIEReady()

            expect(result).toBe(false)
        })

        it('should return true when PIE is fully loaded', () => {
            window.PIE = { K: 'k', L: 'l', E: 'e', key_id: '123', phase: '1' }
            window.ValidatePANChecksum = jest.fn()
            window.ProtectPANandCVV = jest.fn()

            const result = pieEncryption.isPIEReady()

            expect(result).toBe(true)
        })
    })

    // =========================================================================
    // isPIEKeyError Tests
    // =========================================================================

    describe('isPIEKeyError', () => {
        it('should return true when PIE object is missing', () => {
            window.PIE = undefined

            const result = pieEncryption.isPIEKeyError()

            expect(result).toBe(true)
        })

        it('should return true when PIE key properties are missing', () => {
            window.PIE = { K: 'k' }

            const result = pieEncryption.isPIEKeyError()

            expect(result).toBe(true)
        })

        it('should return false when PIE key is complete', () => {
            window.PIE = { K: 'k', L: 'l', E: 'e', key_id: '123', phase: '1' }

            const result = pieEncryption.isPIEKeyError()

            expect(result).toBe(false)
        })
    })

    // =========================================================================
    // isPIEEncryptionError Tests
    // =========================================================================

    describe('isPIEEncryptionError', () => {
        it('should return true when ValidatePANChecksum is missing', () => {
            window.ValidatePANChecksum = undefined
            window.ProtectPANandCVV = jest.fn()

            const result = pieEncryption.isPIEEncryptionError()

            expect(result).toBe(true)
        })

        it('should return true when ProtectPANandCVV is missing', () => {
            window.ValidatePANChecksum = jest.fn()
            window.ProtectPANandCVV = undefined

            const result = pieEncryption.isPIEEncryptionError()

            expect(result).toBe(true)
        })

        it('should return false when both functions are available', () => {
            window.ValidatePANChecksum = jest.fn()
            window.ProtectPANandCVV = jest.fn()

            const result = pieEncryption.isPIEEncryptionError()

            expect(result).toBe(false)
        })
    })

    // =========================================================================
    // validateCardChecksum Tests
    // =========================================================================

    describe('validateCardChecksum', () => {
        it('should use PIE ValidatePANChecksum when available', () => {
            window.ValidatePANChecksum = jest.fn().mockReturnValue(true)

            const result = pieEncryption.validateCardChecksum('4111111111111111')

            expect(window.ValidatePANChecksum).toHaveBeenCalledWith('4111111111111111')
            expect(result).toBe(true)
        })

        it('should use fallback Luhn check when PIE not available', () => {
            window.ValidatePANChecksum = undefined

            // Valid card number (passes Luhn)
            const validResult = pieEncryption.validateCardChecksum('4111111111111111')
            expect(validResult).toBe(true)

            // Invalid card number (fails Luhn)
            const invalidResult = pieEncryption.validateCardChecksum('4111111111111112')
            expect(invalidResult).toBe(false)
        })

        it('should validate known valid card numbers', () => {
            window.ValidatePANChecksum = undefined

            // Visa test card
            expect(pieEncryption.validateCardChecksum('4111111111111111')).toBe(true)
            // Mastercard test card
            expect(pieEncryption.validateCardChecksum('5500000000000004')).toBe(true)
            // Amex test card
            expect(pieEncryption.validateCardChecksum('340000000000009')).toBe(true)
        })

        it('should reject invalid card numbers', () => {
            window.ValidatePANChecksum = undefined

            expect(pieEncryption.validateCardChecksum('1234567890123456')).toBe(false)
            expect(pieEncryption.validateCardChecksum('4111111111111112')).toBe(false) // Last digit wrong
        })
    })

    // =========================================================================
    // encryptCardData Tests
    // =========================================================================

    describe('encryptCardData', () => {
        it('should return null when PIE not ready', () => {
            window.PIE = undefined
            window.ProtectPANandCVV = undefined

            const result = pieEncryption.encryptCardData('4111111111111111', '123')

            expect(result).toBeNull()
        })

        it('should call ProtectPANandCVV with card data', () => {
            window.PIE = { K: 'k', L: 'l', E: 'e', key_id: '123', phase: '1' }
            window.ValidatePANChecksum = jest.fn().mockReturnValue(true)
            // ProtectPANandCVV returns array: [encryptedCard, encryptedCVV, integrityCheck]
            window.ProtectPANandCVV = jest.fn().mockReturnValue([
                'encrypted_pan',
                'encrypted_cvv',
                'hash123'
            ])

            const result = pieEncryption.encryptCardData('4111111111111111', '123')

            expect(window.ProtectPANandCVV).toHaveBeenCalledWith(
                '4111111111111111',
                '123',
                false
            )
            expect(result).toBeDefined()
        })

        it('should return encrypted data in correct format', () => {
            window.PIE = { K: 'k', L: 'l', E: 'e', key_id: 'key-456', phase: '2' }
            window.ValidatePANChecksum = jest.fn().mockReturnValue(true)
            // ProtectPANandCVV returns array: [encryptedCard, encryptedCVV, integrityCheck]
            window.ProtectPANandCVV = jest.fn().mockReturnValue([
                'encrypted_pan_data',
                'encrypted_cvv_data',
                'integrity_check_value'
            ])

            const result = pieEncryption.encryptCardData('4111111111111111', '123')

            expect(result).toHaveProperty('encryptedCardNumber', 'encrypted_pan_data')
            expect(result).toHaveProperty('encryptedCVV', 'encrypted_cvv_data')
            expect(result).toHaveProperty('integrityCheck', 'integrity_check_value')
            expect(result).toHaveProperty('keyId', 'key-456')
            expect(result).toHaveProperty('phase', '2')
        })

        it('should handle encryption error', () => {
            window.PIE = { K: 'k', L: 'l', E: 'e', key_id: '123', phase: '1' }
            window.ValidatePANChecksum = jest.fn().mockReturnValue(true)
            window.ProtectPANandCVV = jest.fn().mockImplementation(() => {
                throw new Error('Encryption failed')
            })

            const result = pieEncryption.encryptCardData('4111111111111111', '123')

            expect(result).toBeNull()
        })

        it('should handle null result from ProtectPANandCVV', () => {
            window.PIE = { K: 'k', L: 'l', E: 'e', key_id: '123', phase: '1' }
            window.ValidatePANChecksum = jest.fn().mockReturnValue(true)
            window.ProtectPANandCVV = jest.fn().mockReturnValue(null)

            const result = pieEncryption.encryptCardData('4111111111111111', '123')

            expect(result).toBeNull()
        })
    })

    // =========================================================================
    // getPIEState Tests
    // =========================================================================

    describe('getPIEState', () => {
        it('should return current PIE state', () => {
            const state = pieEncryption.getPIEState()

            expect(state).toHaveProperty('isLoaded')
            expect(state).toHaveProperty('isLoading')
            expect(state).toHaveProperty('error')
            expect(state).toHaveProperty('merchantId')
            expect(state).toHaveProperty('environment')
        })

        it('should reflect loading state', () => {
            pieEncryption.setPIEState({ isLoading: true })

            const state = pieEncryption.getPIEState()

            expect(state.isLoading).toBe(true)
        })
    })

    // =========================================================================
    // getConfig Tests
    // =========================================================================

    describe('getConfig', () => {
        it('should return PIE configuration', () => {
            pieEncryption.setPIEState({
                merchantId: mockMerchantId,
                environment: 'sandbox'
            })

            const config = pieEncryption.getConfig()

            expect(config.merchantId).toBe(mockMerchantId)
            expect(config.environment).toBe('sandbox')
        })
    })

    // =========================================================================
    // resetPIEState Tests
    // =========================================================================

    describe('resetPIEState', () => {
        it('should reset all state to defaults', () => {
            pieEncryption.setPIEState({
                isLoaded: true,
                isLoading: false,
                error: 'some error',
                merchantId: mockMerchantId,
                environment: 'production'
            })

            pieEncryption.resetPIEState()
            const state = pieEncryption.getPIEState()

            expect(state.isLoaded).toBe(false)
            expect(state.isLoading).toBe(false)
            expect(state.error).toBeNull()
            expect(state.merchantId).toBeNull()
            expect(state.environment).toBe('sandbox')
        })
    })

    // =========================================================================
    // setPIEState Tests
    // =========================================================================

    describe('setPIEState', () => {
        it('should update partial state', () => {
            pieEncryption.setPIEState({ merchantId: '12345' })

            const state = pieEncryption.getPIEState()
            expect(state.merchantId).toBe('12345')
            // Other values should remain
            expect(state.isLoaded).toBe(false)
        })

        it('should merge multiple state properties', () => {
            pieEncryption.setPIEState({
                isLoaded: true,
                merchantId: mockMerchantId,
                environment: 'production'
            })

            const state = pieEncryption.getPIEState()
            expect(state.isLoaded).toBe(true)
            expect(state.merchantId).toBe(mockMerchantId)
            expect(state.environment).toBe('production')
        })
    })

    // =========================================================================
    // getPIEKeyInfo Tests  
    // =========================================================================

    describe('getPIEKeyInfo', () => {
        it('should return null when PIE not loaded', () => {
            window.PIE = undefined

            const result = pieEncryption.getPIEKeyInfo()

            expect(result).toBeNull()
        })

        it('should return PIE key info when loaded', () => {
            window.PIE = {
                K: 'test_K_value',
                L: 'test_L_value',
                E: 'test_E_value',
                key_id: 'key-789',
                phase: '3'
            }

            const result = pieEncryption.getPIEKeyInfo()

            expect(result).toEqual({
                keyId: 'key-789',
                phase: '3'
            })
        })
    })
})
