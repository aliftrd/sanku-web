import type { PageLoad } from './$types';
import { decodeReceiptPayload } from '#lib/split-bill.ts';

export const load: PageLoad = async ({ url }) => {
	const encoded = url.searchParams.get('d');
	const receipt = encoded ? await decodeReceiptPayload(encoded) : null;

	return {
		receipt,
		hasParam: Boolean(encoded)
	};
};
