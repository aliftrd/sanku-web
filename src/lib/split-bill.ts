import { formatMoney } from './finance.ts';
import type {
	SplitBill,
	SplitBillInput,
	SplitDiscount,
	SplitFee,
	SplitItem,
	SplitParticipant,
	SplitRoundingStep
} from './types.ts';

const ZERO_DECIMAL_CURRENCIES = new Set(['IDR', 'JPY', 'VND', 'KRW']);

export const SPLIT_COLORS = [
	'#0f172a',
	'#0284c7',
	'#059669',
	'#f97316',
	'#7c3aed',
	'#db2777',
	'#ca8a04',
	'#0d9488',
	'#dc2626',
	'#4f46e5'
] as const;

export type SplitParticipantItemLine = {
	itemId: string;
	name: string;
	qty: number;
	shareLabel: string;
	amount: number;
};

export type SplitParticipantBreakdown = {
	participant: SplitParticipant;
	items: SplitParticipantItemLine[];
	itemsSubtotal: number;
	itemMenuDiscountShare: number;
	discountShare: number;
	feeShare: number;
	exactAmount: number;
	finalAmount: number;
	savingsPercent: number;
};

export type AppliedDiscountDetail = {
	id: string;
	label: string;
	target: SplitDiscount['target'];
	mode: SplitDiscount['mode'];
	value: number;
	maxAmount?: number;
	rawAmount: number;
	effectiveAmount: number;
};

export type AppliedFeeDetail = {
	id: string;
	label: string;
	kind: SplitFee['kind'];
	mode: SplitFee['mode'];
	value: number;
	allocation: SplitFee['allocation'];
	grossAmount: number;
	netAmount: number;
};

export type SplitCalculationResult = {
	currency: string;
	decimals: number;
	itemsGrossSubtotal: number;
	itemsMenuDiscountTotal: number;
	itemsNetSubtotal: number;
	assignedItemsSubtotal: number;
	unassignedAmount: number;
	unassignedItems: Array<{ id: string; name: string; amount: number }>;
	appliedDiscounts: AppliedDiscountDetail[];
	effectiveItemDiscount: number;
	effectiveDeliveryDiscount: number;
	totalDiscount: number; // menu discounts + item vouchers + delivery discounts
	appliedFees: AppliedFeeDetail[];
	grossDeliveryFees: number;
	netDeliveryFees: number;
	grossFeesTotal: number;
	netFeesTotal: number;
	exactGrandTotal: number;
	grandTotal: number;
	roundingSurplus: number;
	myShare: number;
	outstandingAmount: number;
	unpaidCount: number;
	totalFriendsCount: number;
	status: 'open' | 'settled';
	participants: SplitParticipantBreakdown[];
};

export type PublicSplitReceipt = {
	title: string;
	merchant: string;
	date: string;
	currency: string;
	paymentInfo: string;
	roundingStep: SplitRoundingStep;
	itemsGrossSubtotal: number;
	assignedItemsSubtotal: number;
	itemsMenuDiscountTotal: number;
	effectiveItemDiscount: number;
	effectiveDeliveryDiscount: number;
	totalDiscount: number;
	grossFeesTotal: number;
	netFeesTotal: number;
	exactGrandTotal: number;
	grandTotal: number;
	discounts: Array<{ label: string; amount: number; target: 'items' | 'delivery' }>;
	fees: Array<{ label: string; grossAmount: number; netAmount: number; kind: SplitFee['kind'] }>;
	participants: Array<{
		name: string;
		isMe: boolean;
		paid: boolean;
		color: string;
		itemsSubtotal: number;
		discountShare: number;
		feeShare: number;
		finalAmount: number;
		items: Array<{ name: string; shareLabel: string; amount: number }>;
	}>;
};

