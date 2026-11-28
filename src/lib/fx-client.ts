export type ClientFxSource = 'identity' | 'live' | 'cache' | 'stale' | 'fallback';

export interface ClientFxResult {
	rate: number;
	source: ClientFxSource;
	updatedAt: string | null;
}

interface CachedClientEntry extends ClientFxResult {
	expiresAt: number;
}

const CLIENT_FRESH_TTL_MS = 30 * 60 * 1000; // 30 minutes per browser tab
const CLIENT_FALLBACK_TTL_MS = 2 * 60 * 1000; // 2 minutes for stale/fallback
const FORCE_REFRESH_THROTTLE_MS = 60 * 1000; // Prevent spam clicking "Kurs Live"

const sessionFxCache = new Map<string, CachedClientEntry>();
const inFlightClientFx = new Map<string, Promise<ClientFxResult | null>>();
const lastForcedAt = new Map<string, number>();

/** Fetch and deduplicate exchange rates in the browser with per-tab session caching. */
export async function fetchClientFxRate(
	fromCode: string,
	toCode: string,
	options?: { forceRefresh?: boolean }
): Promise<ClientFxResult | null> {
	const from = fromCode.trim().toUpperCase();
	const to = toCode.trim().toUpperCase();

	if (from === to) {
		return { rate: 1, source: 'identity', updatedAt: null };
	}

	const key = `${from}->${to}`;
	const now = Date.now();
	const cached = sessionFxCache.get(key);
	const wantsForce = Boolean(options?.forceRefresh);
	const canForce = wantsForce && now - (lastForcedAt.get(key) ?? 0) >= FORCE_REFRESH_THROTTLE_MS;

	if (!canForce && cached && now < cached.expiresAt) {
		return {
			rate: cached.rate,
			source: cached.source,
			updatedAt: cached.updatedAt
		};
	}

	const existingFlight = inFlightClientFx.get(key);
	if (existingFlight) {
		return existingFlight;
	}

	if (canForce) {
		lastForcedAt.set(key, now);
	}

	const flight = (async (): Promise<ClientFxResult | null> => {
		try {
			const query = `/api/fx?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${canForce ? '&refresh=1' : ''}`;
			const res = await fetch(query, {
				cache: canForce ? 'no-cache' : 'default'
			});
			if (!res.ok) return null;

			const data = (await res.json()) as {
				rate?: number;
				source?: ClientFxSource;
				updatedAt?: string | null;
			};

			if (typeof data.rate !== 'number' || !Number.isFinite(data.rate) || data.rate <= 0) {
				return null;
			}

			const source: ClientFxSource = data.source ?? 'live';
			const result: ClientFxResult = {
				rate: data.rate,
				source,
				updatedAt: data.updatedAt ?? null
			};

			const ttlMs =
				source === 'stale' || source === 'fallback' ? CLIENT_FALLBACK_TTL_MS : CLIENT_FRESH_TTL_MS;
			sessionFxCache.set(key, {
				...result,
				expiresAt: Date.now() + ttlMs
			});

			return result;
		} catch {
			return null;
		} finally {
			inFlightClientFx.delete(key);
		}
	})();

	inFlightClientFx.set(key, flight);
	return flight;
}
