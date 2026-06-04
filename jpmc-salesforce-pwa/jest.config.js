module.exports = {
    testEnvironment: 'jsdom',
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    moduleNameMapper: {
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/__mocks__/fileMock.js'
    },
    transform: {
        '^.+\\.(js|jsx|mjs)$': ['babel-jest', {
            presets: [
                ['@babel/preset-env', {targets: {node: 'current'}}],
                ['@babel/preset-react', {runtime: 'automatic'}]
            ]
        }]
    },
    transformIgnorePatterns: [
        'node_modules/(?!(@salesforce)/)'
    ],
    collectCoverageFrom: [
        'lib/**/*.{js,jsx,mjs}',
        '!lib/**/*.test.{js,jsx}',
        '!lib/**/tests/**',
        '!lib/**/index.js',
        '!lib/utils/constants.mjs',
        '!lib/utils/constants/**'
    ],
    coverageReporters: ['text', 'lcov', 'clover', 'json'],
    testMatch: [
        '**/__tests__/**/*.[jt]s?(x)',
        '**/?(*.)+(spec|test).[jt]s?(x)'
    ]
}
