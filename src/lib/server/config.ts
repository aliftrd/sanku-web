import {
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET,
	SESSION_SECRET
} from '$app/env/private';

export type Config = {
	clientId: string;
	clientSecret: string;
	sessionSecret: string;
};

/**
 * Returns the app configuration, or null when the required environment
 * variables have not been supplied yet. Keeping this lazy means the landing
 * page can still render (with a setup hint) before OAuth is configured.
 */
export function getConfig(): Config | null {
	const clientId = GOOGLE_CLIENT_ID;
	const clientSecret = GOOGLE_CLIENT_SECRET;
	const sessionSecret = SESSION_SECRET;

	if (!clientId || !clientSecret || !sessionSecret || sessionSecret.length < 32) {
		return null;
	}

	return { clientId, clientSecret, sessionSecret };
}

export function isConfigured(): boolean {
	return getConfig() !== null;
}

export function requireConfig(): Config {
	const config = getConfig();
	if (!config) {
		throw new Error(
			'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SESSION_SECRET (32+ characters).'
		);
	}
	return config;
}
