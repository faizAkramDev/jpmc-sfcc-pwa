/**
 * Configuration Module Index
 * 
 * Single source of truth for environment and JPMC configuration.
 * 
 * @module utils/config
 */

// Environment loader utilities
export {
    isServerSide,
    isClientSide,
    ensureEnvLoaded,
    getEnvVar,
    hasEnvVar,
    getEnvVars
} from './env-loader'

// JPMC configuration utilities
export {
    getJPMCConfig,
    getSensitiveCredentials,
    hasCredentials,
    isDebugMode
} from './jpmc-config'

// Default export
export { default as envLoader } from './env-loader'
export { default as jpmcConfig } from './jpmc-config'
