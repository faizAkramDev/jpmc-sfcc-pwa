/**
 * @jpmorgan/jpmorgan-salesforce-pwa - Client-Side Exports
 * 
 * This module contains ONLY browser-safe exports:
 * - React context providers for checkout
 * - React hooks for payment flow
 * - No Node.js dependencies (fs, crypto, etc.)
 * 
 * For server-side imports (API routes, OAuth), use:
 * import { ... } from '@jpmorgan/jpmorgan-salesforce-pwa/lib/server'
 * 
 * @module @jpmorgan/jpmorgan-salesforce-pwa/lib/client
 */

// =============================================================================
// CHECKOUT PROVIDER (Recommended for minimal integration)
// =============================================================================

/**
 * JPMC Checkout Provider
 * 
 * Wraps checkout to handle the complete payment flow:
 * - PIE SDK initialization
 * - Card data storage between steps
 * - Authorization on place order
 * - Verification (when API available)
 * 
 * Usage:
 * ```jsx
 * import { JPMCCheckoutProvider } from '@jpmorgan/jpmorgan-salesforce-pwa/lib/client'
 * 
 * <JPMCCheckoutProvider>
 *   <YourCheckoutComponent />
 * </JPMCCheckoutProvider>
 * ```
 */
export { 
    JPMCCheckoutProvider, 
    useJPMCCheckout 
} from './context/JPMCCheckoutProvider'

// Re-export provider as default
export { default } from './context/JPMCCheckoutProvider'

// =============================================================================
// LOW-LEVEL HOOKS (For custom implementations)
// =============================================================================

/**
 * Simplified hook for the place order flow
 * 
 * Provides:
 * - One-function place order (submitOrder)
 * - Loading state management
 * - Error handling with reset
 * - Automatic Google Pay integration
 * 
 * Usage:
 * ```jsx
 * import { useJPMCPlaceOrder } from '@jpmorgan/jpmorgan-salesforce-pwa/lib/client'
 * 
 * const { submitOrder, isLoading, error } = useJPMCPlaceOrder({
 *   createOrderFn: () => createOrder(basket),
 *   onSuccess: (order) => navigate(`/checkout/confirmation/${order.orderNo}`)
 * })
 * ```
 */
export { useJPMCPlaceOrder } from '../hooks/useJPMCPlaceOrder'

/**
 * React hook for JP Morgan payment integration
 * 
 * Provides:
 * - PIE SDK encryption initialization
 * - Card data encryption
 * - Payment authorization via SSR API
 * - Payment status checking
 * 
 * Usage:
 * ```jsx
 * import { useJPMorganPayment } from '@jpmorgan/jpmorgan-salesforce-pwa/lib/client'
 * 
 * const { encryptCard, authorize, isReady } = useJPMorganPayment()
 * ```
 */
export { default as useJPMorganPayment } from '../hooks/useJPMorganPayment'

/**
 * React hook for Google Pay integration
 * 
 * Provides:
 * - Google Pay script loading
 * - Availability detection
 * - Payment flow handling
 * - Token collection (authorization happens server-side after order creation)
 * 
 * Usage:
 * ```jsx
 * import { useGooglePay } from '@jpmorgan/jpmorgan-salesforce-pwa/lib/client'
 * 
 * const { isAvailable, getPaymentToken, isProcessing } = useGooglePay({
 *   gatewayMerchantId: 'your-merchant-id',
 *   merchantName: 'Your Store'
 * })
 * 
 * // Get token, then create order, then authorize with orderNo
 * const tokenResult = await getPaymentToken({ amount: '99.99', currencyCode: 'USD' })
 * ```
 */
export { default as useGooglePay } from '../hooks/useGooglePay'

/**
 * React hook for Apple Pay integration
 * 
 * Provides:
 * - Apple Pay availability detection (Safari only)
 * - Merchant validation handling
 * - Payment flow handling
 * - JP Morgan authorization
 * 
 * Usage:
 * ```jsx
 * import { useApplePay } from '@jpmorgan/jpmorgan-salesforce-pwa/lib/client'
 * 
 * const { isAvailable, initiatePayment, isProcessing } = useApplePay({
 *   merchantId: 'merchant.com.yourcompany',
 *   merchantName: 'Your Store'
 * })
 * ```
 */
export { default as useApplePay } from '../hooks/useApplePay'

/**
 * React hook & utility for checking available payment methods from SFCC BM
 * 
 * Analyzes payment methods from the basket and determines which
 * JPMC-supported payment types (Credit Card, Apple Pay, Google Pay) are active.
 * 
 * Usage:
 * ```jsx
 * import { useAvailablePaymentMethods } from '@jpmorgan/jpmorgan-salesforce-pwa/lib/client'
 * import { usePaymentMethodsForBasket } from '@salesforce/commerce-sdk-react'
 * 
 * const { data } = usePaymentMethodsForBasket({ parameters: { basketId } })
 * const { 
 *   isCreditCardActive, 
 *   isApplePayActive, 
 *   isGooglePayActive 
 * } = useAvailablePaymentMethods(data?.applicablePaymentMethods)
 * ```
 */
