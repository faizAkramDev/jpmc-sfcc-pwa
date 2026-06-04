/**
 * JPMC Routes Tests
 * 
 * Tests for the route registration functions
 */

import {
    registerJPMCRoutes,
    registerJPMCEndpoints,
    SuccessHandler,
    ErrorHandler
} from '../routes'

// Mock all dependencies
jest.mock('../../services/api-routes', () => ({
    handleAuthorize: jest.fn((req, res, next) => next ? next() : res.json({ success: true })),
    handleGetConfig: jest.fn((req, res, next) => next ? next() : res.json({ success: true })),
    handleGetGooglePayConfig: jest.fn((req, res, next) => next ? next() : res.json({ success: true })),
    handleVerify: jest.fn((req, res, next) => next ? next() : res.json({ success: true })),
    handleGetAvailablePaymentMethods: jest.fn((req, res, next) => next ? next() : res.json({ success: true })),
    handleGetFraudConfig: jest.fn((req, res, next) => next ? next() : res.json({ success: true }))
}))

jest.mock('../../utils/logger.js', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}))

jest.mock('../controllers/order-controller', () => ({
    configureOrderController: jest.fn(),
    handleConfirmOrder: jest.fn((req, res, next) => {
        res.locals.response = { success: true }
        next()
    }),
    handleFailOrder: jest.fn((req, res, next) => {
        res.locals.response = { success: true }
        next()
    }),
    handleUpdateOrderStatus: jest.fn((req, res, next) => {
        res.locals.response = { success: true }
        next()
    }),
    handlePatchPaymentInstrument: jest.fn((req, res, next) => {
        res.locals.response = { success: true }
        next()
    }),
    handleGetOrder: jest.fn((req, res, next) => {
        res.locals.response = { success: true }
        next()
    })
}))

jest.mock('../controllers/applepay-controller', () => ({
    configureApplePayController: jest.fn(),
    handleApplePaySession: jest.fn((req, res) => res.json({ success: true })),
    handleApplePayAuthorize: jest.fn((req, res) => res.json({ success: true })),
    handleApplePayConfig: jest.fn((req, res) => res.json({ success: true }))
}))

jest.mock('../middleware/rate-limit.js', () => ({
    applyRateLimiting: jest.fn()
}))

import logger from '../../utils/logger.js'
import { configureOrderController } from '../controllers/order-controller'
import { configureApplePayController } from '../controllers/applepay-controller'
import { applyRateLimiting } from '../middleware/rate-limit.js'

// Create a mock Express app
const createMockApp = () => {
    const routes = {
        get: [],
        post: [],
        put: [],
        patch: [],
        use: []
    }
    
    return {
        get: jest.fn((path, ...handlers) => routes.get.push({ path, handlers })),
        post: jest.fn((path, ...handlers) => routes.post.push({ path, handlers })),
        put: jest.fn((path, ...handlers) => routes.put.push({ path, handlers })),
        patch: jest.fn((path, ...handlers) => routes.patch.push({ path, handlers })),
        use: jest.fn((...args) => routes.use.push(args)),
        routes
    }
}

