/**
 * Unit Tests for auth-headers module
 */

import { buildAuthHeaders } from '../auth-headers'

describe('auth-headers', () => {
    describe('buildAuthHeaders', () => {
        beforeEach(() => {
            jest.clearAllMocks()
        })

        it('returns Content-Type header when no options provided', async () => {
            const headers = await buildAuthHeaders()
            expect(headers).toEqual({ 'Content-Type': 'application/json' })
        })

        it('returns Content-Type header when getAccessToken is null', async () => {
            const headers = await buildAuthHeaders({ getAccessToken: null })
            expect(headers).toEqual({ 'Content-Type': 'application/json' })
        })

        it('returns authorization header when getAccessToken succeeds', async () => {
            const mockGetAccessToken = jest.fn().mockResolvedValue('test-token-123')
            const headers = await buildAuthHeaders({ getAccessToken: mockGetAccessToken })
            
            expect(mockGetAccessToken).toHaveBeenCalled()
            expect(headers).toEqual({
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test-token-123'
            })
        })

        it('returns only Content-Type when getAccessToken returns null', async () => {
            const mockGetAccessToken = jest.fn().mockResolvedValue(null)
            const headers = await buildAuthHeaders({ getAccessToken: mockGetAccessToken })
            
            expect(headers).toEqual({ 'Content-Type': 'application/json' })
        })

        it('returns only Content-Type when getAccessToken returns empty string', async () => {
            const mockGetAccessToken = jest.fn().mockResolvedValue('')
            const headers = await buildAuthHeaders({ getAccessToken: mockGetAccessToken })
            
            expect(headers).toEqual({ 'Content-Type': 'application/json' })
        })

        it('returns only Content-Type when getAccessToken throws error', async () => {
            const mockGetAccessToken = jest.fn().mockRejectedValue(new Error('Token fetch failed'))
            const headers = await buildAuthHeaders({ getAccessToken: mockGetAccessToken })
            
            expect(headers).toEqual({ 'Content-Type': 'application/json' })
        })

        it('uses custom contentType when provided', async () => {
            const headers = await buildAuthHeaders({ contentType: 'text/plain' })
            expect(headers).toEqual({ 'Content-Type': 'text/plain' })
        })

        it('handles async function that takes time', async () => {
            const mockGetAccessToken = jest.fn().mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve('delayed-token'), 10))
            )
            const headers = await buildAuthHeaders({ getAccessToken: mockGetAccessToken })
            
            expect(headers).toEqual({
                'Content-Type': 'application/json',
                'Authorization': 'Bearer delayed-token'
            })
        })
    })
})
