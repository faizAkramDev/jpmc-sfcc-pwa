/**
 * Unit Tests for ApplePayButton Component
 *
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import ApplePayButton from '../ApplePayButton'
import * as useApplePayHook from '../../../hooks/useApplePay'

// Mock useApplePay hook
jest.mock('../../../hooks/useApplePay', () => ({
    useApplePay: jest.fn()
}))

// Mock constants
jest.mock('../../../utils/constants.mjs', () => ({
    APPLE_PAY_BUTTON_STYLES: {
        BLACK: 'black',
        WHITE: 'white',
        WHITE_OUTLINE: 'white-outline'
    },
    APPLE_PAY_BUTTON_TYPES: {
        BUY: 'buy',
        PAY: 'pay',
        CHECKOUT: 'checkout'
    },
    APPLE_PAY_DEFAULTS: {
        currencyCode: 'USD',
        countryCode: 'US',
        buttonStyle: 'black',
        buttonType: 'buy'
    },
    getApplePayButtonClass: jest.fn(() => 'apple-pay-button-buy')
}))

describe('ApplePayButton', () => {
    const defaultProps = {
        merchantId: 'merchant.com.test',
        merchantName: 'Test Store',
        amount: 99.99
    }

    const mockUseApplePay = {
        isReady: true,
        isAvailable: true,
        isLoading: false,
        isProcessing: false,
        error: null,
        initiatePayment: jest.fn()
    }

    beforeEach(() => {
        jest.clearAllMocks()
        useApplePayHook.useApplePay.mockReturnValue(mockUseApplePay)
    })

    describe('rendering', () => {
        it('renders Apple Pay button when available', () => {
            render(<ApplePayButton {...defaultProps} />)

            const button = screen.getByRole('button', { name: /pay with apple pay/i })
            expect(button).toBeInTheDocument()
            expect(button).toHaveClass('apple-pay-button')
        })

        it('renders loading state when isLoading', () => {
            useApplePayHook.useApplePay.mockReturnValue({
                ...mockUseApplePay,
                isLoading: true,
                isReady: false
            })

            render(<ApplePayButton {...defaultProps} />)

            expect(screen.getByLabelText(/loading apple pay/i)).toBeInTheDocument()
        })

        it('renders custom loading component when provided', () => {
            useApplePayHook.useApplePay.mockReturnValue({
                ...mockUseApplePay,
                isLoading: true,
                isReady: false
            })

            render(
                <ApplePayButton
                    {...defaultProps}
                    loadingComponent={<div data-testid="custom-loader">Loading...</div>}
                />
            )

            expect(screen.getByTestId('custom-loader')).toBeInTheDocument()
        })

        it('renders null when not available', () => {
            useApplePayHook.useApplePay.mockReturnValue({
                ...mockUseApplePay,
                isReady: true,
                isAvailable: false
            })

            const { container } = render(<ApplePayButton {...defaultProps} />)

            expect(container).toBeEmptyDOMElement()
        })

        it('renders custom unavailable component when provided', () => {
            useApplePayHook.useApplePay.mockReturnValue({
                ...mockUseApplePay,
                isReady: true,
                isAvailable: false
            })

            render(
                <ApplePayButton
                    {...defaultProps}
                    unavailableComponent={<div data-testid="unavailable">Not available</div>}
                />
            )

            expect(screen.getByTestId('unavailable')).toBeInTheDocument()
        })

        it('renders null on initialization error', () => {
            useApplePayHook.useApplePay.mockReturnValue({
                ...mockUseApplePay,
                isReady: false,
                isAvailable: false,
                error: new Error('Init failed')
            })

            const { container } = render(<ApplePayButton {...defaultProps} />)

            expect(container).toBeEmptyDOMElement()
        })
    })

    describe('button styles', () => {
        it('applies disabled class when disabled', () => {
            render(<ApplePayButton {...defaultProps} disabled />)

            const button = screen.getByRole('button')
            expect(button).toHaveClass('disabled')
            expect(button).toBeDisabled()
        })

        it('applies processing class when processing', () => {
            useApplePayHook.useApplePay.mockReturnValue({
                ...mockUseApplePay,
                isProcessing: true
            })

            render(<ApplePayButton {...defaultProps} />)

            const button = screen.getByRole('button')
            expect(button).toHaveClass('processing')
        })

        it('applies full-width class when fullWidth prop is true', () => {
            render(<ApplePayButton {...defaultProps} fullWidth />)

            const container = screen.getByRole('button').parentElement
            expect(container).toHaveClass('full-width')
        })

        it('applies custom className', () => {
            render(<ApplePayButton {...defaultProps} className="custom-class" />)

            const container = screen.getByRole('button').parentElement
            expect(container).toHaveClass('custom-class')
        })

        it('applies button style class - black', () => {
            render(<ApplePayButton {...defaultProps} buttonStyle="black" />)

            const button = screen.getByRole('button')
            expect(button).toHaveClass('apple-pay-button-black')
        })

        it('applies button style class - white', () => {
            render(<ApplePayButton {...defaultProps} buttonStyle="white" />)

            const button = screen.getByRole('button')
            expect(button).toHaveClass('apple-pay-button-white')
        })

        it('applies button style class - white-outline', () => {
            render(<ApplePayButton {...defaultProps} buttonStyle="white-outline" />)

            const button = screen.getByRole('button')
            expect(button).toHaveClass('apple-pay-button-white-outline')
        })
    })

    describe('click handling', () => {
        it('calls initiatePayment on click', () => {
            render(<ApplePayButton {...defaultProps} />)

            const button = screen.getByRole('button')
            fireEvent.click(button)

            expect(mockUseApplePay.initiatePayment).toHaveBeenCalledWith(
                expect.objectContaining({
                    amount: 99.99,
                    label: 'Test Store'
                })
            )
        })

        it('calls onClick callback before initiating payment', () => {
            const onClick = jest.fn()
            render(<ApplePayButton {...defaultProps} onClick={onClick} />)

            const button = screen.getByRole('button')
            fireEvent.click(button)

            expect(onClick).toHaveBeenCalled()
            expect(mockUseApplePay.initiatePayment).toHaveBeenCalled()
        })

        it('does not initiate payment when disabled', () => {
            render(<ApplePayButton {...defaultProps} disabled />)

            const button = screen.getByRole('button')
            fireEvent.click(button)

            expect(mockUseApplePay.initiatePayment).not.toHaveBeenCalled()
        })

        it('does not initiate payment when processing', () => {
            useApplePayHook.useApplePay.mockReturnValue({
                ...mockUseApplePay,
                isProcessing: true
            })

            render(<ApplePayButton {...defaultProps} />)

            const button = screen.getByRole('button')
            fireEvent.click(button)

            expect(mockUseApplePay.initiatePayment).not.toHaveBeenCalled()
        })

        it('calls onClickOverride instead of initiatePayment when provided', () => {
            const onClickOverride = jest.fn()
            render(<ApplePayButton {...defaultProps} onClickOverride={onClickOverride} />)

            const button = screen.getByRole('button')
            fireEvent.click(button)

            expect(onClickOverride).toHaveBeenCalled()
            expect(mockUseApplePay.initiatePayment).not.toHaveBeenCalled()
        })
    })

    describe('processing overlay', () => {
        it('shows processing overlay when isProcessing', () => {
            useApplePayHook.useApplePay.mockReturnValue({
                ...mockUseApplePay,
                isProcessing: true
            })

            render(<ApplePayButton {...defaultProps} />)

            expect(screen.getByLabelText(/processing payment/i)).toBeInTheDocument()
        })

        it('does not show processing overlay when not processing', () => {
            render(<ApplePayButton {...defaultProps} />)

            expect(screen.queryByLabelText(/processing payment/i)).not.toBeInTheDocument()
        })
    })

    describe('accessibility', () => {
        it('has correct aria-label', () => {
            render(<ApplePayButton {...defaultProps} ariaLabel="Custom Apple Pay" />)

            expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Custom Apple Pay')
        })

        it('sets aria-disabled when disabled', () => {
            render(<ApplePayButton {...defaultProps} disabled />)

            expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true')
        })

        it('sets lang attribute when buttonLocale provided', () => {
            render(<ApplePayButton {...defaultProps} buttonLocale="fr-FR" />)

            expect(screen.getByRole('button')).toHaveAttribute('lang', 'fr-FR')
        })
    })

    describe('with onClickOverride', () => {
        it('renders button even when not available (parent manages availability)', () => {
            useApplePayHook.useApplePay.mockReturnValue({
                ...mockUseApplePay,
                isReady: true,
                isAvailable: false
            })

            render(<ApplePayButton {...defaultProps} onClickOverride={jest.fn()} />)

            expect(screen.getByRole('button')).toBeInTheDocument()
        })

        it('skips loading state when onClickOverride provided', () => {
            useApplePayHook.useApplePay.mockReturnValue({
                ...mockUseApplePay,
                isLoading: true
            })

            render(<ApplePayButton {...defaultProps} onClickOverride={jest.fn()} />)

            // Should render button, not loading state
            expect(screen.getByRole('button')).toBeInTheDocument()
        })
    })
})
