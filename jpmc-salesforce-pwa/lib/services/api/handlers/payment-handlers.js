/**
 * Payment Handlers
 * 
 * Handles all payment-related API endpoints:
 * - handleAuthorize: POST /api/jpmorgan/authorize
 * - handleVerify: POST /api/jpmorgan/verify
 */
import { getJPMCConfigAsync } from '../../../ssr'
import { 
    createPayment, 
    callFraudCheck,
    generateRequestId
} from '../payment-api'
import { normalizePaymentResponse } from '../response-normalizer'
import { 
    RESPONSE_STATUS,
    CARD_ENCRYPTION_TYPES, 
    INITIATOR_TYPE,
    ACCOUNT_ON_FILE
} from '../../../utils/constants.mjs'
import { GENERIC_API_ERROR_MESSAGE } from '../../../utils/constants/error-constants'
import { convertCountryCode } from '../../../utils/formatters/country-codes'
import logger, { safeStringify } from '../../../utils/logger'
import { buildFraudCheckPayload } from '../helpers/fraud-helpers'
import { buildMerchantSoftware, formatPhoneForJPMC, getClientIp } from '../helpers/request-helpers'
import { handlePaymentError } from '../helpers/error-helpers'
import { 
    validatePaymentRequest 
} from '../../../utils/validation/input-validation'
import { validateAddressZipcodes } from '../../../utils/validation/zipcode-validation'
import { extractLocale, extractSlasToken } from '../../../utils/locale-extractor'
import { encryptToken, decryptToken } from '../helpers/token-encryption'
// Server-side order patching imports
import { OrderApiClient } from '../../../ssr/api/order-api'
import { mapJPMCResponseToAttributes, mapPaymentTransactionAttributes, mapFraudResponseToOrderAttributes, mapAuthResponseToOrderAttributes } from '../../../ssr/api/attribute-mapping'

// =========================================================================
// Helper Functions (extracted to reduce cognitive complexity)
// =========================================================================

/**
 * Check if fraud review requires manual capture
 * @private
 */
const shouldForceManualCapture = (fraudRuleAction) => {
    return fraudRuleAction === 'E' || fraudRuleAction === 'R'
}

/**
 * Determine HTTP status code for payment response
 * @private
 */
const getPaymentResponseStatusCode = (normalizedResponse, paymentResponse) => {
    if (normalizedResponse.success) return 200
    if (paymentResponse.responseStatus === RESPONSE_STATUS.DENIED) return 402
    return 500
}

/**
 * Build Google Pay payment data
 * @private
 */
const buildGooglePayData = ({ amount, currency, captureMethod, merchantOrderNumber, googlePayToken, billingAddress, accountHolder, clientIp }) => ({
    amount,
    currency,
    captureMethod,
    merchantOrderNumber,
    googlePayToken,
    billingAddress,
    accountHolder,
    clientIp,
    isGooglePay: true
})

/**
 * Build SAFETECH token payment data
 * @private
 */
const buildTokenPaymentData = ({ amount, currency, captureMethod, merchantOrderNumber, token, cardExpiry, billingAddress, accountHolder, clientIp, browserInfo, cardTypeName, cardType }) => ({
    amount,
    currency,
    captureMethod,
    merchantOrderNumber,
    paymentToken: token,
    cardExpiry,
    billingAddress,
    accountHolder,
    clientIp,
    browserInfo,
    cardTypeName,
    cardType
})

/**
 * Build encrypted card payment data
 * @private
 */
const buildCardPaymentData = ({ amount, currency, captureMethod, merchantOrderNumber, card, billingAddress, accountHolder, clientIp, browserInfo, cardTypeName, cardType }) => ({
    amount,
    currency,
    captureMethod,
    merchantOrderNumber,
    card: {
        accountNumberType: 'SAFETECH_PAGE_ENCRYPTION',
        accountNumber: card.encryptedCardNumber,
        cvv: card.encryptedCVV,
        encryptionIntegrityCheck: card.integrityCheck,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear
    },
    billingAddress,
    accountHolder,
    clientIp,
    browserInfo,
    cardTypeName,
    cardType
})

/**
 * Run fraud check and determine if capture should be manual
 * @private
 */
