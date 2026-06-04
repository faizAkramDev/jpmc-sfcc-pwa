/**
 * Rate Limit Middleware Tests
 * 
 * Tests for the JPMC rate limiting middleware
 */

import rateLimitModule, {
    createRateLimiter,
    createCategoryRateLimiter,
    createPaymentRateLimiter,
    paymentRateLimiter,
    configRateLimiter,
    googlePayCartRateLimiter,
    googlePayPdpRateLimiter,
    applePayRateLimiter,
    orderRateLimiter,
    applyRateLimiting
} from '../rate-limit'

// DEFAULT_RATE_LIMITS is only available via default export
const { DEFAULT_RATE_LIMITS } = rateLimitModule

// Mock express-rate-limit
jest.mock('express-rate-limit', () => jest.fn((config) => {
    const middleware = jest.fn((req, res, next) => {
        middleware.config = config
        // Store for testing
        req.rateLimitConfig = config
        next?.()
    })
    middleware.config = config
    return middleware
}))

// Mock logger
jest.mock('../../../utils/logger.js', () => ({
    warn: jest.fn(),
    info: jest.fn()
}))

import rateLimit from 'express-rate-limit'
import logger from '../../../utils/logger.js'

describe('rate-limit.js', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('DEFAULT_RATE_LIMITS', () => {
        it('exports default rate limits for all categories', () => {
            expect(DEFAULT_RATE_LIMITS).toHaveProperty('payment')
            expect(DEFAULT_RATE_LIMITS).toHaveProperty('config')
            expect(DEFAULT_RATE_LIMITS).toHaveProperty('googlePayCart')
            expect(DEFAULT_RATE_LIMITS).toHaveProperty('googlePayPdp')
            expect(DEFAULT_RATE_LIMITS).toHaveProperty('applePay')
            expect(DEFAULT_RATE_LIMITS).toHaveProperty('order')
        })

        it('payment category has strict limits', () => {
            expect(DEFAULT_RATE_LIMITS.payment.max).toBe(5)
            expect(DEFAULT_RATE_LIMITS.payment.windowMs).toBe(60000)
        })

        it('config category has lenient limits', () => {
            expect(DEFAULT_RATE_LIMITS.config.max).toBe(30)
        })

        it('googlePayCart has reasonable limits', () => {
            expect(DEFAULT_RATE_LIMITS.googlePayCart.max).toBe(20)
        })

        it('all categories have message property', () => {
            Object.values(DEFAULT_RATE_LIMITS).forEach(config => {
                expect(config).toHaveProperty('message')
                expect(typeof config.message).toBe('string')
            })
        })
    })

    describe('createRateLimiter', () => {
        it('creates rate limiter with default options', () => {
            const limiter = createRateLimiter()

            expect(rateLimit).toHaveBeenCalledWith(expect.objectContaining({
                windowMs: 60000,
                max: 5
            }))
        })

        it('creates rate limiter with custom options', () => {
            createRateLimiter({ windowMs: 120000, max: 10 })

            expect(rateLimit).toHaveBeenCalledWith(expect.objectContaining({
                windowMs: 120000,
                max: 10
            }))
        })

        it('creates rate limiter with custom message', () => {
            createRateLimiter({ message: 'Custom rate limit message' })

            expect(rateLimit).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.objectContaining({
                    error: 'Custom rate limit message'
                })
            }))
        })

        it('includes standard config options', () => {
            createRateLimiter()

            expect(rateLimit).toHaveBeenCalledWith(expect.objectContaining({
                standardHeaders: true,
                legacyHeaders: false
            }))
        })

        it('includes RATE_LIMIT_EXCEEDED error code', () => {
            createRateLimiter()

            expect(rateLimit).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.objectContaining({
                    errorCode: 'RATE_LIMIT_EXCEEDED'
                })
            }))
        })

        it('includes retryAfter in seconds', () => {
            createRateLimiter({ windowMs: 120000 })

            expect(rateLimit).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.objectContaining({
                    retryAfter: 120
                })
            }))
        })

        it('includes skip function for health checks', () => {
            createRateLimiter()

            const call = rateLimit.mock.calls[0][0]
            expect(typeof call.skip).toBe('function')
            
            // Test skip function
            expect(call.skip({ path: '/api/jpmorgan/health' })).toBe(true)
            expect(call.skip({ path: '/api/jpmorgan/authorize' })).toBe(false)
        })

        it('includes handler function', () => {
            createRateLimiter()

            const call = rateLimit.mock.calls[0][0]
            expect(typeof call.handler).toBe('function')
        })

        describe('handler function', () => {
            it('logs rate limit warning', () => {
                createRateLimiter()

                const call = rateLimit.mock.calls[0][0]
                const mockReq = { ip: '127.0.0.1', path: '/authorize', method: 'POST' }
                const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() }
                
                call.handler(mockReq, mockRes, jest.fn(), {})

                expect(logger.warn).toHaveBeenCalledWith(
                    '[JPMC Rate Limit] Request blocked:',
                    expect.objectContaining({
                        ip: '127.0.0.1',
                        path: '/authorize',
                        method: 'POST'
                    })
                )
            })

            it('returns 429 status', () => {
                createRateLimiter()

                const call = rateLimit.mock.calls[0][0]
                const mockReq = { ip: '127.0.0.1', path: '/test', method: 'POST' }
                const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() }
                
                call.handler(mockReq, mockRes, jest.fn(), { message: 'Custom message' })

                expect(mockRes.status).toHaveBeenCalledWith(429)
                expect(mockRes.json).toHaveBeenCalledWith('Custom message')
            })
        })
    })

    describe('createCategoryRateLimiter', () => {
        it('creates limiter for payment category', () => {
            createCategoryRateLimiter('payment')

            expect(rateLimit).toHaveBeenCalledWith(expect.objectContaining({
                max: 5,
                windowMs: 60000
            }))
        })

        it('creates limiter for config category', () => {
            createCategoryRateLimiter('config')

            expect(rateLimit).toHaveBeenCalledWith(expect.objectContaining({
                max: 30
            }))
        })

        it('creates limiter for googlePayCart category', () => {
            createCategoryRateLimiter('googlePayCart')

            expect(rateLimit).toHaveBeenCalledWith(expect.objectContaining({
                max: 20
            }))
        })

        it('accepts overrides for category', () => {
            createCategoryRateLimiter('payment', { max: 10 })

            expect(rateLimit).toHaveBeenCalledWith(expect.objectContaining({
                max: 10
            }))
        })

        it('falls back to payment defaults for unknown category', () => {
            createCategoryRateLimiter('unknown')

            expect(rateLimit).toHaveBeenCalledWith(expect.objectContaining({
                max: 5  // payment default
            }))
        })
    })

    describe('createPaymentRateLimiter (legacy)', () => {
        it('is same as createRateLimiter', () => {
            expect(createPaymentRateLimiter).toBe(createRateLimiter)
        })
    })

    describe('Pre-configured rate limiters', () => {
        it('exports paymentRateLimiter', () => {
            expect(paymentRateLimiter).toBeDefined()
            expect(typeof paymentRateLimiter).toBe('function')
        })

        it('exports configRateLimiter', () => {
            expect(configRateLimiter).toBeDefined()
        })

        it('exports googlePayCartRateLimiter', () => {
            expect(googlePayCartRateLimiter).toBeDefined()
        })

        it('exports googlePayPdpRateLimiter', () => {
            expect(googlePayPdpRateLimiter).toBeDefined()
        })

        it('exports applePayRateLimiter', () => {
            expect(applePayRateLimiter).toBeDefined()
        })

        it('exports orderRateLimiter', () => {
            expect(orderRateLimiter).toBeDefined()
        })
    })

    describe('applyRateLimiting', () => {
        let mockApp

        beforeEach(() => {
            mockApp = {
                use: jest.fn()
            }
        })

        it('applies rate limiting to payment endpoints', () => {
            applyRateLimiting(mockApp, '/api/jpmorgan')

            // Check that payment endpoints are protected
            const useCalls = mockApp.use.mock.calls.map(c => c[0])
            expect(useCalls).toContain('/api/jpmorgan/authorize')
            expect(useCalls).toContain('/api/jpmorgan/verify')
            expect(useCalls).toContain('/api/jpmorgan/capture')
        })

        it('applies rate limiting to config endpoints', () => {
            applyRateLimiting(mockApp, '/api/jpmorgan')

            const useCalls = mockApp.use.mock.calls.map(c => c[0])
            expect(useCalls).toContain('/api/jpmorgan/config')
            expect(useCalls).toContain('/api/jpmorgan/googlepay/config')
            expect(useCalls).toContain('/api/jpmorgan/applepay/config')
            expect(useCalls).toContain('/api/jpmorgan/available-payment-methods')
            expect(useCalls).toContain('/api/jpmorgan/fraud-config')
        })

        it('applies rate limiting to Google Pay Cart endpoints', () => {
            applyRateLimiting(mockApp, '/api/jpmorgan')

            const useCalls = mockApp.use.mock.calls.map(c => c[0])
            expect(useCalls).toContain('/api/jpmorgan/googlepay/initialize')
            expect(useCalls).toContain('/api/jpmorgan/googlepay/update-shipping')
            expect(useCalls).toContain('/api/jpmorgan/googlepay/select-shipping-option')
            expect(useCalls).toContain('/api/jpmorgan/googlepay/submit-cart-order')
            expect(useCalls).toContain('/api/jpmorgan/googlepay/cart-totals')
        })

        it('applies rate limiting to Google Pay PDP endpoints', () => {
            applyRateLimiting(mockApp, '/api/jpmorgan')

            const useCalls = mockApp.use.mock.calls.map(c => c[0])
            expect(useCalls).toContain('/api/jpmorgan/googlepay/pdp/add-to-cart')
            expect(useCalls).toContain('/api/jpmorgan/googlepay/pdp/restore-basket')
            expect(useCalls).toContain('/api/jpmorgan/googlepay/pdp/validate-stock')
            expect(useCalls).toContain('/api/jpmorgan/googlepay/pdp/product-details')
        })

        it('applies rate limiting to Apple Pay endpoints', () => {
            applyRateLimiting(mockApp, '/api/jpmorgan')

            const useCalls = mockApp.use.mock.calls.map(c => c[0])
            expect(useCalls).toContain('/api/jpmorgan/applepay/session')
            expect(useCalls).toContain('/api/jpmorgan/applepay/authorize')
        })

        it('applies rate limiting to order endpoints', () => {
            applyRateLimiting(mockApp, '/api/jpmorgan')

            const useCalls = mockApp.use.mock.calls.map(c => c[0])
            expect(useCalls).toContain('/api/jpmorgan/order')
        })

        it('logs applied rate limits', () => {
            applyRateLimiting(mockApp, '/api/jpmorgan')

            expect(logger.info).toHaveBeenCalledWith(
                '[JPMC Rate Limit] Applied rate limiting:',
                expect.objectContaining({
                    payment: expect.any(String),
                    config: expect.any(String),
                    googlePayCart: expect.any(String),
                    googlePayPdp: expect.any(String),
                    applePay: expect.any(String),
                    order: expect.any(String)
                })
            )
        })

        describe('backward compatibility', () => {
            it('supports options.max for payment category', () => {
                applyRateLimiting(mockApp, '/api/jpmorgan', { max: 10 })

                // Logger should show updated limit
                expect(logger.info).toHaveBeenCalledWith(
                    expect.any(String),
                    expect.objectContaining({
                        payment: '10 req/60s'
                    })
                )
            })

            it('supports options.windowMs globally', () => {
                applyRateLimiting(mockApp, '/api/jpmorgan', { windowMs: 120000 })

                // Logger should show 120s window
                expect(logger.info).toHaveBeenCalledWith(
                    expect.any(String),
                    expect.objectContaining({
                        payment: '5 req/120s'
                    })
                )
            })
        })

        describe('category overrides', () => {
            it('accepts per-category overrides', () => {
                applyRateLimiting(mockApp, '/api/jpmorgan', {
                    categories: {
                        payment: { max: 10 },
                        config: { max: 50 }
                    }
                })

                expect(logger.info).toHaveBeenCalledWith(
                    expect.any(String),
                    expect.objectContaining({
                        payment: '10 req/60s',
                        config: '50 req/60s'
                    })
                )
            })

            it('applies windowMs override per category', () => {
                applyRateLimiting(mockApp, '/api/jpmorgan', {
                    categories: {
                        order: { windowMs: 120000, max: 20 }
                    }
                })

                expect(logger.info).toHaveBeenCalledWith(
                    expect.any(String),
                    expect.objectContaining({
                        order: '20 req/120s'
                    })
                )
            })
        })

        it('works with custom basePath', () => {
            applyRateLimiting(mockApp, '/custom/path')

            const useCalls = mockApp.use.mock.calls.map(c => c[0])
            expect(useCalls).toContain('/custom/path/authorize')
            expect(useCalls).toContain('/custom/path/config')
        })
    })
})
