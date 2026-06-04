const path = require('path')

/**
 * Webpack Configuration for @jpmorgan/jpmorgan-salesforce-pwa
 * 
 * Creates THREE separate builds:
 * 1. Client bundle (lib/client) - Browser-safe, React hooks
 * 2. SSR bundle (lib/ssr) - Express middleware, routes, CSP
 * 3. Main bundle (lib) - Combined exports (backward compat)
 * 
 * Import paths:
 * - Client: '@jpmorgan/jpmorgan-salesforce-pwa/client'
 * - SSR: '@jpmorgan/jpmorgan-salesforce-pwa/ssr'
 * - Full: '@jpmorgan/jpmorgan-salesforce-pwa' (backward compat)
 */

const commonConfig = {
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            ['@babel/preset-env', {
                                targets: {node: '18'}
                            }],
                            ['@babel/preset-react', {
                                runtime: 'automatic'
                            }]
                        ]
                    }
                }
            },
            {
                test: /\.mjs$/,
                include: /node_modules/,
                type: 'javascript/auto'
            }
        ]
    },
    resolve: {
        extensions: ['.js', '.jsx', '.mjs', '.json']
    },
    mode: process.env.NODE_ENV || 'production',
    // Disable code splitting - bundle everything into single file
    // This avoids dynamic chunk loading issues on MRT
    optimization: {
        splitChunks: false
    }
}

// Client bundle - browser-safe, hooks only
// NOTE: Must NOT use target: 'web' alone, as this bundle is also required during SSR
// PWA Kit does server-side rendering, so React components run in Node first
const clientConfig = {
    ...commonConfig,
    name: 'client',
    entry: './lib/client/index.js',
    output: {
        path: path.resolve(__dirname, 'dist/lib/client'),
        filename: 'index.js',
        libraryTarget: 'commonjs2',
        publicPath: '/',
        clean: true
    },
    externals: {
        // React - provided by PWA Kit host app
        react: 'react',
        // Kount SDK - dynamically imported at runtime, don't bundle
        '@kount/kount-web-client-sdk': '@kount/kount-web-client-sdk'
    },
    // Target node for SSR compatibility - PWA Kit renders on server first
    // Browser-specific code (like useEffect callbacks) only runs client-side
    target: 'node'
}

// SSR bundle - Express middleware, routes, CSP (Node.js only)
// Bundle body-parser and helmet since they're simple dependencies
const ssrConfig = {
    ...commonConfig,
    name: 'ssr',
    entry: './lib/ssr/index.js',
    output: {
        path: path.resolve(__dirname, 'dist/lib/ssr'),
        filename: 'index.js',
        libraryTarget: 'commonjs2',
        clean: true
    },
    externals: {
        // React - provided by PWA Kit host app
        react: 'react'
        // Note: body-parser and helmet are BUNDLED, not external
    },
    // Target node for SSR bundle
    target: 'node'
}

// Main bundle - full exports (server-side, backward compatible)
const mainConfig = {
    ...commonConfig,
    name: 'main',
    entry: './lib/index.js',
    output: {
        path: path.resolve(__dirname, 'dist/lib'),
        filename: 'index.js',
        libraryTarget: 'commonjs2',
        clean: false // Don't clean - client/ssr builds exist
    },
    externals: {
        // React - provided by PWA Kit host app
        react: 'react',
        // Kount SDK - dynamically imported at runtime, don't bundle
        '@kount/kount-web-client-sdk': '@kount/kount-web-client-sdk'
        // Note: body-parser and helmet are BUNDLED, not external
    },
    // Target node - this bundle is for server-side only
    target: 'node'
}

// Export all three configurations
module.exports = [clientConfig, ssrConfig, mainConfig]
