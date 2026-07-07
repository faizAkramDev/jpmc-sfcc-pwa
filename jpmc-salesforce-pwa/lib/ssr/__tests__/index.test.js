/**
 * Unit Tests for SSR Index Module - lib/ssr/index.js
 */

jest.mock('node:fs')
jest.mock('node:path')
jest.mock('dotenv')
jest.mock('../routes', () => ({
    registerJPMCEndpoints: jest.fn()
}))
jest.mock('../middleware/csp', () => ({
    jpmorganCSPMiddleware: jest.fn(() => (req, res, next) => next()),
    mergeCSPDirectives: jest.fn()
}))
jest.mock('../middleware/error-handler', () => ({
    jpmorganErrorHandler: jest.fn(() => (err, req, res, next) => next(err))
}))
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}))
jest.mock('body-parser', () => ({
    json: jest.fn(() => (req, res, next) => next())
}))

describe('lib/ssr/index.js - Server-Side Rendering Configuration Module', () => {
    const originalEnv = { ...process.env }

    beforeEach(() => {
        jest.clearAllMocks()
        // Reset environment
        for (const key of Object.keys(process.env)) {
            if (key.startsWith('JPMC')) {
                delete process.env[key]
            }
        }
    })

    afterAll(() => {
        process.env = originalEnv
    })

    describe('getJPMCConfig() - Synchronous Configuration Retrieval', () => {
        it('should return config object with all properties', () => {
            const { getJPMCConfig } = require('../index')
            const config = getJPMCConfig()

            expect(config).toBeInstanceOf(Object)
            expect(config).toHaveProperty('privateKeyBase64')
            expect(config).toHaveProperty('privateKeyPath')
            expect(config).toHaveProperty('certificateBase64')
            expect(config).toHaveProperty('certificatePath')
            expect(config).toHaveProperty('debug')
        })

        it('should return undefined values when env vars not set', () => {
            const { getJPMCConfig } = require('../index')
            const config = getJPMCConfig()

            expect(config.privateKeyBase64).toBeUndefined()
            expect(config.privateKeyPath).toBeUndefined()
            expect(config.certificateBase64).toBeUndefined()
            expect(config.certificatePath).toBeUndefined()
        })

        it('should read JPMC_PRIVATE_KEY_BASE64 from environment', () => {
            process.env.JPMC_PRIVATE_KEY_BASE64 = 'test-private-key-base64'
            
            jest.resetModules()
            const { getJPMCConfig } = require('../index')
            const config = getJPMCConfig()

            expect(config.privateKeyBase64).toBe('test-private-key-base64')
        })

        it('should read JPMC_PRIVATE_KEY_PATH from environment', () => {
            process.env.JPMC_PRIVATE_KEY_PATH = '/path/to/private/key'
            
            jest.resetModules()
            const { getJPMCConfig } = require('../index')
            const config = getJPMCConfig()

            expect(config.privateKeyPath).toBe('/path/to/private/key')
        })

        it('should read JPMC_CERTIFICATE_BASE64 from environment', () => {
            process.env.JPMC_CERTIFICATE_BASE64 = 'test-cert-base64'
            
            jest.resetModules()
            const { getJPMCConfig } = require('../index')
            const config = getJPMCConfig()

            expect(config.certificateBase64).toBe('test-cert-base64')
        })

        it('should read JPMC_CERTIFICATE_PATH from environment', () => {
            process.env.JPMC_CERTIFICATE_PATH = '/path/to/certificate'
            
            jest.resetModules()
            const { getJPMCConfig } = require('../index')
            const config = getJPMCConfig()

            expect(config.certificatePath).toBe('/path/to/certificate')
        })

        it('should parse JPMC_DEBUG=true as true', () => {
            process.env.JPMC_DEBUG = 'true'
            
            jest.resetModules()
            const { getJPMCConfig } = require('../index')
            const config = getJPMCConfig()

            expect(config.debug).toBe(true)
        })

        it('should parse JPMC_DEBUG=false as false', () => {
            process.env.JPMC_DEBUG = 'false'
            
            jest.resetModules()
            const { getJPMCConfig } = require('../index')
            const config = getJPMCConfig()

            expect(config.debug).toBe(false)
        })

        it('should default debug to false when not set', () => {
            delete process.env.JPMC_DEBUG
            
            jest.resetModules()
            const { getJPMCConfig } = require('../index')
            const config = getJPMCConfig()

            expect(config.debug).toBe(false)
        })

        it('should handle all key types simultaneously', () => {
            process.env.JPMC_PRIVATE_KEY_BASE64 = 'pk-b64'
            process.env.JPMC_PRIVATE_KEY_PATH = '/pk-path'
            process.env.JPMC_CERTIFICATE_BASE64 = 'cert-b64'
            process.env.JPMC_CERTIFICATE_PATH = '/cert-path'
            process.env.JPMC_DEBUG = 'true'
            
            jest.resetModules()
            const { getJPMCConfig } = require('../index')
            const config = getJPMCConfig()

            expect(config.privateKeyBase64).toBe('pk-b64')
            expect(config.privateKeyPath).toBe('/pk-path')
            expect(config.certificateBase64).toBe('cert-b64')
            expect(config.certificatePath).toBe('/cert-path')
            expect(config.debug).toBe(true)
        })
    })

    describe('createJPMCHandler() - Main Handler Factory', () => {
        it('should export createJPMCHandler as a function', () => {
            const { createJPMCHandler } = require('../index')
            expect(typeof createJPMCHandler).toBe('function')
        })

        it('should throw when JPMC_PRIVATE_KEY_BASE64 and JPMC_PRIVATE_KEY_PATH both missing', () => {
            delete process.env.JPMC_PRIVATE_KEY_BASE64
            delete process.env.JPMC_PRIVATE_KEY_PATH
            process.env.JPMC_CERTIFICATE_BASE64 = 'cert'
            
            jest.resetModules()
            const { createJPMCHandler } = require('../index')
            const mockRuntime = { createHandler: jest.fn() }

            expect(() => {
                createJPMCHandler(mockRuntime, {}, null)
            }).toThrow()
            expect(() => {
                createJPMCHandler(mockRuntime, {}, null)
            }).toThrow(/JPMC_PRIVATE_KEY_BASE64 or JPMC_PRIVATE_KEY_PATH is required/)
        })

        it('should throw when JPMC_CERTIFICATE_BASE64 and JPMC_CERTIFICATE_PATH both missing', () => {
            process.env.JPMC_PRIVATE_KEY_BASE64 = 'key'
            delete process.env.JPMC_CERTIFICATE_BASE64
            delete process.env.JPMC_CERTIFICATE_PATH
            
            jest.resetModules()
            const { createJPMCHandler } = require('../index')
            const mockRuntime = { createHandler: jest.fn() }

            expect(() => {
                createJPMCHandler(mockRuntime, {}, null)
            }).toThrow()
            expect(() => {
                createJPMCHandler(mockRuntime, {}, null)
            }).toThrow(/JPMC_CERTIFICATE_BASE64 or JPMC_CERTIFICATE_PATH is required/)
        })

        it('should accept JPMC_PRIVATE_KEY_PATH as valid credential', () => {
            delete process.env.JPMC_PRIVATE_KEY_BASE64
            process.env.JPMC_PRIVATE_KEY_PATH = '/valid/path/to/key'
            process.env.JPMC_CERTIFICATE_BASE64 = 'valid-cert'
            
            jest.resetModules()
            const { createJPMCHandler } = require('../index')
            
            const mockApp = { use: jest.fn() }
            const mockRuntime = {
                createHandler: jest.fn((opts, cb) => {
                    cb(mockApp)
                    return { handler: jest.fn() }
                })
            }

            const result = createJPMCHandler(mockRuntime, {}, null)
            
            expect(mockRuntime.createHandler).toHaveBeenCalled()
            expect(result).toHaveProperty('handler')
        })

        it('should accept JPMC_CERTIFICATE_PATH as valid credential', () => {
            process.env.JPMC_PRIVATE_KEY_BASE64 = 'valid-key'
            delete process.env.JPMC_CERTIFICATE_BASE64
            process.env.JPMC_CERTIFICATE_PATH = '/valid/path/to/cert'
            
            jest.resetModules()
            const { createJPMCHandler } = require('../index')
            
            const mockApp = { use: jest.fn() }
            const mockRuntime = {
                createHandler: jest.fn((opts, cb) => {
                    cb(mockApp)
                    return { handler: jest.fn() }
                })
            }

            const result = createJPMCHandler(mockRuntime, {}, null)
            
            expect(mockRuntime.createHandler).toHaveBeenCalled()
            expect(result).toHaveProperty('handler')
        })

        it('should return handler object with handler property', () => {
            process.env.JPMC_PRIVATE_KEY_BASE64 = 'key'
            process.env.JPMC_CERTIFICATE_BASE64 = 'cert'
            jest.resetModules()
            
            const { createJPMCHandler } = require('../index')
            
            const mockApp = { use: jest.fn() }
            const mockHandler = jest.fn()
            const mockRuntime = {
                createHandler: jest.fn((opts, cb) => {
                    cb(mockApp)
                    return { handler: mockHandler }
                })
            }

            const result = createJPMCHandler(mockRuntime, {}, null)
            
            expect(result).toBeDefined()
            expect(result.handler).toBe(mockHandler)
        })

        it('should call runtime.createHandler with options and callback', () => {
            process.env.JPMC_PRIVATE_KEY_BASE64 = 'key'
            process.env.JPMC_CERTIFICATE_BASE64 = 'cert'
            jest.resetModules()
            
            const { createJPMCHandler } = require('../index')
            
            const mockApp = { use: jest.fn() }
            const mockRuntime = {
                createHandler: jest.fn((opts, cb) => {
                    cb(mockApp)
                    return { handler: jest.fn() }
                })
            }
            const testOptions = { buildDir: '/dist', port: 3000 }

            createJPMCHandler(mockRuntime, testOptions, null)
            
            expect(mockRuntime.createHandler).toHaveBeenCalledWith(testOptions, expect.any(Function))
        })

        it('should invoke appCallback when provided', () => {
            process.env.JPMC_PRIVATE_KEY_BASE64 = 'key'
            process.env.JPMC_CERTIFICATE_BASE64 = 'cert'
            jest.resetModules()
            
            const { createJPMCHandler } = require('../index')
            
            const appCallbackSpy = jest.fn()
            const mockApp = { use: jest.fn() }
            const mockRuntime = {
                createHandler: jest.fn((opts, cb) => {
                    cb(mockApp)
                    return { handler: jest.fn() }
                })
            }

            createJPMCHandler(mockRuntime, {}, appCallbackSpy)
            
            expect(appCallbackSpy).toHaveBeenCalledWith(mockApp)
        })

        it('should not invoke appCallback when null', () => {
            process.env.JPMC_PRIVATE_KEY_BASE64 = 'key'
            process.env.JPMC_CERTIFICATE_BASE64 = 'cert'
            jest.resetModules()
            
            const { createJPMCHandler } = require('../index')
            
            const mockApp = { use: jest.fn() }
            const mockRuntime = {
                createHandler: jest.fn((opts, cb) => {
                    cb(mockApp)
                    return { handler: jest.fn() }
                })
            }

            createJPMCHandler(mockRuntime, {}, null)
            
            // Should not throw, just return successfully
            expect(mockRuntime.createHandler).toHaveBeenCalled()
        })

        it('should not invoke appCallback when not a function', () => {
            process.env.JPMC_PRIVATE_KEY_BASE64 = 'key'
            process.env.JPMC_CERTIFICATE_BASE64 = 'cert'
            jest.resetModules()
            
            const { createJPMCHandler } = require('../index')
            
            const mockApp = { use: jest.fn() }
            const mockRuntime = {
                createHandler: jest.fn((opts, cb) => {
                    cb(mockApp)
                    return { handler: jest.fn() }
                })
            }

            createJPMCHandler(mockRuntime, {}, { not: 'a function' })
            
            expect(mockRuntime.createHandler).toHaveBeenCalled()
        })

        it('should add middleware to app', () => {
            process.env.JPMC_PRIVATE_KEY_BASE64 = 'key'
            process.env.JPMC_CERTIFICATE_BASE64 = 'cert'
            jest.resetModules()
            
            const { createJPMCHandler } = require('../index')
            
            const mockApp = { use: jest.fn() }
            const mockRuntime = {
                createHandler: jest.fn((opts, cb) => {
                    cb(mockApp)
                    return { handler: jest.fn() }
                })
            }

            createJPMCHandler(mockRuntime, {}, null)
            
            expect(mockApp.use.mock.calls.length).toBeGreaterThan(0)
        })

        it('should pass jpmcOptions to configuration', () => {
            process.env.JPMC_PRIVATE_KEY_BASE64 = 'key'
            process.env.JPMC_CERTIFICATE_BASE64 = 'cert'
            jest.resetModules()
            
            const { createJPMCHandler } = require('../index')
            
            const mockApp = { use: jest.fn() }
            const mockRuntime = {
                createHandler: jest.fn((opts, cb) => {
                    cb(mockApp)
                    return { handler: jest.fn() }
                })
            }

            const customOptions = { apiBasePath: '/custom/api', debug: true }
            createJPMCHandler(mockRuntime, {}, null, customOptions)
            
            expect(mockRuntime.createHandler).toHaveBeenCalled()
        })
    })

    describe('validateConfig() - Configuration Validation', () => {
        it('should export validateConfig as a function', () => {
            const { validateConfig } = require('../index')
            expect(typeof validateConfig).toBe('function')
        })

        it('should return a Promise', async () => {
            const { validateConfig } = require('../index')
            const result = validateConfig()
            expect(result instanceof Promise).toBe(true)
            await result
        })

        it('should return object with valid and errors properties', async () => {
            const { validateConfig } = require('../index')
            const result = await validateConfig()
            
            expect(result).toHaveProperty('valid')
            expect(result).toHaveProperty('errors')
            expect(Array.isArray(result.errors)).toBe(true)
        })

        it('should return invalid status when private key missing', async () => {
            delete process.env.JPMC_PRIVATE_KEY_BASE64
            delete process.env.JPMC_PRIVATE_KEY_PATH
            process.env.JPMC_CERTIFICATE_BASE64 = 'cert'
            
            jest.resetModules()
            jest.doMock('../../services/sfcc', () => ({
                getJPMCPreferences: jest.fn().mockResolvedValue({}),
                buildJPMCConfigFromPreferences: jest.fn().mockReturnValue({}),
                mergeWithEnvironmentConfig: jest.fn((bm, env) => ({ ...bm, ...env }))
            }))

            const { validateConfig } = require('../index')
            const result = await validateConfig()
            
            expect(result.valid).toBe(false)
            expect(result.errors.some(e => e.includes('JPMC_PRIVATE_KEY'))).toBe(true)
        })

        it('should return invalid status when certificate missing', async () => {
            process.env.JPMC_PRIVATE_KEY_BASE64 = 'key'
            delete process.env.JPMC_CERTIFICATE_BASE64
            delete process.env.JPMC_CERTIFICATE_PATH
            
            jest.resetModules()
            jest.doMock('../../services/sfcc', () => ({
                getJPMCPreferences: jest.fn().mockResolvedValue({}),
                buildJPMCConfigFromPreferences: jest.fn().mockReturnValue({}),
                mergeWithEnvironmentConfig: jest.fn((bm, env) => ({ ...bm, ...env }))
            }))

            const { validateConfig } = require('../index')
            const result = await validateConfig()
            
            expect(result.valid).toBe(false)
            expect(result.errors.some(e => e.includes('JPMC_CERTIFICATE'))).toBe(true)
        })

        it('should include config in result', async () => {
            process.env.JPMC_PRIVATE_KEY_BASE64 = 'key'
            process.env.JPMC_CERTIFICATE_BASE64 = 'cert'
            
            jest.resetModules()
            jest.doMock('../../services/sfcc', () => ({
                getJPMCPreferences: jest.fn().mockResolvedValue({}),
                buildJPMCConfigFromPreferences: jest.fn().mockReturnValue({}),
                mergeWithEnvironmentConfig: jest.fn((bm, env) => ({ ...bm, ...env }))
            }))

            const { validateConfig } = require('../index')
            const result = await validateConfig()
            
            expect(result).toHaveProperty('config')
        })
    })

    describe('getJPMCConfigAsync() - Asynchronous Configuration', () => {
        it('should export getJPMCConfigAsync as a function', () => {
            const { getJPMCConfigAsync } = require('../index')
            expect(typeof getJPMCConfigAsync).toBe('function')
        })

        it('should return a Promise', () => {
            const { getJPMCConfigAsync } = require('../index')
            const result = getJPMCConfigAsync()
            expect(result instanceof Promise).toBe(true)
        })

        it('should return configuration object', async () => {
            const { getJPMCConfigAsync } = require('../index')
            const config = await getJPMCConfigAsync({ useSitePreferences: false })
            
            expect(config).toBeDefined()
            expect(typeof config).toBe('object')
        })

        it('should return env config when useSitePreferences=false', async () => {
            process.env.JPMC_PRIVATE_KEY_BASE64 = 'test-env-key'
            
            jest.resetModules()
            const { getJPMCConfigAsync } = require('../index')
            const config = await getJPMCConfigAsync({ useSitePreferences: false })
            
            expect(config.privateKeyBase64).toBe('test-env-key')
        })

        it('should handle locale parameter', async () => {
            jest.resetModules()
            jest.doMock('../../services/sfcc', () => ({
                getJPMCPreferences: jest.fn().mockResolvedValue({}),
                buildJPMCConfigFromPreferences: jest.fn().mockReturnValue({}),
                mergeWithEnvironmentConfig: jest.fn((bm, env) => ({ ...bm, ...env }))
            }))

            const { getJPMCConfigAsync } = require('../index')
            const config = await getJPMCConfigAsync({ locale: 'en_US', useSitePreferences: false })
            
            expect(config).toBeDefined()
        })

        it('should handle slasToken parameter', async () => {
            jest.resetModules()
            jest.doMock('../../services/sfcc', () => ({
                getJPMCPreferences: jest.fn().mockResolvedValue({}),
                buildJPMCConfigFromPreferences: jest.fn().mockReturnValue({}),
                mergeWithEnvironmentConfig: jest.fn((bm, env) => ({ ...bm, ...env }))
            }))

            const { getJPMCConfigAsync } = require('../index')
            const config = await getJPMCConfigAsync({ slasToken: 'test-token', useSitePreferences: false })
            
            expect(config).toBeDefined()
        })

        it('should handle forceRefresh parameter', async () => {
            jest.resetModules()
            jest.doMock('../../services/sfcc', () => ({
                getJPMCPreferences: jest.fn().mockResolvedValue({}),
                buildJPMCConfigFromPreferences: jest.fn().mockReturnValue({}),
                mergeWithEnvironmentConfig: jest.fn((bm, env) => ({ ...bm, ...env }))
            }))

            const { getJPMCConfigAsync } = require('../index')
            const config = await getJPMCConfigAsync({ forceRefresh: true, useSitePreferences: false })
            
            expect(config).toBeDefined()
        })
    })

    describe('Module Exports', () => {
        it('should export all required functions', () => {
            const module = require('../index')
            
            expect(typeof module.getJPMCConfig).toBe('function')
            expect(typeof module.getJPMCConfigAsync).toBe('function')
            expect(typeof module.createJPMCHandler).toBe('function')
            expect(typeof module.validateConfig).toBe('function')
        })
    })
})
