# JPMorgan Chase Payment Library for Salesforce PWA Kit

The JPMorgan Chase Payment Library integrates JPMorgan Payments Modern API with Salesforce Commerce Cloud PWA Kit to provide a comprehensive payment solution for e-commerce merchants.

## Overview

This library enables seamless integration of JPMorgan Chase payment services with PWA Kit, offering secure and reliable payment processing capabilities for online merchants.

## Features

### Payment Methods
- **Credit Card Payments**: Full credit card processing with enhanced security
- **Google Pay**: Digital wallet integration for Web
- **Apple Pay**: Digital wallet integration for Web (Safari)

### Credit Card Features
- **Page Encryption**: Client-side encryption using the PIE SDK for PCI-compliant card data handling
- **Tokenization**: Secure token-based payment processing
- **AVS (Address Verification System)**: Address verification for fraud prevention
- **Saved Card Payments**: Secure storage and reuse of customer payment methods
- **Authorization**: Payment authorization processing
- **3D Secure**: 3DS authentication challenge flow support

### Security & Compliance
- PCI DSS compliant payment processing
- End-to-end encryption
- Secure tokenization
- Fraud prevention tools (optional Kount integration)
- Content Security Policy (CSP) middleware

## Technical Requirements

- Node.js 18+
- npm 9+
- Salesforce PWA Kit (`@salesforce/pwa-kit-runtime` >=3.0.0)
- JPMorgan Commerce Platform credentials (OAuth2 private key and certificate)
- SFCC Business Manager access for site preference configuration

## Installation

```bash
npm install @jpmorgan/jpmorgan-salesforce-pwa
```

## Development Scripts

- `npm run build` - Build the library
- `npm test` - Run unit tests
- `npm run lint` - Run linting

## Package Structure

- `lib/ssr` - Server-side Express middleware, API route registration, and OAuth authentication
- `lib/client` - React context providers, hooks, and components for the browser
- `lib/services` - Payment API clients, PIE SDK encryption, and Google/Apple Pay services
- `lib/utils` - Shared utilities, validation, and formatting helpers

## Configuration

Configure the payment settings in Business Manager:
1. Navigate to Merchant Tools > Site Preferences > Custom Preferences
2. Configure JPMorgan Chase payment credentials and options
3. Enable desired payment methods

Set sensitive credentials (private key, certificate) as environment variables in your MRT environment — never in Business Manager.

## Support

This library is fully supported by JPMorgan Chase Payments.

For technical support and documentation, please contact your JPMorgan Chase representative.

## License

Copyright © 2026 JPMorgan Chase & Co. All rights reserved.
