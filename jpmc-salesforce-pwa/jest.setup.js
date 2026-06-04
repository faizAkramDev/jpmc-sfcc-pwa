// Jest setup file
import '@testing-library/jest-dom'

// Mock window.JPMorganEncryption
global.window = {
    JPMorganEncryption: {
        isReady: jest.fn(() => true),
        init: jest.fn(),
        encrypt: jest.fn(async (data) => {
            return `encrypted_${Buffer.from(JSON.stringify(data)).toString('base64')}`
        }),
        version: '1.0.0'
    }
}

// Suppress console errors in tests
global.console = {
    ...console,
    error: jest.fn(),
    warn: jest.fn()
}
