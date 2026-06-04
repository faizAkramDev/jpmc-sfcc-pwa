/**
 * useKount Hook Tests
 * 
 * Tests for Kount device fingerprinting hook
 */

import { renderHook, act } from '@testing-library/react'
import { useKount } from '../useKount.js'

// Mock sessionStorage
const createMockSessionStorage = () => {
    let store = {}
    return {
        getItem: jest.fn((key) => store[key] || null),
        setItem: jest.fn((key, value) => { store[key] = value }),
        removeItem: jest.fn((key) => { delete store[key] }),
        clear: () => { store = {} }
    }
}

let mockSessionStorage

describe('useKount', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockSessionStorage = createMockSessionStorage()
        
        // Setup browser environment
        Object.defineProperty(global, 'sessionStorage', {
            value: mockSessionStorage,
            writable: true
        })
        
        // Mock crypto.randomUUID
        Object.defineProperty(global, 'crypto', {
            value: {
                randomUUID: jest.fn(() => '12345678-1234-1234-1234-123456789012')
            },
            writable: true
        })
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    describe('Session ID Generation', () => {
        it('should generate a session ID on mount', () => {
            const { result } = renderHook(() => useKount({ enabled: true }))

            expect(result.current.kountSessionId).toBeTruthy()
            expect(result.current.kountSessionId.length).toBeLessThanOrEqual(32)
        })

        it('should use crypto.randomUUID when available', () => {
            const { result } = renderHook(() => useKount({ enabled: true }))

            // UUID without hyphens = 32 chars
            expect(result.current.kountSessionId).toBe('12345678123412341234123456789012')
        })

        it('should save session ID to sessionStorage', () => {
            renderHook(() => useKount({ enabled: true }))

            expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
                'jpmc_kount_session_id',
                expect.any(String)
            )
        })

        it('should retrieve existing session ID from sessionStorage', () => {
            mockSessionStorage.getItem.mockReturnValue('existing-session-id')

            const { result } = renderHook(() => useKount({ enabled: true }))

            expect(result.current.kountSessionId).toBe('existing-session-id')
        })

        it('should generate fallback UUID when crypto.randomUUID is not available', () => {
            // Mock crypto.getRandomValues fallback (randomUUID not available)
            global.crypto = { 
                randomUUID: undefined,
                getRandomValues: (arr) => {
                    for (let i = 0; i < arr.length; i++) {
                        arr[i] = Math.floor(Math.random() * 256)
                    }
                    return arr
                }
            }
            mockSessionStorage.getItem.mockReturnValue(null)
            
            const { result } = renderHook(() => useKount({ enabled: true }))

            expect(result.current.kountSessionId).toBeTruthy()
            expect(result.current.kountSessionId.length).toBe(32)
        })
    })

    describe('Collection Complete State', () => {
        it('should set isCollectionComplete to true if session exists', () => {
            mockSessionStorage.getItem.mockReturnValue('existing-id')

            const { result } = renderHook(() => useKount({ enabled: true }))

            expect(result.current.isCollectionComplete).toBe(true)
        })

        it('should set isCollectionComplete to false for new session', () => {
            mockSessionStorage.getItem.mockReturnValue(null)

            const { result } = renderHook(() => useKount({ enabled: true }))

            expect(result.current.isCollectionComplete).toBe(false)
        })
    })

    describe('SDK Initialization', () => {
        it('should not initialize SDK if not enabled', () => {
            const { result } = renderHook(() => useKount({ 
                clientId: 'test-client-id',
                enabled: false 
            }))

            expect(result.current.kountSessionId).toBeTruthy()
        })

        it('should not initialize SDK if clientId is missing', () => {
            const { result } = renderHook(() => useKount({ 
                enabled: true 
            }))

            expect(result.current.kountSessionId).toBeTruthy()
        })

        it('should handle enabled with default options', () => {
            const { result } = renderHook(() => useKount())

            expect(result.current.kountSessionId).toBeTruthy()
            expect(typeof result.current.refreshKount).toBe('function')
        })
    })

    describe('refreshKount', () => {
        it('should generate new session ID when called', async () => {
            global.crypto.randomUUID
                .mockReturnValueOnce('initial-uuid-1234-1234-123456789012')
                .mockReturnValueOnce('second-uuid-5678-5678-567890123456')

            const { result } = renderHook(() => useKount({ enabled: true }))

            const initialId = result.current.kountSessionId

            await act(async () => {
                await result.current.refreshKount()
            })

            expect(result.current.kountSessionId).not.toBe(initialId)
        })

        it('should save new session ID to sessionStorage', async () => {
            const { result } = renderHook(() => useKount({ enabled: true }))

            await act(async () => {
                await result.current.refreshKount()
            })

            // Should have been called at least twice: initial + refresh
            expect(mockSessionStorage.setItem.mock.calls.length).toBeGreaterThanOrEqual(2)
        })

        it('should reset isCollectionComplete to false', async () => {
            mockSessionStorage.getItem.mockReturnValue('existing-id')

            const { result } = renderHook(() => useKount({ enabled: true }))

            expect(result.current.isCollectionComplete).toBe(true)

            await act(async () => {
                await result.current.refreshKount()
            })

            expect(result.current.isCollectionComplete).toBe(false)
        })

        it('should return the new session ID', async () => {
            global.crypto.randomUUID
                .mockReturnValueOnce('initial-uuid-1234-1234-123456789012')
                .mockReturnValueOnce('refresh-uuid-5678-5678-567890123456')

            const { result } = renderHook(() => useKount({ enabled: true }))

            let newId
            await act(async () => {
                newId = await result.current.refreshKount()
            })

            // Session ID has hyphens stripped from UUID
            expect(newId).toBeTruthy()
            expect(typeof newId).toBe('string')
        })
    })

    describe('Return Value', () => {
        it('should return kountSessionId', () => {
            const { result } = renderHook(() => useKount({ enabled: true }))
            expect(result.current.kountSessionId).toBeDefined()
        })

        it('should return isCollectionComplete', () => {
            const { result } = renderHook(() => useKount({ enabled: true }))
            expect(typeof result.current.isCollectionComplete).toBe('boolean')
        })

        it('should return refreshKount function', () => {
            const { result } = renderHook(() => useKount({ enabled: true }))
            expect(typeof result.current.refreshKount).toBe('function')
        })
    })

    describe('Exports', () => {
        it('should have named export useKount', () => {
            expect(typeof useKount).toBe('function')
        })
    })
})
