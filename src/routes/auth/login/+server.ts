import { redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import type { RequestHandler } from './$types';
import { buildAuthorizationUrl, generateCodeVerifier, generateState } from '#lib/server/auth.ts';
import { isConfigured } from '#lib/server/config.ts';

const OAUTH_COOKIE = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: !dev,
	maxAge: 60 * 10
};

export const GET: RequestHandler = async ({ cookies, url }) => {
	if (!isConfigured()) {
		redirect(303, '/?error=not_configured');
	}

	const state = generateState();
	const codeVerifier = generateCodeVerifier();
	const redirectUri = new URL('/auth/callback', url.origin).toString();

	cookies.set('google_oauth_state', state, OAUTH_COOKIE);
	cookies.set('google_oauth_verifier', codeVerifier, OAUTH_COOKIE);

	const authorizationUrl = await buildAuthorizationUrl({ state, codeVerifier, redirectUri });
	redirect(302, authorizationUrl, { external: true });
};
