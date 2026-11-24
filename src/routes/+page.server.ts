import { redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import type { PageServerLoad } from './$types';
import { isConfigured } from '#lib/server/config.ts';

const ERROR_MESSAGES: Record<string, string> = {
	access_denied: 'Sign-in was cancelled. No changes were made.',
	auth_failed: 'Google sign-in did not complete. Please try again.',
	session_expired: 'Your session has expired. Sign in again to reach your dashboard.',
	invalid_request: 'That sign-in link was invalid or has expired. Please try again.',
	not_configured: 'Google sign-in is not configured on this deployment yet.',
	sheets_unavailable: 'We could not reach your finance sheet. Please sign in again.'
};

const REASON_MESSAGES: Record<string, string> = {
	auth_invalid_client:
		'Google rejected the OAuth client credentials. Double-check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env, then restart the dev server.',
	auth_invalid_grant: 'The sign-in code expired or was already used. Please try signing in again.',
	auth_redirect_uri_mismatch:
		'The redirect URI does not match Google Cloud Console. It must be exactly http://localhost:3000/auth/callback.',
	auth_missing_refresh_token:
		'Google did not return a refresh token. Remove the app from your Google Account permissions, then sign in again.',
	sheets_401: 'Google rejected the access token. Please sign in again.',
	sheets_403:
		'Google denied access. Enable both the Google Sheets API and the Google Drive API in the same Google Cloud project, then try again.',
	sheets_404: 'Sanku could not find or create its spreadsheet in your Google Drive.',
	sheets_429: 'Google is rate-limiting requests. Wait a minute, then try again.',
	workspace: 'Sanku could not create its spreadsheet. Check that the Drive and Sheets APIs are enabled.'
};

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.session) {
		redirect(303, '/app');
	}

	const errorCode = url.searchParams.get('error');
	const reason = url.searchParams.get('reason');
	const detail = dev ? url.searchParams.get('detail') : null;

	const baseError = errorCode
		? (ERROR_MESSAGES[errorCode] ?? 'Something went wrong. Please try again.')
		: null;

	return {
		configured: isConfigured(),
		showSetupHint: dev && !isConfigured(),
		error: reason && REASON_MESSAGES[reason] ? REASON_MESSAGES[reason] : baseError,
		detail
	};
};
