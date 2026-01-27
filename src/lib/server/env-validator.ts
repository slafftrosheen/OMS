// src/lib/server/env-validator.ts
import { building, dev } from '$app/environment';

interface EnvValidationRule {
    key: string;
    required: boolean;
    pattern?: RegExp;
    errorMessage?: string;
}

const validationRules: EnvValidationRule[] = [
    {
        key: 'PUBLIC_SUPABASE_URL',
        required: true,
        pattern: /^https:\/\/.+\.supabase\.co$/,
        errorMessage: 'Must be a valid Supabase URL'
    },
    {
        key: 'PUBLIC_SUPABASE_ANON_KEY',
        required: true,
        pattern: /^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/,
        errorMessage: 'Must be a valid JWT token'
    },
    {
        key: 'SUPABASE_SERVICE_ROLE_KEY',
        required: true,
        pattern: /^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/,
        errorMessage: 'Must be a valid JWT token'
    }
];

const insecurePatterns = [
    { pattern: /^(secret|test|dev|demo|example|change)/i, message: 'Contains insecure default value' },
    { pattern: /^(123|password|admin|root)/i, message: 'Contains weak credential' },
    { pattern: /^(.)\1{7,}/, message: 'Contains repeated characters' }
];

export function validateEnvironment(): { valid: boolean; errors: string[] } {
    if (building) return { valid: true, errors: [] };

    const errors: string[] = [];

    // Check required variables
    for (const rule of validationRules) {
        const value = process.env[rule.key];

        if (rule.required && !value) {
            errors.push(`❌ Missing required: ${rule.key}`);
            continue;
        }

        if (value && rule.pattern && !rule.pattern.test(value)) {
            errors.push(`❌ Invalid format for ${rule.key}: ${rule.errorMessage}`);
        }
    }

    // Check for insecure values in production
    if (!dev) {
        const sensitiveKeys = ['SESSION_SECRET', 'JWT_SECRET', 'DATABASE_PASSWORD'];
        
        for (const key of sensitiveKeys) {
            const value = process.env[key];
            if (!value) continue;

            for (const { pattern, message } of insecurePatterns) {
                if (pattern.test(value)) {
                    errors.push(`⚠️  SECURITY: ${key} ${message.toLowerCase()}`);
                }
            }

            if (value.length < 32) {
                errors.push(`⚠️  SECURITY: ${key} is too short (minimum 32 characters)`);
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

export function enforceEnvironmentSecurity() {
    const { valid, errors } = validateEnvironment();

    if (!valid) {
        console.error('\n🚨 ENVIRONMENT VALIDATION FAILED:\n');
        errors.forEach(error => console.error(error));
        console.error('\n');

        if (!dev) {
            throw new Error('Environment validation failed. Cannot start in production mode.');
        } else {
            console.warn('⚠️  Running in development mode with validation warnings\n');
        }
    } else {
        console.log('✅ Environment validation passed\n');
    }
}
