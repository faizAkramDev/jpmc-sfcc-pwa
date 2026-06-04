/**
 * Unit Tests for Constants Module
 *
 * @jest-environment node
 */

const constants = require('../constants/index.js')

describe('Constants Module', () => {

    // =========================================================================
    // JPMC_HOSTS Tests
    // =========================================================================

    describe('JPMC_HOSTS', () => {
        it('should have mock environment host', () => {
            expect(constants.JPMC_HOSTS.mock).toBeDefined()
        })

        it('should have sandbox environment host', () => {
            expect(constants.JPMC_HOSTS.sandbox).toBeDefined()
        })

        it('should have production environment host', () => {
            expect(constants.JPMC_HOSTS.production).toBeDefined()
        })
    })

    // =========================================================================
    // getPIEUrls Tests
    // =========================================================================

    describe('getPIEUrls', () => {
        it('should return sandbox URLs for sandbox environment', () => {
            const urls = constants.getPIEUrls('sandbox', '123456')

            expect(urls.encryption).toContain('safetechpageencryptionvar')
            expect(urls.getKey).toContain('123456')
        })

        it('should return production URLs for production environment', () => {
            const urls = constants.getPIEUrls('production', '123456')

            expect(urls.encryption).toContain('safetechpageencryption.chasepaymentech.com')
            expect(urls.getKey).toContain('123456')
        })

        it('should default to sandbox for unknown environment', () => {
            const urls = constants.getPIEUrls('unknown', '123456')

            expect(urls.encryption).toContain('safetechpageencryptionvar')
        })

        it('should replace merchantId in getKey URL', () => {
            const urls = constants.getPIEUrls('sandbox', 'MERCHANT123')

            expect(urls.getKey).toContain('MERCHANT123')
            expect(urls.getKey).not.toContain('{merchantId}')
        })
    })

    // =========================================================================
    // PAYMENT_STATES Tests
    // =========================================================================

    describe('PAYMENT_STATES', () => {
        it('should have AUTHORIZED state', () => {
            expect(constants.PAYMENT_STATES.AUTHORIZED).toBe('AUTHORIZED')
        })

        it('should have DECLINED state', () => {
            expect(constants.PAYMENT_STATES.DECLINED).toBe('DECLINED')
        })

        it('should have CLOSED state', () => {
            expect(constants.PAYMENT_STATES.CLOSED).toBe('CLOSED')
        })

        it('should have ERROR state', () => {
            expect(constants.PAYMENT_STATES.ERROR).toBe('ERROR')
        })
    })

    // =========================================================================
    // RESPONSE_STATUS Tests
    // =========================================================================

    describe('RESPONSE_STATUS', () => {
        it('should have SUCCESS status', () => {
            expect(constants.RESPONSE_STATUS.SUCCESS).toBe('SUCCESS')
        })

        it('should have DENIED status', () => {
            expect(constants.RESPONSE_STATUS.DENIED).toBe('DENIED')
        })

        it('should have ERROR status', () => {
            expect(constants.RESPONSE_STATUS.ERROR).toBe('ERROR')
        })
    })

    // =========================================================================
    // CAPTURE_METHODS Tests
    // =========================================================================

    describe('CAPTURE_METHODS', () => {
        it('should have NOW method', () => {
            expect(constants.CAPTURE_METHODS.NOW).toBe('NOW')
        })

        it('should have MANUAL method', () => {
            expect(constants.CAPTURE_METHODS.MANUAL).toBe('MANUAL')
        })

        it('should have DELAYED method', () => {
            expect(constants.CAPTURE_METHODS.DELAYED).toBe('DELAYED')
        })
    })

    // =========================================================================
    // ERROR_CODES Tests (MVP - only encryption-related codes)
    // =========================================================================

    describe('ERROR_CODES', () => {
        it('should have ENCRYPTION_FAILED code', () => {
            expect(constants.ERROR_CODES.ENCRYPTION_FAILED).toBe('ENCRYPTION_FAILED')
        })

        it('should have SDK_NOT_LOADED code', () => {
            expect(constants.ERROR_CODES.SDK_NOT_LOADED).toBe('SDK_NOT_LOADED')
        })
    })

    // =========================================================================
    // CARD_PATTERNS Tests
    // =========================================================================

    describe('CARD_PATTERNS', () => {
        it('should have visa pattern', () => {
            expect(constants.CARD_PATTERNS.visa).toBeInstanceOf(RegExp)
            expect('4111111111111111').toMatch(constants.CARD_PATTERNS.visa)
        })

        it('should have mastercard pattern', () => {
            expect(constants.CARD_PATTERNS.mc).toBeInstanceOf(RegExp)
            expect('5500000000000004').toMatch(constants.CARD_PATTERNS.mc)
        })

        it('should have amex pattern', () => {
            expect(constants.CARD_PATTERNS.amex).toBeInstanceOf(RegExp)
            expect('340000000000009').toMatch(constants.CARD_PATTERNS.amex)
        })

        it('should have discover pattern', () => {
            expect(constants.CARD_PATTERNS.discover).toBeInstanceOf(RegExp)
            expect('6011000000000004').toMatch(constants.CARD_PATTERNS.discover)
        })
    })

    // =========================================================================
    // CVV_LENGTHS Tests
    // =========================================================================

    describe('CVV_LENGTHS', () => {
        it('should have 3-digit CVV for visa', () => {
            expect(constants.CVV_LENGTHS.visa).toBe(3)
        })

        it('should have 3-digit CVV for mastercard', () => {
            expect(constants.CVV_LENGTHS.mc).toBe(3)
        })

        it('should have 4-digit CVV for amex', () => {
            expect(constants.CVV_LENGTHS.amex).toBe(4)
        })
    })

    // =========================================================================
    // ERROR_MESSAGES Tests (MVP - only encryption-related messages)
    // =========================================================================

    describe('ERROR_MESSAGES', () => {
        it('should have message for ENCRYPTION_FAILED', () => {
            expect(constants.ERROR_MESSAGES[constants.ERROR_CODES.ENCRYPTION_FAILED]).toBeDefined()
        })

        it('should have message for SDK_NOT_LOADED', () => {
            expect(constants.ERROR_MESSAGES[constants.ERROR_CODES.SDK_NOT_LOADED]).toBeDefined()
        })
    })

    // =========================================================================
    // GOOGLE PAY Constants Tests
    // =========================================================================

    describe('GOOGLE_PAY_API_VERSION', () => {
        it('should have apiVersion 2', () => {
            expect(constants.GOOGLE_PAY_API_VERSION.apiVersion).toBe(2)
        })

        it('should have apiVersionMinor 0', () => {
            expect(constants.GOOGLE_PAY_API_VERSION.apiVersionMinor).toBe(0)
        })
    })

    describe('GOOGLE_PAY_SCRIPT_URL', () => {
        it('should be the official Google Pay script URL', () => {
            expect(constants.GOOGLE_PAY_SCRIPT_URL).toBe('https://pay.google.com/gp/p/js/pay.js')
        })
    })

    describe('GOOGLE_PAY_ENVIRONMENTS', () => {
        it('should have TEST environment', () => {
            expect(constants.GOOGLE_PAY_ENVIRONMENTS.TEST).toBe('TEST')
        })

        it('should have PRODUCTION environment', () => {
            expect(constants.GOOGLE_PAY_ENVIRONMENTS.PRODUCTION).toBe('PRODUCTION')
        })
    })

    describe('GOOGLE_PAY_ALLOWED_NETWORKS', () => {
        it('should include all major card networks', () => {
            expect(constants.GOOGLE_PAY_ALLOWED_NETWORKS).toContain('VISA')
            expect(constants.GOOGLE_PAY_ALLOWED_NETWORKS).toContain('MASTERCARD')
            expect(constants.GOOGLE_PAY_ALLOWED_NETWORKS).toContain('AMEX')
            expect(constants.GOOGLE_PAY_ALLOWED_NETWORKS).toContain('DISCOVER')
            expect(constants.GOOGLE_PAY_ALLOWED_NETWORKS).toContain('JCB')
        })
    })

    describe('GOOGLE_PAY_AUTH_METHODS', () => {
        it('should include PAN_ONLY', () => {
            expect(constants.GOOGLE_PAY_AUTH_METHODS).toContain('PAN_ONLY')
        })

        it('should include CRYPTOGRAM_3DS', () => {
            expect(constants.GOOGLE_PAY_AUTH_METHODS).toContain('CRYPTOGRAM_3DS')
        })
    })

    describe('GOOGLE_PAY_GATEWAY', () => {
        it('should use chase as gateway', () => {
            expect(constants.GOOGLE_PAY_GATEWAY.gateway).toBe('chase')
        })

        it('should have gatewayMerchantId key', () => {
            expect(constants.GOOGLE_PAY_GATEWAY.gatewayMerchantIdKey).toBe('gatewayMerchantId')
        })
    })

    describe('GOOGLE_PAY_BUTTON_CONFIG', () => {
        it('should have button types', () => {
            expect(constants.GOOGLE_PAY_BUTTON_CONFIG.BUTTON_TYPES.BUY).toBe('buy')
            expect(constants.GOOGLE_PAY_BUTTON_CONFIG.BUTTON_TYPES.CHECKOUT).toBe('checkout')
            expect(constants.GOOGLE_PAY_BUTTON_CONFIG.BUTTON_TYPES.PAY).toBe('pay')
        })

        it('should have button colors', () => {
            expect(constants.GOOGLE_PAY_BUTTON_CONFIG.BUTTON_COLORS.BLACK).toBe('black')
            expect(constants.GOOGLE_PAY_BUTTON_CONFIG.BUTTON_COLORS.WHITE).toBe('white')
        })

        it('should have default button configuration', () => {
            expect(constants.GOOGLE_PAY_BUTTON_CONFIG.DEFAULT.buttonType).toBe('buy')
            expect(constants.GOOGLE_PAY_BUTTON_CONFIG.DEFAULT.buttonColor).toBe('black')
        })
    })

    describe('GOOGLE_PAY_PRICE_STATUS', () => {
        it('should have FINAL status', () => {
            expect(constants.GOOGLE_PAY_PRICE_STATUS.FINAL).toBe('FINAL')
        })

        it('should have ESTIMATED status', () => {
            expect(constants.GOOGLE_PAY_PRICE_STATUS.ESTIMATED).toBe('ESTIMATED')
        })
    })

    describe('GOOGLE_PAY_ERROR_CODES', () => {
        it('should have script load error codes', () => {
            expect(constants.GOOGLE_PAY_ERROR_CODES.SCRIPT_LOAD_FAILED).toBe('GPAY_SCRIPT_LOAD_FAILED')
            expect(constants.GOOGLE_PAY_ERROR_CODES.SCRIPT_LOAD_TIMEOUT).toBe('GPAY_SCRIPT_LOAD_TIMEOUT')
        })

        it('should have payment error codes', () => {
            expect(constants.GOOGLE_PAY_ERROR_CODES.PAYMENT_CANCELLED).toBe('GPAY_PAYMENT_CANCELLED')
            expect(constants.GOOGLE_PAY_ERROR_CODES.PAYMENT_FAILED).toBe('GPAY_PAYMENT_FAILED')
        })

        it('should have token error codes', () => {
            expect(constants.GOOGLE_PAY_ERROR_CODES.TOKEN_PARSE_ERROR).toBe('GPAY_TOKEN_PARSE_ERROR')
            expect(constants.GOOGLE_PAY_ERROR_CODES.TOKEN_MISSING).toBe('GPAY_TOKEN_MISSING')
        })
    })

    describe('GOOGLE_PAY_ERROR_MESSAGES', () => {
        it('should have message for SCRIPT_LOAD_FAILED', () => {
            const message = constants.GOOGLE_PAY_ERROR_MESSAGES[constants.GOOGLE_PAY_ERROR_CODES.SCRIPT_LOAD_FAILED]
            expect(message).toBeDefined()
            expect(typeof message).toBe('string')
        })

        it('should have message for PAYMENT_CANCELLED', () => {
            const message = constants.GOOGLE_PAY_ERROR_MESSAGES[constants.GOOGLE_PAY_ERROR_CODES.PAYMENT_CANCELLED]
            expect(message).toBeDefined()
            expect(typeof message).toBe('string')
        })
    })

    describe('GOOGLE_PAY_DEFAULTS', () => {
        it('should have TEST as default environment', () => {
            expect(constants.GOOGLE_PAY_DEFAULTS.environment).toBe('TEST')
        })

        it('should require billing address by default', () => {
            expect(constants.GOOGLE_PAY_DEFAULTS.billingAddressRequired).toBe(true)
        })

        it('should have script load timeout', () => {
            expect(constants.GOOGLE_PAY_DEFAULTS.scriptLoadTimeout).toBe(10000)
        })
    })

    describe('getGooglePayEnvironment', () => {
        it('should return PRODUCTION for production environment', () => {
            expect(constants.getGooglePayEnvironment('production')).toBe('PRODUCTION')
        })

        it('should return TEST for sandbox environment', () => {
            expect(constants.getGooglePayEnvironment('sandbox')).toBe('TEST')
        })

        it('should return TEST for any non-production environment', () => {
            expect(constants.getGooglePayEnvironment('test')).toBe('TEST')
            expect(constants.getGooglePayEnvironment('development')).toBe('TEST')
            expect(constants.getGooglePayEnvironment(undefined)).toBe('TEST')
        })
    })

    describe('getGooglePayErrorMessage', () => {
        it('should return correct message for known error code', () => {
            const message = constants.getGooglePayErrorMessage(constants.GOOGLE_PAY_ERROR_CODES.SCRIPT_LOAD_FAILED)
            expect(message).toBe('Failed to load Google Pay. Please refresh the page and try again.')
        })

        it('should return default message for unknown error code', () => {
            const message = constants.getGooglePayErrorMessage('UNKNOWN_ERROR')
            expect(message).toBe('An unexpected error occurred with Google Pay.')
        })
    })

    describe('PAYMENT_METHODS', () => {
        it('should include GOOGLE_PAY', () => {
            expect(constants.PAYMENT_METHODS.GOOGLE_PAY).toBe('googlepay')
        })
    })

    // =========================================================================
    // Google Pay Cart/PDP Constants Tests
    // =========================================================================

    describe('GOOGLE_PAY_CALLBACK_TRIGGERS', () => {
        it('should have INITIALIZE trigger', () => {
            expect(constants.GOOGLE_PAY_CALLBACK_TRIGGERS.INITIALIZE).toBe('INITIALIZE')
        })

        it('should have SHIPPING_ADDRESS trigger', () => {
            expect(constants.GOOGLE_PAY_CALLBACK_TRIGGERS.SHIPPING_ADDRESS).toBe('SHIPPING_ADDRESS')
        })

        it('should have SHIPPING_OPTION trigger', () => {
            expect(constants.GOOGLE_PAY_CALLBACK_TRIGGERS.SHIPPING_OPTION).toBe('SHIPPING_OPTION')
        })

        it('should have OFFER trigger', () => {
            expect(constants.GOOGLE_PAY_CALLBACK_TRIGGERS.OFFER).toBe('OFFER')
        })
    })

    describe('GOOGLE_PAY_CONTEXT', () => {
        it('should have CHECKOUT context', () => {
            expect(constants.GOOGLE_PAY_CONTEXT.CHECKOUT).toBe('checkout')
        })

        it('should have CART context', () => {
            expect(constants.GOOGLE_PAY_CONTEXT.CART).toBe('cart')
        })

        it('should have PDP context', () => {
            expect(constants.GOOGLE_PAY_CONTEXT.PDP).toBe('pdp')
        })
    })

    describe('GOOGLE_PAY_CART_INTENTS', () => {
        it('should include SHIPPING_ADDRESS intent', () => {
            expect(constants.GOOGLE_PAY_CART_INTENTS).toContain('SHIPPING_ADDRESS')
        })

        it('should include SHIPPING_OPTION intent', () => {
            expect(constants.GOOGLE_PAY_CART_INTENTS).toContain('SHIPPING_OPTION')
        })

        it('should include PAYMENT_AUTHORIZATION intent', () => {
            expect(constants.GOOGLE_PAY_CART_INTENTS).toContain('PAYMENT_AUTHORIZATION')
        })

        it('should have exactly 3 intents', () => {
            expect(constants.GOOGLE_PAY_CART_INTENTS).toHaveLength(3)
        })
    })

    describe('GOOGLE_PAY_PDP_INTENTS', () => {
        it('should include SHIPPING_ADDRESS intent', () => {
            expect(constants.GOOGLE_PAY_PDP_INTENTS).toContain('SHIPPING_ADDRESS')
        })

        it('should include SHIPPING_OPTION intent', () => {
            expect(constants.GOOGLE_PAY_PDP_INTENTS).toContain('SHIPPING_OPTION')
        })

        it('should include PAYMENT_AUTHORIZATION intent', () => {
            expect(constants.GOOGLE_PAY_PDP_INTENTS).toContain('PAYMENT_AUTHORIZATION')
        })

        it('should match CART intents', () => {
            expect(constants.GOOGLE_PAY_PDP_INTENTS).toEqual(constants.GOOGLE_PAY_CART_INTENTS)
        })
    })

    describe('GOOGLE_PAY_CHECKOUT_INTENTS', () => {
        it('should be an empty array (checkout uses simple token collection without callbacks)', () => {
            expect(constants.GOOGLE_PAY_CHECKOUT_INTENTS).toEqual([])
        })

        it('should NOT include SHIPPING_ADDRESS intent', () => {
            expect(constants.GOOGLE_PAY_CHECKOUT_INTENTS).not.toContain('SHIPPING_ADDRESS')
        })

        it('should NOT include SHIPPING_OPTION intent', () => {
            expect(constants.GOOGLE_PAY_CHECKOUT_INTENTS).not.toContain('SHIPPING_OPTION')
        })

        it('should NOT include PAYMENT_AUTHORIZATION intent (checkout flow handles authorization separately)', () => {
            expect(constants.GOOGLE_PAY_CHECKOUT_INTENTS).not.toContain('PAYMENT_AUTHORIZATION')
        })
    })

    describe('getGooglePayIntentsForContext', () => {
        it('should return CART_INTENTS for cart context', () => {
            const intents = constants.getGooglePayIntentsForContext('cart')
            expect(intents).toEqual(constants.GOOGLE_PAY_CART_INTENTS)
        })

        it('should return PDP_INTENTS for pdp context', () => {
            const intents = constants.getGooglePayIntentsForContext('pdp')
            expect(intents).toEqual(constants.GOOGLE_PAY_PDP_INTENTS)
        })

        it('should return CHECKOUT_INTENTS for checkout context', () => {
            const intents = constants.getGooglePayIntentsForContext('checkout')
            expect(intents).toEqual(constants.GOOGLE_PAY_CHECKOUT_INTENTS)
        })

        it('should throw error for invalid context', () => {
            expect(() => constants.getGooglePayIntentsForContext('invalid')).toThrow(
                /Invalid Google Pay context/
            )
        })

        it('should return a copy, not the original array', () => {
            const intents = constants.getGooglePayIntentsForContext('cart')
            intents.push('TEST')
            expect(constants.GOOGLE_PAY_CART_INTENTS).not.toContain('TEST')
        })
    })

    describe('GOOGLE_PAY_SHIPPING_ERROR_REASONS', () => {
        it('should have SHIPPING_ADDRESS_INVALID reason', () => {
            expect(constants.GOOGLE_PAY_SHIPPING_ERROR_REASONS.SHIPPING_ADDRESS_INVALID).toBe('SHIPPING_ADDRESS_INVALID')
        })

        it('should have SHIPPING_ADDRESS_UNSERVICEABLE reason', () => {
            expect(constants.GOOGLE_PAY_SHIPPING_ERROR_REASONS.SHIPPING_ADDRESS_UNSERVICEABLE).toBe('SHIPPING_ADDRESS_UNSERVICEABLE')
        })

        it('should have SHIPPING_OPTION_INVALID reason', () => {
            expect(constants.GOOGLE_PAY_SHIPPING_ERROR_REASONS.SHIPPING_OPTION_INVALID).toBe('SHIPPING_OPTION_INVALID')
        })

        it('should have OTHER_ERROR reason', () => {
            expect(constants.GOOGLE_PAY_SHIPPING_ERROR_REASONS.OTHER_ERROR).toBe('OTHER_ERROR')
        })
    })

    describe('GOOGLE_PAY_DISPLAY_ITEM_TYPES', () => {
        it('should have SUBTOTAL type', () => {
            expect(constants.GOOGLE_PAY_DISPLAY_ITEM_TYPES.SUBTOTAL).toBe('SUBTOTAL')
        })

        it('should have TAX type', () => {
            expect(constants.GOOGLE_PAY_DISPLAY_ITEM_TYPES.TAX).toBe('TAX')
        })

        it('should have LINE_ITEM type', () => {
            expect(constants.GOOGLE_PAY_DISPLAY_ITEM_TYPES.LINE_ITEM).toBe('LINE_ITEM')
        })
    })

    describe('GOOGLE_PAY_DISPLAY_ITEM_STATUS', () => {
        it('should have FINAL status', () => {
            expect(constants.GOOGLE_PAY_DISPLAY_ITEM_STATUS.FINAL).toBe('FINAL')
        })

        it('should have PENDING status', () => {
            expect(constants.GOOGLE_PAY_DISPLAY_ITEM_STATUS.PENDING).toBe('PENDING')
        })
    })
})
