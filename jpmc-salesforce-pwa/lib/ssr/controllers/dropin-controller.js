import { getJPMCConfigAsync } from '../index.js'
import { getAccessToken } from '../../services/auth/oauth-service.js'
import { getSequenceNumber } from '../../services/jpmc-sequence-number-service.js'
import { getBasket } from '../../services/sfcc/basket-service.js'
import logger from '../../utils/logger.js'
import { extractLocale, extractSlasToken } from '../../utils/locale-extractor.js'
import { GENERIC_API_ERROR_MESSAGE } from '../../utils/constants/error-constants'



function buildScapiBasketPatchUrl(basketId, scapiShortCode, scapiOrgId, scapiSiteId) {
    return `https://${scapiShortCode}.api.commercecloud.salesforce.com/checkout/shopper-baskets/v1/organizations/${scapiOrgId}/baskets/${basketId}?siteId=${scapiSiteId}`
}

async function patchBasketAttrs(patchUrl, attrs, slasToken) {
    const response = await fetch(patchUrl, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${slasToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(attrs)
    })
    if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(`SCAPI basket PATCH failed (${response.status}): ${errText}`)
    }
}

async function resolveOrderNumber(basket, basketId, slasToken, sfraBaseUrl, locale, scapiConfig) {
    const { scapiShortCode, scapiOrgId, scapiSiteId } = scapiConfig
    const hasScapi = !!(scapiShortCode && scapiOrgId && scapiSiteId && slasToken)

    const existingReservedOrderNo = basket?.c_jpmcReservedOrderNo || null
    const previousVersion = basket?.c_jpmcLastEtag || ''
    // Track orderTotal (cents) as version — avoids false positives from our own basket PATCHes
    const currentVersion = String(Math.round((basket?.orderTotal || 0) * 100))
    const lastIntentOrderNumber = basket?.c_jpmcCheckoutIntentOrderNumber || null

    let reservedOrderNo = existingReservedOrderNo
    if (!reservedOrderNo) {
        const sequenceResult = await getSequenceNumber({ sfraBaseUrl, locale })
        reservedOrderNo = sequenceResult.sequenceNumber
        if (hasScapi) {
            const patchUrl = buildScapiBasketPatchUrl(basketId, scapiShortCode, scapiOrgId, scapiSiteId)
            await patchBasketAttrs(patchUrl, { c_jpmcReservedOrderNo: reservedOrderNo }, slasToken)
        } else {
            logger.warn('[DropIn] SCAPI not configured — c_jpmcReservedOrderNo not persisted')
        }
    }

    const versionChanged = !!previousVersion && currentVersion !== previousVersion
    const merchantOrderNumber = versionChanged
        ? reservedOrderNo + '-' + Date.now().toString(36)
        : (lastIntentOrderNumber || reservedOrderNo)

    return { reservedOrderNo, merchantOrderNumber, currentVersion }
}

async function persistIntentState(basketId, slasToken, currentVersion, merchantOrderNumber, scapiConfig) {
    const { scapiShortCode, scapiOrgId, scapiSiteId } = scapiConfig
    if (!(scapiShortCode && scapiOrgId && scapiSiteId && slasToken && currentVersion)) return
    try {
        const patchUrl = buildScapiBasketPatchUrl(basketId, scapiShortCode, scapiOrgId, scapiSiteId)
        await patchBasketAttrs(patchUrl, {
            c_jpmcLastEtag: currentVersion,
            c_jpmcCheckoutIntentOrderNumber: merchantOrderNumber
        }, slasToken)
    } catch (e) {
        logger.warn('[DropIn] Failed to persist intent state — non-fatal', { error: e.message })
    }
}

