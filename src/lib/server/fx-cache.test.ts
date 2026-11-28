import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { getFallbackExchangeRate } from '../finance.ts';
import {
	MIN_FRESH_TTL_MS,
	RATE_LIMIT_COOLDOWN_MS,
	resetFxCacheForTests,
	resolveExchangeRate,
	type EdgeCacheLike,
	type FxPlatformLike
} from './fx-cache.ts';

function createMockEdgeCache() {
	const store = new Map<string, Response>();
	const waitUntilPromises: Promise<unknown>[] = [];

	const cache: EdgeCacheLike = {
		async match(req: Request | string) {
			const key = typeof req === 'string' ? req : req.url;
			const entry = store.get(key);
			return entry ? entry.clone() : undefined;
		},
		async put(req: Request | string, res: Response) {
			const key = typeof req === 'string' ? req : req.url;
			store.set(key, res.clone());
		}
	};

	const platform: FxPlatformLike = {
		caches: { default: cache },
		context: {
			waitUntil(p: Promise<unknown>) {
				waitUntilPromises.push(p);
			}
		}
	};

	return {
		platform,
		store,
		async flush() {
			await Promise.all(waitUntilPromises);
		}
	};
}

describe('multi-layer FX cache and rate-limit circuit breaker', () => {
	beforeEach(() => {
		resetFxCacheForTests();
	});

	it('reuses canonical base table across target currencies with 1 upstream fetch', async () => {
		let fetchCount = 0;
		const now = 1_750_000_000_000;
		const nextUpdateUnix = Math.floor((now + 3 * 3600_000) / 1000);

		const mockFetch: typeof fetch = async () => {
			fetchCount += 1;
			return new Response(
				JSON.stringify({
					result: 'success',
					time_last_update_utc: 'Sat, 28 Nov 2026 00:00:01 +0000',
					time_next_update_unix: nextUpdateUnix,
					rates: { IDR: 16250.456, SGD: 1.33891 }
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		};

		const first = await resolveExchangeRate({ from: 'USD', to: 'IDR', fetchFn: mockFetch, now });
		assert.equal(first.source, 'live');
		assert.equal(first.cacheStatus, 'MISS');
		assert.equal(first.rate, 16250.46);
		assert.equal(fetchCount, 1);

		const second = await resolveExchangeRate({
			from: 'USD',
			to: 'SGD',
			fetchFn: mockFetch,
			now: now + 5000
		});
		assert.equal(second.source, 'cache');
		assert.equal(second.cacheStatus, 'HIT-MEMORY');
		assert.equal(second.rate, 1.3389);
		assert.equal(fetchCount, 1);
	});

	it('deduplicates concurrent cold requests via singleflight', async () => {
		let fetchCount = 0;
		const now = 1_750_000_000_000;

		const mockFetch: typeof fetch = async () => {
			fetchCount += 1;
			await new Promise((r) => setTimeout(r, 15));
			return new Response(
				JSON.stringify({
					result: 'success',
					time_last_update_utc: 'Sat, 28 Nov 2026 00:00:01 +0000',
					rates: { IDR: 17420, USD: 1.085 }
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		};

		const results = await Promise.all(
			Array.from({ length: 10 }, () => resolveExchangeRate({ from: 'EUR', to: 'IDR', fetchFn: mockFetch, now }))
		);

		assert.equal(fetchCount, 1);
		for (const res of results) {
			assert.equal(res.rate, 17420);
			assert.equal(res.source, 'live');
		}
	});

	it('hydrates from Cloudflare Edge Cache API across isolate resets with 0 upstream calls', async () => {
		let fetchCount = 0;
		const now = 1_750_000_000_000;
		const edge = createMockEdgeCache();

		const mockFetch: typeof fetch = async () => {
			fetchCount += 1;
			return new Response(
				JSON.stringify({
					result: 'success',
					time_last_update_utc: 'Sat, 28 Nov 2026 00:00:01 +0000',
					time_next_update_unix: Math.floor((now + 4 * 3600_000) / 1000),
					rates: { IDR: 12100.5 }
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		};

		const warm = await resolveExchangeRate({
			from: 'SGD',
			to: 'IDR',
			platform: edge.platform,
			fetchFn: mockFetch,
			now
		});
		assert.equal(warm.cacheStatus, 'MISS');
		await edge.flush();
		assert.equal(fetchCount, 1);

		// Simulate fresh Worker isolate restart (memory cache cleared, edge cache persists)
		resetFxCacheForTests();

		const afterRestart = await resolveExchangeRate({
			from: 'SGD',
			to: 'IDR',
			platform: edge.platform,
			fetchFn: mockFetch,
			now: now + 60_000
		});
		assert.equal(afterRestart.source, 'cache');
		assert.equal(afterRestart.cacheStatus, 'HIT-EDGE');
		assert.equal(afterRestart.rate, 12100.5);
		assert.equal(fetchCount, 1);
	});

	it('trips 20-minute cooldown on HTTP 429 and serves stale cached rate safely', async () => {
		let mode: 'ok' | 'rate_limit' = 'ok';
		let fetchCount = 0;
		const t0 = 1_750_000_000_000;

		const mockFetch: typeof fetch = async () => {
			fetchCount += 1;
			if (mode === 'rate_limit') {
				return new Response('Too Many Requests', { status: 429 });
			}
			return new Response(
				JSON.stringify({
					result: 'success',
					time_last_update_utc: 'Sat, 28 Nov 2026 00:00:01 +0000',
					time_next_update_unix: Math.floor((t0 + MIN_FRESH_TTL_MS) / 1000),
					rates: { IDR: 15999 }
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		};

		const initial = await resolveExchangeRate({ from: 'USD', to: 'IDR', fetchFn: mockFetch, now: t0 });
		assert.equal(initial.rate, 15999);
		assert.equal(fetchCount, 1);

		// Fast-forward past 1h fresh TTL and simulate HTTP 429 from upstream
		mode = 'rate_limit';
		const tExpired = t0 + MIN_FRESH_TTL_MS + 10_000;
		const during429 = await resolveExchangeRate({
			from: 'USD',
			to: 'IDR',
			fetchFn: mockFetch,
			now: tExpired
		});
		assert.equal(during429.source, 'stale');
		assert.equal(during429.cacheStatus, 'STALE');
		assert.equal(during429.rate, 15999);
		assert.equal(fetchCount, 2);

		// Next calls within 20m cooldown MUST NOT hit upstream at all
		const withinCooldown = await resolveExchangeRate({
			from: 'USD',
			to: 'IDR',
			fetchFn: mockFetch,
			now: tExpired + RATE_LIMIT_COOLDOWN_MS - 10_000
		});
		assert.equal(withinCooldown.source, 'stale');
		assert.equal(fetchCount, 2);
	});

	it('falls back to static reference spot rates on cold upstream failure', async () => {
		const mockFetch: typeof fetch = async () => {
			throw new Error('Network unreachable');
		};

		const res = await resolveExchangeRate({
			from: 'JPY',
			to: 'IDR',
			fetchFn: mockFetch,
			now: 1_750_000_000_000
		});

		assert.equal(res.source, 'fallback');
		assert.equal(res.rate, getFallbackExchangeRate('JPY', 'IDR'));
		assert.equal(res.cacheStatus, 'COOLDOWN-FALLBACK');
	});
});
