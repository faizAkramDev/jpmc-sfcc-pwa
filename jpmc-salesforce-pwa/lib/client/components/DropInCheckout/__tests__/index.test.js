/**
 * Tests for DropInCheckout component
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { DropInCheckout } from '../index'

// Mock context
jest.mock('../../../context/JPMCCheckoutProvider', () => ({
    useJPMCCheckout: jest.fn()
}))

import { useJPMCCheckout } from '../../../context/JPMCCheckoutProvider'

// Mock fetch
global.fetch = jest.fn()

// Mock window.DropInUI
class MockDropInUI {
    constructor(config) {
        this.config = config
        this.listeners = []
        window.DropInUI.instance = this
    }

    subscribe(fn) {
        this.listeners.push(fn)
    }

    mount(_elementId) {
        // Do nothing
    }

    unmount() {
        // Do nothing
    }

    triggerPaymentSuccess(payload) {
        this.listeners.forEach(fn => fn({
            namespace: 'payment',
            level: 'info',
            message: 'PaymentSuccess',
            payload
        }))
    }

    triggerPaymentError() {
        this.listeners.forEach(fn => fn({
            namespace: 'payment',
            level: 'error',
            message: 'PaymentUnsuccessful'
        }))
    }
}

describe('DropInCheckout Component', () => {
    const mockBasket = {
        basketId: 'test-basket-123',
        orderTotal: 100,
        currency: 'USD',
        totals: {
            subtotal: 85,
            totalTax: 10,
            totalShipping: 5
        }
    }

    const mockContextValue = {
        locale: 'en-US',
        paymentConfig: {
            dropInScriptUrl: 'https://example.com/dropin.js'
        },
        getAccessToken: jest.fn(() => Promise.resolve('test-token'))
    }

    beforeEach(() => {
        jest.clearAllMocks()
        global.fetch.mockClear()
        sessionStorage.clear()
        window.DropInUI = MockDropInUI
        useJPMCCheckout.mockReturnValue(mockContextValue)
    })

    afterEach(() => {
        delete window.DropInUI
    })

    describe('Initialization', () => {
        it('should render container div', () => {
            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)
            expect(screen.getByText('Loading payment form…')).toBeInTheDocument()
        })

        it('should show error when basket is missing basketId', async () => {
            const basketNoBId = { ...mockBasket, basketId: undefined }
            render(<DropInCheckout basket={basketNoBId} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                expect(screen.getByText(/No active basket/i)).toBeInTheDocument()
            })
        })

        it('should show error when orderTotal is invalid', async () => {
            const basketNoTotal = { ...mockBasket, orderTotal: 0 }
            render(<DropInCheckout basket={basketNoTotal} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                expect(screen.getByText(/Cart total is invalid/i)).toBeInTheDocument()
            })
        })

        it('should show error when currency is missing', async () => {
            const basketNoCurrency = { ...mockBasket, currency: undefined }
            render(<DropInCheckout basket={basketNoCurrency} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                expect(screen.getByText(/Currency is not set/i)).toBeInTheDocument()
            })
        })
    })

    describe('Create Session Flow', () => {
        it('should call create-session on initial load', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    checkoutSessionToken: 'session-token-123',
                    reservedOrderNo: 'order-123'
                })
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringContaining('create-session'),
                    expect.any(Object)
                )
            })
        })

        it('should include Authorization header when getAccessToken available', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    checkoutSessionToken: 'session-token',
                    reservedOrderNo: 'order-123'
                })
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                const call = global.fetch.mock.calls.find(c => c[0].includes('create-session'))
                expect(call[1].headers['Authorization']).toBe('Bearer test-token')
            })
        })

        it('should handle create-session failure', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: () => Promise.resolve('Server error')
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                expect(screen.getByText(/create-session returned 500/i)).toBeInTheDocument()
            })
        })
    })

    describe('Script Loading', () => {
        it('should attempt to load Drop-in SDK script when configured', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    checkoutSessionToken: 'token',
                    reservedOrderNo: 'order-123'
                })
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                expect(screen.queryByText(/Error/i)).not.toBeInTheDocument()
            })
        })

        it('should show error when Drop-in script URL not configured', async () => {
            useJPMCCheckout.mockReturnValue({
                ...mockContextValue,
                paymentConfig: {}
            })

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    checkoutSessionToken: 'token',
                    reservedOrderNo: 'order-123'
                })
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                expect(screen.getByText(/script URL is not configured/i)).toBeInTheDocument()
            })
        })
    })

    describe('Response Validation', () => {
        it('should show error when create-session missing checkoutSessionToken', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    reservedOrderNo: 'order-123'
                })
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                expect(screen.getByText(/No checkoutSessionToken in create-session response/i)).toBeInTheDocument()
            })
        })

        it('should show error when create-session missing reservedOrderNo', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    checkoutSessionToken: 'token'
                })
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                expect(screen.getByText(/No reservedOrderNo in create-session response/i)).toBeInTheDocument()
            })
        })

        it('should show error when get-intent missing checkoutSessionToken', async () => {
            sessionStorage.setItem('jpmcDropInInitialized', mockBasket.basketId)

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    reservedOrderNo: 'order-456'
                })
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                expect(screen.getByText(/No checkoutSessionToken in get-intent response/i)).toBeInTheDocument()
            })
        })

        it('should handle get-intent failure with specific error message', async () => {
            sessionStorage.setItem('jpmcDropInInitialized', mockBasket.basketId)

            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: () => Promise.resolve('Bad request')
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                expect(screen.getByText(/get-intent returned 400/i)).toBeInTheDocument()
            })
        })

        it('should extract errorStage from get-intent error response', async () => {
            sessionStorage.setItem('jpmcDropInInitialized', mockBasket.basketId)

            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: () => Promise.resolve(JSON.stringify({
                    errorStage: 'shipping',
                    error: 'Shipping validation failed'
                }))
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                expect(screen.getByText(/Shipping validation failed/i)).toBeInTheDocument()
            })
        })
    })

    describe('Re-entry Detection', () => {
        it('should call get-intent on re-entry', async () => {
            sessionStorage.setItem('jpmcDropInInitialized', mockBasket.basketId)

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    checkoutSessionToken: 'intent-token',
                    reservedOrderNo: 'order-456'
                })
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringContaining('get-intent'),
                    expect.any(Object)
                )
            })
        })
    })

    describe('Basket Calculations', () => {
        it('should include subtotal in create-session request', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    checkoutSessionToken: 'token',
                    reservedOrderNo: 'order-123'
                })
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                const call = global.fetch.mock.calls.find(c => c[0].includes('create-session'))
                const body = JSON.parse(call[1].body)
                expect(body.subtotalAmount).toBe(8500)
            })
        })

        it('should calculate subtotal when not provided', async () => {
            const basketNoSubtotal = {
                ...mockBasket,
                totals: {
                    totalTax: 10,
                    totalShipping: 5
                }
            }

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    checkoutSessionToken: 'token',
                    reservedOrderNo: 'order-123'
                })
            })

            render(<DropInCheckout basket={basketNoSubtotal} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                const call = global.fetch.mock.calls.find(c => c[0].includes('create-session'))
                const body = JSON.parse(call[1].body)
                expect(body.subtotalAmount).toBeGreaterThan(0)
            })
        })

        it('should extract shipping from shipments array when totals.totalShipping not available', async () => {
            const basketWithShipments = {
                ...mockBasket,
                totals: {
                    subtotal: 85,
                    totalTax: 10
                },
                shipments: [{
                    shippingCost: 5
                }]
            }

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    checkoutSessionToken: 'token',
                    reservedOrderNo: 'order-123'
                })
            })

            render(<DropInCheckout basket={basketWithShipments} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                const call = global.fetch.mock.calls.find(c => c[0].includes('create-session'))
                const body = JSON.parse(call[1].body)
                expect(body.totalShippingAmount).toBe(500)
            })
        })

        it('should include tax amount in create-session request', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    checkoutSessionToken: 'token',
                    reservedOrderNo: 'order-123'
                })
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                const call = global.fetch.mock.calls.find(c => c[0].includes('create-session'))
                const body = JSON.parse(call[1].body)
                expect(body.totalTaxAmount).toBe(1000)
            })
        })

        it('should include shipping amount in create-session request', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    checkoutSessionToken: 'token',
                    reservedOrderNo: 'order-123'
                })
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                const call = global.fetch.mock.calls.find(c => c[0].includes('create-session'))
                const body = JSON.parse(call[1].body)
                expect(body.totalShippingAmount).toBe(500)
            })
        })
    })

    describe('Locale Parameter', () => {
        it('should include locale in fetch URL when provided', async () => {
            useJPMCCheckout.mockReturnValue({
                ...mockContextValue,
                locale: 'fr-FR'
            })

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    checkoutSessionToken: 'token',
                    reservedOrderNo: 'order-123'
                })
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                const call = global.fetch.mock.calls.find(c => c[0].includes('create-session'))
                expect(call[0]).toContain('locale=fr-FR')
            })
        })
    })

    describe('Error Retry', () => {
        it('should show Try Again button on error', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: () => Promise.resolve('Error')
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                expect(screen.getByText('Try Again')).toBeInTheDocument()
            })
        })
    })

    describe('Payment Callback Handling', () => {
        it('should accept onPaymentSuccess callback prop', () => {
            const onSuccess = jest.fn()
            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={onSuccess} />)
            
            expect(screen.getByText('Loading payment form…')).toBeInTheDocument()
        })
    })

    describe('Payment Event Subscription', () => {
        it('should subscribe to DropInUI announcements after mount', async () => {
            const subscribeSpy = jest.spyOn(MockDropInUI.prototype, 'subscribe')
            window.DropInUI = MockDropInUI

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    checkoutSessionToken: 'token',
                    reservedOrderNo: 'order-123'
                })
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                expect(screen.queryByText('Loading payment form…')).not.toBeInTheDocument()
            }, { timeout: 100 })

            subscribeSpy.mockRestore()
        })

        it('should handle PaymentSuccess announcement and call callback', async () => {
            window.DropInUI = MockDropInUI

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    checkoutSessionToken: 'token',
                    reservedOrderNo: 'order-123'
                })
            })

            const onSuccess = jest.fn(() => Promise.resolve({ success: true }))
            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={onSuccess} />)

            await waitFor(() => {
                expect(screen.queryByText('Loading payment form…')).not.toBeInTheDocument()
            }, { timeout: 100 })
        })

        it('should handle PaymentUnsuccessful announcement', async () => {
            window.DropInUI = MockDropInUI

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    checkoutSessionToken: 'token',
                    reservedOrderNo: 'order-123'
                })
            })

            render(<DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />)

            await waitFor(() => {
                expect(screen.queryByText('Loading payment form…')).not.toBeInTheDocument()
            }, { timeout: 100 })
        })
    })

    describe('Cleanup', () => {
        it('should handle unmount during initialization', async () => {
            global.fetch.mockImplementation(() => new Promise(resolve => {
                setTimeout(() => resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        checkoutSessionToken: 'token',
                        reservedOrderNo: 'order-123'
                    })
                }), 100)
            }))

            const { unmount } = render(
                <DropInCheckout basket={mockBasket} onPaymentSuccess={jest.fn()} />
            )

            unmount()
        })
    })
})
