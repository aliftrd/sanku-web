import type { Session } from '#lib/server/session.ts';

declare global {
	namespace App {
		interface Locals {
			session: Session | null;
		}
	}
}

export {};
