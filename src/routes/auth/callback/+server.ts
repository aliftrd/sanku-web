import { redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import type { RequestHandler } from './$types';
import { AuthError, exchangeCode, fetchGoogleUser } from '#lib/server/auth.ts';
import { ensureWorkspace, SheetsError } from '#lib/server/sheets.ts';
import { setSession, type Session } from '#lib/server/session.ts';

const OAUTH_COOKIES = ['google_oauth_state', 'google_oauth_verifier'];

export const GET: RequestHandler = async ({ cookies, url }) => {
	const providerError = url.searchParams.get('error');
	if (providerError) {
		redirect(303, `/?error=${encodeURIComponent(providerError)}`);
	}

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('google_oauth_state');
	const codeVerifier = cookies.get('google_oauth_verifier');

	for (const name of OAUTH_COOKIES) {
		cookies.delete(name, { path: '/' });
	}

	if (!code || !state || !storedState || state !== storedState || !codeVerifier) {
		redirect(303, '/?error=invalid_request');
	}

	let session: Session;

	try {
		const redirectUri = new URL('/auth/callback', url.origin).toString();
		const tokens = await exchangeCode({ code, codeVerifier, redirectUri });

		if (!tokens.refresh_token) {
			throw new AuthError('Google did not return a refresh token.', 'missing_refresh_token');
		}

		const user = await fetchGoogleUser(tokens.access_token);
		const workspace = await ensureWorkspace(tokens.access_token);

		session = {
			user: {
				sub: user.sub,
				email: user.email,
				name: user.name?.trim() || user.email.split('@')[0],
				picture: user.picture ?? null
			},
			refreshToken: tokens.refresh_token,
			...workspace
		};
	} catch (error) {
		console.error('Google sign-in failed:', error);

		let reason = 'unknown';
		if (error instanceof AuthError) {
			reason = `auth_${error.code ?? 'unknown'}`;
		} else if (error instanceof SheetsError) {
			reason = `sheets_${error.status}`;
		} else if (error instanceof Error && error.message.includes('did not return')) {
			reason = 'workspace';
		}

		const params = new URLSearchParams({ error: 'auth_failed', reason });
		// Surface the real Google error locally, but never in production.
		if (dev && error instanceof Error) {
			params.set('detail', error.message.slice(0, 300));
		}

		redirect(303, `/?${params.toString()}`);
	}

	await setSession(cookies, session);
	redirect(303, '/app');
};
