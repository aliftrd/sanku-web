import { defineEnvVars } from '@sveltejs/kit/env';

/**
 * SvelteKit 3 exposes declared environment variables through
 * `$app/env/private` (server) and `$app/env/public` (client).
 */
export const variables = defineEnvVars({
	GOOGLE_CLIENT_ID: {
		description: 'OAuth 2.0 client id from Google Cloud Console.',
		schema: (value) => value?.trim() || undefined
	},
	GOOGLE_CLIENT_SECRET: {
		description: 'OAuth 2.0 client secret from Google Cloud Console.',
		schema: (value) => value?.trim() || undefined
	},
	SESSION_SECRET: {
		description: 'Random secret (32+ characters) used to encrypt the session cookie.',
		schema: (value) => value?.trim() || undefined
	}
});