export { 
    useAvailablePaymentMethods, 
    checkAvailablePaymentMethods 
} from '../hooks/useAvailablePaymentMethods'

/**
 * Hook for Drop-in payment success flow
 * 
 * Encapsulates the complete order flow after Drop-in SDK PaymentSuccess fires:
 * 1. Set billing address to basket
 * 2. Attach payment instrument to basket
 * 3. Create SFCC order
 * 4. Normalize Drop-in payload and confirm order server-side
 * 5. Call success callback (e.g., navigate to confirmation)
 * 
 * This hook extracts the reusable business logic so integrators don't need
 * to duplicate the 100+ line payment flow in every app.
 * 
 * Usage:
 * ```jsx
 * import { useDropInPaymentSuccess } from '@jpmorgan/jpmorgan-salesforce-pwa/lib/client'
 * import { DropInCheckout } from '@jpmorgan/jpmorgan-salesforce-pwa/lib/client'
 * 
 * const CheckoutPayment = () => {
 *   const { mutate: createOrder } = useCreateOrder()
 *   const navigate = useNavigation()
 *   
 *   const { handlePaymentSuccess, isProcessing, error } = useDropInPaymentSuccess({
 *     createOrderFn: createOrder,
 *     onSuccess: (orderNo) => navigate(`/checkout/confirmation/${orderNo}`),
 *     onError: (errorMsg) => setErrorMessage(errorMsg)
 *   })
 *   
 *   return <DropInCheckout onPaymentSuccess={handlePaymentSuccess} />
 * }
 * ```
 */
export { useDropInPaymentSuccess } from '../hooks/useDropInPaymentSuccess'

export { useServerSideCreateOrder } from '../hooks/useServerSideCreateOrder'

// =============================================================================
// GOOGLE PAY COMPONENTS
// =============================================================================

/**
 * Google Pay Button Component
 * 
 * A unified Google Pay button that handles all contexts through a single `context` prop:
 * - checkout (default): Token collection for checkout page
 * - cart: Full shipping flow with address/option callbacks
 * - pdp: Product-to-order flow (future)
 * 
 * CHECKOUT CONTEXT (default):
 * ```jsx
 * import { GooglePayButton } from '@jpmorgan/jpmorgan-salesforce-pwa/lib/client'
 * 
 * <GooglePayButton
 *   amount="99.99"
 *   currencyCode="USD"
 *   onSuccess={(result) => handlePayment(result)}
 * />
 * ```
 * 
 * CART CONTEXT:
 * ```jsx
 * import { GooglePayButton } from '@jpmorgan/jpmorgan-salesforce-pwa/lib/client'
 * 
 * <GooglePayButton
 *   context="cart"
 *   basket={basket}
 *   createOrderFn={() => createOrder({ body: { basketId } })}
 *   onSuccess={(result) => navigate(`/confirmation/${result.orderNo}`)}
 *   allowedCountryCodes={['US', 'CA']}
 * />
 * ```
 */
export { GooglePayButton } from './components'

// =============================================================================
// APPLE PAY COMPONENTS
// =============================================================================

/**
 * Apple Pay Button Component
 * 
 * A plug-and-play button that handles the complete Apple Pay flow.
 * Automatically hides on non-Safari browsers.
 * 
 * Usage:
 * ```jsx
 * import { ApplePayButton } from '@jpmorgan/jpmorgan-salesforce-pwa/lib/client'
 * 
 * <ApplePayButton
 *   merchantId="merchant.com.yourcompany"
 *   merchantName="Your Store"
 *   amount={99.99}
 *   onSuccess={(result) => handleSuccess(result)}
 *   onError={(error) => handleError(error)}
 * />
 * ```
 */
export { ApplePayButton } from './components'

// =============================================================================
// DROP-IN UI COMPONENT
// =============================================================================

/**
 * Drop-in Checkout Component
 *
 * Renders the JPMC hosted Drop-in UI widget for EU / alternate payment flows.
 * Requires JPMCCheckoutProvider with dropInEnabled: true in the resolved config.
 *
 * Usage:
 * ```jsx
 * import { DropInCheckout } from '@jpmorgan/jpmorgan-salesforce-pwa/lib/client'
 *
 * // Inside checkout payment step (when isDropInEnabled === true):
 * <DropInCheckout />
 * ```
 */
export { DropInCheckout } from './components/DropInCheckout'

// =============================================================================
// 3DS COMPONENTS
// =============================================================================

