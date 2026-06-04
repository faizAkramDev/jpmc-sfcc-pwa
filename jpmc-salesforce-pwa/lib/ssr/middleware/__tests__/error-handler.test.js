/**
 * Error Handler Middleware Tests
 * 
 * Tests for the centralized JPMC error handling middleware
 */

import { jpmorganErrorHandler, createJPMCError } from '../error-handler'

// Mock logger
jest.mock('../../../utils/logger.js', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}))

import logger from '../../../utils/logger.js'

describe('error-handler', () => {
    let req
    let res
    let next

    beforeEach(() => {
        jest.clearAllMocks()
        
        req = {
            path: '/api/jpmorgan/authorize',
            method: 'POST'
        }
        
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        }
        
        next = jest.fn()
    })

    describe('jpmorganErrorHandler', () => {
        it('handles errors for JPMC routes', () => {
            const error = new Error('Payment failed')

            jpmorganErrorHandler(error, req, res, next)

            expect(res.status).toHaveBeenCalledWith(500)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                errorCode: 'INTERNAL_ERROR',
                canRetry: true
            }))
        })

        it('passes non-JPMC route errors to next middleware', () => {
            req.path = '/other/api/endpoint'
            const error = new Error('Other error')

            jpmorganErrorHandler(error, req, res, next)

            expect(next).toHaveBeenCalledWith(error)
            expect(res.status).not.toHaveBeenCalled()
        })

        it('logs error details', () => {
            const error = new Error('Test error')

            jpmorganErrorHandler(error, req, res, next)

            expect(logger.error).toHaveBeenCalledWith(
                '[JPMC Error]',
                expect.objectContaining({
                    path: '/api/jpmorgan/authorize',
                    method: 'POST',
                    error: 'Test error'
                })
            )
        })

        it('uses error statusCode when provided', () => {
            const error = Object.assign(new Error('Bad request'), {
                statusCode: 400
            })

            jpmorganErrorHandler(error, req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
        })

        it('maps ValidationError to 400', () => {
            const error = new Error('Validation failed')
            error.name = 'ValidationError'

            jpmorganErrorHandler(error, req, res, next)

            expect(res.status).toHaveBeenCalledWith(400)
        })

        it('maps UnauthorizedError to 401', () => {
            const error = new Error('Unauthorized')
            error.name = 'UnauthorizedError'

            jpmorganErrorHandler(error, req, res, next)

            expect(res.status).toHaveBeenCalledWith(401)
        })

        it('maps authentication errors to 401', () => {
            const error = new Error('authentication required')

            jpmorganErrorHandler(error, req, res, next)

            expect(res.status).toHaveBeenCalledWith(401)
        })

        it('maps not found errors to 404', () => {
            const error = new Error('Order not found')

            jpmorganErrorHandler(error, req, res, next)

            expect(res.status).toHaveBeenCalledWith(404)
        })

        it('uses error code when provided', () => {
            const error = Object.assign(new Error('Custom error'), {
                code: 'CUSTOM_CODE'
            })

            jpmorganErrorHandler(error, req, res, next)

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                errorCode: 'CUSTOM_CODE'
            }))
        })

        it('sets canRetry to true for 5xx errors', () => {
            const error = new Error('Server error')

            jpmorganErrorHandler(error, req, res, next)

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                canRetry: true
            }))
        })

        it('sets canRetry to false for 4xx errors', () => {
            const error = new Error('Resource not found')

            jpmorganErrorHandler(error, req, res, next)

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                canRetry: false
            }))
        })

        describe('production mode', () => {
            let originalEnv

            beforeEach(() => {
                originalEnv = process.env.NODE_ENV
            })

            afterEach(() => {
                process.env.NODE_ENV = originalEnv
            })

            it('always uses generic error message in production', () => {
                process.env.NODE_ENV = 'production'
                const error = new Error('Sensitive error details')

                jpmorganErrorHandler(error, req, res, next)

                expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                    message: "Payment couldn't be processed. Please try again later."
                }))
            })

            it('hides stack trace in production', () => {
                process.env.NODE_ENV = 'production'
                const error = new Error('Test error')

                jpmorganErrorHandler(error, req, res, next)

                expect(logger.error).toHaveBeenCalledWith(
                    '[JPMC Error]',
                    expect.objectContaining({
                        stack: undefined
                    })
                )
            })
        })

        describe('non-production mode', () => {
            let originalEnv

            beforeEach(() => {
                originalEnv = process.env.NODE_ENV
                process.env.NODE_ENV = 'development'
            })

            afterEach(() => {
                process.env.NODE_ENV = originalEnv
            })

            it('always uses generic error message in development', () => {
                const error = new Error('Detailed error message')

                jpmorganErrorHandler(error, req, res, next)

                expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                    message: "Payment couldn't be processed. Please try again later."
                }))
            })

            it('includes stack trace in logs', () => {
                const error = new Error('Test error')

                jpmorganErrorHandler(error, req, res, next)

                expect(logger.error).toHaveBeenCalledWith(
                    '[JPMC Error]',
                    expect.objectContaining({
                        stack: expect.any(String)
                    })
                )
            })

            it('includes debug info when JPMC_DEBUG is true', () => {
                const originalDebug = process.env.JPMC_DEBUG
                process.env.JPMC_DEBUG = 'true'
                
                const error = new Error('Debug error')

                jpmorganErrorHandler(error, req, res, next)

                expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                    _debug: expect.objectContaining({
                        originalError: 'Debug error',
                        stack: expect.any(String)
                    })
                }))

                process.env.JPMC_DEBUG = originalDebug
            })
        })

        it('handles error without message', () => {
            const error = {}

            jpmorganErrorHandler(error, req, res, next)

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false
            }))
        })
    })

    describe('createJPMCError', () => {
        it('creates an error with JPMC properties', () => {
            const error = createJPMCError('Test error', 'TEST_CODE', 400)

            expect(error.message).toBe('Test error')
            expect(error.code).toBe('TEST_CODE')
            expect(error.statusCode).toBe(400)
            expect(error.name).toBe('JPMCError')
        })

        it('uses default values', () => {
            const error = createJPMCError('Test error')

            expect(error.code).toBe('JPMC_ERROR')
            expect(error.statusCode).toBe(500)
        })

        it('creates an instance of Error', () => {
            const error = createJPMCError('Test')

            expect(error).toBeInstanceOf(Error)
        })

        it('has proper stack trace', () => {
            const error = createJPMCError('Test')

            expect(error.stack).toBeDefined()
            expect(error.stack).toContain('createJPMCError')
        })
    })
})
