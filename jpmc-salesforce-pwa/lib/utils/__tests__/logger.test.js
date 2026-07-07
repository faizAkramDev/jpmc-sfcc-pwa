/**
 * Logger Tests
 * 
 * Tests for server-side logger with PII masking
 */

import logger, { maskSensitiveData, maskObject, safeStringify, SENSITIVE_FIELDS } from '../logger'

describe('logger', () => {
    let consoleInfoSpy
    let consoleWarnSpy
    let consoleErrorSpy
    let consoleDebugSpy
    let consoleLogSpy
    let originalEnv

    beforeEach(() => {
        // Save original env
        originalEnv = process.env.JPMC_DEBUG
        delete process.env.JPMC_DEBUG
        
        // Spy on console methods
        consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation()
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
        consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation()
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    })

    afterEach(() => {
        consoleInfoSpy.mockRestore()
        consoleWarnSpy.mockRestore()
        consoleErrorSpy.mockRestore()
        consoleDebugSpy.mockRestore()
        consoleLogSpy.mockRestore()
        process.env.JPMC_DEBUG = originalEnv
    })

    describe('logger.info', () => {
        it('logs info message', () => {
            logger.info('Test message')

            expect(consoleInfoSpy).toHaveBeenCalledWith('Test message')
        })

        it('masks sensitive data in info logs', () => {
            logger.info('Card number', { cardNumber: '1234567890123456' })

            expect(consoleInfoSpy).toHaveBeenCalled()
            const call = consoleInfoSpy.mock.calls[0]
            expect(JSON.stringify(call)).toContain('Card number')
            expect(JSON.stringify(call)).not.toContain('1234567890123456')
        })

        it('handles multiple arguments', () => {
            logger.info('Message', { key: 'value' }, 'another')

            expect(consoleInfoSpy).toHaveBeenCalledWith(
                'Message',
                expect.any(Object),
                'another'
            )
        })
    })

    describe('logger.warn', () => {
        it('logs warn message', () => {
            logger.warn('Warning message')

            expect(consoleWarnSpy).toHaveBeenCalledWith('Warning message')
        })

        it('masks sensitive data in warn logs', () => {
            logger.warn('User data', { email: 'user@example.com' })

            expect(consoleWarnSpy).toHaveBeenCalled()
            const call = consoleWarnSpy.mock.calls[0]
            expect(JSON.stringify(call)).toContain('User data')
        })
    })

    describe('logger.error', () => {
        it('logs error message', () => {
            logger.error('Error message')

            expect(consoleErrorSpy).toHaveBeenCalledWith('Error message')
        })

        it('masks sensitive data in error logs', () => {
            logger.error('Payment error', { cvv: '123' })

            expect(consoleErrorSpy).toHaveBeenCalled()
        })

        it('handles Error objects', () => {
            const error = new Error('Test error')
            logger.error('Caught error:', error)

            expect(consoleErrorSpy).toHaveBeenCalled()
        })
    })

    describe('logger.debug', () => {
        it('does not log debug when JPMC_DEBUG is not set', () => {
            logger.debug('Debug message')

            expect(consoleDebugSpy).not.toHaveBeenCalled()
        })

        it('logs debug when JPMC_DEBUG is true', () => {
            process.env.JPMC_DEBUG = 'true'

            logger.debug('Debug message')

            expect(consoleDebugSpy).toHaveBeenCalledWith('[DEBUG]', 'Debug message')
        })

        it('does not log debug when JPMC_DEBUG is false', () => {
            process.env.JPMC_DEBUG = 'false'

            logger.debug('Debug message')

            expect(consoleDebugSpy).not.toHaveBeenCalled()
        })

        it('masks sensitive data in debug logs when enabled', () => {
            process.env.JPMC_DEBUG = 'true'

            logger.debug('Debug info', { accessToken: 'secret123' })

            expect(consoleDebugSpy).toHaveBeenCalled()
            const call = consoleDebugSpy.mock.calls[0]
            const stringified = JSON.stringify(call)
            expect(stringified).not.toContain('secret123')
        })
    })

    describe('logger.log', () => {
        it('logs message', () => {
            logger.log('Log message')

            expect(consoleLogSpy).toHaveBeenCalledWith('Log message')
        })

        it('masks sensitive data in log', () => {
            logger.log('Data', { phoneNumber: '1234567890' })

            expect(consoleLogSpy).toHaveBeenCalled()
        })
    })

    describe('logger.isDebugEnabled', () => {
        it('returns false when JPMC_DEBUG is not set', () => {
            delete process.env.JPMC_DEBUG

            expect(logger.isDebugEnabled()).toBe(false)
        })

        it('returns true when JPMC_DEBUG is true', () => {
            process.env.JPMC_DEBUG = 'true'

            expect(logger.isDebugEnabled()).toBe(true)
        })

        it('returns false when JPMC_DEBUG is false', () => {
            process.env.JPMC_DEBUG = 'false'

            expect(logger.isDebugEnabled()).toBe(false)
        })

        it('returns false when JPMC_DEBUG is any other value', () => {
            process.env.JPMC_DEBUG = 'invalid'

            expect(logger.isDebugEnabled()).toBe(false)
        })
    })
})

