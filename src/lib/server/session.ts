import { EncryptJWT, jwtDecrypt, type JWTPayload } from 'jose';
import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/env';
import { getConfig, requireConfig } from './config';
import type { SheetIds } from '#lib/types.ts';

export const SESSION_COOKIE = 'sanku_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type SessionUser = {
	sub: string;
	email: string;
	name: string;
	picture: string | null;
};

export type Session = {
	user: SessionUser;
	refreshToken: string;
	/** The Google Sheet that backs this account. */
	spreadsheetId?: string;
	/** Numeric ids of the tabs inside the spreadsheet. */
	sheetIds?: SheetIds;
};

const keyCache = new Map<string, Uint8Array>();

async function getKey(secret: string): Promise<Uint8Array> {
	const cached = keyCache.get(secret);
	if (cached) return cached;

	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
	const key = new Uint8Array(digest);
	keyCache.set(secret, key);
	return key;
}

export async function sealSession(session: Session, secret: string): Promise<string> {
	const key = await getKey(secret);
	return new EncryptJWT(session as unknown as JWTPayload)
		.setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
		.setIssuedAt()
		.setExpirationTime(`${SESSION_MAX_AGE}s`)
		.encrypt(key);
}

export async function readSession(cookies: Cookies): Promise<Session | null> {
	const config = getConfig();
	if (!config) return null;

	const token = cookies.get(SESSION_COOKIE);
	if (!token) return null;

	try {
		const { payload } = await jwtDecrypt(token, await getKey(config.sessionSecret));
		const session = payload as unknown as Session;

		if (
			!session.user?.sub ||
			!session.user?.email ||
			!session.refreshToken ||
			typeof session.refreshToken !== 'string'
		) {
			return null;
		}

		return session;
	} catch {
		// Expired, tampered with, or signed with a different secret.
		return null;
	}
}

export async function setSession(cookies: Cookies, session: Session): Promise<void> {
	const config = requireConfig();
	const token = await sealSession(session, config.sessionSecret);

	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: SESSION_MAX_AGE
	});
}

export function clearSession(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
