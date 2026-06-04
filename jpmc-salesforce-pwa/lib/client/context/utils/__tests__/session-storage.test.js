/**
 * Session Storage Tests
 * 
 * Tests for session storage utilities that manage payment tokens,
 * fraud data, and errors across React re-renders.
 */

import {
    saveTokenToSession,
    getTokenFromSession,
    clearTokenFromSession,
    saveFraudRuleAction,
    getFraudRuleAction,
    clearFraudRuleAction,
    saveFraudCart,
    getFraudCart,
    clearFraudCart,
    saveFraudShipTo,
    getFraudShipTo,
    clearFraudShipTo,
    savePaymentError,
    getPaymentError,
    clearPaymentError,
    hasPaymentError,
    clearAllSessionData
} from '../session-storage.js'

// Mock sessionStorage
const mockSessionStorage = (() => {
    let store = {}
    return {
        getItem: jest.fn((key) => store[key] || null),
        setItem: jest.fn((key, value) => { store[key] = value }),
        removeItem: jest.fn((key) => { delete store[key] }),
        clear: () => { store = {} }
    }
})()

// Store original window
const originalWindow = global.window

describe('session-storage', () => {
    beforeEach(() => {
        // Reset mock storage
        mockSessionStorage.clear()
        jest.clearAllMocks()
        
        // Setup window and sessionStorage
        global.window = { sessionStorage: mockSessionStorage }
        global.sessionStorage = mockSessionStorage
    })

    afterEach(() => {
        global.window = originalWindow
    })

    // ==========================================================================
    // Token Storage Tests
    // ==========================================================================
    
    describe('Token Storage', () => {
        describe('saveTokenToSession', () => {
            it('should save token and basketId to sessionStorage', () => {
                saveTokenToSession('test-token-123', 'basket-456')
                
                // Verify by retrieving
                expect(getTokenFromSession('basket-456')).toBe('test-token-123')
            })

            it('should save token without basketId', () => {
                saveTokenToSession('test-token-123')
                
                // Token should be retrievable without matching basketId
                expect(getTokenFromSession()).toBeTruthy()
            })

            it('should not save if token is falsy', () => {
                clearTokenFromSession()
                saveTokenToSession(null, 'basket-456')
                saveTokenToSession('', 'basket-456')
                saveTokenToSession(undefined, 'basket-456')
                
                expect(getTokenFromSession('basket-456')).toBeNull()
            })
        })

        describe('getTokenFromSession', () => {
            it('should return token if basketId matches', () => {
                saveTokenToSession('test-token', 'basket-123')

                const token = getTokenFromSession('basket-123')
                expect(token).toBe('test-token')
            })

            it('should clear and return null if basketId does not match', () => {
                saveTokenToSession('test-token', 'basket-123')

                const token = getTokenFromSession('different-basket')
                
                expect(token).toBeNull()
            })

            it('should return token if no basketId is stored', () => {
                saveTokenToSession('test-token')

                const token = getTokenFromSession('basket-123')
                expect(token).toBe('test-token')
            })

            it('should return null if no token is stored', () => {
                clearTokenFromSession()
                
                const token = getTokenFromSession('basket-123')
                expect(token).toBeNull()
            })
        })

        describe('clearTokenFromSession', () => {
            it('should remove both token and basketId', () => {
                saveTokenToSession('test-token', 'test-basket')
                expect(getTokenFromSession('test-basket')).toBe('test-token')
                
                clearTokenFromSession()
                
                expect(getTokenFromSession('test-basket')).toBeNull()
            })
        })
    })

    // ==========================================================================
    // Fraud Rule Action Tests
    // ==========================================================================
    
    describe('Fraud Rule Action Storage', () => {
        describe('saveFraudRuleAction', () => {
            it('should save fraud rule action', () => {
                saveFraudRuleAction('A')
                
                // Verify it was saved
                expect(getFraudRuleAction()).toBe('A')
            })

            it('should not save if action is falsy', () => {
                clearFraudRuleAction()
                saveFraudRuleAction(null)
                saveFraudRuleAction('')
                
                expect(getFraudRuleAction()).toBeNull()
            })
        })

        describe('getFraudRuleAction', () => {
            it('should return stored fraud rule action', () => {
                saveFraudRuleAction('R')
                
                const action = getFraudRuleAction()
                expect(action).toBe('R')
            })

            it('should return null if not stored', () => {
                clearFraudRuleAction()
                
                const action = getFraudRuleAction()
                expect(action).toBeNull()
            })
        })

        describe('clearFraudRuleAction', () => {
            it('should remove fraud rule action', () => {
                saveFraudRuleAction('A')
                expect(getFraudRuleAction()).toBe('A')
                
                clearFraudRuleAction()
                
                expect(getFraudRuleAction()).toBeNull()
            })
        })
    })

    // ==========================================================================
    // Fraud Cart Tests
    // ==========================================================================
    
    describe('Fraud Cart Storage', () => {
        describe('saveFraudCart', () => {
            it('should save fraud cart string', () => {
                const cart = 'T=Product&I=prod123&D=Test%20Product&Q=1&P=999&|'
                saveFraudCart(cart)
                
                // Verify it was saved by retrieving it
                expect(getFraudCart()).toBe(cart)
            })

            it('should not save if cart is falsy', () => {
                clearFraudCart()
                saveFraudCart(null)
                saveFraudCart('')
                
                expect(getFraudCart()).toBeNull()
            })
        })

        describe('getFraudCart', () => {
            it('should return stored fraud cart', () => {
                const cart = 'T=Product&I=prod123&Q=1&P=999&|'
                saveFraudCart(cart)
                
                const result = getFraudCart()
                expect(result).toBe(cart)
            })
        })

        describe('clearFraudCart', () => {
            it('should remove fraud cart', () => {
                saveFraudCart('test-cart')
                expect(getFraudCart()).toBe('test-cart')
                
                clearFraudCart()
                
                expect(getFraudCart()).toBeNull()
            })
        })
    })

    // ==========================================================================
    // Fraud Ship To Tests
    // ==========================================================================
    
    describe('Fraud Ship To Storage', () => {
        const mockShipTo = {
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Main St',
            city: 'New York',
            stateCode: 'NY',
            postalCode: '10001',
            countryCode: 'US'
        }

        describe('saveFraudShipTo', () => {
            it('should save fraud shipTo as JSON', () => {
                saveFraudShipTo(mockShipTo)
                
                // Verify it was saved by retrieving it
                const result = getFraudShipTo()
                expect(result).toEqual(mockShipTo)
            })

            it('should not save if shipTo is falsy', () => {
                clearFraudShipTo()
                saveFraudShipTo(null)
                
                expect(getFraudShipTo()).toBeNull()
            })
        })

        describe('getFraudShipTo', () => {
            it('should return parsed shipTo object', () => {
                saveFraudShipTo(mockShipTo)
                
                const result = getFraudShipTo()
                expect(result).toEqual(mockShipTo)
            })

            it('should return null if not stored', () => {
                clearFraudShipTo()
                
                const result = getFraudShipTo()
                expect(result).toBeNull()
            })

            it('should return null if stored value is invalid JSON', () => {
                sessionStorage.setItem('jpmc_fraud_ship_to', 'invalid json {')
                
                const result = getFraudShipTo()
                expect(result).toBeNull()
            })
        })

        describe('clearFraudShipTo', () => {
            it('should remove fraud shipTo', () => {
                saveFraudShipTo(mockShipTo)
                expect(getFraudShipTo()).toEqual(mockShipTo)
                
                clearFraudShipTo()
                
                expect(getFraudShipTo()).toBeNull()
            })
        })
    })

    // ==========================================================================
    // Payment Error Tests
    // ==========================================================================
    
    describe('Payment Error Storage', () => {
        const mockError = {
            message: 'Payment declined',
            code: 'DECLINED',
            step: 'authorization',
            orderNo: 'ORD-123'
        }

        describe('savePaymentError', () => {
            it('should save error with timestamp', () => {
                const result = savePaymentError(mockError)
                
                expect(result).toBe(true)
                // Verify it was saved by retrieving it
                const saved = getPaymentError()
                expect(saved).toBeDefined()
                expect(saved.message).toBe(mockError.message)
                expect(saved.code).toBe(mockError.code)
                expect(saved.timestamp).toBeDefined()
                
                // Clean up
                clearPaymentError()
            })

            it('should return false if error is null', () => {
                const result = savePaymentError(null)
                
                expect(result).toBe(false)
            })
        })

        describe('getPaymentError', () => {
            it('should return error if not expired', () => {
                // Save a recent error
                savePaymentError(mockError)
                
                const result = getPaymentError()
                expect(result).toBeDefined()
                expect(result.message).toBe(mockError.message)
                
                // Clean up
                clearPaymentError()
            })

            it('should return null and clear if error is expired (> 5 minutes)', () => {
                // Save an error with an old timestamp directly
                const expiredError = { ...mockError, timestamp: Date.now() - (6 * 60 * 1000) }
                sessionStorage.setItem('jpmc_payment_error', JSON.stringify(expiredError))
                
                const result = getPaymentError()
                expect(result).toBeNull()
            })

            it('should return null if not stored', () => {
                clearPaymentError()
                
                const result = getPaymentError()
                expect(result).toBeNull()
            })

            it('should return null if stored value is invalid JSON', () => {
                sessionStorage.setItem('jpmc_payment_error', 'not valid json')
                
                const result = getPaymentError()
                expect(result).toBeNull()
            })
        })

        describe('clearPaymentError', () => {
            it('should remove payment error', () => {
                savePaymentError(mockError)
                expect(getPaymentError()).toBeDefined()
                
                clearPaymentError()
                
                expect(getPaymentError()).toBeNull()
            })
        })

        describe('hasPaymentError', () => {
            it('should return true if valid error exists', () => {
                // Save a recent error
                savePaymentError({ message: 'test error' })
                
                const result = hasPaymentError()
                expect(result).toBe(true)
                
                // Clean up
                clearPaymentError()
            })

            it('should return false if no error exists', () => {
                // Ensure no error exists
                clearPaymentError()
                
                const result = hasPaymentError()
                expect(result).toBe(false)
            })

            it('should return false if error has expired', () => {
                // Save an error with an old timestamp directly to sessionStorage
                const expiredError = {
                    message: 'old error',
                    timestamp: Date.now() - (6 * 60 * 1000) // 6 minutes ago (expiration is 5 min)
                }
                sessionStorage.setItem('jpmc_payment_error', JSON.stringify(expiredError))
                
                const result = hasPaymentError()
                expect(result).toBe(false)
            })
        })
    })

    // ==========================================================================
    // Clear All Session Data Tests
    // ==========================================================================
    
    describe('clearAllSessionData', () => {
        it('should clear all JPMC session data', () => {
            // Store some data first using the real sessionStorage
            saveTokenToSession('test-token', 'test-basket')
            saveFraudRuleAction('A')
            saveFraudCart('cart-data')
            saveFraudShipTo({ address: 'test' })
            savePaymentError({ message: 'error' })
            
            // Verify data was saved
            expect(getTokenFromSession('test-basket')).toBe('test-token')
            expect(getFraudRuleAction()).toBe('A')
            expect(getFraudCart()).toBe('cart-data')
            expect(getFraudShipTo()).toEqual({ address: 'test' })
            
            // Clear all data
            clearAllSessionData()
            
            // Verify data is actually cleared
            expect(getTokenFromSession('test-basket')).toBeNull()
            expect(getFraudRuleAction()).toBeNull()
            expect(getFraudCart()).toBeNull()
            expect(getFraudShipTo()).toBeNull()
            expect(getPaymentError()).toBeNull()
        })
    })

    // ==========================================================================
    // SSR Safety Tests
    // ==========================================================================
    
    describe('SSR Safety', () => {
        beforeEach(() => {
            // Remove window to simulate SSR
            delete global.window
        })

        it('saveTokenToSession should not throw in SSR', () => {
            expect(() => saveTokenToSession('token', 'basket')).not.toThrow()
        })

        it('getTokenFromSession should return null in SSR', () => {
            expect(getTokenFromSession('basket')).toBeNull()
        })

        it('clearTokenFromSession should not throw in SSR', () => {
            expect(() => clearTokenFromSession()).not.toThrow()
        })

        it('saveFraudRuleAction should not throw in SSR', () => {
            expect(() => saveFraudRuleAction('A')).not.toThrow()
        })

        it('getFraudRuleAction should return null in SSR', () => {
            expect(getFraudRuleAction()).toBeNull()
        })

        it('saveFraudCart should not throw in SSR', () => {
            expect(() => saveFraudCart('cart')).not.toThrow()
        })

        it('getFraudCart should return null in SSR', () => {
            expect(getFraudCart()).toBeNull()
        })

        it('saveFraudShipTo should not throw in SSR', () => {
            expect(() => saveFraudShipTo({ address: 'test' })).not.toThrow()
        })

        it('getFraudShipTo should return null in SSR', () => {
            expect(getFraudShipTo()).toBeNull()
        })

        it('savePaymentError should return false in SSR', () => {
            expect(savePaymentError({ message: 'error' })).toBe(false)
        })

        it('getPaymentError should return null in SSR', () => {
            expect(getPaymentError()).toBeNull()
        })

        it('hasPaymentError should return false in SSR', () => {
            expect(hasPaymentError()).toBe(false)
        })
    })

    // ==========================================================================
    // Storage Error Handling Tests
    // ==========================================================================
    
    describe('Storage Error Handling', () => {
        it('should handle sessionStorage.getItem throwing', () => {
            // Spy on the actual sessionStorage to make getItem throw
            const getItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
                throw new Error('QuotaExceeded')
            })
            
            expect(getTokenFromSession('basket')).toBeNull()
            expect(getFraudRuleAction()).toBeNull()
            expect(getFraudCart()).toBeNull()
            expect(getFraudShipTo()).toBeNull()
            expect(getPaymentError()).toBeNull()
            
            getItemSpy.mockRestore()
        })

        it('should handle sessionStorage.setItem throwing', () => {
            // Spy on the actual sessionStorage to make setItem throw
            const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
                throw new Error('QuotaExceeded')
            })
            
            // These should not throw, just fail silently
            expect(() => saveTokenToSession('token', 'basket')).not.toThrow()
            expect(() => saveFraudRuleAction('A')).not.toThrow()
            expect(() => saveFraudCart('cart')).not.toThrow()
            expect(() => saveFraudShipTo({ test: 'data' })).not.toThrow()
            expect(() => savePaymentError({ message: 'error' })).not.toThrow()
            
            setItemSpy.mockRestore()
        })

        it('should handle sessionStorage.removeItem throwing', () => {
            // Spy on the actual sessionStorage to make removeItem throw
            const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
                throw new Error('Error')
            })
            
            // These should not throw
            expect(() => clearTokenFromSession()).not.toThrow()
            expect(() => clearFraudRuleAction()).not.toThrow()
            expect(() => clearFraudCart()).not.toThrow()
            expect(() => clearFraudShipTo()).not.toThrow()
            expect(() => clearPaymentError()).not.toThrow()
            
            removeItemSpy.mockRestore()
        })
    })
})