describe('maskSensitiveData', () => {
    it('masks card numbers in JSON format', () => {
        const input = '{"cardNumber": "1234567890123456"}'
        const result = maskSensitiveData(input)

        expect(result).not.toContain('567890')
        expect(result).toContain('1234')
    })

    it('masks card numbers in compact JSON format', () => {
        const input = '{"cardNumber":"1234567890123456"}'
        const result = maskSensitiveData(input)

        expect(result).not.toBe(input)
        expect(result).toContain('****')
    })

    it('masks CVV codes in JSON format', () => {
        const input = '{"cvv": "123"}'
        const result = maskSensitiveData(input)

        expect(result).toContain('****')
    })

    it('masks email addresses in JSON format', () => {
        const input = '{"email": "user@example.com"}'
        const result = maskSensitiveData(input)

        expect(result).not.toContain('@example.com')
    })

    it('masks multiple phone number variations', () => {
        const input1 = '{"phoneNumber": "1234567890"}'
        const result1 = maskSensitiveData(input1)
        expect(result1).toContain('****')

        const input2 = '{"phone": "1234567890"}'
        const result2 = maskSensitiveData(input2)
        expect(result2).toContain('****')
    })

    it('masks form-encoded data', () => {
        const input = 'cardNumber=1234567890123456&email=user@example.com'
        const result = maskSensitiveData(input)

        expect(result).toContain('****')
        expect(result).not.toContain('user@example.com')
    })

    it('handles plain strings without sensitive data', () => {
        const input = 'This is a regular message'
        const result = maskSensitiveData(input)

        expect(result).toBe(input)
    })

    it('is case-insensitive for field names in JSON', () => {
        const input1 = '{"CardNumber": "1234567890123456"}'
        const input2 = '{"cardNumber": "1234567890123456"}'
        
        const result1 = maskSensitiveData(input1)
        const result2 = maskSensitiveData(input2)

        expect(result1).toContain('****')
        expect(result2).toContain('****')
    })

    it('masks numbers in JSON format', () => {
        const input = '{"cardNumber": 1234567890123456}'
        const result = maskSensitiveData(input)

        expect(result).toContain('**')
    })

    it('handles short sensitive values', () => {
        const input1 = '{"cvv": "12"}'
        const result1 = maskSensitiveData(input1)
        expect(result1).toContain('****')

        const input2 = 'cardNumber=12'
        const result2 = maskSensitiveData(input2)
        expect(result2).toContain('****')
    })
})

