// src/lib/server/config/validate.ts
import { dev } from '$app/environment';

interface ConfigValidation {
	key: string;
	required: boolean;
	validator?: (value: string) => boolean;
	errorMessage?: string;
}

const configSchema: ConfigValidation[] = [
	{
		key: 'DATABASE_URL',
		required: true,
		validator: (value) => {
			if (dev) return true;
			// In production, check for insecure defaults
			const insecurePatterns = [
				/password=admin/i,
				/password=postgres/i,
				/password=123456/,
				/password=test/i
			];
			return !insecurePatterns.some((pattern) => pattern.test(value));
		},
		errorMessage: 'DATABASE_URL contains insecure default password in production'
	},
	{
		key: 'SUPABASE_URL',
		required: true,
		validator: (value) => value.startsWith('https://'),
		errorMessage: 'SUPABASE_URL must start with https://'
	},
	{
		key: 'SUPABASE_ANON_KEY',
		required: true
	},
	{
		key: 'SUPABASE_SERVICE_ROLE_KEY',
		required: !dev
	},
	{
		key: 'SESSION_SECRET',
		required: true,
		validator: (value) => {
			if (dev) return value.length >= 16;
			// Production: must be strong and not default
			return (
				value.length >= 32 &&
				!/^(secret|test|dev|password)/i.test(value)
			);
		},
		errorMessage: 'SESSION_SECRET must be at least 32 characters in production and not use default values'
	},
	{
		key: 'JWT_SECRET',
		required: true,
		validator: (value) => {
			if (dev) return value.length >= 16;
			return (
				value.length >= 32 &&
				!/^(secret|test|dev|password)/i.test(value)
			);
		},
		errorMessage: 'JWT_SECRET must be at least 32 characters in production and not use default values'
	}
];

export function validateConfig(): void {
	const errors: string[] = [];

	for (const config of configSchema) {
		const value = process.env[config.key];

		// Check if required
		if (config.required && !value) {
			errors.push(`Missing required environment variable: ${config.key}`);
			continue;
		}

		// Run custom validator if present
		if (value && config.validator && !config.validator(value)) {
			errors.push(
				config.errorMessage || `Invalid value for ${config.key}`
			);
		}
	}

	if (errors.length > 0) {
		console.error('❌ Configuration Validation Failed:\n');
		errors.forEach((error) => console.error(`   - ${error}`));
		console.error('\n📖 See docs/configuration.md for setup instructions\n');
		process.exit(1);
	}

	console.log('✅ Configuration validated successfully');
}

// Generate secure random secrets
export function generateSecret(length: number = 32): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
	let result = '';
	const randomValues = new Uint8Array(length);
	crypto.getRandomValues(randomValues);
	
	for (let i = 0; i < length; i++) {
		result += chars[randomValues[i] % chars.length];
	}
	
	return result;
}