const runAuthorizationFraudCheck = async ({ config, token, card, cardExpiry, accountHolder, billingAddress, currency, amount, fraudShoppingCart, shipTo, kountSessionId, req, priorFraudRuleAction }) => {
    const hasEncryptedCard = card?.encryptedCardNumber && (card.integrityCheck || /[a-zA-Z]/.test(card.encryptedCardNumber))
    
    let authFraudPayload
    
    if (hasEncryptedCard) {
        // Card-based fraud check (PIE encrypted)
        authFraudPayload = buildFraudCheckPayload({
            config,
            card: {
                encryptedCardNumber: card.encryptedCardNumber,
                encryptedCVV: card.encryptedCVV,
                integrityCheck: card.integrityCheck,
                expiryMonth: card.expiryMonth,
                expiryYear: card.expiryYear
            },
            accountNumberType: CARD_ENCRYPTION_TYPES.SAFETECH_PAGE_ENCRYPTION,
            accountHolder,
            billingAddress,
            currency,
            amount,
            fraudShoppingCart,
            shipTo,
            kountSessionId,
            userAgent: req.headers['user-agent'],
            deviceIPAddress: getClientIp(req)
        })
    } else if (token) {
        // Token-based fraud check
        authFraudPayload = buildFraudCheckPayload({
            config,
            card: {
                accountNumber: token,
                expiryMonth: cardExpiry?.month,
                expiryYear: cardExpiry?.year
            },
            accountNumberType: CARD_ENCRYPTION_TYPES.SAFETECH_TOKEN,
            accountHolder,
            billingAddress,
            currency,
            amount,
            fraudShoppingCart,
            shipTo,
            kountSessionId,
            userAgent: req.headers['user-agent'],
            deviceIPAddress: getClientIp(req)
        })
    } else {
        logger.warn('[JPMC Authorize] No card or token provided for fraud check')
        return {
            declined: false,
            forceManualCapture: shouldForceManualCapture(priorFraudRuleAction),
            fraudResponse: null
        }
    }
    
    const authFraudResult = await callFraudCheck({ config, fraudPayload: authFraudPayload })
    
    if (!authFraudResult) {
        logger.warn('[JPMC Authorize] Auth fraud check returned null - failing open with manual capture')
        // Create simple indicator for c_jpmcFraudResponse to track unavailability
        const failOpenIndicator = {
            status: 'FRAUD_CHECK_UNAVAILABLE',
            message: 'Fraud check service unavailable - transaction allowed with manual capture required',
            timestamp: new Date().toISOString()
        }
        return {
            declined: false,
            forceManualCapture: true, // Force manual capture when fraud check unavailable
            fraudResponse: failOpenIndicator
        }
    }

    const authFraudRuleAction = authFraudResult.riskDecision?.fraudRuleAction || null
    
    if (authFraudRuleAction === 'D') {
        logger.warn('[JPMC Authorize] Transaction declined by auth fraud check')
        return { declined: true, forceManualCapture: false, fraudResponse: authFraudResult }
    }
    
    const forceManualCapture = shouldForceManualCapture(priorFraudRuleAction) || shouldForceManualCapture(authFraudRuleAction)
    return { declined: false, forceManualCapture, fraudResponse: authFraudResult }
}

/**
 * Build verification payload for JPMC API
 * @private
 */
const buildVerificationPayload = ({ card, accountHolder, billingAddress, currency, config }) => {
    const buildBillingAddress = () => {
        if (config.enableAVS !== true || !billingAddress) return undefined
        const countryCode = convertCountryCode(billingAddress.countryCode || billingAddress.country)
        return {
            line1: billingAddress.line1 || billingAddress.address1,
            line2: billingAddress.line2 || billingAddress.address2,
            city: billingAddress.city,
            state: billingAddress.state || billingAddress.stateCode,
            postalCode: billingAddress.postalCode,
            countryCode
        }
    }

    return {
        merchant: {
            merchantSoftware: buildMerchantSoftware()
        },
        currency,
        paymentMethodType: {
            card: {
                accountNumberType: CARD_ENCRYPTION_TYPES.SAFETECH_PAGE_ENCRYPTION,
                accountNumber: card.encryptedCardNumber,
                expiry: {
                    month: card.expiryMonth,
                    year: card.expiryYear
                },
                cvv: card.encryptedCVV,
                encryptionIntegrityCheck: card.integrityCheck
            }
        },
        initiatorType: INITIATOR_TYPE,
        accountOnFile: ACCOUNT_ON_FILE.TO_BE_STORED,
        accountHolder: {
            fullName: accountHolder?.fullName || accountHolder?.name,
            email: accountHolder?.email,
            billingAddress: buildBillingAddress(),
            phone: formatPhoneForJPMC(accountHolder?.phone, billingAddress?.countryCode || billingAddress?.country)
        }
    }
}

