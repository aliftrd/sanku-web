import { getFallbackExchangeRate } from '#lib/finance.ts';

export type FxRateSource = 'identity' | 'live' | 'cache' | 'stale' | 'fallback';

export type FxCacheStatus =
	| 'IDENTITY'
	| 'HIT-MEMORY'
	| 'HIT-EDGE'
	| 'MISS'
	| 'STALE'
	| 'COOLDOWN-FALLBACK'
	| 'FALLBACK';

export interface EdgeCacheLike {
	match(request: Request | string): Promise<Response | undefined>;
	put(request: Request | string, response: Response): Promise<void>;
}

export interface FxPlatformLike {
	context?: {
		waitUntil(promise: Promise<unknown>): void;
	};
	caches?: {
		default?: EdgeCacheLike;
	};
}

export interface CachedFxTable {
	base: string;
	rates: Record<string, number>;
	updatedAt: string | null;
	expiresAt: number;
	staleUntil: number;
}

export interface ResolvedFxRate {
	from: string;
	to: string;
	rate: number;
	source: FxRateSource;
	updatedAt: string | null;
	cacheStatus: FxCacheStatus;
}

export const MIN_FRESH_TTL_MS = 60 * 60 * 1000; // 1 hour
export const MAX_FRESH_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
export const DEFAULT_FRESH_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
export const STALE_RETENTION_MS = 72 * 60 * 60 * 1000; // 72 hours
export const RATE_LIMIT_COOLDOWN_MS = 20 * 60 * 1000; // 20 minutes (ExchangeRate-API 429 cooldown)
export const ERROR_BACKOFF_MS = 2 * 60 * 1000; // 2 minutes on transient error/timeout
const UPSTREAM_TIMEOUT_MS = 4000;

const memoryCache = new Map<string, CachedFxTable>();
const inFlightRequests = new Map<string, Promise<CachedFxTable | null>>();
let cooldownUntil = 0;

/** Normalize FX rate decimal precision cleanly per magnitude. */
export function normalizeExchangeRate(rate: number): number {
	if (rate >= 100) return Math.round(rate * 100) / 100;
	if (rate >= 1) return Math.round(rate * 10000) / 10000;
	return Math.round(rate * 1000000) / 1000000;
}

function getEdgeCache(platform?: FxPlatformLike | App.Platform): EdgeCacheLike | undefined {
	if (platform?.caches?.default) return platform.caches.default;
	const globalCaches = (globalThis as { caches?: { default?: EdgeCacheLike } }).caches;
	return globalCaches?.default;
}

function edgeCacheRequest(base: string): Request {
	return new Request(`https://fx-cache.sanku.internal/v1/latest/${encodeURIComponent(base)}`, {
		method: 'GET'
	});
}

function isValidCachedTable(value: unknown, expectedBase: string): value is CachedFxTable {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<CachedFxTable>;
	return (
		candidate.base === expectedBase &&
		typeof candidate.expiresAt === 'number' &&
		typeof candidate.staleUntil === 'number' &&
		Boolean(candidate.rates) &&
		typeof candidate.rates === 'object'
	);
}

function computeFreshTtlMs(nextUpdateUnix: unknown, now: number): number {
	if (typeof nextUpdateUnix !== 'number' || !Number.isFinite(nextUpdateUnix)) {
		return DEFAULT_FRESH_TTL_MS;
	}
	const deltaMs = nextUpdateUnix * 1000 - now;
	return Math.min(MAX_FRESH_TTL_MS, Math.max(MIN_FRESH_TTL_MS, deltaMs));
}

function parseRetryAfterMs(headerValue: string | null): number {
	if (!headerValue) return RATE_LIMIT_COOLDOWN_MS;
	const numericSeconds = Number(headerValue.trim());
	if (Number.isFinite(numericSeconds) && numericSeconds > 0) {
		return Math.max(60_000, numericSeconds * 1000);
	}
	return RATE_LIMIT_COOLDOWN_MS;
}

