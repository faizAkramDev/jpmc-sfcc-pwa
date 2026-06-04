/**
 * Unit Tests for GooglePayButton Component
 * 
 * Tests the unified GooglePayButton with context support
 * 
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'

// =============================================================================
// Mocks
// =============================================================================

// Mock useGooglePay hook
const mockLoadPaymentData = jest.fn()
const mockGetPaymentToken = jest.fn()
const mockPaymentsClient = {
    createButton: jest.fn(() => {
        const button = document.createElement('button')
        button.textContent = 'Google Pay'
        return button
    }),
    isReadyToPay: jest.fn().mockResolvedValue({ result: true })
}

jest.mock('../../../hooks/useGooglePay', () => ({
    useGooglePay: jest.fn(() => ({
        isReady: true,
        isAvailable: true,
        isLoading: false,
        isProcessing: false,
        error: null,
        paymentsClient: mockPaymentsClient,
        loadPaymentData: mockLoadPaymentData,
        getPaymentToken: mockGetPaymentToken
    }))
}))

// Note: useGooglePayCartFlow and useGooglePayPDPFlow hooks have been removed
// These internal hooks are no longer used - integrators use callbacks directly

// Mock useJPMCCheckout context
jest.mock('../../context/JPMCCheckoutProvider', () => ({
    useJPMCCheckout: jest.fn(() => ({
        authorize: jest.fn(),
        paymentConfig: {
            googlePay: {
                gatewayMerchantId: 'test-merchant',
                merchantName: 'Test Store'
            },
            environment: 'TEST'
        },
        googlePayPaymentMethodId: 'JPMC_GOOGLE_PAY',
        confirmOrderServerSide: jest.fn(),
        failOrderServerSide: jest.fn(),
        addPaymentInstrumentToBasket: jest.fn(),
        removePaymentInstrumentFromBasket: jest.fn()
    }))
}))

// Mock googlepay config
jest.mock('../../../services/googlepay/config', () => ({
    buildBaseCardPaymentMethod: jest.fn(() => ({
        type: 'CARD',
        parameters: {
            allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
            allowedCardNetworks: ['VISA', 'MASTERCARD']
        }
    }))
}))

// Mock constants
jest.mock('../../../utils/constants.mjs', () => ({
    GOOGLE_PAY_BUTTON_CONFIG: {
        DEFAULT: {
            buttonType: 'buy',
            buttonColor: 'black',
            buttonSizeMode: 'fill',
            buttonLocale: 'en'
        },
        BUTTON_TYPES: { BUY: 'buy', CHECKOUT: 'checkout', PAY: 'pay' },
        BUTTON_COLORS: { BLACK: 'black', WHITE: 'white' },
        BUTTON_SIZE_MODES: { FILL: 'fill', STATIC: 'static' }
    },
    GOOGLE_PAY_ERROR_CODES: {
        CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
        PAYMENT_FAILED: 'PAYMENT_FAILED'
    },
    GOOGLE_PAY_CONTEXT: {
        CHECKOUT: 'checkout',
        CART: 'cart',
        PDP: 'pdp'
    }
}))

// Mock prop validator
jest.mock('../utils/googlepay-prop-validator', () => ({
    validateContextProps: jest.fn(() => ({
        valid: true,
        errors: [],
        warnings: []
    })),
    formatValidationErrors: jest.fn(() => ''),
    logValidationWarnings: jest.fn()
}))

// Mock config resolver
jest.mock('../utils/googlepay-config-resolver', () => ({
    resolveGooglePayConfig: jest.fn(() => ({
        gatewayMerchantId: 'test-merchant',
        merchantName: 'Test Store',
        merchantId: null,
        environment: 'sandbox',
        gateway: 'jpmorgan',
        allowedNetworks: ['VISA', 'MASTERCARD'],
        allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
        resolvedAllowedCountryCodes: ['US'],
        resolvedBillingAddressRequired: true
    })),
    isGooglePayDisabledInBM: jest.fn(() => false)
}))

// Mock button PropTypes
jest.mock('../utils/googlepay-button-proptypes', () => ({
    GooglePayButtonPropTypes: {}
}))

// Mock useServerConfig hook
jest.mock('../hooks/useServerConfig', () => ({
    useServerConfig: jest.fn(() => ({
        serverConfig: null,
        configLoading: false,
        configError: null
    }))
}))

// Mock useVariantValidation hook
jest.mock('../hooks/useVariantValidation', () => ({
    useVariantValidation: jest.fn(() => ({
        computedIsProductOrderable: true,
        computedVariantError: null,
        validationRef: { current: { isOrderable: true, errorMessage: null } }
    }))
}))

import GooglePayButton from '../GooglePayButton'
import { useGooglePay } from '../../../hooks/useGooglePay'
import { validateContextProps } from '../utils/googlepay-prop-validator'
import { resolveGooglePayConfig } from '../utils/googlepay-config-resolver'

// =============================================================================
// Test Data
// =============================================================================

const checkoutProps = {
    amount: '99.99',
    currencyCode: 'USD'
}

// Note: cartProps with context="cart" is no longer tested
// Integrators now use onPaymentDataChanged and onPaymentAuthorized callbacks directly

// =============================================================================
// Tests
// =============================================================================

describe('GooglePayButton', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        validateContextProps.mockReturnValue({
            valid: true,
            errors: [],
            warnings: []
        })
        mockGetPaymentToken.mockResolvedValue({ success: true, token: 'test-token' })
    })

    // =========================================================================
    // Checkout Context (Default)
    // =========================================================================

    describe('Checkout Context (default)', () => {
        it('should render Google Pay button', async () => {
            render(<GooglePayButton {...checkoutProps} />)

            await waitFor(() => {
                expect(mockPaymentsClient.createButton).toHaveBeenCalled()
            })
        })

        it('should validate checkout props', () => {
            render(<GooglePayButton {...checkoutProps} />)

            expect(validateContextProps).toHaveBeenCalledWith('checkout', {
                amount: '99.99',
                currencyCode: 'USD'
            })
        })

        it('should call getPaymentToken on click (checkout)', async () => {
            render(<GooglePayButton {...checkoutProps} />)

            await waitFor(() => {
                expect(mockPaymentsClient.createButton).toHaveBeenCalled()
            })

            const clickHandler = mockPaymentsClient.createButton.mock.calls[0][0].onClick
            clickHandler()

            await waitFor(() => {
                // getPaymentToken now includes displayItems automatically
                expect(mockGetPaymentToken).toHaveBeenCalledWith(
                    expect.objectContaining({
                        amount: '99.99',
                        currencyCode: 'USD'
                    })
                )
            })
        })

        it('should call onSuccess with token result', async () => {
            const onSuccess = jest.fn()
            render(<GooglePayButton {...checkoutProps} onSuccess={onSuccess} />)

            await waitFor(() => {
                expect(mockPaymentsClient.createButton).toHaveBeenCalled()
            })

            const clickHandler = mockPaymentsClient.createButton.mock.calls[0][0].onClick
            await clickHandler()

            await waitFor(() => {
                expect(onSuccess).toHaveBeenCalledWith({ success: true, token: 'test-token' })
            })
        })

        it('should default context to checkout', () => {
            render(<GooglePayButton {...checkoutProps} />)

            expect(useGooglePay).toHaveBeenCalledWith(
                expect.objectContaining({
                    context: 'checkout'
                })
            )
        })
    })

    // Note: Cart Context tests removed - integrators now use callback pattern directly
    // Note: PDP Context tests removed - integrators now use callback pattern directly

    // =========================================================================
    // Loading States
    // =========================================================================

    describe('Loading States', () => {
        it('should render loading component when loading', () => {
            // Mock resolveGooglePayConfig to return no gatewayMerchantId so loading state shows
            resolveGooglePayConfig.mockReturnValueOnce({
                gatewayMerchantId: null,
                merchantName: null,
                merchantId: null,
                environment: 'sandbox',
                gateway: 'jpmorgan',
                allowedNetworks: ['VISA', 'MASTERCARD'],
                allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
                resolvedAllowedCountryCodes: ['US'],
                resolvedBillingAddressRequired: true
            })
            useGooglePay.mockReturnValueOnce({
                isReady: false,
                isAvailable: false,
                isLoading: true,
                isProcessing: false,
                error: null,
                paymentsClient: null,
                loadPaymentData: mockLoadPaymentData,
                getPaymentToken: mockGetPaymentToken
            })

            render(<GooglePayButton {...checkoutProps} />)

            expect(screen.getByRole('status')).toBeInTheDocument()
        })

        it('should render custom loading component', () => {
            // Mock resolveGooglePayConfig to return no gatewayMerchantId so loading state shows
            resolveGooglePayConfig.mockReturnValueOnce({
                gatewayMerchantId: null,
                merchantName: null,
                merchantId: null,
                environment: 'sandbox',
                gateway: 'jpmorgan',
                allowedNetworks: ['VISA', 'MASTERCARD'],
                allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
                resolvedAllowedCountryCodes: ['US'],
                resolvedBillingAddressRequired: true
            })
            useGooglePay.mockReturnValueOnce({
                isReady: false,
                isAvailable: false,
                isLoading: true,
                isProcessing: false,
                error: null,
                paymentsClient: null,
                loadPaymentData: mockLoadPaymentData,
                getPaymentToken: mockGetPaymentToken
            })

            render(
                <GooglePayButton
                    {...checkoutProps}
                    loadingComponent={<div data-testid="custom-loading">Loading...</div>}
                />
            )

            expect(screen.getByTestId('custom-loading')).toBeInTheDocument()
        })

        // Note: "should show processing overlay when cart is processing" test removed
        // Cart context is no longer supported - integrators use callback pattern
    })

    // =========================================================================
    // Unavailable States
    // =========================================================================

    describe('Unavailable States', () => {
        it('should return null when not available', () => {
            useGooglePay.mockReturnValueOnce({
                isReady: true,
                isAvailable: false,
                isLoading: false,
                isProcessing: false,
                error: null,
                paymentsClient: mockPaymentsClient,
                loadPaymentData: mockLoadPaymentData,
                getPaymentToken: mockGetPaymentToken
            })

            const { container } = render(<GooglePayButton {...checkoutProps} />)

            expect(container.firstChild).toBeNull()
        })

        it('should render unavailable component when specified', () => {
            useGooglePay.mockReturnValueOnce({
                isReady: true,
                isAvailable: false,
                isLoading: false,
                isProcessing: false,
                error: null,
                paymentsClient: mockPaymentsClient,
                loadPaymentData: mockLoadPaymentData,
                getPaymentToken: mockGetPaymentToken
            })

            render(
                <GooglePayButton
                    {...checkoutProps}
                    unavailableComponent={<div data-testid="unavailable">Not available</div>}
                />
            )

            expect(screen.getByTestId('unavailable')).toBeInTheDocument()
        })
    })

    // =========================================================================
    // Validation
    // =========================================================================

    describe('Prop Validation', () => {
        it('should show error in dev mode when validation fails', () => {
            const originalEnv = process.env.NODE_ENV
            process.env.NODE_ENV = 'development'

            validateContextProps.mockReturnValueOnce({
                valid: false,
                errors: [{ field: 'amount', message: 'Required' }],
                warnings: []
            })

            render(<GooglePayButton {...checkoutProps} />)

            expect(screen.getByRole('alert')).toBeInTheDocument()

            process.env.NODE_ENV = originalEnv
        })

        it('should call onError when validation fails on click', async () => {
            const onError = jest.fn()
            validateContextProps.mockReturnValue({
                valid: false,
                errors: [{ field: 'amount', message: 'Required' }],
                warnings: []
            })

            // Reset to production so component renders
            const originalEnv = process.env.NODE_ENV
            process.env.NODE_ENV = 'production'

            render(<GooglePayButton {...checkoutProps} onError={onError} />)

            await waitFor(() => {
                expect(mockPaymentsClient.createButton).toHaveBeenCalled()
            })

            const clickHandler = mockPaymentsClient.createButton.mock.calls[0][0].onClick
            clickHandler()

            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: 'CONFIGURATION_ERROR'
                })
            )

            process.env.NODE_ENV = originalEnv
        })
    })

    // =========================================================================
    // Button Appearance
    // =========================================================================

    describe('Button Appearance', () => {
        it('should pass button options to createButton', async () => {
            render(
                <GooglePayButton
                    {...checkoutProps}
                    buttonType="checkout"
                    buttonColor="white"
                    buttonLocale="fr"
                    buttonRadius={8}
                />
            )

            await waitFor(() => {
                expect(mockPaymentsClient.createButton).toHaveBeenCalledWith(
                    expect.objectContaining({
                        buttonType: 'checkout',
                        buttonColor: 'white',
                        buttonLocale: 'fr',
                        buttonRadius: 8
                    })
                )
            })
        })

        it('should apply custom className and style', async () => {
            render(
                <GooglePayButton
                    {...checkoutProps}
                    className="custom-class"
                    style={{ margin: '10px' }}
                />
            )

            await waitFor(() => {
                const container = document.querySelector('.gpay-button-container')
                expect(container).toHaveClass('custom-class')
                expect(container).toHaveStyle({ margin: '10px' })
            })
        })
    })

    // =========================================================================
    // Disabled State
    // =========================================================================

    describe('Disabled State', () => {
        it('should not call handler when disabled', async () => {
            render(<GooglePayButton {...checkoutProps} disabled={true} />)

            await waitFor(() => {
                expect(mockPaymentsClient.createButton).toHaveBeenCalled()
            })

            const clickHandler = mockPaymentsClient.createButton.mock.calls[0][0].onClick
            clickHandler()

            expect(mockGetPaymentToken).not.toHaveBeenCalled()
        })

        it('should set aria-disabled when disabled', async () => {
            const { container } = render(<GooglePayButton {...checkoutProps} disabled={true} />)

            await waitFor(() => {
                const wrapper = container.querySelector('.gpay-button-wrapper')
                expect(wrapper).toHaveAttribute('aria-disabled', 'true')
            })
        })
    })

    // =========================================================================
    // Accessibility
    // =========================================================================

    describe('Accessibility', () => {
        it('should apply aria-label to button wrapper', async () => {
            const { container } = render(
                <GooglePayButton {...checkoutProps} ariaLabel="Pay now with Google Pay" />
            )

            await waitFor(() => {
                const wrapper = container.querySelector('.gpay-button-wrapper')
                expect(wrapper).toHaveAttribute('aria-label', 'Pay now with Google Pay')
            })
        })
    })
})