/**
 * Extract token from JPMC verification response
 * @private
 */
const extractVerificationToken = (verifyResult) => {
    const paymentTokens = verifyResult.paymentMethodType?.card?.paymentTokens || []
    
    const safetechToken = paymentTokens.find(t => t.tokenProvider === 'SAFETECH' && t.responseStatus === 'SUCCESS')
    const networkToken = paymentTokens.find(t => t.tokenProvider === 'NETWORK' && t.responseStatus === 'SUCCESS')
    
    return safetechToken?.tokenNumber || networkToken?.tokenNumber || null
}

/**
 * Run fraud check for verification flow
 * @private
 */
const runVerifyFraudCheck = async ({ config, card, accountHolder, billingAddress, currency, amount, fraudShoppingCart, shipTo, kountSessionId, req }) => {
    const fraudCard = {
        encryptedCardNumber: card.encryptedCardNumber,
        encryptedCVV: card.encryptedCVV,
        integrityCheck: card.integrityCheck,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear
    }

    const fraudPayload = buildFraudCheckPayload({
        config,
        card: fraudCard,
        accountNumberType: CARD_ENCRYPTION_TYPES.SAFETECH_PAGE_ENCRYPTION,
        accountHolder,
        billingAddress,
        currency,
        amount: amount || 0,
        fraudShoppingCart,
        shipTo,
        kountSessionId,
        userAgent: req.headers['user-agent'],
        deviceIPAddress: getClientIp(req)
    })
    
    const fraudResult = await callFraudCheck({ config, fraudPayload })
    
    if (!fraudResult) {
        logger.warn('[JPMC Verify] Fraud check returned null - failing open')
        return { declined: false, fraudRuleAction: null, fraudResponse: null }
    }
    
    const fraudRuleAction = fraudResult.riskDecision?.fraudRuleAction || null
    
    if (fraudRuleAction === 'D') {
        return { declined: true, fraudRuleAction, fraudResponse: fraudResult }
    }
    
    return { declined: false, fraudRuleAction, fraudResponse: fraudResult }
}

/**
 * Get server-side JPMC configuration (asynchronous)
 * 
 * Fetches from Custom Object (if locale provided) or BM site preferences.
 * Merges with env config for sensitive data.
 * 
 * @param {Object} req - Express request
 * @returns {Promise<Object>} JPMC configuration
 */
const getServerConfigAsync = async (req) => {
    const locale = extractLocale(req)
    const slasToken = extractSlasToken(req)
    
    return getJPMCConfigAsync({ locale, slasToken })
}

// =============================================================================
// Authorization Helpers
// =============================================================================

/**
 * Build payment data based on payment method type
 */
const buildPaymentDataForMethod = ({ paymentMethod, googlePayToken, token, card, amount, currency, captureMethod, merchantOrderNumber, cardExpiry, billingAddress, accountHolder, clientIp, browserInfo, cardTypeName, cardType }) => {
    if (paymentMethod === 'googlepay' || googlePayToken) {
        if (!googlePayToken) {
            return { error: { errorCode: 'VALIDATION_ERROR', message: 'googlePayToken is required for Google Pay payments' } }
        }
        return { data: buildGooglePayData({ amount, currency, captureMethod, merchantOrderNumber, googlePayToken, billingAddress, accountHolder, clientIp }) }
    }
    
    const hasEncryptedCard = card?.encryptedCardNumber && (card.integrityCheck || /[a-zA-Z]/.test(card.encryptedCardNumber))
    if (hasEncryptedCard) {
        return { data: buildCardPaymentData({ amount, currency, captureMethod, merchantOrderNumber, card, billingAddress, accountHolder, clientIp, browserInfo, cardTypeName, cardType }) }
    }
    
    if (token) {
        return { data: buildTokenPaymentData({ amount, currency, captureMethod, merchantOrderNumber, token, cardExpiry, billingAddress, accountHolder, clientIp, browserInfo, cardTypeName, cardType }) }
    }
    
    return { error: { errorCode: 'NO_PAYMENT_DATA', message: 'No valid card data or token provided' } }
}

