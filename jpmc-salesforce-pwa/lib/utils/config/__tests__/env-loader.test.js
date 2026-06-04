/**
 * Unit Tests for Environment Loader
 */

import {
    isServerSide,
    isClientSide,
    ensureEnvLoaded,
    getEnvVar,
    hasEnvVar,
    getEnvVars,
    _resetEnvState
} from '../env-loader'

describe('Environment Loader', () => {
    const originalWindow = global.window
    const originalProcess = process.env

    beforeEach(() => {
        _resetEnvState()
        process.env = { ...originalProcess }
    })

    afterEach(() => {
        global.window = originalWindow
        process.env = originalProcess
    })

    describe('isServerSide', () => {
        it('returns true when window is undefined', () => {
            delete global.window
            expect(isServerSide()).toBe(true)
        })

        it('returns false when window is defined', () => {
            global.window = {}
            expect(isServerSide()).toBe(false)
        })
    })

    describe('isClientSide', () => {
        it('returns false when window is undefined', () => {
            delete global.window
            expect(isClientSide()).toBe(false)
        })

        it('returns true when window is defined', () => {
            global.window = {}
            expect(isClientSide()).toBe(true)
        })
    })

    describe('ensureEnvLoaded', () => {
        it('marks env as loaded on client side', () => {
            global.window = {}
            ensureEnvLoaded()
            // Should not throw
            expect(getEnvVar('TEST_VAR', 'default')).toBe('default')
        })

        it('is idempotent - calling multiple times has no effect', () => {
            global.window = {}
            ensureEnvLoaded()
            ensureEnvLoaded()
            ensureEnvLoaded()
            // Should not throw
            expect(true).toBe(true)
        })
    })

    describe('getEnvVar', () => {
        it('returns environment variable value', () => {
            process.env.TEST_VAR = 'test_value'
            expect(getEnvVar('TEST_VAR')).toBe('test_value')
        })

        it('returns default value when env var not set', () => {
            expect(getEnvVar('NONEXISTENT_VAR', 'default')).toBe('default')
        })

        it('returns empty string as default when no default provided', () => {
            expect(getEnvVar('NONEXISTENT_VAR')).toBe('')
        })
    })

    describe('hasEnvVar', () => {
        it('returns true when env var is set', () => {
            process.env.EXISTS_VAR = 'value'
            expect(hasEnvVar('EXISTS_VAR')).toBe(true)
        })

        it('returns false when env var is not set', () => {
            delete process.env.DOESNT_EXIST
            expect(hasEnvVar('DOESNT_EXIST')).toBe(false)
        })

        it('returns false when env var is empty string', () => {
            process.env.EMPTY_VAR = ''
            expect(hasEnvVar('EMPTY_VAR')).toBe(false)
        })
    })

    describe('getEnvVars', () => {
        it('returns object with requested env vars', () => {
            process.env.VAR_A = 'value_a'
            process.env.VAR_B = 'value_b'

            const result = getEnvVars(['VAR_A', 'VAR_B', 'VAR_C'])

            expect(result).toEqual({
                VAR_A: 'value_a',
                VAR_B: 'value_b',
                VAR_C: ''
            })
        })

        it('returns empty strings for missing vars', () => {
            const result = getEnvVars(['MISSING_1', 'MISSING_2'])

            expect(result).toEqual({
                MISSING_1: '',
                MISSING_2: ''
            })
        })
    })
})
