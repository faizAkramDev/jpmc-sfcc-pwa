/**
 * Environment Variable Loader
 * 
 * Single source of truth for loading environment variables.
 * Handles both server-side (Node.js with dotenv) and client-side (browser) environments.
 * 
 * @module utils/config/env-loader
 */

let envLoaded = false

/**
 * Check if code is running on server-side (Node.js)
 * @returns {boolean} True if running on server
 */
export const isServerSide = () => typeof window === 'undefined'

/**
 * Check if code is running on client-side (browser)
 * @returns {boolean} True if running in browser
 */
export const isClientSide = () => typeof window !== 'undefined'

/**
 * Ensure environment variables are loaded from .env file (server-side only)
 * 
 * This function is idempotent - calling it multiple times has no effect after first load.
 * On client-side, it's a no-op since environment variables aren't available in browser.
 * 
 * @returns {void}
 */
export const ensureEnvLoaded = () => {
    // Already loaded, skip
    if (envLoaded) return
    
    // Client-side: env vars not applicable
    if (isClientSide()) {
        envLoaded = true
        return
    }
    
    // Server-side: try to load .env file
    try {
        // Dynamic import to avoid bundling dotenv in client builds
        const dotenv = require('dotenv')
        dotenv.config()
        envLoaded = true
    } catch (error) {
        // dotenv not available (e.g., in MRT where env vars are set externally)
        // This is expected in production environments
        envLoaded = true
    }
}

/**
 * Get an environment variable value with optional default
 * 
 * @param {string} key - Environment variable name
 * @param {string} defaultValue - Default value if not set
 * @returns {string} Environment variable value or default
 */
export const getEnvVar = (key, defaultValue = '') => {
    ensureEnvLoaded()
    return process.env[key] || defaultValue
}

/**
 * Check if an environment variable is set (non-empty)
 * 
 * @param {string} key - Environment variable name
 * @returns {boolean} True if variable is set and non-empty
 */
export const hasEnvVar = (key) => {
    ensureEnvLoaded()
    return !!process.env[key]
}

/**
 * Get multiple environment variables as an object
 * 
 * @param {string[]} keys - Array of environment variable names
 * @returns {object} Object with key-value pairs
 */
export const getEnvVars = (keys) => {
    ensureEnvLoaded()
    return keys.reduce((acc, key) => {
        acc[key] = process.env[key] || ''
        return acc
    }, {})
}

/**
 * Reset env loaded state (for testing purposes only)
 * @private
 */
export const _resetEnvState = () => {
    envLoaded = false
}

export default {
    isServerSide,
    isClientSide,
    ensureEnvLoaded,
    getEnvVar,
    hasEnvVar,
    getEnvVars
}
