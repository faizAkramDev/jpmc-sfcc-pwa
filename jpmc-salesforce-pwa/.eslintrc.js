module.exports = {
    env: {
        browser: true,
        es2021: true,
        node: true,
        jest: true
    },
    extends: [
        'eslint:recommended',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        'prettier'
    ],
    parserOptions: {
        ecmaFeatures: {
            jsx: true
        },
        ecmaVersion: 'latest',
        sourceType: 'module'
    },
    plugins: [
        'react',
        'react-hooks'
    ],
    rules: {
        'react/react-in-jsx-scope': 'off',
        'react/prop-types': 'warn',
        'no-unused-vars': ['warn', {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_'
        }],
        // Allow console.log/info for payment debugging - these are intentional
        'no-console': ['warn', {
            allow: ['warn', 'error', 'info', 'log']
        }]
    },
    settings: {
        react: {
            version: 'detect'
        }
    }
}