/**
 * 3D Secure Modal Component
 * 
 * Displays an iframe for 3DS authentication challenge flow.
 * Used internally by useJPMCPlaceOrder but can be used standalone.
 * 
 * Usage:
 * ```jsx
 * import { ThreeDSModal } from '@jpmorgan/jpmorgan-salesforce-pwa/lib/client'
 * 
 * <ThreeDSModal
 *   isOpen={is3DSRequired}
 *   onCancel={handleCancel}
 *   iframeName="jpmc-3ds-iframe"
 *   onIframeRef={(ref) => setIframeRef(ref)}
 *   title="Payment Authentication"
 *   cancelText="Cancel"
 * />
 * ```
 */
export { ThreeDSModal } from './components'

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Transform PWA Kit form data to JPMC card format
 * 
 * Handles:
 * - Card type mapping (PWA Kit to JPMC format)
 * - Expiry date parsing (MM/YY to month/year)
 * - Billing address transformation
 * - Name parsing (full name to first/last)
 * 
 * Usage:
 * ```jsx
 * import { transformPWAKitFormData } from '@jpmorgan/jpmorgan-salesforce-pwa/lib/client'
 * 
 * const { setCardData } = useJPMCCheckout()
 * 
 * const handlePaymentInfo = (formData) => {
 *   const cardData = transformPWAKitFormData(formData)
 *   setCardData(cardData)
 * }
 * ```
 */
export { transformPWAKitFormData, mapPWAKitCardType } from '../utils/form-transformer'

// =============================================================================
// LOCALIZATION & DISPLAY LABELS
// =============================================================================

/**
 * Display Item Labels for Apple Pay & Google Pay
 * 
 * Provides localized labels for payment display items (shipping, tax, total).
 * 
 * Usage:
 * ```jsx
 * import { getDisplayItemLabels } from '@jpmorgan/jpmorgan-salesforce-pwa/client'
 * 
 * const labels = getDisplayItemLabels(intl)
 * // Returns: { shipping: 'Shipping', tax: 'Tax', total: 'Total' }
 * ```
 */
export { getDisplayItemLabels } from '../utils/label-fetcher'

// =============================================================================
// PAYMENT ERROR HANDLING & REDIRECT
// =============================================================================

/**
 * Payment Error Session Helpers
 * 
 * When payment authorization fails AFTER order creation (order created but 
 * payment declined), the basket is consumed and payment error data is saved 
 * to sessionStorage. The checkout should redirect to your error page.
 * 
 * **Error Object Shape**:
 * ```typescript
 * {
 *   message: string,       // User-friendly error message
 *   code: string,          // Error code (e.g., 'AUTHORIZATION_FAILED')
 *   orderNo: string,       // SFCC order number (marked as 'failed' in BM)
 *   step: string,          // Where failure occurred ('authorization', 'verification')
 *   paymentMethod: string, // Payment method ('card', 'googlepay', 'applepay')
 *   shouldRedirect: boolean, // True if redirect needed (orderNo exists)
 *   timestamp: number      // Auto-expires after 5 minutes
 * }
 * ```
 * 
 * **Implementation Example - Error Page**:
 * ```jsx
 * // pages/checkout/order-failed.jsx (or your custom error route)
 * import { getPaymentError, clearPaymentError } from '@jpmorgan/jpmorgan-salesforce-pwa/client'
 * 
 * const OrderFailedPage = () => {
 *   const error = getPaymentError()
 *   const navigate = useNavigation()
 *   
 *   const handleRetry = () => {
 *     clearPaymentError()
 *     navigate('/cart')
 *   }
 *   
 *   return (
 *     <Box p={8} textAlign="center">
 *       <Heading mb={4}>Payment Failed</Heading>
 *       <Text mb={4}>{error?.message || 'Your payment could not be processed.'}</Text>
 *       {error?.orderNo && (
 *         <Text fontSize="sm" color="gray.500">
 *           Reference: {error.orderNo}
 *         </Text>
 *       )}
 *       <Button onClick={handleRetry} mt={6}>Return to Cart</Button>
 *     </Box>
 *   )
 * }
 * ```
 * 
 * **Implementation Example - Checkout onError**:
 * ```jsx
 * // pages/checkout/index.jsx
 * import { useJPMCPlaceOrder } from '@jpmorgan/jpmorgan-salesforce-pwa/client'
 * 
 * // Define your own error route
 * const ORDER_ERROR_ROUTE = '/checkout/order-failed'
 * 
 * const { submitOrder, isLoading } = useJPMCPlaceOrder({
 *   createOrderFn: () => createOrder({ body: { basketId } }),
 *   onSuccess: (order) => navigate(`/checkout/confirmation/${order.orderNo}`),
 *   onError: (err) => {
 *     if (err.shouldRedirect) {
 *       navigate(ORDER_ERROR_ROUTE)
 *     }
 *   }
 * })
 * ```
 */
export { 
    getPaymentError, 
    clearPaymentError, 
    hasPaymentError,
    savePaymentError
} from './context/JPMCCheckoutProvider'