/**
 * Determine capture method based on fraud check results
 */
const resolveCaptureMethod = async ({ config, token, googlePayToken, cardExpiry, accountHolder, billingAddress, currency, amount, fraudShoppingCart, shipTo, kountSessionId, req, fraudRuleAction, initialCaptureMethod, card }) => {
    let captureMethod = initialCaptureMethod
    let fraudResponse = null
    
    const hasEncryptedCard = card?.encryptedCardNumber && (card.integrityCheck || /[a-zA-Z]/.test(card.encryptedCardNumber))
    const canRunFraudCheck = (token || hasEncryptedCard) && !googlePayToken
    
    if (config.enableFraudCheck && config.enableFraudCheckAtAuth && canRunFraudCheck) {
        const fraudResult = await runAuthorizationFraudCheck({
            config, token, cardExpiry, accountHolder, billingAddress,
            currency, amount, fraudShoppingCart, shipTo, kountSessionId,
            req, priorFraudRuleAction: fraudRuleAction, card
        })
        
        if (fraudResult.declined) return { declined: true, fraudResponse: fraudResult.fraudResponse }
        if (fraudResult.forceManualCapture) {
            captureMethod = 'MANUAL'
        }
        fraudResponse = fraudResult.fraudResponse
    } else if (!googlePayToken && shouldForceManualCapture(fraudRuleAction)) {
        captureMethod = 'MANUAL'
    }
    
    return { captureMethod, fraudResponse }
}

// =============================================================================
// Order Patching Helpers (server-side order update after successful auth)
// =============================================================================

/**
 * Check if 3DS authentication is required from JPMC response
 * @private
 */
const is3DSRequired = (paymentResponse) => {
    return paymentResponse.responseCode === 'PERFORM_AUTHENTICATION' &&
        !!paymentResponse.paymentAuthenticationResult?.authenticationOrchestrationUrl
}

/**
 * Patch order after successful non-3DS authorization
 * Updates order status to 'new' and patches payment instrument/transaction with JPMC data
 * @private
 */
const patchOrderAfterAuth = async ({ orderNo, paymentInstrumentId, paymentAmount, paymentResponse, captureMethod, fraudResponse, kountSessionId }) => {
    if (!orderNo || !paymentInstrumentId) {
        logger.warn('[JPMC Authorize] Cannot patch order - missing orderNo or paymentInstrumentId')
        return { patched: false }
    }
    
    try {
        const orderApi = new OrderApiClient()
        
        // Step 1: Update order status to 'new'
        try {
            await orderApi.updateOrderStatus(orderNo, 'new')
        } catch (err) {
            logger.warn('[JPMC Authorize] Failed to update order status:', err.message)
        }
        
        // Step 2: Patch order with fraud check attributes (if fraud check was performed)
        if (fraudResponse) {
            try {
                const fraudAttributes = mapFraudResponseToOrderAttributes(fraudResponse, kountSessionId)
                if (Object.keys(fraudAttributes).length > 0) {
                    await orderApi.patchOrder(orderNo, fraudAttributes)
                } else {
                    logger.warn('[JPMC Authorize] No fraud attributes to patch - mapping returned empty object')
                }
            } catch (err) {
                logger.error('[JPMC Authorize] Order fraud attribute patch failed:', err.message)
            }
        }
        
        // Step 2b: Patch order with auth response attributes (card network response)
        try {
            const authAttributes = mapAuthResponseToOrderAttributes(paymentResponse)
            if (Object.keys(authAttributes).length > 0) {
                await orderApi.patchOrder(orderNo, authAttributes)
            }
        } catch (err) {
            logger.warn('[JPMC Authorize] Order auth attribute patch failed:', err.message)
        }
        
        // Step 3: Patch payment instrument with JPMC data
        try {
            const piAttributes = mapJPMCResponseToAttributes(paymentResponse)
            await orderApi.patchPaymentInstrument(orderNo, paymentInstrumentId, piAttributes)
        } catch (err) {
            logger.warn('[JPMC Authorize] Payment instrument patch failed:', err.message)
        }
        
        // Step 4: Patch payment transaction with JPMC data
        if (paymentAmount) {
            try {
                const txnAttributes = mapPaymentTransactionAttributes(paymentResponse, paymentAmount, captureMethod)
                await orderApi.patchPaymentTransaction(orderNo, paymentInstrumentId, txnAttributes)
            } catch (err) {
                logger.warn('[JPMC Authorize] Payment transaction patch failed:', err.message)
            }
        }
        
        return { patched: true }
    } catch (err) {
        logger.error('[JPMC Authorize] Order patch failed:', err.message)
        return { patched: false }
    }
}

