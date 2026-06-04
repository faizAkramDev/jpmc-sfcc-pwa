/**
 * CSP Middleware Tests
 * 
 * Tests for the JPMC Content Security Policy middleware
 */

import {
    jpmorganCSPMiddleware,
    mergeCSPDirectives,
    getCSPDirectives
} from '../csp'

// Mock helmet
jest.mock('helmet', () => jest.fn((config) => (req, res, next) => {
    // Store config on res for testing
    res.helmetConfig = config
    next?.()
}))

import helmet from 'helmet'

describe('csp.js', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        // Reset env
        delete process.env.AWS_LAMBDA_FUNCTION_NAME
        delete process.env.MOBIFY_PROPERTY_ID
        delete process.env.X_MOBIFY_DEPLOYID
    })

    describe('mergeCSPDirectives', () => {
        it('returns default JPMC directives when no custom provided', () => {
            const directives = mergeCSPDirectives()

            expect(directives['script-src']).toContain("'self'")
            expect(directives['script-src']).toContain('https://pay.google.com')
            expect(directives['connect-src']).toContain('https://api-ms.payments.jpmorgan.com')
        })

        it('merges custom directives with defaults', () => {
            const custom = {
                'script-src': ['https://custom-script.com']
            }

            const directives = mergeCSPDirectives(custom)

            expect(directives['script-src']).toContain("'self'")
            expect(directives['script-src']).toContain('https://custom-script.com')
        })

        it('avoids duplicate values when merging', () => {
            const custom = {
                'script-src': ["'self'", 'https://pay.google.com']
            }

            const directives = mergeCSPDirectives(custom)
            const selfCount = directives['script-src'].filter(s => s === "'self'").length

            expect(selfCount).toBe(1)
        })

        it('adds new directive categories', () => {
            const custom = {
                'worker-src': ['https://worker.example.com']
            }

            const directives = mergeCSPDirectives(custom)

            expect(directives['worker-src']).toContain('https://worker.example.com')
        })
    })

    describe('getCSPDirectives', () => {
        it('returns directives object', () => {
            const directives = getCSPDirectives()

            expect(directives).toHaveProperty('script-src')
            expect(directives).toHaveProperty('connect-src')
            expect(directives).toHaveProperty('frame-src')
        })

        it('merges additional directives', () => {
            const directives = getCSPDirectives({
                'default-src': ["'self'"]
            })

            expect(directives['default-src']).toContain("'self'")
        })
    })

    describe('jpmorganCSPMiddleware', () => {
        let mockReq, mockRes, mockNext

        beforeEach(() => {
            mockReq = {}
            mockRes = {
                locals: {},
                helmetConfig: null
            }
            mockNext = jest.fn()
        })

        const invokeMiddleware = (additionalDirectives) => {
            const middleware = jpmorganCSPMiddleware(additionalDirectives)
            middleware(mockReq, mockRes, mockNext)
        }

        it('creates middleware function', () => {
            const middleware = jpmorganCSPMiddleware()

            expect(typeof middleware).toBe('function')
        })

        it('calls helmet with CSP configuration', () => {
            invokeMiddleware()

            expect(helmet).toHaveBeenCalledWith(expect.objectContaining({
                contentSecurityPolicy: expect.objectContaining({
                    useDefaults: true,
                    directives: expect.any(Object)
                })
            }))
        })

        it('sets crossOriginOpenerPolicy for Google Pay', () => {
            invokeMiddleware()

            expect(helmet).toHaveBeenCalledWith(expect.objectContaining({
                crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
            }))
        })

        it('accepts additional directives', () => {
            invokeMiddleware({
                'script-src': ['https://custom.example.com']
            })

            const call = helmet.mock.calls[0][0]
            expect(call.contentSecurityPolicy.directives['script-src']).toContain('https://custom.example.com')
        })

        it('sets per-request nonce on res.locals.cspNonce', () => {
            invokeMiddleware()

            expect(mockRes.locals.cspNonce).toBeDefined()
            expect(typeof mockRes.locals.cspNonce).toBe('string')
        })

        it('adds nonce to script-src directive', () => {
            invokeMiddleware()

            const call = helmet.mock.calls[0][0]
            const scriptSrc = call.contentSecurityPolicy.directives['script-src']
            const nonce = mockRes.locals.cspNonce

            expect(scriptSrc.some(s => s === `'nonce-${nonce}'`)).toBe(true)
        })

        it('style-src contains unsafe-inline (required for React inline style attributes)', () => {
            invokeMiddleware()

            const call = helmet.mock.calls[0][0]
            const styleSrc = call.contentSecurityPolicy.directives['style-src']

            expect(styleSrc).toContain("'unsafe-inline'")
        })

        describe('local development mode', () => {
            it('disables upgrade-insecure-requests locally', () => {
                // No env vars set, so !isRemote() = true
                invokeMiddleware()

                const call = helmet.mock.calls[0][0]
                expect(call.contentSecurityPolicy.directives['upgrade-insecure-requests']).toBeNull()
            })

            it('disables HSTS locally', () => {
                invokeMiddleware()

                expect(helmet).toHaveBeenCalledWith(expect.objectContaining({
                    hsts: false
                }))
            })
        })

        describe('remote/production mode', () => {
            it('enables upgrade-insecure-requests when AWS_LAMBDA_FUNCTION_NAME set', () => {
                process.env.AWS_LAMBDA_FUNCTION_NAME = 'my-function'

                invokeMiddleware()

                const call = helmet.mock.calls[0][0]
                expect(call.contentSecurityPolicy.directives['upgrade-insecure-requests']).not.toBeNull()
            })

            it('enables upgrade-insecure-requests when MOBIFY_PROPERTY_ID set', () => {
                process.env.MOBIFY_PROPERTY_ID = 'property-123'

                invokeMiddleware()

                const call = helmet.mock.calls[0][0]
                expect(call.contentSecurityPolicy.directives['upgrade-insecure-requests']).toBeUndefined()
            })

            it('enables upgrade-insecure-requests when X_MOBIFY_DEPLOYID set', () => {
                process.env.X_MOBIFY_DEPLOYID = 'deploy-123'

                invokeMiddleware()

                const call = helmet.mock.calls[0][0]
                expect(call.contentSecurityPolicy.directives['upgrade-insecure-requests']).toBeUndefined()
            })

            it('enables HSTS in remote', () => {
                process.env.AWS_LAMBDA_FUNCTION_NAME = 'my-function'

                invokeMiddleware()

                expect(helmet).toHaveBeenCalledWith(expect.objectContaining({
                    hsts: true
                }))
            })
        })
    })

    describe('CSP directive content', () => {
        it('includes PIE SDK script domains', () => {
            const directives = getCSPDirectives()

            expect(directives['script-src']).toContain('https://safetechpageencryptionvar.chasepaymentech.com')
            expect(directives['script-src']).toContain('https://safetechpageencryption.chasepaymentech.com')
        })

        it('includes JPMC API connect domains', () => {
            const directives = getCSPDirectives()

            expect(directives['connect-src']).toContain('https://api-ms-test.payments.jpmorgan.com')
            expect(directives['connect-src']).toContain('https://api-ms.payments.jpmorgan.com')
        })

        it('includes Google Pay domains', () => {
            const directives = getCSPDirectives()

            expect(directives['script-src']).toContain('https://pay.google.com')
            expect(directives['frame-src']).toContain('https://pay.google.com')
        })

        it('includes Apple Pay domains', () => {
            const directives = getCSPDirectives()

            expect(directives['script-src']).toContain('https://applepay.cdn-apple.com')
            expect(directives['connect-src']).toContain('https://apple-pay-gateway.apple.com')
        })

        it('includes Kount fingerprinting domains', () => {
            const directives = getCSPDirectives()

            expect(directives['script-src']).toContain('https://*.kaptcha.com')
            expect(directives['frame-src']).toContain('https://*.kaptcha.com')
        })

        it('does not include unsafe-eval (PIE SDK verified to not require it)', () => {
            const directives = getCSPDirectives()

            expect(directives['script-src']).not.toContain("'unsafe-eval'")
        })

        it('includes unsafe-inline for styles (required for React/Chakra inline style attributes)', () => {
            const directives = getCSPDirectives()

            expect(directives['style-src']).toContain("'unsafe-inline'")
        })
    })
})
