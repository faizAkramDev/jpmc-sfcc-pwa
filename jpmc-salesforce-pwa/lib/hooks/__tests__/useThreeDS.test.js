/**
 * Unit Tests for useThreeDS Hook
 *
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { useThreeDS } from '../useThreeDS'
import { THREE_DS } from '../../utils/constants.mjs'

// Mock timers
jest.useFakeTimers()

describe('useThreeDS Hook', () => {
    const defaultProps = {
        onSuccess: jest.fn(),
        onDenied: jest.fn(),
        onError: jest.fn(),
        onCancel: jest.fn(),
        onTimeout: jest.fn(),
        fail3DSOrderFn: jest.fn()
    }

    let mockIframe

    beforeEach(() => {
        jest.clearAllMocks()
        jest.clearAllTimers()

        // Create mock iframe
        mockIframe = document.createElement('iframe')
        mockIframe.name = 'jpmc-3ds-iframe'
        document.body.appendChild(mockIframe)

        // Mock form creation and submission
        HTMLFormElement.prototype.submit = jest.fn()
    })

    afterEach(() => {
        // Cleanup iframe
        if (mockIframe && mockIframe.parentNode) {
            mockIframe.parentNode.removeChild(mockIframe)
        }
    })

    // =========================================================================
    // Initial State Tests
    // =========================================================================

    describe('Initial State', () => {
        it('should initialize with modal closed', () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            expect(result.current.isModalOpen).toBe(false)
        })

        it('should return correct iframe name', () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            expect(result.current.iframeName).toBe('jpmc-3ds-iframe')
        })

        it('should return required functions', () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            expect(typeof result.current.initiateOrchestration).toBe('function')
            expect(typeof result.current.handleCancel).toBe('function')
            expect(typeof result.current.hideModal).toBe('function')
            expect(typeof result.current.setIframeRef).toBe('function')
        })
    })

    // =========================================================================
    // Orchestration Initiation Tests
    // =========================================================================

    describe('initiateOrchestration', () => {
        it('should show modal when orchestration is initiated', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            // Set up iframe ref
            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            expect(result.current.isModalOpen).toBe(true)
        })

        it('should submit orchestration URL to iframe', async () => {
            const submitSpy = jest.spyOn(HTMLFormElement.prototype, 'submit')
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc&key=123',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            // Wait for the setTimeout in initiateOrchestration
            act(() => {
                jest.advanceTimersByTime(100)
            })

            expect(submitSpy).toHaveBeenCalled()
        })

        it('should queue orchestration URL when iframe ref is not yet available', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            // Don't set iframe ref

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            // Wait for the setTimeout
            act(() => {
                jest.advanceTimersByTime(100)
            })

            // With the new queuing behavior, no error is called - URL is queued
            // and will be submitted when iframe ref is set
            expect(defaultProps.onError).not.toHaveBeenCalled()
            expect(result.current.isModalOpen).toBe(true)
        })
    })

    // =========================================================================
    // PostMessage Handling Tests
    // =========================================================================

    describe('PostMessage Handling', () => {
        it('should call onSuccess when receiving success postMessage', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            // Simulate postMessage from same origin
            const messageData = {
                type: THREE_DS.POSTMESSAGE_TYPE,
                responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS,
                authenticationValue: 'CAVV123',
                eci: '05',
                continueUrl: '/checkout/confirmation/ORDER123'
            }

            act(() => {
                window.dispatchEvent(new MessageEvent('message', {
                    origin: window.location.origin,
                    data: messageData
                }))
            })

            expect(defaultProps.onSuccess).toHaveBeenCalledWith(messageData)
            expect(result.current.isModalOpen).toBe(false)
        })

        it('should call onDenied when receiving denied postMessage', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            const messageData = {
                type: THREE_DS.POSTMESSAGE_TYPE,
                responseStatus: THREE_DS.RESPONSE_STATUS.DENIED,
                error: 'Card not enrolled'
            }

            act(() => {
                window.dispatchEvent(new MessageEvent('message', {
                    origin: window.location.origin,
                    data: messageData
                }))
            })

            expect(defaultProps.onDenied).toHaveBeenCalledWith(messageData)
        })

        it('should call onError for non-success/non-denied status', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            const messageData = {
                type: THREE_DS.POSTMESSAGE_TYPE,
                responseStatus: THREE_DS.RESPONSE_STATUS.ERROR,
                error: 'System error'
            }

            act(() => {
                window.dispatchEvent(new MessageEvent('message', {
                    origin: window.location.origin,
                    data: messageData
                }))
            })

            expect(defaultProps.onError).toHaveBeenCalledWith(messageData)
        })

        it('should reject messages from unknown origins', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            const messageData = {
                type: THREE_DS.POSTMESSAGE_TYPE,
                responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
            }

            act(() => {
                window.dispatchEvent(new MessageEvent('message', {
                    origin: 'https://malicious.com',
                    data: messageData
                }))
            })

            // Should not call any callbacks
            expect(defaultProps.onSuccess).not.toHaveBeenCalled()
            expect(defaultProps.onDenied).not.toHaveBeenCalled()
            expect(defaultProps.onError).not.toHaveBeenCalled()
        })

        it('should accept messages from JPMC domain', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            const messageData = {
                type: THREE_DS.POSTMESSAGE_TYPE,
                responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
            }

            act(() => {
                window.dispatchEvent(new MessageEvent('message', {
                    origin: `https://secure${THREE_DS.JPMC_DOMAIN_SUFFIX}`,
                    data: messageData
                }))
            })

            expect(defaultProps.onSuccess).toHaveBeenCalledWith(messageData)
        })

        it('should accept messages from explicit JPMC_ORIGINS array (per SFRA)', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            const messageData = {
                type: THREE_DS.POSTMESSAGE_TYPE,
                responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
            }

            // Test explicit origin from JPMC_ORIGINS array
            act(() => {
                window.dispatchEvent(new MessageEvent('message', {
                    origin: THREE_DS.JPMC_ORIGINS[0], // https://payments.jpmorgan.com
                    data: messageData
                }))
            })

            expect(defaultProps.onSuccess).toHaveBeenCalledWith(messageData)
        })

        it('should ignore messages with wrong type', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            act(() => {
                window.dispatchEvent(new MessageEvent('message', {
                    origin: window.location.origin,
                    data: { type: 'someOtherType', responseStatus: 'SUCCESS' }
                }))
            })

            expect(defaultProps.onSuccess).not.toHaveBeenCalled()
        })

        it('should ignore messages with null data', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            act(() => {
                window.dispatchEvent(new MessageEvent('message', {
                    origin: window.location.origin,
                    data: null
                }))
            })

            expect(defaultProps.onSuccess).not.toHaveBeenCalled()
        })
    })

    // =========================================================================
    // Timeout Tests
    // =========================================================================

    describe('Timeout Handling', () => {
        it('should call onTimeout after timeout period', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            // Fast-forward timeout
            act(() => {
                jest.advanceTimersByTime(THREE_DS.TIMEOUT_MS)
            })

            expect(defaultProps.onTimeout).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: THREE_DS.FAILURE_REASON.TIMEOUT,
                    message: 'Authentication timed out.'
                })
            )
        })

        it('should call fail3DSOrderFn on timeout', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            act(() => {
                jest.advanceTimersByTime(THREE_DS.TIMEOUT_MS)
            })

            expect(defaultProps.fail3DSOrderFn).toHaveBeenCalledWith(
                'ORDER123',
                'TOKEN456',
                THREE_DS.FAILURE_REASON.TIMEOUT
            )
        })

        it('should not call onTimeout if postMessage received before timeout', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            // Send success message before timeout
            act(() => {
                window.dispatchEvent(new MessageEvent('message', {
                    origin: window.location.origin,
                    data: {
                        type: THREE_DS.POSTMESSAGE_TYPE,
                        responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                    }
                }))
            })

            // Fast-forward timeout
            act(() => {
                jest.advanceTimersByTime(THREE_DS.TIMEOUT_MS)
            })

            expect(defaultProps.onTimeout).not.toHaveBeenCalled()
        })

        it('should close modal on timeout', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            expect(result.current.isModalOpen).toBe(true)

            act(() => {
                jest.advanceTimersByTime(THREE_DS.TIMEOUT_MS)
            })

            expect(result.current.isModalOpen).toBe(false)
        })
    })

    // =========================================================================
    // Cancel Handling Tests
    // =========================================================================

    describe('Cancel Handling', () => {
        it('should call onCancel when handleCancel is called', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            act(() => {
                result.current.handleCancel()
            })

            expect(defaultProps.onCancel).toHaveBeenCalled()
        })

        it('should call fail3DSOrderFn on cancel', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            act(() => {
                result.current.handleCancel()
            })

            expect(defaultProps.fail3DSOrderFn).toHaveBeenCalledWith(
                'ORDER123',
                'TOKEN456',
                THREE_DS.FAILURE_REASON.USER_CANCELLED
            )
        })

        it('should close modal on cancel', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            expect(result.current.isModalOpen).toBe(true)

            act(() => {
                result.current.handleCancel()
            })

            expect(result.current.isModalOpen).toBe(false)
        })

        it('should not call onCancel twice', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            act(() => {
                result.current.handleCancel()
            })

            act(() => {
                result.current.handleCancel()
            })

            expect(defaultProps.onCancel).toHaveBeenCalledTimes(1)
        })
    })

    // =========================================================================
    // hideModal Tests
    // =========================================================================

    describe('hideModal', () => {
        it('should close modal and cleanup', async () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            expect(result.current.isModalOpen).toBe(true)

            act(() => {
                result.current.hideModal()
            })

            expect(result.current.isModalOpen).toBe(false)
        })
    })

    // =========================================================================
    // Cleanup Tests
    // =========================================================================

    describe('Cleanup', () => {
        it('should clear timeout on unmount', async () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')
            const { result, unmount } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            unmount()

            expect(clearTimeoutSpy).toHaveBeenCalled()
        })

        it('should remove event listener on unmount', async () => {
            const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener')
            const { result, unmount } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            unmount()

            expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function))
        })
    })

    // =========================================================================
    // setIframeRef Tests
    // =========================================================================

    describe('setIframeRef', () => {
        it('should set iframe reference correctly', () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            // Verify iframe ref is set by checking orchestration works
            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            act(() => {
                jest.advanceTimersByTime(100)
            })

            // Should not call onError if iframe is set correctly
            expect(defaultProps.onError).not.toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Iframe not available' })
            )
        })
    })

    // =========================================================================
    // Edge Cases
    // =========================================================================

    describe('Edge Cases', () => {
        it('should handle orchestration URL with special characters', () => {
            const { result } = renderHook(() => useThreeDS(defaultProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            expect(() => {
                act(() => {
                    result.current.initiateOrchestration(
                        'https://jpmc.com/3ds?token=abc&special=<>&value=test',
                        'ORDER123',
                        'TOKEN456'
                    )
                })
            }).not.toThrow()
        })

        it('should handle missing fail3DSOrderFn gracefully', async () => {
            const propsWithoutFail = {
                ...defaultProps,
                fail3DSOrderFn: undefined
            }

            const { result } = renderHook(() => useThreeDS(propsWithoutFail))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            // Cancel without fail3DSOrderFn should not throw
            expect(() => {
                act(() => {
                    result.current.handleCancel()
                })
            }).not.toThrow()
        })

        it('should handle undefined callbacks gracefully', async () => {
            const minimalProps = {
                onSuccess: undefined,
                onDenied: undefined,
                onError: undefined,
                onCancel: undefined,
                onTimeout: undefined
            }

            const { result } = renderHook(() => useThreeDS(minimalProps))

            act(() => {
                result.current.setIframeRef(mockIframe)
            })

            act(() => {
                result.current.initiateOrchestration(
                    'https://jpmc.com/3ds?token=abc',
                    'ORDER123',
                    'TOKEN456'
                )
            })

            // Should not throw even with undefined callbacks
            expect(() => {
                act(() => {
                    window.dispatchEvent(new MessageEvent('message', {
                        origin: window.location.origin,
                        data: {
                            type: THREE_DS.POSTMESSAGE_TYPE,
                            responseStatus: THREE_DS.RESPONSE_STATUS.SUCCESS
                        }
                    }))
                })
            }).not.toThrow()
        })
    })

    // =========================================================================
    // Default Export Test
    // =========================================================================

    describe('Default Export', () => {
        it('should export useThreeDS as default', () => {
            const defaultExport = require('../useThreeDS').default
            expect(defaultExport).toBe(useThreeDS)
        })
    })
})
