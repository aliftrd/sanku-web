import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSession } from '#lib/server/session.ts';

export const POST: RequestHandler = async ({ cookies }) => {
	clearSession(cookies);
	redirect(303, '/');
};