function decimalsFor(currency: string): number {
	return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

function roundTo(value: number, decimals: number): number {
	const factor = decimals === 0 ? 1 : 10 ** decimals;
	return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Hamilton / Largest Remainder Method apportionment.
 * Guarantees sum(results) === targetTotal at the currency's smallest unit.
 */
export function apportionByLargestRemainder(
	rawValues: number[],
	targetTotal: number,
	decimals: number
): number[] {
	if (rawValues.length === 0) return [];
	const factor = decimals === 0 ? 1 : 10 ** decimals;
	const targetUnits = Math.max(0, Math.round((targetTotal + Number.EPSILON) * factor));

	const safeValues = rawValues.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
	const rawSum = safeValues.reduce((sum, v) => sum + v, 0);

	if (rawSum <= 0 || targetUnits === 0) {
		return safeValues.map(() => 0);
	}

	const scaled = safeValues.map((v) => (v / rawSum) * targetUnits);
	const floored = scaled.map((v) => Math.floor(v));
	let remaining = targetUnits - floored.reduce((sum, v) => sum + v, 0);

	const order = scaled
		.map((val, index) => ({
			index,
			remainder: val - floored[index],
			raw: safeValues[index]
		}))
		.sort((a, b) => {
			if (Math.abs(b.remainder - a.remainder) > 1e-12) {
				return b.remainder - a.remainder;
			}
			if (b.raw !== a.raw) return b.raw - a.raw;
			return a.index - b.index;
		});

	for (let i = 0; i < remaining; i += 1) {
		const pick = order[i % order.length];
		if (pick) floored[pick.index] += 1;
	}

	return floored.map((units) => units / factor);
}

export function calculateSplitBill(
	input: Pick<
		SplitBill | SplitBillInput,
		'currency' | 'participants' | 'items' | 'discounts' | 'fees' | 'roundingStep'
	>
): SplitCalculationResult {
	const currency = input.currency || 'IDR';
	const decimals = decimalsFor(currency);
	const participants = input.participants ?? [];
	const items = input.items ?? [];
	const discounts = input.discounts ?? [];
	const fees = input.fees ?? [];
	const roundingStep: SplitRoundingStep =
		input.roundingStep === 100 || input.roundingStep === 500 || input.roundingStep === 1000
			? input.roundingStep
			: 0;

	const participantMap = new Map<
		string,
		{
			participant: SplitParticipant;
			items: SplitParticipantItemLine[];
			itemsSubtotal: number;
			itemMenuDiscountShare: number;
			discountShare: number;
			feeShare: number;
		}
	>();

	for (const participant of participants) {
		participantMap.set(participant.id, {
			participant,
			items: [],
			itemsSubtotal: 0,
			itemMenuDiscountShare: 0,
			discountShare: 0,
			feeShare: 0
		});
	}

	let itemsGrossSubtotal = 0;
	let itemsMenuDiscountTotal = 0;
	let assignedItemsSubtotal = 0;
	let unassignedAmount = 0;
	const unassignedItems: Array<{ id: string; name: string; amount: number }> = [];

	for (const item of items) {
		const qty = Math.max(0, Number(item.qty) || 0);
		const price = Math.max(0, Number(item.price) || 0);
		const gross = price * qty;
		const itemDisc = Math.min(gross, Math.max(0, Number(item.itemDiscount) || 0));
		const net = Math.max(0, gross - itemDisc);

		itemsGrossSubtotal += gross;
		itemsMenuDiscountTotal += itemDisc;

		const assignedEntries = Object.entries(item.shares ?? {}).filter(
			([pid, weight]) => participantMap.has(pid) && Number(weight) > 0
		);
		const totalWeight = assignedEntries.reduce((sum, [, weight]) => sum + Number(weight), 0);

		if (totalWeight <= 0) {
			if (net > 0) {
				unassignedAmount += net;
				unassignedItems.push({
					id: item.id,
					name: item.name?.trim() || 'Pesanan tanpa nama',
					amount: roundTo(net, decimals)
				});
			}
			continue;
		}

		assignedItemsSubtotal += net;

		for (const [pid, weight] of assignedEntries) {
			const entry = participantMap.get(pid);
			if (!entry) continue;
			const ratio = Number(weight) / totalWeight;
			const amount = net * ratio;
			entry.itemsSubtotal += amount;
			entry.itemMenuDiscountShare += itemDisc * ratio;

			const shareLabel =
				assignedEntries.length === 1
					? qty > 1
						? `${qty}x`
						: '1x'
					: `${Number(weight)}/${totalWeight}`;

			entry.items.push({
				itemId: item.id,
				name: item.name?.trim() || 'Menu',
				qty,
				shareLabel,
				amount: roundTo(amount, decimals)
			});
		}
	}

	const itemsNetSubtotal = assignedItemsSubtotal + unassignedAmount;

	// 1. Compute gross fees
	const feeComputations = fees.map((fee) => {
		const val = Math.max(0, Number(fee.value) || 0);
		const grossAmount = fee.mode === 'percent' ? (assignedItemsSubtotal * val) / 100 : val;
		return { fee, grossAmount, netAmount: grossAmount };
	});

	const grossDeliveryFees = feeComputations
		.filter((f) => f.fee.kind === 'delivery')
		.reduce((sum, f) => sum + f.grossAmount, 0);
	const grossFeesTotal = feeComputations.reduce((sum, f) => sum + f.grossAmount, 0);

	// 2. Compute delivery discounts (apply to delivery fees first)
	const deliveryDiscountsRaw = discounts
		.filter((d) => d.target === 'delivery')
		.map((d) => {
			const val = Math.max(0, Number(d.value) || 0);
			let raw = d.mode === 'percent' ? (grossDeliveryFees * val) / 100 : val;
			if (d.mode === 'percent' && d.maxAmount && d.maxAmount > 0) {
				raw = Math.min(raw, d.maxAmount);
			}
			return { discount: d, rawAmount: Math.max(0, raw) };
		});

	const rawDeliveryDiscountSum = deliveryDiscountsRaw.reduce((sum, d) => sum + d.rawAmount, 0);
	const effectiveDeliveryDiscount = Math.min(grossDeliveryFees, rawDeliveryDiscountSum);
	const deliveryDiscountScale =
		rawDeliveryDiscountSum > 0 ? effectiveDeliveryDiscount / rawDeliveryDiscountSum : 0;
	const deliveryFeeScale =
		grossDeliveryFees > 0 ? (grossDeliveryFees - effectiveDeliveryDiscount) / grossDeliveryFees : 1;

	for (const fc of feeComputations) {
		if (fc.fee.kind === 'delivery') {
			fc.netAmount = fc.grossAmount * deliveryFeeScale;
		}
	}

	const netDeliveryFees = Math.max(0, grossDeliveryFees - effectiveDeliveryDiscount);
	const netFeesTotal = feeComputations.reduce((sum, f) => sum + f.netAmount, 0);

	// 3. Compute item/order discounts
	const itemDiscountsRaw = discounts
		.filter((d) => d.target === 'items')
		.map((d) => {
			const val = Math.max(0, Number(d.value) || 0);
			let raw = d.mode === 'percent' ? (assignedItemsSubtotal * val) / 100 : val;
			if (d.mode === 'percent' && d.maxAmount && d.maxAmount > 0) {
				raw = Math.min(raw, d.maxAmount);
			}
			return { discount: d, rawAmount: Math.max(0, raw) };
		});

	const rawItemDiscountSum = itemDiscountsRaw.reduce((sum, d) => sum + d.rawAmount, 0);
	const effectiveItemDiscount = Math.min(assignedItemsSubtotal, rawItemDiscountSum);
	const itemDiscountScale =
		rawItemDiscountSum > 0 ? effectiveItemDiscount / rawItemDiscountSum : 0;

	const appliedDiscounts: AppliedDiscountDetail[] = discounts.map((d) => {
		if (d.target === 'delivery') {
			const match = deliveryDiscountsRaw.find((entry) => entry.discount.id === d.id);
			const rawAmount = match?.rawAmount ?? 0;
			return {
				id: d.id,
				label: d.label?.trim() || 'Diskon Ongkir',
				target: d.target,
				mode: d.mode,
				value: d.value,
				maxAmount: d.maxAmount,
				rawAmount: roundTo(rawAmount, decimals),
				effectiveAmount: roundTo(rawAmount * deliveryDiscountScale, decimals)
			};
		}

		const match = itemDiscountsRaw.find((entry) => entry.discount.id === d.id);
		const rawAmount = match?.rawAmount ?? 0;
		return {
			id: d.id,
			label: d.label?.trim() || 'Diskon',
			target: d.target,
			mode: d.mode,
			value: d.value,
			maxAmount: d.maxAmount,
			rawAmount: roundTo(rawAmount, decimals),
			effectiveAmount: roundTo(rawAmount * itemDiscountScale, decimals)
		};
	});

	const appliedFees: AppliedFeeDetail[] = feeComputations.map((fc) => ({
		id: fc.fee.id,
		label: fc.fee.label?.trim() || 'Biaya Tambahan',
		kind: fc.fee.kind,
		mode: fc.fee.mode,
		value: fc.fee.value,
		allocation: fc.fee.allocation,
		grossAmount: roundTo(fc.grossAmount, decimals),
		netAmount: roundTo(fc.netAmount, decimals)
	}));

	// 4. Allocate item discounts & net fees across participants
	const allEntries = participants
		.map((p) => participantMap.get(p.id))
		.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
	const orderingEntries = allEntries.filter((entry) => entry.itemsSubtotal > 0);
	const equalPool = orderingEntries.length > 0 ? orderingEntries : allEntries;

	for (const d of itemDiscountsRaw) {
		const eff = d.rawAmount * itemDiscountScale;
		if (eff <= 0) continue;

		if (d.discount.allocation === 'proportional' && assignedItemsSubtotal > 0) {
			for (const entry of allEntries) {
				if (entry.itemsSubtotal <= 0) continue;
				entry.discountShare += eff * (entry.itemsSubtotal / assignedItemsSubtotal);
			}
		} else if (equalPool.length > 0) {
			const perPerson = eff / equalPool.length;
			for (const entry of equalPool) {
				entry.discountShare += perPerson;
			}
		}
	}

	for (const fc of feeComputations) {
		const netFee = fc.netAmount;
		if (netFee <= 0) continue;

		if (fc.fee.allocation === 'proportional' && assignedItemsSubtotal > 0) {
			for (const entry of allEntries) {
				if (entry.itemsSubtotal <= 0) continue;
				entry.feeShare += netFee * (entry.itemsSubtotal / assignedItemsSubtotal);
			}
		} else if (equalPool.length > 0) {
			const perPerson = netFee / equalPool.length;
			for (const entry of equalPool) {
				entry.feeShare += perPerson;
			}
		}
	}

	// 5. Reconcile exact totals via Largest Remainder Method
	const rawParticipantTotals = allEntries.map((entry) =>
		Math.max(0, entry.itemsSubtotal - entry.discountShare + entry.feeShare)
	);
	const exactGrandTotalRaw = Math.max(0, assignedItemsSubtotal - effectiveItemDiscount + netFeesTotal);
	const exactGrandTotal = roundTo(exactGrandTotalRaw, decimals);

	const exactApportioned = apportionByLargestRemainder(
		rawParticipantTotals,
		exactGrandTotal,
		decimals
	);

	const breakdownParticipants: SplitParticipantBreakdown[] = allEntries.map((entry, index) => {
		const exactAmount = exactApportioned[index] ?? 0;
		const finalAmount =
			roundingStep > 0 && decimals === 0 && exactAmount > 0
				? Math.ceil(exactAmount / roundingStep) * roundingStep
				: exactAmount;

		const totalGrossForPerson = entry.itemsSubtotal + entry.itemMenuDiscountShare;
		const totalSavedForPerson = entry.discountShare + entry.itemMenuDiscountShare;
		const savingsPercent =
			totalGrossForPerson > 0 ? Math.min(100, (totalSavedForPerson / totalGrossForPerson) * 100) : 0;

		return {
			participant: entry.participant,
			items: entry.items,
			itemsSubtotal: roundTo(entry.itemsSubtotal, decimals),
			itemMenuDiscountShare: roundTo(entry.itemMenuDiscountShare, decimals),
			discountShare: roundTo(entry.discountShare, decimals),
			feeShare: roundTo(entry.feeShare, decimals),
			exactAmount,
			finalAmount,
			savingsPercent: roundTo(savingsPercent, 1)
		};
	});

	const grandTotal = roundTo(
		breakdownParticipants.reduce((sum, p) => sum + p.finalAmount, 0),
		decimals
	);
	const roundingSurplus = roundTo(grandTotal - exactGrandTotal, decimals);

	const meBreakdown =
		breakdownParticipants.filter((p) => p.participant.isMe);
	const myShare =
		meBreakdown.length > 0
			? roundTo(
					meBreakdown.reduce((sum, p) => sum + p.finalAmount, 0),
					decimals
				)
			: (breakdownParticipants[0]?.finalAmount ?? 0);

	const friends = breakdownParticipants.filter((p) => !p.participant.isMe);
	const unpaidFriends = friends.filter((p) => !p.participant.paid && p.finalAmount > 0);
	const outstandingAmount = roundTo(
		unpaidFriends.reduce((sum, p) => sum + p.finalAmount, 0),
		decimals
	);

	const totalDiscount = roundTo(
		itemsMenuDiscountTotal + effectiveItemDiscount + effectiveDeliveryDiscount,
		decimals
	);

	return {
		currency,
		decimals,
		itemsGrossSubtotal: roundTo(itemsGrossSubtotal, decimals),
		itemsMenuDiscountTotal: roundTo(itemsMenuDiscountTotal, decimals),
		itemsNetSubtotal: roundTo(itemsNetSubtotal, decimals),
		assignedItemsSubtotal: roundTo(assignedItemsSubtotal, decimals),
		unassignedAmount: roundTo(unassignedAmount, decimals),
		unassignedItems,
		appliedDiscounts,
		effectiveItemDiscount: roundTo(effectiveItemDiscount, decimals),
		effectiveDeliveryDiscount: roundTo(effectiveDeliveryDiscount, decimals),
		totalDiscount,
		appliedFees,
		grossDeliveryFees: roundTo(grossDeliveryFees, decimals),
		netDeliveryFees: roundTo(netDeliveryFees, decimals),
		grossFeesTotal: roundTo(grossFeesTotal, decimals),
		netFeesTotal: roundTo(netFeesTotal, decimals),
		exactGrandTotal,
		grandTotal,
		roundingSurplus,
		myShare,
		outstandingAmount,
		unpaidCount: unpaidFriends.length,
		totalFriendsCount: friends.length,
		status: unpaidFriends.length === 0 && participants.length > 0 ? 'settled' : 'open',
		participants: breakdownParticipants
	};
}

/**
 * Helper for GoFood/GrabFood/ShopeeFood users:
 * Given subtotal of menu items + gross fees and the actual final amount paid in the app,
 * computes the implied total discount amount to distribute proportionally.
 */
export function computeAutoDiscountFromPaidTotal(
	itemsNetSubtotal: number,
	grossFeesTotal: number,
	actualPaidTotal: number
): number {
	const raw = Math.max(0, itemsNetSubtotal) + Math.max(0, grossFeesTotal) - Math.max(0, actualPaidTotal);
	return Math.max(0, Math.round(raw));
}

function formatShortIndonesianDate(isoDate: string): string {
	const parsed = new Date(`${isoDate}T00:00:00Z`);
	if (Number.isNaN(parsed.getTime())) return isoDate;
	return new Intl.DateTimeFormat('id-ID', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(parsed);
}

export function formatWhatsAppSummary(
	bill: Pick<SplitBill | SplitBillInput, 'title' | 'merchant' | 'date' | 'currency' | 'paymentInfo'>,
	calc: SplitCalculationResult,
	shareUrl?: string
): string {
	const titleText = bill.title?.trim() || 'Beli Rame-rame';
	const headerTitle = bill.merchant?.trim()
		? `${titleText} (${bill.merchant.trim()})`
		: titleText;

	const lines: string[] = [
		`🧾 *Beli Rame-rame: ${headerTitle}*`,
		`📅 ${formatShortIndonesianDate(bill.date)}`,
		''
	];

	for (const p of calc.participants) {
		const badge = p.participant.isMe
			? ' (Saya) ✅'
			: p.participant.paid
				? ' ✅ Lunas'
				: ' ⏳';
		lines.push(
			`👤 *${p.participant.name}*${badge} — *${formatMoney(p.finalAmount, calc.currency)}*`
		);

		if (p.items.length > 0) {
			for (const item of p.items) {
				lines.push(
					`  • ${item.name} (${item.shareLabel}) ${formatMoney(item.amount, calc.currency)}`
				);
			}
		} else {
			lines.push(`  • (Belum ada pesanan)`);
		}

		if (p.discountShare > 0) {
			lines.push(`  • Potongan diskon −${formatMoney(p.discountShare, calc.currency)}`);
		}
		if (p.feeShare > 0) {
			lines.push(`  • Ongkir & biaya +${formatMoney(p.feeShare, calc.currency)}`);
		}
		lines.push('');
	}

	lines.push('━━━━━━━━━━━━━━');
	lines.push(`Subtotal Menu: ${formatMoney(calc.assignedItemsSubtotal, calc.currency)}`);
	if (calc.totalDiscount > 0) {
		lines.push(`Total Hemat Diskon: −${formatMoney(calc.totalDiscount, calc.currency)}`);
	}
	if (calc.netFeesTotal > 0) {
		lines.push(`Ongkir & Biaya: +${formatMoney(calc.netFeesTotal, calc.currency)}`);
	}
	lines.push(`*Grand Total: ${formatMoney(calc.grandTotal, calc.currency)}*`);

	if (bill.paymentInfo?.trim()) {
		lines.push('');
		lines.push('💳 *Transfer / Bayar ke:*');
		lines.push(bill.paymentInfo.trim());
	}

	if (shareUrl?.trim()) {
		lines.push('');
		lines.push(`🔗 Rincian struk digital: ${shareUrl.trim()}`);
	}

	return lines.join('\n');
}

// --- Stateless Public Receipt URL Encoding (Web Streams deflate-raw + base64url) ---

type CompactReceiptPayload = {
	v: 1;
	t: string;
	m: string;
	d: string;
	c: string;
	p: string;
	rs: SplitRoundingStep;
	ig: number;
	in: number;
	md: number;
	id: number;
	dd: number;
	td: number;
	gf: number;
	nf: number;
	eg: number;
	gt: number;
	ds: Array<[string, number, 'i' | 'd']>;
	fs: Array<[string, number, number, SplitFee['kind']]>;
	ps: Array<
		[
			string,
			0 | 1,
			0 | 1,
			string,
			number,
			number,
			number,
			number,
			Array<[string, string, number]>
		]
	>;
};

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = '';
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(input: string): Uint8Array {
	const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
	const padLength = (4 - (normalized.length % 4)) % 4;
	const padded = normalized + '='.repeat(padLength);
	const binary = atob(padded);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		out[i] = binary.charCodeAt(i);
	}
	return out;
}

async function compressDeflateRaw(data: Uint8Array): Promise<Uint8Array> {
	const cs = new CompressionStream('deflate-raw');
	const writer = cs.writable.getWriter();
	const copy = new Uint8Array(data.byteLength);
	copy.set(data);
	const writePromise = writer.write(copy).then(() => writer.close());
	const reader = cs.readable.getReader();
	const chunks: Uint8Array[] = [];
	let totalLength = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			chunks.push(value);
			totalLength += value.byteLength;
		}
	}
	await writePromise;

	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

async function decompressDeflateRaw(data: Uint8Array): Promise<Uint8Array> {
	const ds = new DecompressionStream('deflate-raw');
	const writer = ds.writable.getWriter();
	const copy = new Uint8Array(data.byteLength);
	copy.set(data);
	const writePromise = writer.write(copy).then(() => writer.close());
	const reader = ds.readable.getReader();
	const chunks: Uint8Array[] = [];
	let totalLength = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			chunks.push(value);
			totalLength += value.byteLength;
		}
	}
	await writePromise;

	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