describe('maskObject', () => {
    it('masks all sensitive fields in an object', () => {
        const input = {
            cardNumber: '1234567890123456',
            firstName: 'John',
            email: 'john@example.com',
            publicField: 'can stay'
        }

        const result = maskObject(input)

        expect(result.publicField).toBe('can stay')
        expect(result.cardNumber).not.toContain('5678')
        expect(result.firstName).not.toBe('John')
        expect(result.email).not.toContain('@')
    })

    it('handles nested objects', () => {
        const input = {
            user: {
                cardNumber: '1234567890123456',
                name: 'John'
            }
        }

        const result = maskObject(input)

        expect(result.user.cardNumber).not.toContain('5678')
    })

    it('preserves non-sensitive fields', () => {
        const input = {
            orderId: '12345',
            amount: 99.99,
            currency: 'USD'
        }

        const result = maskObject(input)

        expect(result.orderId).toBe('12345')
        expect(result.amount).toBe(99.99)
        expect(result.currency).toBe('USD')
    })

    it('handles empty objects', () => {
        const result = maskObject({})

        expect(result).toEqual({})
    })

    it('handles null and undefined', () => {
        expect(maskObject(null)).toBe(null)
        expect(maskObject(undefined)).toBe(undefined)
    })

    it('handles primitive values', () => {
        expect(maskObject('string')).toBe('string')
        expect(maskObject(123)).toBe(123)
        expect(maskObject(true)).toBe(true)
    })

    it('masks numeric sensitive field values', () => {
        const input = {
            cardNumber: 1234567890123456
        }

        const result = maskObject(input)

        expect(typeof result.cardNumber).toBe('string')
        expect(result.cardNumber).toContain('**')
    })

    it('masks short numeric values', () => {
        const input = {
            cvv: 12
        }

        const result = maskObject(input)

        expect(result.cvv).toBe('**')
    })

    it('masks nested sensitive objects', () => {
        const input = {
            payment: {
                token: 'secret_token_value',
                metadata: {
                    cvv: '123'
                }
            }
        }

        const result = maskObject(input)

        expect(result.payment.token).toContain('sha256:')
        expect(result.payment.metadata.cvv).toContain('****')
    })

    it('handles arrays with objects containing sensitive data', () => {
        const input = {
            cards: [
                { cardNumber: '1234567890123456' },
                { cardNumber: '9876543210987654' }
            ]
        }

        const result = maskObject(input)

        expect(Array.isArray(result.cards)).toBe(true)
        expect(typeof result.cards[0].cardNumber).toBe('string')
        expect(typeof result.cards[1].cardNumber).toBe('string')
    })
})

describe('safeStringify', () => {
    it('stringifies objects with masking', () => {
        const input = { cardNumber: '1234567890123456', name: 'John' }

        const result = safeStringify(input)

        expect(typeof result).toBe('string')
        expect(result).not.toContain('1234567890123456')
        expect(JSON.parse(result)).toHaveProperty('cardNumber')
    })

    it('uses default indentation of 2', () => {
        const input = { a: 1, b: 2 }

        const result = safeStringify(input)

        expect(result).toContain('\n  ')
    })

    it('respects custom indentation', () => {
        const input = { a: 1, b: 2 }

        const result = safeStringify(input, 4)

        expect(result).toContain('\n    ')
    })

    it('returns error message for circular references', () => {
        const circular = { a: 1 }
        circular.self = circular

        const result = safeStringify(circular)

        expect(result).toBe('[Unable to stringify]')
    })

    it('handles null', () => {
        const result = safeStringify(null)

        expect(result).toBe('null')
    })

    it('handles arrays', () => {
        const input = [
            { email: 'user@example.com' },
            { cardNumber: '1234567890123456' }
        ]

        const result = safeStringify(input)

        expect(typeof result).toBe('string')
        expect(result).not.toContain('user@example.com')
    })

    it('masks nested sensitive data', () => {
        const input = {
            user: {
                profile: {
                    email: 'user@example.com',
                    phone: '1234567890'
                }
            }
        }

        const result = safeStringify(input)

        expect(result).not.toContain('user@example.com')
        expect(result).not.toContain('1234567890')
    })
})

describe('SENSITIVE_FIELDS', () => {
    it('is an array', () => {
        expect(Array.isArray(SENSITIVE_FIELDS)).toBe(true)
    })

    it('includes card-related fields', () => {
        expect(SENSITIVE_FIELDS).toContain('cardNumber')
        expect(SENSITIVE_FIELDS).toContain('cvv')
        expect(SENSITIVE_FIELDS).toContain('expirationMonth')
    })

    it('includes personal data fields', () => {
        expect(SENSITIVE_FIELDS).toContain('email')
        expect(SENSITIVE_FIELDS).toContain('phone')
        expect(SENSITIVE_FIELDS).toContain('firstName')
    })

    it('includes address fields', () => {
        expect(SENSITIVE_FIELDS).toContain('city')
        expect(SENSITIVE_FIELDS).toContain('postalCode')
        expect(SENSITIVE_FIELDS).toContain('countryCode')
    })

    it('includes token fields', () => {
        expect(SENSITIVE_FIELDS).toContain('accessToken')
        expect(SENSITIVE_FIELDS).toContain('refreshToken')
    })
})