async function readEdgeCache(
	base: string,
	edgeCache: EdgeCacheLike | undefined
): Promise<CachedFxTable | null> {
	if (!edgeCache) return null;
	try {
		const matched = await edgeCache.match(edgeCacheRequest(base));
		if (!matched || !matched.ok) return null;
		const parsed = (await matched.json()) as unknown;
		if (!isValidCachedTable(parsed, base)) return null;
		return parsed;
	} catch {
		return null;
	}
}

function writeEdgeCache(
	table: CachedFxTable,
	edgeCache: EdgeCacheLike | undefined,
	platform?: FxPlatformLike | App.Platform
): void {
	if (!edgeCache) return;
	const ttlSeconds = Math.floor(STALE_RETENTION_MS / 1000);
	const payload = new Response(JSON.stringify(table), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': `public, s-maxage=${ttlSeconds}`
		}
	});
	const putPromise = Promise.resolve(edgeCache.put(edgeCacheRequest(table.base), payload)).catch(
		() => {}
	);
	if (platform?.context?.waitUntil) {
		platform.context.waitUntil(putPromise);
	}
}

function hasValidTargetRate(table: CachedFxTable | undefined | null, to: string): table is CachedFxTable {
	return Boolean(
		table && typeof table.rates[to] === 'number' && Number.isFinite(table.rates[to]) && table.rates[to] > 0
	);
}

async function fetchUpstreamTable(params: {
	base: string;
	fetchFn: typeof fetch;
	edgeCache: EdgeCacheLike | undefined;
	platform?: FxPlatformLike | App.Platform;
	now: number;
}): Promise<CachedFxTable | null> {
	const { base, fetchFn, edgeCache, platform, now } = params;
	const existingFlight = inFlightRequests.get(base);
	if (existingFlight) return existingFlight;

	const flight = (async (): Promise<CachedFxTable | null> => {
		try {
			const response = await fetchFn(
				`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`,
				{
					signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
				}
			);

			if (response.status === 429) {
				const retryMs = parseRetryAfterMs(response.headers.get('retry-after'));
				cooldownUntil = Math.max(cooldownUntil, now + retryMs);
				return null;
			}

			if (!response.ok) {
				cooldownUntil = Math.max(cooldownUntil, now + ERROR_BACKOFF_MS);
				return null;
			}

			const payload = (await response.json()) as {
				result?: string;
				rates?: Record<string, number>;
				time_last_update_utc?: string;
				time_next_update_unix?: number;
			};

			if (!payload?.rates || typeof payload.rates !== 'object') {
				cooldownUntil = Math.max(cooldownUntil, now + ERROR_BACKOFF_MS);
				return null;
			}

			const freshTtlMs = computeFreshTtlMs(payload.time_next_update_unix, now);
			const table: CachedFxTable = {
				base,
				rates: payload.rates,
				updatedAt: payload.time_last_update_utc ?? null,
				expiresAt: now + freshTtlMs,
				staleUntil: now + STALE_RETENTION_MS
			};

			memoryCache.set(base, table);
			writeEdgeCache(table, edgeCache, platform);
			return table;
		} catch {
			cooldownUntil = Math.max(cooldownUntil, now + ERROR_BACKOFF_MS);
			return null;
		} finally {
			inFlightRequests.delete(base);
		}
	})();

	inFlightRequests.set(base, flight);
	return flight;
}