describe('routes.js', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('SuccessHandler', () => {
        it('sends response from res.locals.response', () => {
            const req = {}
            const res = {
                locals: { response: { success: true, data: 'test' } },
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            }

            SuccessHandler(req, res)

            expect(res.status).toHaveBeenCalledWith(200)
            expect(res.json).toHaveBeenCalledWith({ success: true, data: 'test' })
        })

        it('does nothing when no response in locals', () => {
            const req = {}
            const res = {
                locals: {},
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            }

            const result = SuccessHandler(req, res)

            expect(res.status).not.toHaveBeenCalled()
            expect(res.json).not.toHaveBeenCalled()
            expect(result).toBeUndefined()
        })
    })

    describe('ErrorHandler', () => {
        it('returns 500 for generic errors', () => {
            const err = new Error('Something went wrong')
            const req = {}
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            }
            const next = jest.fn()

            ErrorHandler(err, req, res, next)

            expect(res.status).toHaveBeenCalledWith(500)
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: "Payment couldn't be processed. Please try again later."
            })
            expect(logger.error).toHaveBeenCalled()
        })

        it('uses error statusCode when provided', () => {
            const err = Object.assign(new Error('Bad request'), { statusCode: 400 })
            const req = {}
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            }
            const next = jest.fn()

            ErrorHandler(err, req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
        })

        it('returns generic message when error.message is undefined', () => {
            const err = {}
            const req = {}
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            }
            const next = jest.fn()

            ErrorHandler(err, req, res, next)

            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: "Payment couldn't be processed. Please try again later."
            })
        })
    })

    describe('registerJPMCRoutes', () => {
        it('registers all basic routes', () => {
            const app = createMockApp()

            registerJPMCRoutes(app)

            // Config routes
            expect(app.get).toHaveBeenCalledWith('/api/jpmorgan/config', expect.any(Function))
            expect(app.post).toHaveBeenCalledWith('/api/jpmorgan/config', expect.any(Function))

            // Google Pay config routes
            expect(app.get).toHaveBeenCalledWith('/api/jpmorgan/googlepay/config', expect.any(Function))
            expect(app.post).toHaveBeenCalledWith('/api/jpmorgan/googlepay/config', expect.any(Function))

            // Payment routes
            expect(app.post).toHaveBeenCalledWith('/api/jpmorgan/authorize', expect.any(Function))
            expect(app.post).toHaveBeenCalledWith('/api/jpmorgan/verify', expect.any(Function))

            // Available payment methods
            expect(app.get).toHaveBeenCalledWith('/api/jpmorgan/available-payment-methods', expect.any(Function))
        })

        it('uses custom basePath', () => {
            const app = createMockApp()

            registerJPMCRoutes(app, { basePath: '/custom/path' })

            expect(app.get).toHaveBeenCalledWith('/custom/path/config', expect.any(Function))
            expect(app.post).toHaveBeenCalledWith('/custom/path/authorize', expect.any(Function))
        })

        it('applies rate limiting by default', () => {
            const app = createMockApp()

            registerJPMCRoutes(app)

            expect(applyRateLimiting).toHaveBeenCalledWith(
                app,
                '/api/jpmorgan',
                { windowMs: 60000, max: 5 }
            )
        })

        it('skips rate limiting when disabled', () => {
            const app = createMockApp()

            registerJPMCRoutes(app, { enableRateLimit: false })

            expect(applyRateLimiting).not.toHaveBeenCalled()
        })

        it('logs when debug is enabled', () => {
            const app = createMockApp()

            registerJPMCRoutes(app, { debug: true })

            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[JPMC Routes]'),
                expect.anything()
            )
        })

        it('uses custom rate limit options', () => {
            const app = createMockApp()

            registerJPMCRoutes(app, {
                rateLimitOptions: { windowMs: 120000, max: 10 }
            })

            expect(applyRateLimiting).toHaveBeenCalledWith(
                app,
                '/api/jpmorgan',
                { windowMs: 120000, max: 10 }
            )
        })
    })

    describe('registerJPMCEndpoints', () => {
        it('registers all endpoints', () => {
            const app = createMockApp()
            const runtime = {}

            registerJPMCEndpoints(app, runtime)

            // Config endpoints
            expect(app.get).toHaveBeenCalledWith('/api/jpmorgan/config', expect.any(Function))
            expect(app.post).toHaveBeenCalledWith('/api/jpmorgan/config', expect.any(Function))
            expect(app.get).toHaveBeenCalledWith('/api/jpmorgan/googlepay/config', expect.any(Function))
            expect(app.get).toHaveBeenCalledWith('/api/jpmorgan/available-payment-methods', expect.any(Function))
            expect(app.get).toHaveBeenCalledWith('/api/jpmorgan/fraud-config', expect.any(Function))

            // Apple Pay endpoints
            expect(app.get).toHaveBeenCalledWith('/api/jpmorgan/applepay/config', expect.any(Function))
            expect(app.post).toHaveBeenCalledWith('/api/jpmorgan/applepay/session', expect.any(Function))
            expect(app.post).toHaveBeenCalledWith('/api/jpmorgan/applepay/authorize', expect.any(Function))

            // Payment endpoints
            expect(app.post).toHaveBeenCalledWith('/api/jpmorgan/authorize', expect.any(Function))
            expect(app.post).toHaveBeenCalledWith('/api/jpmorgan/verify', expect.any(Function))

            // Order management endpoints
            expect(app.post).toHaveBeenCalledWith('/api/jpmorgan/order/:orderNo/confirm', expect.any(Function), expect.any(Function))
            expect(app.post).toHaveBeenCalledWith('/api/jpmorgan/order/:orderNo/fail', expect.any(Function), expect.any(Function))
            expect(app.put).toHaveBeenCalledWith('/api/jpmorgan/order/:orderNo/status', expect.any(Function), expect.any(Function))
            expect(app.patch).toHaveBeenCalledWith('/api/jpmorgan/order/:orderNo/payment-instruments/:paymentInstrumentId', expect.any(Function), expect.any(Function))
            expect(app.get).toHaveBeenCalledWith('/api/jpmorgan/order/:orderNo', expect.any(Function), expect.any(Function))

            // Google Pay Cart/PDP endpoints removed - integrators handle basket operations directly

            // Error handler
            expect(app.use).toHaveBeenCalled()
        })

        it('uses custom basePath', () => {
            const app = createMockApp()

            registerJPMCEndpoints(app, {}, { basePath: '/v2/payments' })

            expect(app.get).toHaveBeenCalledWith('/v2/payments/config', expect.any(Function))
            expect(app.post).toHaveBeenCalledWith('/v2/payments/authorize', expect.any(Function))
        })

        it('configures order controller', () => {
            const app = createMockApp()
            const attributeMapping = { c_custom: () => 'value' }
            const onAuthorizationSuccess = jest.fn()
            const onAuthorizationFailure = jest.fn()

            registerJPMCEndpoints(app, {}, {
                attributeMapping,
                onAuthorizationSuccess,
                onAuthorizationFailure,
                commerceConfig: { orgId: 'test-org' }
            })

            expect(configureOrderController).toHaveBeenCalledWith({
                attributeMapping,
                onAuthorizationSuccess,
                onAuthorizationFailure,
                commerceConfig: { orgId: 'test-org' },
                debug: false
            })
        })

        it('configures Apple Pay when provided', () => {
            const app = createMockApp()
            const applePayConfig = {
                merchantId: 'merchant.test',
                merchantName: 'Test Store'
            }

            registerJPMCEndpoints(app, {}, { applePay: applePayConfig })

            expect(configureApplePayController).toHaveBeenCalledWith({
                ...applePayConfig,
                debug: false
            })
        })

        it('applies handler overrides', () => {
            const app = createMockApp()
            const customHandler = jest.fn()

            registerJPMCEndpoints(app, {}, {
                overrides: {
                    config: [customHandler]
                }
            })

            expect(app.get).toHaveBeenCalledWith('/api/jpmorgan/config', customHandler)
        })

        it('applies custom error handler override', () => {
            const app = createMockApp()
            const customErrorHandler = jest.fn()

            registerJPMCEndpoints(app, {}, {
                overrides: {
                    ErrorHandler: customErrorHandler
                }
            })

            expect(app.use).toHaveBeenCalledWith(customErrorHandler)
        })

        it('applies rate limiting by default', () => {
            const app = createMockApp()

            registerJPMCEndpoints(app, {})

            expect(applyRateLimiting).toHaveBeenCalledWith(
                app,
                '/api/jpmorgan',
                { windowMs: 60000, max: 5 }
            )
        })

        it('skips rate limiting when disabled', () => {
            const app = createMockApp()

            registerJPMCEndpoints(app, {}, { enableRateLimit: false })

            expect(applyRateLimiting).not.toHaveBeenCalled()
        })

        it('logs debug info when enabled', () => {
            const app = createMockApp()

            registerJPMCEndpoints(app, {}, { debug: true })

            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[JPMC Endpoints]'),
                expect.anything()
            )
        })

        it('uses JPMC_DEBUG env var for debug flag', () => {
            const originalEnv = process.env.JPMC_DEBUG
            process.env.JPMC_DEBUG = 'true'

            const app = createMockApp()

            registerJPMCEndpoints(app, {})

            expect(logger.info).toHaveBeenCalled()

            process.env.JPMC_DEBUG = originalEnv
        })
    })
})
