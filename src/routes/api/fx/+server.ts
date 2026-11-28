import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSupportedCurrency } from '#lib/finance.ts';
import { resolveExchangeRate } from '#lib/server/fx-cache.ts';

export const GET: RequestHandler = async ({ url, locals, platform }) => {
	if (!locals.session) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const from = String(url.searchParams.get('from') ?? 'USD').trim().toUpperCase();
	const to = String(url.searchParams.get('to') ?? 'IDR').trim().toUpperCase();

	if (!isSupportedCurrency(from) || !isSupportedCurrency(to)) {
		return json({ error: 'Unsupported currency code' }, { status: 400 });
	}

	const result = await resolveExchangeRate({ from, to, platform });
	const cacheControl =
		result.source === 'stale' || result.source === 'fallback'
			? 'private, max-age=120'
			: 'private, max-age=3600, stale-while-revalidate=86400';

	return json(
		{
			from: result.from,
			to: result.to,
			rate: result.rate,
			source: result.source,
			updatedAt: result.updatedAt
		},
		{
			headers: {
				'Cache-Control': cacheControl,
				Vary: 'Cookie',
				'X-FX-Cache': result.cacheStatus
			}
		}
	);
};