/**
 * Patch order with 3DS pending status
 * @private
 */
const patchOrderFor3DSPending = async ({ orderNo, paymentResponse, merchantId, fraudResponse, kountSessionId }) => {
    if (!orderNo) {
        logger.warn('[JPMC Authorize] Cannot patch 3DS pending - missing orderNo')
        return { patched: false }
    }
    
    try {
        const orderApi = new OrderApiClient()
        const authResult = paymentResponse.paymentAuthenticationResult || {}
        
        
        const patchPayload = {
            c_jpmcMerchantId: merchantId || null,
            c_pending3DSAuthentication: true,
            c_threeDSTransactionId: paymentResponse.transactionId,
            c_threeDSAuthenticationId: authResult.authenticationId || null
        }
        
        // Add fraud check attributes if fraud check was performed
        if (fraudResponse) {
            const fraudAttributes = mapFraudResponseToOrderAttributes(fraudResponse, kountSessionId)
            Object.assign(patchPayload, fraudAttributes)
        }
        
        // Add auth response attributes (card network response)
        const authAttributes = mapAuthResponseToOrderAttributes(paymentResponse)
        if (Object.keys(authAttributes).length > 0) {
            Object.assign(patchPayload, authAttributes)
        }
        
        await orderApi.patchOrder(orderNo, patchPayload)
        
        return { patched: true }
    } catch (err) {
        logger.warn('[JPMC Authorize] 3DS pending patch failed:', err.message)
        return { patched: false }
    }
}

/**
 * Handle payment authorization request
 * 
 * POST /api/jpmorgan/authorize
 * 
 * Supports three authorization modes:
 * 1. SAFETECH token (from verification step) - preferred for stored payments
 * 2. Google Pay - uses encrypted payment bundle from Google
 * 3. Card-based - direct card authorization (PIE encrypted or plain for testing)
 * 
 * Request body:
 * {
 *   amount: 1234,           // Amount in minor units
 *   currency: 'USD',
 *   token: '...',           // SAFETECH token from verification
 *   cardExpiry: { month: 5, year: 2029 },  // Required with token
 *   card: { ... },          // Or card details for direct auth
 *   googlePayToken: '...',  // Or Google Pay token
 *   merchantOrderNumber: '...',
 *   captureMethod: 'AUTO'   // AUTO or MANUAL
 * }
 * 
 * Response:
 * {
 *   success: true/false,
 *   transactionId: '...',
 *   message: '...',
 *   canRetry: true/false
 * }
 */