/** Resolve FX rate using memory isolate cache, Cloudflare Edge Cache API, singleflight upstream fetch, and 429 cooldown + stale fallback. */
export async function resolveExchangeRate(options: {
	from: string;
	to: string;
	platform?: FxPlatformLike | App.Platform;
	fetchFn?: typeof fetch;
	now?: number;
}): Promise<ResolvedFxRate> {
	const { from, to, platform, fetchFn = globalThis.fetch, now = Date.now() } = options;

	if (from === to) {
		return {
			from,
			to,
			rate: 1,
			source: 'identity',
			updatedAt: null,
			cacheStatus: 'IDENTITY'
		};
	}

	// L2: Isolate in-memory fresh hit
	const memEntry = memoryCache.get(from);
	if (memEntry && now < memEntry.expiresAt && hasValidTargetRate(memEntry, to)) {
		return {
			from,
			to,
			rate: normalizeExchangeRate(memEntry.rates[to]),
			source: 'cache',
			updatedAt: memEntry.updatedAt,
			cacheStatus: 'HIT-MEMORY'
		};
	}

	// L3: Cloudflare Edge Cache API hit
	const edgeCache = getEdgeCache(platform);
	const edgeEntry = await readEdgeCache(from, edgeCache);
	if (edgeEntry) {
		if (!memEntry || edgeEntry.expiresAt > memEntry.expiresAt) {
			memoryCache.set(from, edgeEntry);
		}
		if (now < edgeEntry.expiresAt && hasValidTargetRate(edgeEntry, to)) {
			return {
				from,
				to,
				rate: normalizeExchangeRate(edgeEntry.rates[to]),
				source: 'cache',
				updatedAt: edgeEntry.updatedAt,
				cacheStatus: 'HIT-EDGE'
			};
		}
	}

	// Singleflight upstream fetch when circuit breaker is closed
	if (now >= cooldownUntil) {
		const freshTable = await fetchUpstreamTable({
			base: from,
			fetchFn,
			edgeCache,
			platform,
			now
		});
		if (hasValidTargetRate(freshTable, to)) {
			return {
				from,
				to,
				rate: normalizeExchangeRate(freshTable.rates[to]),
				source: 'live',
				updatedAt: freshTable.updatedAt,
				cacheStatus: 'MISS'
			};
		}
	}

	// L4a: Stale-if-error from memory or edge cache (up to 72h)
	const latestStale = memoryCache.get(from) ?? edgeEntry;
	if (latestStale && now < latestStale.staleUntil && hasValidTargetRate(latestStale, to)) {
		return {
			from,
			to,
			rate: normalizeExchangeRate(latestStale.rates[to]),
			source: 'stale',
			updatedAt: latestStale.updatedAt,
			cacheStatus: 'STALE'
		};
	}

	// L4b: Cross-rate computation via cached USD table
	if (from !== 'USD') {
		let usdTable = memoryCache.get('USD');
		if (!usdTable) {
			usdTable = (await readEdgeCache('USD', edgeCache)) ?? undefined;
			if (usdTable) memoryCache.set('USD', usdTable);
		}
		if (
			usdTable &&
			now < usdTable.staleUntil &&
			typeof usdTable.rates[from] === 'number' &&
			usdTable.rates[from] > 0 &&
			typeof usdTable.rates[to] === 'number' &&
			usdTable.rates[to] > 0
		) {
			const isFreshUsd = now < usdTable.expiresAt;
			return {
				from,
				to,
				rate: normalizeExchangeRate(usdTable.rates[to] / usdTable.rates[from]),
				source: isFreshUsd ? 'cache' : 'stale',
				updatedAt: usdTable.updatedAt,
				cacheStatus: isFreshUsd ? 'HIT-MEMORY' : 'STALE'
			};
		}
	}

	// L4c: Static reference fallback
	return {
		from,
		to,
		rate: getFallbackExchangeRate(from, to),
		source: 'fallback',
		updatedAt: null,
		cacheStatus: now < cooldownUntil ? 'COOLDOWN-FALLBACK' : 'FALLBACK'
	};
}

/** Clear isolate cache, in-flight map, and circuit breaker cooldown (for automated tests). */
export function resetFxCacheForTests(): void {
	memoryCache.clear();
	inFlightRequests.clear();
	cooldownUntil = 0;
}
