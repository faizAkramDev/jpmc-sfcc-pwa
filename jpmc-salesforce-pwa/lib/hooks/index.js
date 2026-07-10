/**
 * Hooks Index
 * Exports JP Morgan payment hooks
 * 
 * @module hooks
 */

export { default as useJPMorganPayment } from './useJPMorganPayment'
export { default as useGooglePay } from './useGooglePay'
export { default as useApplePay } from './useApplePay'
export { useJPMCPlaceOrder } from './useJPMCPlaceOrder'
export { useAvailablePaymentMethods, checkAvailablePaymentMethods } from './useAvailablePaymentMethods'
export { default as useKount } from './useKount'
export { useThreeDS } from './useThreeDS'
export { useDropInPaymentSuccess } from './useDropInPaymentSuccess'

import useJPMorganPayment from './useJPMorganPayment'
import useGooglePay from './useGooglePay'
import useApplePay from './useApplePay'
import { useJPMCPlaceOrder } from './useJPMCPlaceOrder'
import { useAvailablePaymentMethods, checkAvailablePaymentMethods } from './useAvailablePaymentMethods'
import useKount from './useKount'
import { useThreeDS } from './useThreeDS'
import { useDropInPaymentSuccess } from './useDropInPaymentSuccess'

export default {
    useJPMorganPayment,
    useGooglePay,
    useApplePay,
    useJPMCPlaceOrder,
    useAvailablePaymentMethods,
    checkAvailablePaymentMethods,
    useKount,
    useThreeDS,
    useDropInPaymentSuccess
}
