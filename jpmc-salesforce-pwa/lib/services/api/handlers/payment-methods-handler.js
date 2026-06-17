/**
 * Payment Methods Handler
 * 
 * Handles the available payment methods endpoint:
 * - handleGetAvailablePaymentMethods: GET /api/jpmorgan/available-payment-methods
 */
import logger from '../../../utils/logger'
import { extractSlasToken } from '../../../utils/locale-extractor'
import { checkAvailablePaymentMethods } from '../../../hooks/useAvailablePaymentMethods'
import { getJPMCConfigAsync } from '../../../ssr/index.js'
import { isDefaultLocale } from '../../../utils/site-config.js'

/**
 * GET /api/jpmorgan/available-payment-methods
 * 
 * Fetches payment methods from SFCC BM and returns availability flags.
 * This is a plug-and-play endpoint that developers don't need to configure.
 * 
 * Query params:
 *   basketId - The basket ID to fetch payment methods for
 * 
 * Returns:
 * {
 *   success: true,
 *   isCreditCardActive: boolean,
 *   isGooglePayActive: boolean,
 *   isApplePayActive: boolean,
 *   paymentMethods: [{id, name, ...}]
 * }
 * 
 * Note: Requires SLAS token in Authorization header (automatically forwarded from PWA Kit)
 */
export const handleGetAvailablePaymentMethods = async (req, res) => {
    try {
        const { basketId } = req.query
        
        // Validate required parameters
        if (!basketId) {
            return res.status(400).json({
                success: false,
                errorCode: 'INVALID_REQUEST',
                message: 'Missing required query parameter: basketId',
                // Return defaults so UI doesn't break
                isCreditCardActive: true,
                isGooglePayActive: false,
                isApplePayActive: false,
                creditCardPaymentMethodId: null,
                googlePayPaymentMethodId: null,
                applePayPaymentMethodId: null
            })
        }
        
        // Extract SLAS token from request headers
        const slasToken = extractSlasToken(req)
        if (!slasToken) {
            // If no auth, return defaults (don't block checkout)
            logger.warn('[PaymentMethods] No Authorization header, returning defaults')
            return res.status(200).json({
                success: true,
                isCreditCardActive: true,
                isGooglePayActive: false,
                isApplePayActive: false,
                creditCardPaymentMethodId: null,
                googlePayPaymentMethodId: null,
                applePayPaymentMethodId: null,
                warning: 'No authorization - using defaults'
            })
        }
        
        // Build Shopper Baskets API URL
        const shortCode = process.env.SFCC_SHORT_CODE || process.env.COMMERCE_API_SHORT_CODE
        const organizationId = process.env.SFCC_ORG_ID || process.env.COMMERCE_API_ORG_ID
        const siteId = process.env.SFCC_SITE_ID || process.env.COMMERCE_API_SITE_ID || 'RefArchGlobal'
        
        if (!shortCode || !organizationId) {
            logger.error('[PaymentMethods] Missing SFCC configuration')
            return res.status(200).json({
                success: true,
                isCreditCardActive: true,
                isGooglePayActive: false,
                isApplePayActive: false,
                creditCardPaymentMethodId: null,
                googlePayPaymentMethodId: null,
                applePayPaymentMethodId: null,
                warning: 'Missing SFCC configuration - using defaults'
            })
        }
        
        const apiUrl = `https://${shortCode}.api.commercecloud.salesforce.com/checkout/shopper-baskets/v1/organizations/${organizationId}/baskets/${basketId}/payment-methods?siteId=${siteId}`
        
        logger.info('[PaymentMethods] Fetching from SFCC:', { basketId, siteId })
        
        // Call Shopper Baskets API
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${slasToken}`
            }
        })
        
        if (!response.ok) {
            const errorBody = await response.text()
            logger.error('[PaymentMethods] API error:', {
                status: response.status,
                body: errorBody
            })
            
            // Return defaults on error
            return res.status(200).json({
                success: true,
                isCreditCardActive: true,
                isGooglePayActive: false,
                isApplePayActive: false,
                creditCardPaymentMethodId: null,
                googlePayPaymentMethodId: null,
                applePayPaymentMethodId: null,
                warning: `SFCC API error ${response.status} - using defaults`
            })
        }
        
        const data = await response.json()
        const paymentMethods = data.applicablePaymentMethods || []
        
        // Analyze payment methods using our utility
        const availability = checkAvailablePaymentMethods(paymentMethods)
        
        // Apple Pay: ONLY enabled for default locale (no multi-locale support)
        // Check if the requested locale is the default locale from site configuration
        let applePayActive = availability.isApplePayActive
        const locale = req.query?.locale || req.body?.locale
        
        if (!isDefaultLocale(locale)) {
            // Non-default locale: Apple Pay is NOT supported
            logger.info(`[PaymentMethods] Apple Pay disabled for non-default locale: ${locale}`)
            applePayActive = false
        } else {
            // Default locale or no locale specified: Check site preference
            try {
                const jpmcConfig = await getJPMCConfigAsync({ slasToken })
                if (jpmcConfig.applePayEnabled === false) {
                    logger.info('[PaymentMethods] JPMCApplePayEnabled is false in BM — overriding isApplePayActive to false')
                    applePayActive = false
                }
            } catch (configErr) {
                logger.warn('[PaymentMethods] Could not load JPMC config for applePayEnabled check:', configErr.message)
            }
        }
        
        logger.info('[PaymentMethods] Analyzed:', {
            isCreditCardActive: availability.isCreditCardActive,
            isGooglePayActive: availability.isGooglePayActive,
            isApplePayActive: applePayActive,
            creditCardPaymentMethodId: availability.creditCardPaymentMethodId,
            googlePayPaymentMethodId: availability.googlePayPaymentMethodId,
            applePayPaymentMethodId: availability.applePayPaymentMethodId,
            count: paymentMethods.length
        })
        
        return res.status(200).json({
            success: true,
            isCreditCardActive: availability.isCreditCardActive,
            isGooglePayActive: availability.isGooglePayActive,
            isApplePayActive: applePayActive,
            // Include the actual payment method IDs for dynamic use
            creditCardPaymentMethodId: availability.creditCardPaymentMethodId,
            googlePayPaymentMethodId: availability.googlePayPaymentMethodId,
            applePayPaymentMethodId: availability.applePayPaymentMethodId
        })
        
    } catch (error) {
        logger.error('[PaymentMethods] Error:', error)
        
        // Return defaults on any error
        return res.status(200).json({
            success: true,
            isCreditCardActive: true,
            isGooglePayActive: false,
            isApplePayActive: false,
            creditCardPaymentMethodId: null,
            googlePayPaymentMethodId: null,
            applePayPaymentMethodId: null,
            paymentMethods: [],
            warning: `Error: ${error.message} - using defaults`
        })
    }
}
