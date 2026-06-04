/**
 * Unit Tests for JPMC Config
 */

import { getJPMCConfig, getSensitiveCredentials, hasCredentials, isDebugMode } from '../jpmc-config'
import * as envLoader from '../env-loader'

// Mock env-loader
jest.mock('../env-loader', () => ({
    ensureEnvLoaded: jest.fn(),
    getEnvVar: jest.fn()
}))

describe('JPMC Config', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('getJPMCConfig', () => {
        it('returns config from environment variables', () => {
            envLoader.getEnvVar
                .mockImplementation((key, defaultVal) => {
                    const vars = {
                        JPMC_CERTIFICATE_PATH: '/path/to/cert',
                        JPMC_PRIVATE_KEY_PATH: '/path/to/key',
                        JPMC_CERTIFICATE_BASE64: 'base64cert',
                        JPMC_PRIVATE_KEY_BASE64: 'base64key',
                        JPMC_DEBUG: 'true'
                    }
                    return vars[key] || defaultVal
                })

            const config = getJPMCConfig()

            expect(envLoader.ensureEnvLoaded).toHaveBeenCalled()
            expect(config.certificatePath).toBe('/path/to/cert')
            expect(config.privateKeyPath).toBe('/path/to/key')
            expect(config.certificateBase64).toBe('base64cert')
            expect(config.privateKeyBase64).toBe('base64key')
            expect(config.debug).toBe(true)
        })

        it('returns default values when env vars not set', () => {
            envLoader.getEnvVar.mockImplementation((key, defaultVal) => defaultVal)

            const config = getJPMCConfig()

            expect(config.certificatePath).toBe('')
            expect(config.privateKeyPath).toBe('')
            expect(config.debug).toBe(false)
        })

        it('merges overrides with config', () => {
            envLoader.getEnvVar.mockImplementation((key, defaultVal) => defaultVal)

            const config = getJPMCConfig({ customField: 'customValue' })

            expect(config.customField).toBe('customValue')
        })
    })

    describe('getSensitiveCredentials', () => {
        it('returns only credential fields', () => {
            envLoader.getEnvVar
                .mockImplementation((key, defaultVal) => {
                    const vars = {
                        JPMC_CERTIFICATE_PATH: '/cert',
                        JPMC_PRIVATE_KEY_PATH: '/key',
                        JPMC_CERTIFICATE_BASE64: 'b64cert',
                        JPMC_PRIVATE_KEY_BASE64: 'b64key',
                        JPMC_DEBUG: 'true'
                    }
                    return vars[key] || defaultVal
                })

            const creds = getSensitiveCredentials()

            expect(creds.certificatePath).toBe('/cert')
            expect(creds.privateKeyPath).toBe('/key')
            expect(creds.certificateBase64).toBe('b64cert')
            expect(creds.privateKeyBase64).toBe('b64key')
            expect(creds.debug).toBeUndefined()
        })
    })

    describe('hasCredentials', () => {
        it('returns true when base64 credentials are set', () => {
            envLoader.getEnvVar
                .mockImplementation((key, defaultVal) => {
                    const vars = {
                        JPMC_CERTIFICATE_BASE64: 'cert',
                        JPMC_PRIVATE_KEY_BASE64: 'key'
                    }
                    return vars[key] || defaultVal
                })

            expect(hasCredentials()).toBe(true)
        })

        it('returns true when path credentials are set', () => {
            envLoader.getEnvVar
                .mockImplementation((key, defaultVal) => {
                    const vars = {
                        JPMC_CERTIFICATE_PATH: '/cert',
                        JPMC_PRIVATE_KEY_PATH: '/key'
                    }
                    return vars[key] || defaultVal
                })

            expect(hasCredentials()).toBe(true)
        })

        it('returns false when no credentials are set', () => {
            envLoader.getEnvVar.mockImplementation((key, defaultVal) => defaultVal)

            expect(hasCredentials()).toBe(false)
        })

        it('returns false when only certificate is set', () => {
            envLoader.getEnvVar
                .mockImplementation((key, defaultVal) => {
                    const vars = {
                        JPMC_CERTIFICATE_BASE64: 'cert'
                    }
                    return vars[key] || defaultVal
                })

            expect(hasCredentials()).toBe(false)
        })

        it('returns false when only private key is set', () => {
            envLoader.getEnvVar
                .mockImplementation((key, defaultVal) => {
                    const vars = {
                        JPMC_PRIVATE_KEY_BASE64: 'key'
                    }
                    return vars[key] || defaultVal
                })

            expect(hasCredentials()).toBe(false)
        })
    })

    describe('isDebugMode', () => {
        it('returns true when JPMC_DEBUG is true', () => {
            envLoader.getEnvVar
                .mockImplementation((key, defaultVal) => {
                    if (key === 'JPMC_DEBUG') return 'true'
                    return defaultVal
                })

            expect(isDebugMode()).toBe(true)
        })

        it('returns false when JPMC_DEBUG is not true', () => {
            envLoader.getEnvVar.mockImplementation((key, defaultVal) => defaultVal)

            expect(isDebugMode()).toBe(false)
        })
    })
})
