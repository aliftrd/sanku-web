import type { Handle } from '@sveltejs/kit/hooks';
import { readSession } from '#lib/server/session.ts';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.session = await readSession(event.cookies);
	return resolve(event);
};
