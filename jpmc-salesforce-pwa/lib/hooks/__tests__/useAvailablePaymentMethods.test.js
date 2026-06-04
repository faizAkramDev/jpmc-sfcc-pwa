/**
 * Unit Tests for useAvailablePaymentMethods Hook
 *
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react'
import { useAvailablePaymentMethods, checkAvailablePaymentMethods } from '../useAvailablePaymentMethods'

describe('useAvailablePaymentMethods', () => {
    describe('loading state', () => {
        it('returns isLoading=true when paymentMethods is null', () => {
            const { result } = renderHook(() => useAvailablePaymentMethods(null))
            expect(result.current.isLoading).toBe(true)
            expect(result.current.availablePaymentMethods).toEqual([])
        })

        it('returns isLoading=true when paymentMethods is undefined', () => {
            const { result } = renderHook(() => useAvailablePaymentMethods(undefined))
            expect(result.current.isLoading).toBe(true)
        })

        it('returns isLoading=false when paymentMethods is empty array', () => {
            const { result } = renderHook(() => useAvailablePaymentMethods([]))
            expect(result.current.isLoading).toBe(false)
        })
    })

    describe('credit card detection', () => {
        it('detects credit_card payment method', () => {
            const methods = [{ id: 'credit_card' }]
            const { result } = renderHook(() => useAvailablePaymentMethods(methods))
            expect(result.current.isCreditCardActive).toBe(true)
            expect(result.current.creditCardPaymentMethodId).toBe('credit_card')
        })

        it('detects creditcard (no underscore) payment method', () => {
            const methods = [{ id: 'creditcard' }]
            const { result } = renderHook(() => useAvailablePaymentMethods(methods))
            expect(result.current.isCreditCardActive).toBe(true)
        })

        it('detects card in payment method id', () => {
            const methods = [{ id: 'jpmc_card_payment' }]
            const { result } = renderHook(() => useAvailablePaymentMethods(methods))
            expect(result.current.isCreditCardActive).toBe(true)
        })
    })

    describe('Apple Pay detection', () => {
        it('detects apple_pay payment method', () => {
            const methods = [{ id: 'apple_pay' }]
            const { result } = renderHook(() => useAvailablePaymentMethods(methods))
            expect(result.current.isApplePayActive).toBe(true)
            expect(result.current.applePayPaymentMethodId).toBe('apple_pay')
        })

        it('detects applepay (no underscore) payment method', () => {
            const methods = [{ id: 'applepay' }]
            const { result } = renderHook(() => useAvailablePaymentMethods(methods))
            expect(result.current.isApplePayActive).toBe(true)
        })

        it('detects dw_apple_pay payment method', () => {
            const methods = [{ id: 'dw_apple_pay' }]
            const { result } = renderHook(() => useAvailablePaymentMethods(methods))
            expect(result.current.isApplePayActive).toBe(true)
        })
    })

    describe('Google Pay detection', () => {
        it('detects google_pay payment method', () => {
            const methods = [{ id: 'google_pay' }]
            const { result } = renderHook(() => useAvailablePaymentMethods(methods))
            expect(result.current.isGooglePayActive).toBe(true)
            expect(result.current.googlePayPaymentMethodId).toBe('google_pay')
        })

        it('detects googlepay (no underscore) payment method', () => {
            const methods = [{ id: 'googlepay' }]
            const { result } = renderHook(() => useAvailablePaymentMethods(methods))
            expect(result.current.isGooglePayActive).toBe(true)
        })

        it('detects gpay payment method', () => {
            const methods = [{ id: 'gpay' }]
            const { result } = renderHook(() => useAvailablePaymentMethods(methods))
            expect(result.current.isGooglePayActive).toBe(true)
        })

        it('detects jpmc_google_pay payment method', () => {
            const methods = [{ id: 'jpmc_google_pay' }]
            const { result } = renderHook(() => useAvailablePaymentMethods(methods))
            expect(result.current.isGooglePayActive).toBe(true)
        })
    })

    describe('multiple payment methods', () => {
        it('detects all three payment types', () => {
            const methods = [
                { id: 'credit_card' },
                { id: 'apple_pay' },
                { id: 'google_pay' }
            ]
            const { result } = renderHook(() => useAvailablePaymentMethods(methods))
            expect(result.current.isCreditCardActive).toBe(true)
            expect(result.current.isApplePayActive).toBe(true)
            expect(result.current.isGooglePayActive).toBe(true)
        })

        it('returns false for missing payment types', () => {
            const methods = [{ id: 'paypal' }, { id: 'bank_transfer' }]
            const { result } = renderHook(() => useAvailablePaymentMethods(methods))
            expect(result.current.isCreditCardActive).toBe(false)
            expect(result.current.isApplePayActive).toBe(false)
            expect(result.current.isGooglePayActive).toBe(false)
            expect(result.current.creditCardPaymentMethodId).toBeNull()
        })
    })

    describe('case insensitivity', () => {
        it('matches payment methods case-insensitively', () => {
            const methods = [
                { id: 'CREDIT_CARD' },
                { id: 'Apple_Pay' },
                { id: 'GOOGLE_PAY' }
            ]
            const { result } = renderHook(() => useAvailablePaymentMethods(methods))
            expect(result.current.isCreditCardActive).toBe(true)
            expect(result.current.isApplePayActive).toBe(true)
            expect(result.current.isGooglePayActive).toBe(true)
        })
    })
})

describe('checkAvailablePaymentMethods (non-hook)', () => {
    it('works as a standalone function', () => {
        const methods = [{ id: 'credit_card' }, { id: 'google_pay' }]
        const result = checkAvailablePaymentMethods(methods)
        
        expect(result.isCreditCardActive).toBe(true)
        expect(result.isGooglePayActive).toBe(true)
        expect(result.isApplePayActive).toBe(false)
        expect(result.isLoading).toBe(false)
    })

    it('handles null input', () => {
        const result = checkAvailablePaymentMethods(null)
        expect(result.isLoading).toBe(true)
        expect(result.availablePaymentMethods).toEqual([])
    })
})
