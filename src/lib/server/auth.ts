import { requireConfig } from './config';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

/**
 * `drive.file` lets the app create and manage only the spreadsheet it makes.
 * It cannot see the rest of the user's Drive.
 */
const SCOPES = [
	'openid',
	'email',
	'profile',
	'https://www.googleapis.com/auth/drive.file'
] as const;

type TokenResponse = {
	access_token: string;
	expires_in: number;
	refresh_token?: string;
	scope: string;
	token_type: string;
	id_token?: string;
};

export type GoogleUser = {
	sub: string;
	email: string;
	email_verified?: boolean;
	name?: string;
	picture?: string;
};

export class AuthError extends Error {
	constructor(
		message: string,
		public readonly code: string | null = null
	) {
		super(message);
		this.name = 'AuthError';
	}
}

function base64url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateState(): string {
	return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export function generateCodeVerifier(): string {
	return base64url(crypto.getRandomValues(new Uint8Array(64)));
}

export async function codeChallenge(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return base64url(new Uint8Array(digest));
}

export async function buildAuthorizationUrl(options: {
	state: string;
	codeVerifier: string;
	redirectUri: string;
}): Promise<string> {
	const config = requireConfig();
	const challenge = await codeChallenge(options.codeVerifier);

	const params = new URLSearchParams({
		client_id: config.clientId,
		redirect_uri: options.redirectUri,
		response_type: 'code',
		scope: SCOPES.join(' '),
		state: options.state,
		code_challenge: challenge,
		code_challenge_method: 'S256',
		// Ask for a refresh token so sessions survive the one-hour access token.
		access_type: 'offline',
		prompt: 'consent',
		include_granted_scopes: 'true'
	});

	return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function readTokenResponse(response: Response): Promise<TokenResponse> {
	if (!response.ok) {
		let code: string | null = null;
		let description = `Google token request failed (${response.status})`;

		try {
			const body = (await response.json()) as { error?: string; error_description?: string };
			code = body.error ?? null;
			if (body.error_description) description = body.error_description;
		} catch {
			// Ignore a non-JSON error body.
		}

		throw new AuthError(description, code);
	}

	return (await response.json()) as TokenResponse;
}

export async function exchangeCode(options: {
	code: string;
	codeVerifier: string;
	redirectUri: string;
}): Promise<TokenResponse> {
	const config = requireConfig();

	const response = await fetch(TOKEN_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code: options.code,
			client_id: config.clientId,
			client_secret: config.clientSecret,
			redirect_uri: options.redirectUri,
			grant_type: 'authorization_code',
			code_verifier: options.codeVerifier
		})
	});

	return readTokenResponse(response);
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
	const config = requireConfig();

	const response = await fetch(TOKEN_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			refresh_token: refreshToken,
			client_id: config.clientId,
			client_secret: config.clientSecret,
			grant_type: 'refresh_token'
		})
	});

	const tokens = await readTokenResponse(response);
	return tokens.access_token;
}

export async function fetchGoogleUser(accessToken: string): Promise<GoogleUser> {
	const response = await fetch(USERINFO_ENDPOINT, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});

	if (!response.ok) {
		throw new AuthError(`Could not load your Google profile (${response.status}).`);
	}

	const user = (await response.json()) as GoogleUser;

	if (!user.sub || !user.email) {
		throw new AuthError('Google did not return an email address for this account.');
	}

	if (user.email_verified === false) {
		throw new AuthError('Your Google email address is not verified.');
	}

	return user;
}
