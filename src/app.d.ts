import type { Session } from '#lib/server/session.ts';

declare global {
	namespace App {
		interface Locals {
			session: Session | null;
		}
		interface Platform {
			context?: {
				waitUntil(promise: Promise<unknown>): void;
			};
			caches?: {
				default?: {
					match(request: Request | string): Promise<Response | undefined>;
					put(request: Request | string, response: Response): Promise<void>;
				};
			};
		}
	}
}

export {};
