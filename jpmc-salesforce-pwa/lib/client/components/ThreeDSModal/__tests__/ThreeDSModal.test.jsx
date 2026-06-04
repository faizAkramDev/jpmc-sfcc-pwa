/**
 * Unit Tests for ThreeDSModal Component
 *
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ThreeDSModal from '../ThreeDSModal'

describe('ThreeDSModal Component', () => {
    const defaultProps = {
        isOpen: true,
        onCancel: jest.fn()
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        // Reset body overflow style
        document.body.style.overflow = ''
    })

    // =========================================================================
    // Rendering Tests
    // =========================================================================

    describe('Rendering', () => {
        it('should not render when isOpen is false', () => {
            render(<ThreeDSModal {...defaultProps} isOpen={false} />)

            expect(screen.queryByTestId('threeds-modal-overlay')).not.toBeInTheDocument()
        })

        it('should render when isOpen is true', () => {
            render(<ThreeDSModal {...defaultProps} />)

            expect(screen.getByTestId('threeds-modal-overlay')).toBeInTheDocument()
        })

        it('should render modal container', () => {
            render(<ThreeDSModal {...defaultProps} />)

            expect(screen.getByTestId('threeds-modal')).toBeInTheDocument()
        })

        it('should render iframe', () => {
            render(<ThreeDSModal {...defaultProps} />)

            expect(screen.getByTestId('threeds-iframe')).toBeInTheDocument()
        })

        it('should render cancel button', () => {
            render(<ThreeDSModal {...defaultProps} />)

            expect(screen.getByTestId('threeds-cancel-button')).toBeInTheDocument()
        })

        it('should render loading indicator initially', () => {
            render(<ThreeDSModal {...defaultProps} />)

            expect(screen.getByTestId('threeds-loading')).toBeInTheDocument()
        })

        it('should render default title', () => {
            render(<ThreeDSModal {...defaultProps} />)

            expect(screen.getByText('Card Verification')).toBeInTheDocument()
        })

        it('should render custom title', () => {
            render(<ThreeDSModal {...defaultProps} title="Payment Authentication" />)

            expect(screen.getByText('Payment Authentication')).toBeInTheDocument()
        })

        it('should render default cancel text', () => {
            render(<ThreeDSModal {...defaultProps} />)

            expect(screen.getByText('Cancel')).toBeInTheDocument()
        })

        it('should render custom cancel text', () => {
            render(<ThreeDSModal {...defaultProps} cancelText="Abort" />)

            expect(screen.getByText('Abort')).toBeInTheDocument()
        })
    })

    // =========================================================================
    // Accessibility Tests
    // =========================================================================

    describe('Accessibility', () => {
        it('should have role="dialog"', () => {
            render(<ThreeDSModal {...defaultProps} />)

            expect(screen.getByRole('dialog')).toBeInTheDocument()
        })

        it('should have aria-modal="true"', () => {
            render(<ThreeDSModal {...defaultProps} />)

            expect(screen.getByTestId('threeds-modal-overlay')).toHaveAttribute('aria-modal', 'true')
        })

        it('should have aria-labelledby pointing to title', () => {
            render(<ThreeDSModal {...defaultProps} />)

            const overlay = screen.getByTestId('threeds-modal-overlay')
            expect(overlay).toHaveAttribute('aria-labelledby', 'threeds-modal-title')
        })

        it('should have accessible cancel button', () => {
            render(<ThreeDSModal {...defaultProps} />)

            const button = screen.getByTestId('threeds-cancel-button')
            expect(button).toHaveAttribute('aria-label', 'Cancel verification')
        })

        it('should have iframe with title', () => {
            render(<ThreeDSModal {...defaultProps} />)

            const iframe = screen.getByTestId('threeds-iframe')
            expect(iframe).toHaveAttribute('title', '3D Secure Verification')
        })
    })

    // =========================================================================
    // Iframe Tests
    // =========================================================================

    describe('Iframe', () => {
        it('should have default iframe name', () => {
            render(<ThreeDSModal {...defaultProps} />)

            const iframe = screen.getByTestId('threeds-iframe')
            expect(iframe).toHaveAttribute('name', 'jpmc-3ds-iframe')
        })

        it('should use custom iframe name when provided', () => {
            render(<ThreeDSModal {...defaultProps} iframeName="custom-iframe" />)

            const iframe = screen.getByTestId('threeds-iframe')
            expect(iframe).toHaveAttribute('name', 'custom-iframe')
        })

        it('should have proper sandbox attributes', () => {
            render(<ThreeDSModal {...defaultProps} />)

            const iframe = screen.getByTestId('threeds-iframe')
            expect(iframe).toHaveAttribute('sandbox', 'allow-forms allow-scripts allow-same-origin allow-top-navigation')
        })

        it('should hide loading indicator when iframe loads', async () => {
            render(<ThreeDSModal {...defaultProps} />)

            const iframe = screen.getByTestId('threeds-iframe')

            // Initially loading should be visible
            expect(screen.getByTestId('threeds-loading')).toBeInTheDocument()

            // Simulate iframe load
            fireEvent.load(iframe)

            await waitFor(() => {
                expect(screen.queryByTestId('threeds-loading')).not.toBeInTheDocument()
            })
        })

        it('should call onIframeRef when provided', () => {
            const onIframeRef = jest.fn()
            render(<ThreeDSModal {...defaultProps} onIframeRef={onIframeRef} />)

            expect(onIframeRef).toHaveBeenCalled()
            expect(onIframeRef).toHaveBeenCalledWith(expect.any(HTMLIFrameElement))
        })

        it('should not call onIframeRef when not provided', () => {
            expect(() => {
                render(<ThreeDSModal {...defaultProps} />)
            }).not.toThrow()
        })
    })

    // =========================================================================
    // Cancel Behavior Tests
    // =========================================================================

    describe('Cancel Behavior', () => {
        it('should call onCancel when cancel button is clicked', () => {
            const onCancel = jest.fn()
            render(<ThreeDSModal {...defaultProps} onCancel={onCancel} />)

            fireEvent.click(screen.getByTestId('threeds-cancel-button'))

            expect(onCancel).toHaveBeenCalledTimes(1)
        })

        it('should call onCancel when Escape key is pressed', () => {
            const onCancel = jest.fn()
            render(<ThreeDSModal {...defaultProps} onCancel={onCancel} />)

            fireEvent.keyDown(document, { key: 'Escape' })

            expect(onCancel).toHaveBeenCalledTimes(1)
        })

        it('should not call onCancel for other keys', () => {
            const onCancel = jest.fn()
            render(<ThreeDSModal {...defaultProps} onCancel={onCancel} />)

            fireEvent.keyDown(document, { key: 'Enter' })
            fireEvent.keyDown(document, { key: 'Tab' })

            expect(onCancel).not.toHaveBeenCalled()
        })

        it('should not respond to Escape when modal is closed', () => {
            const onCancel = jest.fn()
            render(<ThreeDSModal {...defaultProps} isOpen={false} onCancel={onCancel} />)

            fireEvent.keyDown(document, { key: 'Escape' })

            expect(onCancel).not.toHaveBeenCalled()
        })
    })

    // =========================================================================
    // Body Overflow Tests
    // =========================================================================

    describe('Body Overflow', () => {
        it('should set body overflow to hidden when modal opens', () => {
            render(<ThreeDSModal {...defaultProps} />)

            expect(document.body.style.overflow).toBe('hidden')
        })

        it('should reset body overflow when modal closes', () => {
            const { rerender } = render(<ThreeDSModal {...defaultProps} />)

            expect(document.body.style.overflow).toBe('hidden')

            rerender(<ThreeDSModal {...defaultProps} isOpen={false} />)

            expect(document.body.style.overflow).toBe('')
        })

        it('should reset body overflow on unmount', () => {
            const { unmount } = render(<ThreeDSModal {...defaultProps} />)

            expect(document.body.style.overflow).toBe('hidden')

            unmount()

            expect(document.body.style.overflow).toBe('')
        })
    })

    // =========================================================================
    // Loading State Tests
    // =========================================================================

    describe('Loading State', () => {
        it('should show loading when modal first opens', () => {
            render(<ThreeDSModal {...defaultProps} />)

            expect(screen.getByTestId('threeds-loading')).toBeInTheDocument()
            expect(screen.getByText('Loading verification...')).toBeInTheDocument()
        })

        it('should reset loading state when modal reopens', async () => {
            const { rerender } = render(<ThreeDSModal {...defaultProps} />)

            // Simulate iframe load
            fireEvent.load(screen.getByTestId('threeds-iframe'))

            await waitFor(() => {
                expect(screen.queryByTestId('threeds-loading')).not.toBeInTheDocument()
            })

            // Close and reopen modal
            rerender(<ThreeDSModal {...defaultProps} isOpen={false} />)
            rerender(<ThreeDSModal {...defaultProps} isOpen={true} />)

            // Loading should be visible again
            expect(screen.getByTestId('threeds-loading')).toBeInTheDocument()
        })
    })

    // =========================================================================
    // Style Tests
    // =========================================================================

    describe('Styles', () => {
        it('should have overlay with fixed positioning', () => {
            render(<ThreeDSModal {...defaultProps} />)

            const overlay = screen.getByTestId('threeds-modal-overlay')
            expect(overlay).toHaveStyle({ position: 'fixed' })
        })

        it('should have overlay covering full viewport', () => {
            render(<ThreeDSModal {...defaultProps} />)

            const overlay = screen.getByTestId('threeds-modal-overlay')
            expect(overlay).toHaveStyle({
                top: '0',
                left: '0',
                right: '0',
                bottom: '0'
            })
        })

        it('should have high z-index for overlay', () => {
            render(<ThreeDSModal {...defaultProps} />)

            const overlay = screen.getByTestId('threeds-modal-overlay')
            expect(overlay).toHaveStyle({ zIndex: '9999' })
        })

        it('should have modal with white background', () => {
            render(<ThreeDSModal {...defaultProps} />)

            const modal = screen.getByTestId('threeds-modal')
            expect(modal).toHaveStyle({ backgroundColor: 'rgb(255, 255, 255)' })
        })
    })

    // =========================================================================
    // Event Cleanup Tests
    // =========================================================================

    describe('Event Cleanup', () => {
        it('should remove keydown listener when modal closes', () => {
            const onCancel = jest.fn()
            const { rerender } = render(<ThreeDSModal {...defaultProps} onCancel={onCancel} />)

            // Close modal
            rerender(<ThreeDSModal {...defaultProps} isOpen={false} onCancel={onCancel} />)

            // Escape should not trigger onCancel now
            fireEvent.keyDown(document, { key: 'Escape' })

            expect(onCancel).not.toHaveBeenCalled()
        })

        it('should remove keydown listener on unmount', () => {
            const onCancel = jest.fn()
            const { unmount } = render(<ThreeDSModal {...defaultProps} onCancel={onCancel} />)

            unmount()

            // Escape should not trigger onCancel
            fireEvent.keyDown(document, { key: 'Escape' })

            expect(onCancel).not.toHaveBeenCalled()
        })
    })

    // =========================================================================
    // PropTypes Tests
    // =========================================================================

    describe('PropTypes', () => {
        it('should accept all valid props', () => {
            const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

            render(
                <ThreeDSModal
                    isOpen={true}
                    onCancel={jest.fn()}
                    title="Test Title"
                    cancelText="Test Cancel"
                    iframeName="test-iframe"
                    onIframeRef={jest.fn()}
                />
            )

            expect(consoleError).not.toHaveBeenCalled()

            consoleError.mockRestore()
        })
    })
})
