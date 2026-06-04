/**
 * JPMC Error Handler Middleware
 * 
 * Centralized error handling for JPMC API routes.
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/ssr/middleware/error-handler
 */

import logger from '../../utils/logger.js'
import { GENERIC_API_ERROR_MESSAGE } from '../../utils/constants/error-constants'

/**
 * Express error handler for JPMC routes
 * 
 * @param {Error} err - Error object
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Next middleware
 */
export function jpmorganErrorHandler(err, req, res, next) {
    // Only handle errors for JPMC routes
    if (!req.path.includes('/api/jpmorgan')) {
        return next(err)
    }
    
    logger.error('[JPMC Error]', {
        path: req.path,
        method: req.method,
        error: err.message,
        stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    })
    
    // Determine status code
    let statusCode = err.statusCode || 500
    
    // Map common error types
    if (err.name === 'ValidationError') {
        statusCode = 400
    } else if (err.name === 'UnauthorizedError' || err.message?.includes('authentication')) {
        statusCode = 401
    } else if (err.message?.includes('not found')) {
        statusCode = 404
    }
    
    // Build error response
    const errorResponse = {
        success: false,
        errorCode: err.code || 'INTERNAL_ERROR',
        message: GENERIC_API_ERROR_MESSAGE,
        canRetry: statusCode >= 500  // Server errors can be retried
    }
    
    // Add debug info in non-production
    if (process.env.NODE_ENV !== 'production' && process.env.JPMC_DEBUG === 'true') {
        errorResponse._debug = {
            originalError: err.message,
            stack: err.stack
        }
    }
    
    return res.status(statusCode).json(errorResponse)
}

/**
 * Create a JPMC-specific error
 * 
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {number} statusCode - HTTP status code
 * @returns {Error} Error with JPMC properties
 */
export function createJPMCError(message, code = 'JPMC_ERROR', statusCode = 500) {
    const error = new Error(message)
    error.code = code
    error.statusCode = statusCode
    error.name = 'JPMCError'
    return error
}

export default { jpmorganErrorHandler, createJPMCError }