export async function encodeReceiptPayload(
	bill: Pick<
		SplitBill | SplitBillInput,
		'title' | 'merchant' | 'date' | 'currency' | 'paymentInfo' | 'roundingStep'
	>,
	calc: SplitCalculationResult
): Promise<string> {
	const compact: CompactReceiptPayload = {
		v: 1,
		t: (bill.title || 'Beli Rame-rame').trim().slice(0, 100),
		m: (bill.merchant || '').trim().slice(0, 80),
		d: bill.date,
		c: calc.currency,
		p: (bill.paymentInfo || '').trim().slice(0, 200),
		rs: bill.roundingStep || 0,
		ig: calc.itemsGrossSubtotal,
		in: calc.assignedItemsSubtotal,
		md: calc.itemsMenuDiscountTotal,
		id: calc.effectiveItemDiscount,
		dd: calc.effectiveDeliveryDiscount,
		td: calc.totalDiscount,
		gf: calc.grossFeesTotal,
		nf: calc.netFeesTotal,
		eg: calc.exactGrandTotal,
		gt: calc.grandTotal,
		ds: calc.appliedDiscounts
			.filter((d) => d.effectiveAmount > 0)
			.map((d) => [d.label.slice(0, 50), d.effectiveAmount, d.target === 'delivery' ? 'd' : 'i']),
		fs: calc.appliedFees
			.filter((f) => f.grossAmount > 0)
			.map((f) => [f.label.slice(0, 50), f.grossAmount, f.netAmount, f.kind]),
		ps: calc.participants.map((p) => [
			p.participant.name.slice(0, 40),
			p.participant.isMe ? 1 : 0,
			p.participant.paid ? 1 : 0,
			p.participant.color || '#0f172a',
			p.itemsSubtotal,
			p.discountShare,
			p.feeShare,
			p.finalAmount,
			p.items.map((item) => [item.name.slice(0, 60), item.shareLabel, item.amount])
		])
	};

	const rawBytes = new TextEncoder().encode(JSON.stringify(compact));

	if (typeof CompressionStream !== 'undefined') {
		try {
			const compressed = await compressDeflateRaw(rawBytes);
			if (compressed.byteLength < rawBytes.byteLength) {
				return `z.${bytesToBase64Url(compressed)}`;
			}
		} catch {
			// Fallback to uncompressed base64url
		}
	}

	return `j.${bytesToBase64Url(rawBytes)}`;
}

