import { useCallback } from 'react'
import { GENERIC_API_ERROR_MESSAGE } from '../utils/constants/error-constants'

/**
 * @param {object} options
 * @param {string} [options.locale]
 * @param {function} [options.getAccessToken]
 */
export function useServerSideCreateOrder({ locale, getAccessToken } = {}) {
    const createOrder = useCallback(async ({ body: { basketId } = {} } = {}) => {
        if (!basketId) {
            return { success: false, error: 'basketId is required' }
        }

        const localeParam = locale ? `?locale=${encodeURIComponent(locale)}` : ''
        const headers = { 'Content-Type': 'application/json' }

        if (getAccessToken) {
            try {
                const token = await getAccessToken()
                if (token) headers['Authorization'] = `Bearer ${token}`
            } catch (_err) {
                // Non-fatal: proceed without authorization
            }
        }

        try {
            const response = await fetch(`/api/jpmorgan/order/create${localeParam}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ basketId })
            })

            if (!response.ok) {
                return { success: false, error: GENERIC_API_ERROR_MESSAGE }
            }

            return response.json()
        } catch (_err) {
            return { success: false, error: GENERIC_API_ERROR_MESSAGE }
        }
    }, [locale, getAccessToken])

    return { createOrder }
}