export const handleAuthorize = async (req, res) => {
    try {
        const config = await getServerConfigAsync(req)
        
        logger.debug('[JPMC Authorize] ========== INCOMING REQUEST ==========')
        logger.debug('[JPMC Authorize] Request body:', safeStringify(req.body))
        logger.debug('[JPMC Authorize] browserInfo received:', !!req.body.browserInfo)
        logger.debug('[JPMC Authorize] 3DS config - jpmc3DSEnabled:', config.jpmc3DSEnabled)
        logger.debug('[JPMC Authorize] ===========================================' )
        
        if (!config.merchantId) {
            return res.status(500).json({ success: false, errorCode: 'CONFIGURATION_ERROR', message: GENERIC_API_ERROR_MESSAGE })
        }

        const { amount, currency, card, token: rawToken, tokenRef, cardExpiry, merchantOrderNumber, billingAddress, accountHolder, paymentMethod, googlePayToken, fraudShoppingCart, shipTo, kountSessionId, fraudRuleAction, browserInfo, paymentInstrumentId, paymentAmount, cardTypeName, cardType } = req.body
        
        // Decrypt tokenRef if provided, otherwise use raw token (backwards compat)
        let token = rawToken
        if (tokenRef) {
            token = decryptToken(tokenRef)
        }

        // Input validation
        const validationResult = validatePaymentRequest(req.body)
        if (!validationResult.valid) {
            return res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: GENERIC_API_ERROR_MESSAGE, field: validationResult.field })
        }

        // Validate zipcode for US and CA locales (both billing and shipping)
        const zipcodeValidation = validateAddressZipcodes(billingAddress, shipTo)
        if (!zipcodeValidation.valid) {
            logger.warn('[JPMC Authorize] Zipcode validation failed:', zipcodeValidation.error, 'addressType:', zipcodeValidation.addressType)
            return res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: GENERIC_API_ERROR_MESSAGE })
        }

        if (!amount || (!card && !token && !googlePayToken)) {
            logger.warn('[JPMC Authorize] Validation failed - missing payment method. token:', !!token, 'card:', !!card, 'googlePayToken:', !!googlePayToken)
            return res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: GENERIC_API_ERROR_MESSAGE })
        }

        // Resolve capture method (handles fraud check)
        const initialCaptureMethod = req.body.captureMethod || config.captureMethod
        const captureResult = await resolveCaptureMethod({
            config, token, googlePayToken, cardExpiry, accountHolder, billingAddress,
            currency, amount, fraudShoppingCart, shipTo, kountSessionId, req, fraudRuleAction,
            initialCaptureMethod, card
        })
        
        if (captureResult.declined) {
            return res.status(402).json({ success: false, errorCode: 'FRAUD_DECLINED', message: GENERIC_API_ERROR_MESSAGE })
        }

        // Build payment data
        const clientIp = getClientIp(req)
        const paymentDataResult = buildPaymentDataForMethod({
            paymentMethod, googlePayToken, token, card, amount, currency,
            captureMethod: captureResult.captureMethod, merchantOrderNumber,
            cardExpiry, billingAddress, accountHolder, clientIp, browserInfo, cardTypeName, cardType
        })
        
        if (paymentDataResult.error) {
            return res.status(400).json({ success: false, ...paymentDataResult.error })
        }

        // Build config with baseUrl for 3DS return URL construction
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https'
        const host = req.headers['x-forwarded-host'] || req.headers.host
        const baseUrl = `${protocol}://${host}`
        const configWith3DS = { ...config, baseUrl }

        const paymentResponse = await createPayment({ accessToken: null, config: configWith3DS, paymentData: paymentDataResult.data })
        const normalizedResponse = normalizePaymentResponse(paymentResponse)
        const statusCode = getPaymentResponseStatusCode(normalizedResponse, paymentResponse)

        // Server-side order patching (if paymentInstrumentId provided)
        // This eliminates the need for client to call /confirm endpoint
        if (normalizedResponse.success && paymentInstrumentId && merchantOrderNumber) {
            if (is3DSRequired(paymentResponse)) {
                // 3DS required: patch order with pending status and fraud attributes
                await patchOrderFor3DSPending({
                    orderNo: merchantOrderNumber,
                    paymentResponse,
                    merchantId: config.merchantId,
                    fraudResponse: captureResult.fraudResponse,
                    kountSessionId
                })
            } else {
                // Non-3DS success: patch order with full JPMC data
                await patchOrderAfterAuth({
                    orderNo: merchantOrderNumber,
                    paymentInstrumentId,
                    paymentAmount,
                    paymentResponse,
                    captureMethod: captureResult.captureMethod,
                    fraudResponse: captureResult.fraudResponse,
                    kountSessionId
                })
                // Add flag to indicate order was patched server-side
                normalizedResponse.orderPatched = true
            }
        }

        return res.status(statusCode).json(normalizedResponse)
    } catch (error) {
        return handlePaymentError(res, error, 'Authorization', { canRetry: true })
    }
}

/**
 * Handle card verification request
 * 
 * POST /api/jpmorgan/verify
 * 
 * This endpoint verifies card data with JPMC and returns a token.
 * The token should be stored in the payment instrument for later authorization.
 * 
 * API: https://api-ms-test.payments.jpmorgan.com/api/v2/verifications
 * 
 * Request body:
 * {
 *   card: {
 *     encryptedCardNumber: '...',
 *     encryptedCVV: '...',
 *     integrityCheck: '...',
 *     expiryMonth: 5,
 *     expiryYear: 2029
 *   },
 *   accountHolder: {
 *     fullName: 'John Doe',
 *     email: 'john@example.com',
 *     phone: { phoneNumber: '5551234567' }
 *   },
 *   billingAddress: {
 *     line1: '123 Main St',
 *     city: 'Los Angeles',
 *     state: 'CA',
 *     postalCode: '90001',
 *     countryCode: 'USA'
 *   },
 *   currency: 'USD'
 * }
 * 
 * Response:
 * {
 *   success: true/false,
 *   token: '...',
 *   fraudRuleAction: '...'
 * }
 */