export async function decodeReceiptPayload(token: string | null | undefined): Promise<PublicSplitReceipt | null> {
	if (!token || typeof token !== 'string' || token.length > 16_000) return null;

	try {
		const trimmed = token.trim();
		let jsonText = '';

		if (trimmed.startsWith('z.')) {
			if (typeof DecompressionStream === 'undefined') return null;
			const compressed = base64UrlToBytes(trimmed.slice(2));
			const decompressed = await decompressDeflateRaw(compressed);
			jsonText = new TextDecoder().decode(decompressed);
		} else if (trimmed.startsWith('j.')) {
			const raw = base64UrlToBytes(trimmed.slice(2));
			jsonText = new TextDecoder().decode(raw);
		} else {
			return null;
		}

		const parsed = JSON.parse(jsonText) as Partial<CompactReceiptPayload>;
		if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.ps)) return null;

		const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
		const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

		const roundingStep: SplitRoundingStep =
			parsed.rs === 100 || parsed.rs === 500 || parsed.rs === 1000 ? parsed.rs : 0;

		return {
			title: str(parsed.t, 'Beli Rame-rame'),
			merchant: str(parsed.m),
			date: str(parsed.d),
			currency: str(parsed.c, 'IDR'),
			paymentInfo: str(parsed.p),
			roundingStep,
			itemsGrossSubtotal: num(parsed.ig),
			assignedItemsSubtotal: num(parsed.in),
			itemsMenuDiscountTotal: num(parsed.md),
			effectiveItemDiscount: num(parsed.id),
			effectiveDeliveryDiscount: num(parsed.dd),
			totalDiscount: num(parsed.td),
			grossFeesTotal: num(parsed.gf),
			netFeesTotal: num(parsed.nf),
			exactGrandTotal: num(parsed.eg),
			grandTotal: num(parsed.gt),
			discounts: Array.isArray(parsed.ds)
				? parsed.ds
						.filter((row): row is [string, number, 'i' | 'd'] => Array.isArray(row) && row.length >= 3)
						.map((row) => ({
							label: str(row[0], 'Diskon'),
							amount: num(row[1]),
							target: row[2] === 'd' ? 'delivery' : 'items'
						}))
				: [],
			fees: Array.isArray(parsed.fs)
				? parsed.fs
						.filter(
							(row): row is [string, number, number, SplitFee['kind']] =>
								Array.isArray(row) && row.length >= 4
						)
						.map((row) => ({
							label: str(row[0], 'Biaya'),
							grossAmount: num(row[1]),
							netAmount: num(row[2]),
							kind:
								row[3] === 'delivery' || row[3] === 'service' || row[3] === 'tax'
									? row[3]
									: 'other'
						}))
				: [],
			participants: parsed.ps
				.filter((row) => Array.isArray(row) && row.length >= 9)
				.map((row) => ({
					name: str(row[0], 'Peserta'),
					isMe: row[1] === 1,
					paid: row[2] === 1,
					color: str(row[3], '#0f172a'),
					itemsSubtotal: num(row[4]),
					discountShare: num(row[5]),
					feeShare: num(row[6]),
					finalAmount: num(row[7]),
					items: Array.isArray(row[8])
						? row[8]
								.filter((item) => Array.isArray(item) && item.length >= 3)
								.map((item) => ({
									name: str(item[0], 'Menu'),
									shareLabel: str(item[1], '1x'),
									amount: num(item[2])
								}))
						: []
				}))
		};
	} catch {
		return null;
	}
}
