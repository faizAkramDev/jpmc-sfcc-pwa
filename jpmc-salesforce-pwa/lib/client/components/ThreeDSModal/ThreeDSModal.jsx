/**
 * ThreeDSModal Component
 * 
 * Modal component for displaying 3D Secure authentication challenge.
 * Contains a hidden iframe that loads JPMC's orchestration URL.
 * 
 * @module client/components/ThreeDSModal
 */

import React, { useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'

/**
 * Modal overlay styles - covers the entire viewport
 */
const overlayStyles = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999
}

/**
 * Modal container styles
 */
const modalStyles = {
    position: 'relative',
    backgroundColor: '#fff',
    borderRadius: '8px',
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
}

/**
 * Modal header styles
 */
const headerStyles = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #e0e0e0'
}

/**
 * Header title styles
 */
const titleStyles = {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#333'
}

/**
 * Cancel button styles
 */
const cancelButtonStyles = {
    padding: '8px 16px',
    backgroundColor: '#f5f5f5',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#666',
    transition: 'background-color 0.2s'
}

/**
 * Modal body styles (contains iframe)
 */
const bodyStyles = {
    flex: 1,
    overflow: 'hidden',
    minHeight: '400px'
}

/**
 * Iframe styles - fills the modal body
 */
const iframeStyles = {
    width: '100%',
    height: '100%',
    minHeight: '400px',
    border: 'none'
}

/**
 * Loading indicator styles
 */
const loadingStyles = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    textAlign: 'center',
    color: '#666'
}


/**
 * ThreeDSModal - 3D Secure authentication modal
 * 
 * Renders a modal overlay with an iframe for 3DS challenge.
 * The iframe is targeted by the form submission from orchestrationFormSubmit().
 * 
 * For frictionless flows, the modal is rendered (so iframe exists) but kept
 * invisible until isVisible becomes true. This prevents showing a spinner
 * for quick frictionless authentications.
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether modal is rendered (controls iframe existence)
 * @param {boolean} [props.isVisible=true] - Whether modal is visible to user (for frictionless delay)
 * @param {Function} props.onCancel - Called when user clicks cancel
 * @param {string} [props.title] - Modal title
 * @param {string} [props.cancelText] - Cancel button text
 * @param {string} [props.iframeName] - Name attribute for iframe (for form targeting)
 * @param {Function} [props.onIframeRef] - Callback to receive iframe ref
 * 
 * @example
 * <ThreeDSModal
 *     isOpen={show3DSModal}
 *     isVisible={show3DSSpinner}
 *     onCancel={handleCancel}
 *     onIframeRef={(ref) => setIframeRef(ref)}
 * />
 */
function ThreeDSModal({
    isOpen,
    isVisible = true,
    onCancel,
    title = 'Card Verification',
    cancelText = 'Cancel',
    iframeName = 'jpmc-3ds-iframe',
    onIframeRef
}) {
    const [isLoading, setIsLoading] = React.useState(true)

    const iframeRefCallback = useCallback((node) => {
        if (node && onIframeRef) {
            onIframeRef(node)
        }
    }, [onIframeRef])

    const handleIframeLoad = useCallback(() => {
        setIsLoading(false)
    }, [])

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true)
        }
    }, [isOpen])

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && isOpen && onCancel) {
                onCancel()
            }
        }

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown)
            document.body.style.overflow = 'hidden'
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            document.body.style.overflow = ''
        }
    }, [isOpen, onCancel])

    if (!isOpen) {
        return null
    }
    
    const hiddenOverlayStyles = {
        ...overlayStyles,
        opacity: 0,
        pointerEvents: 'none'
    }

    return (
        <div
            style={isVisible ? overlayStyles : hiddenOverlayStyles}
            role="dialog"
            aria-modal="true"
            aria-labelledby="threeds-modal-title"
            aria-hidden={!isVisible}
            data-testid="threeds-modal-overlay"
        >
            <div style={modalStyles} data-testid="threeds-modal">
                {/* Header */}
                <div style={headerStyles}>
                    <h2 id="threeds-modal-title" style={titleStyles}>
                        {title}
                    </h2>
                    <button
                        id="jpmc-3ds-cancel-btn"
                        type="button"
                        style={cancelButtonStyles}
                        onClick={onCancel}
                        aria-label="Cancel verification"
                        data-testid="threeds-cancel-button"
                    >
                        {cancelText}
                    </button>
                </div>

                {/* Body with iframe */}
                <div style={bodyStyles}>
                    {isLoading && (
                        <div style={loadingStyles} data-testid="threeds-loading">
                            <div>Loading verification...</div>
                        </div>
                    )}
                    <iframe
                        ref={iframeRefCallback}
                        name={iframeName}
                        title="3D Secure Verification"
                        style={iframeStyles}
                        onLoad={handleIframeLoad}
                        sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation"
                        data-testid="threeds-iframe"
                    />
                </div>
            </div>
        </div>
    )
}

ThreeDSModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    isVisible: PropTypes.bool,
    onCancel: PropTypes.func.isRequired,
    title: PropTypes.string,
    cancelText: PropTypes.string,
    iframeName: PropTypes.string,
    onIframeRef: PropTypes.func
}

export default ThreeDSModal