async function fetchCustomerProfile(basket, slasToken, scapiShortCode, scapiOrgId, scapiSiteId) {
    let isRegisteredCustomer = false, customerEmail = null, customerFullName = null, jpmcProfileId = null
    try {
        const customerNo = basket?.customerInfo?.customerNo
        const customerId = basket?.customerInfo?.customerId
        isRegisteredCustomer = !!customerNo
        if (isRegisteredCustomer && customerId) {
            const url = `https://${scapiShortCode}.api.commercecloud.salesforce.com/customer/shopper-customers/v1/organizations/${scapiOrgId}/customers/${customerId}?siteId=${scapiSiteId}`
            const res = await fetch(url, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${slasToken}`, 'Content-Type': 'application/json' }
            })
            if (res.ok) {
                const data = await res.json()
                customerEmail = data.email || null
                const fullName = ((data.firstName || '') + ' ' + (data.lastName || '')).trim()
                if (fullName) customerFullName = fullName
                if (data.c_jpmcProfileId) jpmcProfileId = data.c_jpmcProfileId
            } else {
                logger.warn('[DropIn] Could not fetch customer profile', { status: res.status })
            }
        }
    } catch (e) {
        logger.warn('[DropIn] Customer profile lookup failed', { error: e.message })
    }
    return { isRegisteredCustomer, customerEmail, customerFullName, jpmcProfileId }
}

/**
 * POST /api/jpmorgan/dropin/create-session
 * Create a JPMC checkout session token for the Drop-in UI (initial mount).
 * Returns checkoutSessionToken and reservedOrderNo for re-entry detection.
 */
export const handleDropInCreateSession = async (req, res) => {
    try {
        const locale = extractLocale(req)
        const slasToken = extractSlasToken(req)
        const config = await getJPMCConfigAsync({ locale, slasToken })
        const { merchantId, apiHost, captureMethod, checkoutIntentUrl, checkoutMode } = config

        if (checkoutMode !== 'DROP_IN') {
            return res.status(400).json({ success: false, error: 'Drop-in checkout is not enabled for this locale.' })
        }
        if (!merchantId || (!apiHost && !checkoutIntentUrl)) {
            return res.status(500).json({ success: false, error: 'Merchant configuration is incomplete. Contact support.' })
        }

        const {
            basketId,
            currencyCode: bodyCurrentCode,
            totalTransactionAmount: bodyTotal,
            subtotalAmount: bodySubtotal,
            totalTaxAmount: bodyTaxAmount,
            totalShippingAmount: bodyShippingAmount,
            saveConsumerProfile: bodySaveConsumerProfile
        } = req.body || {}
        const currencyCode = bodyCurrentCode || req.query?.currencyCode
        const totalTransactionAmount = bodyTotal !== undefined ? bodyTotal : req.query?.totalTransactionAmount

        if (!basketId) return res.status(400).json({ success: false, error: 'basketId is required.' })
        if (!currencyCode) return res.status(400).json({ success: false, error: 'Currency is required.' })
        if (totalTransactionAmount === undefined || totalTransactionAmount === null) {
            return res.status(400).json({ success: false, error: 'Cart total is required.' })
        }
        if (typeof currencyCode !== 'string' || !/^[A-Z]{3}$/.test(currencyCode)) {
            return res.status(400).json({ success: false, error: 'Invalid currency code.' })
        }
        if (typeof totalTransactionAmount !== 'number' || totalTransactionAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid cart total.' })
        }

        const scapiShortCode = process.env.COMMERCE_API_SHORT_CODE
        const scapiOrgId = process.env.COMMERCE_API_ORG_ID
        const scapiSiteId = process.env.COMMERCE_API_SITE_ID
        const scapiConfig = { scapiShortCode, scapiOrgId, scapiSiteId }
        const hasScapi = !!(scapiShortCode && scapiOrgId && scapiSiteId && slasToken)

        let basket = null
        if (hasScapi) {
            try { basket = await getBasket(basketId, slasToken) } catch (e) {
                logger.warn('[DropIn] Failed to fetch basket — Tier 1/3 will not engage', { error: e.message })
            }
        }

        // ── Obtain JPMC access token ────────────────────────────────────────────
        const accessToken = await getAccessToken(config)
        const requestId = crypto.randomUUID().replace(/-/g, '').substring(0, 22)
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'merchantId': String(merchantId),
            'requestId': requestId
        }

        const captureMethodMapped = captureMethod === 'NOW' ? 'CAPTURE_METHOD_NOW' : 'CAPTURE_METHOD_MANUAL'

        // ── Tier 1 + Tier 3: Resolve merchantOrderNumber ────────────────────────
        const ocapiHost = process.env.SFCC_OCAPI_HOST
        const siteId = process.env.COMMERCE_API_SITE_ID
        const sfraBaseUrl = `https://${ocapiHost}/on/demandware.store/Sites-${siteId}-Site/${locale}`
        const { reservedOrderNo, merchantOrderNumber, currentVersion } = await resolveOrderNumber(
            basket, basketId, slasToken, sfraBaseUrl, locale, scapiConfig
        )

        let isRegisteredCustomer = false
        let customerEmail = null
        let customerFullName = null
        let jpmcProfileId = null

        if (basket && hasScapi) {
            const profile = await fetchCustomerProfile(basket, slasToken, scapiShortCode, scapiOrgId, scapiSiteId)
            isRegisteredCustomer = profile.isRegisteredCustomer
            customerEmail = profile.customerEmail
            customerFullName = profile.customerFullName
            jpmcProfileId = profile.jpmcProfileId
        }

        const subtotalAmount = bodySubtotal || totalTransactionAmount
        const totalTaxAmount = bodyTaxAmount || 0
        const totalShippingAmount = bodyShippingAmount || 0

        const saveConsumerProfile = bodySaveConsumerProfile !== undefined ? bodySaveConsumerProfile : config.saveConsumerProfile

        const payload = {
            currencyCode,
            merchantOrderNumber,
            checkoutOptions: {
                authorization: {
                    authorizationType: 'AUTH_METHOD_CART_AMOUNT'
                },
                capture: {
                    captureMethod: captureMethodMapped
                }
            },
            cart: {
                totalTransactionAmount: Number(totalTransactionAmount),
                subtotalAmount: {
                    currencyCode,
                    amount: Number(subtotalAmount)
                },
                totalTax: {
                    currencyCode,
                    amount: Number(totalTaxAmount)
                },
                totalShippingCost: {
                    currencyCode,
                    amount: Number(totalShippingAmount)
                }
            }
        }

        if (isRegisteredCustomer) {
            payload.checkoutOptions.cardOnFile = {
                transactionType: 'COF_TRANSACTION_TYPE_UNSCHEDULED'
            }
        }
        if (saveConsumerProfile && isRegisteredCustomer) {
            payload.checkoutOptions.consumerProfileOptions = { isSaveConsumerProfile: true }
        }
        if (isRegisteredCustomer && (customerEmail || jpmcProfileId)) {
            payload.consumer = {}
            if (customerEmail) payload.consumer.email = customerEmail
            if (customerFullName) payload.consumer.recipientFullName = customerFullName
            if (jpmcProfileId) payload.consumer.consumerProfileId = jpmcProfileId
        }

        const maskedPayload = {
            ...payload,
            consumer: payload.consumer ? {
                ...payload.consumer,
                email: payload.consumer.email
                    ? payload.consumer.email.replace(/^(.{2})[^@]*(@.*)$/, '$1***$2')
                    : undefined,
                recipientFullName: payload.consumer.recipientFullName
                    ? payload.consumer.recipientFullName.replace(/\S+/g, (w) => w[0] + '*'.repeat(w.length - 1))
                    : undefined
            } : undefined
        }

        logger.debug('[DropIn] /checkout/intent request', {
            url: checkoutIntentUrl,
            merchantOrderNumber: payload.merchantOrderNumber,
            currencyCode: payload.currencyCode,
            isRegisteredCustomer,
            cardOnFile: payload.checkoutOptions.cardOnFile || null,
            payload: JSON.stringify(maskedPayload)
        })

        const response = await fetch(checkoutIntentUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        })

        const responseText = await response.text()

        if (!response.ok) {
            logger.error('[DropIn] /checkout/intent failed', { status: response.status, body: responseText })
            return res.status(502).json({ success: false, error: 'Failed to create checkout session with JPMC.' })
        }

        let data
        try {
            data = JSON.parse(responseText)
        } catch (parseErr) {
            logger.error('[DropIn] /checkout/intent non-JSON response', { body: responseText })
            return res.status(502).json({ success: false, error: 'Failed to create checkout session with JPMC.' })
        }
        const { checkoutSessionToken } = data

        if (!checkoutSessionToken) {
            logger.error('[DropIn] /checkout/intent missing checkoutSessionToken', data)
            return res.status(502).json({ success: false, error: 'Checkout session token not returned by JPMC.' })
        }

        await persistIntentState(basketId, slasToken, currentVersion, merchantOrderNumber, scapiConfig)

        return res.status(200).json({ success: true, checkoutSessionToken, reservedOrderNo })
    } catch (error) {
        logger.error('[DropIn] create-session error', { message: error.message, stack: error.stack })
        return res.status(500).json({ success: false, error: GENERIC_API_ERROR_MESSAGE })
    }
}

/**
 * POST /api/jpmorgan/dropin/get-intent
 * Token refresh for Drop-in re-entry. Validates basket and reuses reserved order number.
 */
export const handleDropInGetIntent = async (req, res) => {
    try {
        const locale = extractLocale(req)
        const slasToken = extractSlasToken(req)
        const config = await getJPMCConfigAsync({ locale, slasToken })
        const { merchantId, apiHost, captureMethod, checkoutIntentUrl, checkoutMode } = config

        if (checkoutMode !== 'DROP_IN') {
            return res.status(400).json({ success: false, error: 'Drop-in checkout is not enabled.' })
        }
        if (!merchantId || (!apiHost && !checkoutIntentUrl)) {
            return res.status(500).json({ success: false, error: 'Merchant configuration is incomplete. Contact support.' })
        }

        const { basketId } = req.body || {}
        if (!basketId) {
            return res.status(400).json({ success: false, error: 'basketId is required.' })
        }

        const scapiShortCode = process.env.COMMERCE_API_SHORT_CODE
        const scapiOrgId = process.env.COMMERCE_API_ORG_ID
        const scapiSiteId = process.env.COMMERCE_API_SITE_ID
        const scapiConfig = { scapiShortCode, scapiOrgId, scapiSiteId }

        if (!(scapiShortCode && scapiOrgId && scapiSiteId && slasToken)) {
            return res.status(500).json({ success: false, error: 'Server configuration error. Contact support.' })
        }

        let basket
        try {
            basket = await getBasket(basketId, slasToken)
        } catch (e) {
            logger.error('[DropIn GetIntent] Failed to fetch basket', { error: e.message })
            return res.status(400).json({
                success: false,
                error: 'Could not retrieve your basket. Please refresh and try again.'
            })
        }

        if (!basket?.productItems?.length) {
            return res.status(400).json({
                success: false,
                error: 'Your cart is empty.',
                cartError: true
            })
        }

        const shippingAddr = basket?.shipments?.[0]?.shippingAddress
        if (!shippingAddr?.address1) {
            return res.status(400).json({
                success: false,
                error: 'Please provide a shipping address before proceeding to payment.',
                errorStage: { stage: 'shipping', step: 'address' }
            })
        }


        if (!basket?.billingAddress?.address1) {
            try {
                const billingUrl = `https://${scapiShortCode}.api.commercecloud.salesforce.com/checkout/shopper-baskets/v1/organizations/${scapiOrgId}/baskets/${basketId}/billing-address?siteId=${scapiSiteId}`
                const billingResponse = await fetch(billingUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${slasToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        firstName: shippingAddr.firstName || '',
                        lastName: shippingAddr.lastName || '',
                        address1: shippingAddr.address1,
                        address2: shippingAddr.address2 || '',
                        city: shippingAddr.city || '',
                        stateCode: shippingAddr.stateCode || '',
                        countryCode: shippingAddr.countryCode || '',
                        postalCode: shippingAddr.postalCode || '',
                        phone: shippingAddr.phone || ''
                    })
                })
                if (!billingResponse.ok) {
                    const errText = await billingResponse.text().catch(() => '')
                    logger.warn('[DropIn GetIntent] Billing address copy failed — non-fatal', {
                        status: billingResponse.status, error: errText
                    })
                }
            } catch (e) {
                logger.warn('[DropIn GetIntent] Billing address copy threw — non-fatal', { error: e.message })
            }
        }

        // ── Derive amounts from basket (server-side, always fresh) ──────────────
        const currencyCode = basket.currency
        if (!currencyCode) {
            logger.error('[DropIn GetIntent] Basket has no currency code')
            return res.status(400).json({ success: false, error: 'Basket currency is not set. Please refresh and try again.' })
        }

        const orderTotalCents = Math.round((basket.orderTotal || 0) * 100)
        if (orderTotalCents <= 0) {
            logger.error('[DropIn GetIntent] Basket orderTotal is invalid', { orderTotal: basket.orderTotal })
            return res.status(400).json({ success: false, error: 'Invalid cart total. Please verify your cart and try again.' })
        }

        // ── Obtain JPMC access token ────────────────────────────────────────────
        const accessToken = await getAccessToken(config)
        const requestId = crypto.randomUUID().replace(/-/g, '').substring(0, 22)
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'merchantId': String(merchantId),
            'requestId': requestId
        }

        // Drop-in UI does not support DELAYED capture; map to MANUAL.
        const captureMethodMapped = captureMethod === 'NOW' ? 'CAPTURE_METHOD_NOW' : 'CAPTURE_METHOD_MANUAL'

        // ── Tier 1 + Tier 3: Resolve merchantOrderNumber ────────────────────────
        const ocapiHost = process.env.SFCC_OCAPI_HOST
        const siteId = process.env.COMMERCE_API_SITE_ID
        const sfraBaseUrl = `https://${ocapiHost}/on/demandware.store/Sites-${siteId}-Site/${locale}`
        const { reservedOrderNo, merchantOrderNumber, currentVersion } = await resolveOrderNumber(
            basket, basketId, slasToken, sfraBaseUrl, locale, scapiConfig
        )

        // ── Customer profile (from already-fetched basket) ──────────────────────
        const profile = await fetchCustomerProfile(basket, slasToken, scapiShortCode, scapiOrgId, scapiSiteId)
        const { isRegisteredCustomer, customerEmail, customerFullName, jpmcProfileId } = profile

        // ── Build intent payload ────────────────────────────────────────────────
        const saveConsumerProfile = config.saveConsumerProfile

        const payload = {
            currencyCode,
            merchantOrderNumber,
            checkoutOptions: {
                authorization: { authorizationType: 'AUTH_METHOD_CART_AMOUNT' },
                capture: { captureMethod: captureMethodMapped }
            },
            cart: {
                totalTransactionAmount: orderTotalCents
            }
        }

        if (saveConsumerProfile && isRegisteredCustomer) {
            payload.checkoutOptions.consumerProfileOptions = { isSaveConsumerProfile: true }
        }

        if (isRegisteredCustomer && (customerEmail || jpmcProfileId)) {
            payload.consumer = {}
            if (customerEmail) { payload.consumer.email = customerEmail }
            if (customerFullName) { payload.consumer.recipientFullName = customerFullName }
            if (jpmcProfileId) { payload.consumer.consumerProfileId = jpmcProfileId }
        }

        logger.info('[DropIn GetIntent] Calling /checkout/intent', {
            url: checkoutIntentUrl,
            merchantOrderNumber,
            captureMethod: captureMethodMapped,
            currencyCode,
            totalTransactionAmount: orderTotalCents,
            isRegisteredCustomer,
            hasCustomerEmail: !!customerEmail,
            hasJpmcProfileId: !!jpmcProfileId
        })

        // ── Call JPMC /checkout/intent ──────────────────────────────────────────
        const response = await fetch(checkoutIntentUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        })

        if (!response.ok) {
            const errBody = await response.text()
            logger.error('[DropIn GetIntent] /checkout/intent returned non-OK status', {
                status: response.status,
                body: errBody
            })
            return res.status(502).json({ success: false, error: 'Failed to refresh checkout session with JPMC.' })
        }

        const data = await response.json()
        const { checkoutSessionToken } = data

        if (!checkoutSessionToken) {
            logger.error('[DropIn GetIntent] /checkout/intent response missing checkoutSessionToken', data)
            return res.status(502).json({ success: false, error: 'Checkout session token not returned by JPMC.' })
        }

        // ── Persist intent state for Tier 3 on next call ───────────────────────
        await persistIntentState(basketId, slasToken, currentVersion, merchantOrderNumber, scapiConfig)

        logger.info('[DropIn GetIntent] Intent token obtained successfully', {
            hasCheckoutSessionToken: !!checkoutSessionToken,
            reservedOrderNo,
            merchantOrderNumber
        })

        return res.status(200).json({
            success: true,
            checkoutSessionToken,
            reservedOrderNo
        })
    } catch (error) {
        logger.error('[DropIn GetIntent] error:', {
            message: error.message,
            stack: error.stack,
            code: error.code
        })
        return res.status(500).json({
            success: false,
            error: GENERIC_API_ERROR_MESSAGE
        })
    }
}