export const handleVerify = async (req, res) => {
    try {
        const config = await getServerConfigAsync(req)
        
        if (!config.merchantId) {
            return res.status(500).json({
                success: false,
                errorCode: 'CONFIGURATION_ERROR',
                message: 'JPMC_MERCHANT_ID is required'
            })
        }

        const { card, accountHolder, billingAddress, currency, amount, fraudShoppingCart, shipTo, kountSessionId } = req.body
        logger.debug('[JPMC Verify] Incoming verification request:', safeStringify(req.body))
        
        if (!card) {
            return res.status(400).json({
                success: false,
                errorCode: 'VALIDATION_ERROR',
                message: 'card data is required'
            })
        }

        const hasEncryptedData = card.encryptedCardNumber && 
            (card.integrityCheck || /[a-zA-Z]/.test(card.encryptedCardNumber))
        
        if (!hasEncryptedData) {
            return res.status(400).json({
                success: false,
                errorCode: 'ENCRYPTION_REQUIRED',
                message: 'Card data must be encrypted using PIE SDK for production'
            })
        }

        // Validate zipcode for US and CA locales (both billing and shipping)
        const zipcodeValidation = validateAddressZipcodes(billingAddress, shipTo)
        if (!zipcodeValidation.valid) {
            logger.warn('[JPMC Verify] Zipcode validation failed:', zipcodeValidation.error, 'addressType:', zipcodeValidation.addressType)
            return res.status(400).json({
                success: false,
                errorCode: 'VALIDATION_ERROR',
                message: GENERIC_API_ERROR_MESSAGE
            })
        }

        const verificationPayload = buildVerificationPayload({ card, accountHolder, billingAddress, currency, config })

        const apiHost = config.apiHost
        if (!apiHost) {
            return res.status(500).json({ success: false, error: 'API host not configured' })
        }
        const verificationApiUrl = `https://${apiHost}/api/v2/verifications`

        // Fraud check (gated by JPMCEnableFraudCheck)
        let fraudRuleAction = null
        if (config.enableFraudCheck) {
            const fraudResult = await runVerifyFraudCheck({
                config, card, accountHolder, billingAddress,
                currency, amount, fraudShoppingCart, shipTo, kountSessionId, req
            })
            
            if (fraudResult.declined) {
                return res.status(402).json({
                    success: false,
                    errorCode: 'FRAUD_DECLINED',
                    message: GENERIC_API_ERROR_MESSAGE
                })
            }
            fraudRuleAction = fraudResult.fraudRuleAction
        }

        logger.debug('[JPMC Verify] RAW REQUEST:', safeStringify(verificationPayload))

        const { getAccessToken } = await import('../../auth')
        const accessToken = await getAccessToken(config, false)

        const verifyResponse = await fetch(verificationApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'merchant-id': config.merchantId,
                'request-id': generateRequestId()
            },
            body: JSON.stringify(verificationPayload)
        })

        const verifyResult = await verifyResponse.json()
        
        logger.debug('[JPMC Verify] RAW RESPONSE:', safeStringify(verifyResult))

        if (!verifyResponse.ok) {
            return res.status(verifyResponse.status).json({ success: false, message: GENERIC_API_ERROR_MESSAGE })
        }

        if (verifyResult.responseStatus === 'DENIED' || verifyResult.responseStatus === 'ERROR') {
            return res.status(400).json({ success: false, message: GENERIC_API_ERROR_MESSAGE })
        }

        const token = extractVerificationToken(verifyResult)
        if (!token) {
            logger.warn('[JPMC Verify] No valid payment token found in response')
        }

        const tokenRef = token ? encryptToken(token) : null
        const cardTypeName = verifyResult.paymentMethodType?.card?.cardTypeName || null
        const cardType = verifyResult.paymentMethodType?.card?.cardType || null

        return res.status(200).json({
            success: true,
            tokenRef,
            fraudRuleAction,
            cardTypeName,
            cardType
        })

    } catch (error) {
        return handlePaymentError(res, error, 'Verification', { canRetry: true, logPrefix: 'JPMC Verify' })
    }
}
