/**
 * Order API Client Tests
 * 
 * Tests for the server-side SFCC Orders Data API client
 */

import { OrderApiClient } from '../order-api'

// Mock global fetch
global.fetch = jest.fn()

describe('OrderApiClient', () => {
    let client
    let originalEnv

    beforeEach(() => {
        jest.clearAllMocks()
        
        // Save original env
        originalEnv = { ...process.env }
        
        // Set up test environment variables
        process.env.COMMERCE_API_CLIENT_ID_PRIVATE = 'test-client-id'
        process.env.COMMERCE_API_CLIENT_SECRET = 'test-client-secret'
        process.env.COMMERCE_API_ORG_ID = 'f_ecom_test_realm_001'
        process.env.COMMERCE_API_SHORT_CODE = 'testshort'
        process.env.COMMERCE_API_SITE_ID = 'TestSite'
        
        // Create client instance
        client = new OrderApiClient({
            logger: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn()
            }
        })

        // Mock successful auth token response
        global.fetch.mockImplementation((url) => {
            if (url.includes('access_token')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'test-access-token' })
                })
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ orderNo: 'ORDER123' })
            })
        })
    })

    afterEach(() => {
        // Restore original env
        process.env = originalEnv
    })

    describe('constructor', () => {
        it('uses environment variables by default', () => {
            const client = new OrderApiClient()
            
            expect(client.clientId).toBe('test-client-id')
            expect(client.clientSecret).toBe('test-client-secret')
            expect(client.orgId).toBe('f_ecom_test_realm_001')
            expect(client.shortCode).toBe('testshort')
            expect(client.siteId).toBe('TestSite')
        })

        it('accepts config overrides', () => {
            const client = new OrderApiClient({
                clientId: 'custom-client',
                clientSecret: 'custom-secret',
                orgId: 'custom-org',
                shortCode: 'customshort',
                siteId: 'CustomSite'
            })
            
            expect(client.clientId).toBe('custom-client')
            expect(client.clientSecret).toBe('custom-secret')
            expect(client.orgId).toBe('custom-org')
            expect(client.shortCode).toBe('customshort')
            expect(client.siteId).toBe('CustomSite')
        })

        it('derives realmId from orgId', () => {
            const client = new OrderApiClient({
                orgId: 'f_ecom_realm123_instance456'
            })
            
            expect(client.realmId).toBe('realm123_instance456')
        })

        it('uses explicit realmId and instanceId when provided', () => {
            const client = new OrderApiClient({
                realmId: 'explicit-realm',
                instanceId: 'explicit-instance'
            })
            
            expect(client.realmId).toBe('explicit-realm')
            expect(client.instanceId).toBe('explicit-instance')
        })

        it('uses default oauth scopes', () => {
            const client = new OrderApiClient()
            
            expect(client.oauthScopes).toBe('sfcc.orders.rw')
        })

        it('accepts custom oauth scopes', () => {
            process.env.SFCC_OAUTH_SCOPES = 'sfcc.orders sfcc.baskets'
            const client = new OrderApiClient()
            
            expect(client.oauthScopes).toBe('sfcc.orders sfcc.baskets')
        })

        it('enables debug with JPMC_DEBUG env var', () => {
            process.env.JPMC_DEBUG = 'true'
            const client = new OrderApiClient()
            
            expect(client.debug).toBe(true)
        })

        it('uses console as default logger', () => {
            const client = new OrderApiClient()
            
            expect(client.logger).toBe(console)
        })

        it('accepts custom logger', () => {
            const customLogger = { info: jest.fn(), error: jest.fn() }
            const client = new OrderApiClient({ logger: customLogger })
            
            expect(client.logger).toBe(customLogger)
        })
    })

    describe('getAdminAuthToken', () => {
        it('requests token with correct credentials', async () => {
            await client.getAdminAuthToken()

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('access_token'),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': expect.stringContaining('Basic ')
                    })
                })
            )
        })

        it('throws on auth failure', async () => {
            global.fetch.mockImplementationOnce(() =>
                Promise.resolve({
                    ok: false,
                    status: 401,
                    statusText: 'Unauthorized',
                    text: () => Promise.resolve('Invalid credentials')
                })
            )

            await expect(client.getAdminAuthToken()).rejects.toThrow('Auth failed')
        })

        it('logs debug info when debug is enabled', async () => {
            client.debug = true
            await client.getAdminAuthToken()

            expect(client.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[OrderApiClient]'),
                expect.anything()
            )
        })
    })

    describe('request', () => {
        it('makes authenticated request', async () => {
            global.fetch
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'token123' })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: 'test' })
                }))

            await client.request('GET', 'ORDER123')

            // Second call should be the actual API request
            expect(global.fetch).toHaveBeenCalledTimes(2)
            expect(global.fetch).toHaveBeenLastCalledWith(
                expect.stringContaining('/orders/ORDER123'),
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer token123'
                    })
                })
            )
        })

        it('includes body for non-GET requests', async () => {
            global.fetch
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'token123' })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true })
                }))

            await client.request('POST', 'ORDER123', { body: { status: 'new' } })

            expect(global.fetch).toHaveBeenLastCalledWith(
                expect.anything(),
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ status: 'new' })
                })
            )
        })

    })

    describe('getOrder', () => {
        it('returns order details', async () => {
            global.fetch
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'token123' })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        orderNo: 'ORDER123',
                        status: 'new',
                        paymentInstruments: []
                    })
                }))

            const order = await client.getOrder('ORDER123')

            expect(order.orderNo).toBe('ORDER123')
            expect(order.status).toBe('new')
        })

        it('throws on failure', async () => {
            global.fetch
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'token123' })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    text: () => Promise.resolve('Order not found')
                }))

            await expect(client.getOrder('ORDER123')).rejects.toThrow('Get order failed')
        })
    })

    describe('updateOrderStatus', () => {
        it('updates order status to new', async () => {
            global.fetch
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'token123' })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true })
                }))

            const result = await client.updateOrderStatus('ORDER123', 'new')

            expect(result.success).toBe(true)
            expect(global.fetch).toHaveBeenLastCalledWith(
                expect.stringContaining('ORDER123/status'),
                expect.objectContaining({
                    method: 'PUT',
                    body: JSON.stringify({ status: 'new' })
                })
            )
        })

        it('defaults to new status', async () => {
            global.fetch
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'token123' })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true })
                }))

            await client.updateOrderStatus('ORDER123')

            expect(global.fetch).toHaveBeenLastCalledWith(
                expect.anything(),
                expect.objectContaining({
                    body: JSON.stringify({ status: 'new' })
                })
            )
        })

        it('throws on failure', async () => {
            global.fetch
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'token123' })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: false,
                    status: 400,
                    statusText: 'Bad Request',
                    text: () => Promise.resolve('Invalid status')
                }))

            await expect(client.updateOrderStatus('ORDER123', 'invalid')).rejects.toThrow('Update order status failed')
        })
    })

    describe('patchPaymentInstrument', () => {
        it('patches payment instrument with custom attributes', async () => {
            global.fetch
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'token123' })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true })
                }))

            const result = await client.patchPaymentInstrument('ORDER123', 'pi123', {
                c_jpmcTransactionId: 'txn123'
            })

            expect(result.success).toBe(true)
            expect(global.fetch).toHaveBeenLastCalledWith(
                expect.stringContaining('ORDER123/payment-instruments/pi123'),
                expect.objectContaining({
                    method: 'PATCH',
                    body: JSON.stringify({ c_jpmcTransactionId: 'txn123' })
                })
            )
        })

        it('throws on failure', async () => {
            global.fetch
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'token123' })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: false,
                    status: 400,
                    statusText: 'Bad Request',
                    text: () => Promise.resolve('Invalid attribute')
                }))

            await expect(
                client.patchPaymentInstrument('ORDER123', 'pi123', { bad: 'data' })
            ).rejects.toThrow('Patch payment instrument failed')
        })
    })

    describe('patchPaymentTransaction', () => {
        it('patches payment transaction with attributes', async () => {
            global.fetch
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'token123' })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true })
                }))

            const result = await client.patchPaymentTransaction('ORDER123', 'pi123', {
                transactionId: 'txn123',
                c_jpmcAuthCode: 'AUTH123'
            })

            expect(result.success).toBe(true)
            expect(global.fetch).toHaveBeenLastCalledWith(
                expect.stringContaining('ORDER123/payment-instruments/pi123/transaction'),
                expect.objectContaining({
                    method: 'PATCH'
                })
            )
        })

        it('throws on failure', async () => {
            global.fetch
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'token123' })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: false,
                    status: 400,
                    statusText: 'Bad Request',
                    text: () => Promise.resolve('Invalid transaction')
                }))

            await expect(
                client.patchPaymentTransaction('ORDER123', 'pi123', {})
            ).rejects.toThrow('Patch payment transaction failed')
        })
    })

    // =========================================================================
    // patchOrder Tests (3DS Support)
    // =========================================================================

    describe('patchOrder', () => {
        it('patches order with custom attributes', async () => {
            global.fetch
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'token123' })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ orderNo: 'ORDER123', success: true })
                }))

            const result = await client.patchOrder('ORDER123', {
                c_pending3DSAuthentication: false,
                c_threeDSTransactionId: 'dsTransId-456',
                c_threeDSAuthenticationValue: 'CAVV-xyz'
            })

            expect(result.success).toBe(true)
            expect(global.fetch).toHaveBeenLastCalledWith(
                expect.stringContaining('/orders/ORDER123'),
                expect.objectContaining({
                    method: 'PATCH',
                    body: expect.stringContaining('c_pending3DSAuthentication')
                })
            )
        })

        it('includes authorization header', async () => {
            global.fetch
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'token123' })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true })
                }))

            await client.patchOrder('ORDER123', { c_test: 'value' })

            expect(global.fetch).toHaveBeenLastCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer token123'
                    })
                })
            )
        })

        it('patches with 3DS failure attributes', async () => {
            global.fetch
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'token123' })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true })
                }))

            const result = await client.patchOrder('ORDER123', {
                c_pending3DSAuthentication: false,
                c_threeDSTransactionStatus: 'UNAVAILABLE',
                c_threeDSFailureReason: 'TIMEOUT'
            })

            expect(result.success).toBe(true)
            expect(global.fetch).toHaveBeenLastCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: expect.stringContaining('c_threeDSFailureReason')
                })
            )
        })

        it('throws on API failure', async () => {
            global.fetch
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'token123' })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: false,
                    status: 400,
                    statusText: 'Bad Request',
                    text: () => Promise.resolve('Invalid attribute')
                }))

            await expect(
                client.patchOrder('ORDER123', { c_invalid: 'data' })
            ).rejects.toThrow('Patch order failed')
        })

        it('throws on authentication failure', async () => {
            global.fetch.mockImplementationOnce(() => Promise.resolve({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: () => Promise.resolve('Invalid credentials')
            }))

            await expect(
                client.patchOrder('ORDER123', { c_test: 'value' })
            ).rejects.toThrow()
        })

        it('constructs correct API URL', async () => {
            global.fetch
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'token123' })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true })
                }))

            await client.patchOrder('ORDER123', { c_test: 'value' })

            const lastCall = global.fetch.mock.calls[global.fetch.mock.calls.length - 1]
            const url = lastCall[0]
            
            expect(url).toContain('/orders/ORDER123')
            expect(url).not.toContain('/payment-instruments/')
        })

        it('patches with minimal data', async () => {
            global.fetch
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'token123' })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true })
                }))

            const result = await client.patchOrder('ORDER123', {
                c_pending3DSAuthentication: false
            })

            expect(result.success).toBe(true)
        })
    })
})
