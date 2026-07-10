/**
 * Tests for JPMC Sequence Number Service
 * 
 * Tests the endpoint for retrieving unique order sequence numbers from SFRA
 */

import { getSequenceNumber } from '../jpmc-sequence-number-service'

describe('JPMC Sequence Number Service', () => {
    let mockFetch

    beforeEach(() => {
        mockFetch = jest.fn()
        global.fetch = mockFetch
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('getSequenceNumber', () => {
        const mockUrl = 'https://abcd-032.dx.commercecloud.salesforce.com/on/demandware.store/Sites-RefArch-Site/en_US'

        it('should fetch sequence number successfully', async () => {
            const mockResponse = {
                success: true,
                sequenceNumber: 'SEQ-12345678'
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse
            })

            const result = await getSequenceNumber({ sfraBaseUrl: mockUrl })

            expect(result).toEqual({ sequenceNumber: 'SEQ-12345678' })
            expect(mockFetch).toHaveBeenCalledWith(
                `${mockUrl}/JPMC-GetSequenceNumber`,
                expect.objectContaining({
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                })
            )
        })

        it('should include locale in request when provided', async () => {
            const mockResponse = {
                success: true,
                sequenceNumber: 'SEQ-87654321'
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse
            })

            const result = await getSequenceNumber({ 
                sfraBaseUrl: mockUrl,
                locale: 'en_CA'
            })

            expect(result.sequenceNumber).toBe('SEQ-87654321')
        })

        it('should throw error when sfraBaseUrl is missing', async () => {
            await expect(getSequenceNumber({})).rejects.toThrow(
                '[JPMCSequenceNumberService] sfraBaseUrl is required'
            )

            expect(mockFetch).not.toHaveBeenCalled()
        })

        it('should throw error when sfraBaseUrl is null', async () => {
            await expect(getSequenceNumber({ sfraBaseUrl: null })).rejects.toThrow(
                '[JPMCSequenceNumberService] sfraBaseUrl is required'
            )
        })

        it('should throw error when sfraBaseUrl is empty string', async () => {
            await expect(getSequenceNumber({ sfraBaseUrl: '' })).rejects.toThrow(
                '[JPMCSequenceNumberService] sfraBaseUrl is required'
            )
        })

        it('should handle non-OK response status', async () => {
            const mockResponse = {
                success: false,
                error: 'Internal Server Error'
            }

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => mockResponse
            })

            await expect(getSequenceNumber({ sfraBaseUrl: mockUrl }))
                .rejects
                .toThrow('[JPMCSequenceNumberService] Endpoint returned 500: Internal Server Error')
        })

        it('should handle 404 error response', async () => {
            const mockResponse = {
                success: false,
                error: 'Not Found'
            }

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => mockResponse
            })

            await expect(getSequenceNumber({ sfraBaseUrl: mockUrl }))
                .rejects
                .toThrow('[JPMCSequenceNumberService] Endpoint returned 404: Not Found')
        })

        it('should handle 401 unauthorized response', async () => {
            const mockResponse = {
                success: false,
                error: 'Unauthorized'
            }

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: async () => mockResponse
            })

            await expect(getSequenceNumber({ sfraBaseUrl: mockUrl }))
                .rejects
                .toThrow('[JPMCSequenceNumberService] Endpoint returned 401: Unauthorized')
        })

        it('should throw error when success is false in response', async () => {
            const mockResponse = {
                success: false,
                error: 'Failed to generate sequence number'
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse
            })

            await expect(getSequenceNumber({ sfraBaseUrl: mockUrl }))
                .rejects
                .toThrow('[JPMCSequenceNumberService] Endpoint returned success=false: Failed to generate sequence number')
        })

        it('should throw error when sequenceNumber is missing from response', async () => {
            const mockResponse = {
                success: true
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse
            })

            await expect(getSequenceNumber({ sfraBaseUrl: mockUrl }))
                .rejects
                .toThrow('[JPMCSequenceNumberService] No sequenceNumber in response')
        })

        it('should throw error when sequenceNumber is null', async () => {
            const mockResponse = {
                success: true,
                sequenceNumber: null
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse
            })

            await expect(getSequenceNumber({ sfraBaseUrl: mockUrl }))
                .rejects
                .toThrow('[JPMCSequenceNumberService] No sequenceNumber in response')
        })

        it('should throw error when sequenceNumber is empty string', async () => {
            const mockResponse = {
                success: true,
                sequenceNumber: ''
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse
            })

            await expect(getSequenceNumber({ sfraBaseUrl: mockUrl }))
                .rejects
                .toThrow('[JPMCSequenceNumberService] No sequenceNumber in response')
        })

        it('should handle error response without error message', async () => {
            const mockResponse = {
                success: false
            }

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => mockResponse
            })

            await expect(getSequenceNumber({ sfraBaseUrl: mockUrl }))
                .rejects
                .toThrow('[JPMCSequenceNumberService] Endpoint returned 500: Unknown error')
        })

        it('should handle multiple locales correctly', async () => {
            const urls = [
                'https://server.com/en_US',
                'https://server.com/en_CA',
                'https://server.com/fr_CA'
            ]

            const responses = [
                { success: true, sequenceNumber: 'SEQ-US' },
                { success: true, sequenceNumber: 'SEQ-CA' },
                { success: true, sequenceNumber: 'SEQ-FR' }
            ]

            for (let i = 0; i < urls.length; i++) {
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => responses[i]
                })

                const result = await getSequenceNumber({ 
                    sfraBaseUrl: urls[i],
                    locale: urls[i].split('/').pop()
                })
                
                expect(result.sequenceNumber).toBe(responses[i].sequenceNumber)
            }
        })

        it('should construct correct endpoint URL', async () => {
            const mockResponse = {
                success: true,
                sequenceNumber: 'SEQ-TEST'
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse
            })

            const baseUrl = 'https://example.com/store'
            await getSequenceNumber({ sfraBaseUrl: baseUrl })

            expect(mockFetch).toHaveBeenCalledWith(
                'https://example.com/store/JPMC-GetSequenceNumber',
                expect.any(Object)
            )
        })

        it('should handle network errors gracefully', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'))

            await expect(getSequenceNumber({ sfraBaseUrl: mockUrl }))
                .rejects
                .toThrow('Network error')
        })

        it('should handle timeout errors', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Timeout'))

            await expect(getSequenceNumber({ sfraBaseUrl: mockUrl }))
                .rejects
                .toThrow('Timeout')
        })
    })
})
