import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	apportionByLargestRemainder,
	calculateSplitBill,
	computeAutoDiscountFromPaidTotal,
	decodeReceiptPayload,
	encodeReceiptPayload,
	formatWhatsAppSummary
} from './split-bill.ts';
import type { SplitBillInput } from './types.ts';

describe('apportionByLargestRemainder', () => {
	it('splits uneven IDR amounts with zero penny drift', () => {
		const parts = apportionByLargestRemainder([1, 1, 1], 10000, 0);
		assert.deepEqual(parts, [3334, 3333, 3333]);
		assert.equal(
			parts.reduce((a, b) => a + b, 0),
			10000
		);
	});

	it('splits uneven USD amounts to exact cents', () => {
		const parts = apportionByLargestRemainder([1, 1, 1], 100, 2);
		assert.deepEqual(parts, [33.34, 33.33, 33.33]);
		assert.equal(
			Math.round(parts.reduce((a, b) => a + b, 0) * 100),
			10000
		);
	});
});

describe('calculateSplitBill', () => {
	it('handles full GoFood multi-discount scenario with item discount, capped %, fixed voucher, delivery discount, and shared items', () => {
		const bill: SplitBillInput = {
			date: '2026-11-28',
			title: 'GoFood Makan Siang',
			merchant: 'Ayam Geprek Mantap',
			currency: 'IDR',
			participants: [
				{ id: 'me', name: 'Raka', isMe: true, color: '#0f172a', paid: true },
				{ id: 'dimas', name: 'Dimas', isMe: false, color: '#0284c7', paid: false },
				{ id: 'siti', name: 'Siti', isMe: false, color: '#059669', paid: true }
			],
			items: [
				// Raka: 45,000 - 5,000 menu discount = 40,000
				{ id: 'i1', name: 'Paket Ayam Mozza', price: 45000, qty: 1, itemDiscount: 5000, shares: { me: 1 } },
				// Dimas: 60,000
				{ id: 'i2', name: 'Ayam Jumbo + Es Teh', price: 30000, qty: 2, itemDiscount: 0, shares: { dimas: 1 } },
				// Siti: 20,000
				{ id: 'i3', name: 'Nasi Telor', price: 20000, qty: 1, itemDiscount: 0, shares: { siti: 1 } },
				// Shared equally by all 3: 30,000 -> 10,000 each
				{
					id: 'i4',
					name: 'Tahu Crispy Sharing',
					price: 30000,
					qty: 1,
					itemDiscount: 0,
					shares: { me: 1, dimas: 1, siti: 1 }
				}
			],
			discounts: [
				// 40% of 150,000 = 60,000 -> capped at 35,000
				{
					id: 'd1',
					label: 'Voucher GoFood 40%',
					mode: 'percent',
					value: 40,
					maxAmount: 35000,
					target: 'items',
					allocation: 'proportional'
				},
				// Fixed promo 10,000
				{
					id: 'd2',
					label: 'Promo QRIS',
					mode: 'fixed',
					value: 10000,
					target: 'items',
					allocation: 'proportional'
				},
				// Delivery discount 20,000 -> capped at gross delivery fee 14,000
				{
					id: 'd3',
					label: 'Gratis Ongkir s.d 20rb',
					mode: 'fixed',
					value: 20000,
					target: 'delivery',
					allocation: 'equal'
				}
			],
			fees: [
				{ id: 'f1', label: 'Ongkir', mode: 'fixed', value: 14000, kind: 'delivery', allocation: 'equal' },
				{ id: 'f2', label: 'Biaya Layanan', mode: 'fixed', value: 6000, kind: 'service', allocation: 'equal' }
			],
			roundingStep: 0,
			paymentInfo: 'BCA 1234567890 a/n Raka',
			categoryId: '',
			account: 'Main bank',
			ledgerMode: 'my_share'
		};

		const result = calculateSplitBill(bill);

		// Menu totals: Raka 50k, Dimas 70k, Siti 30k => total 150k
		assert.equal(result.itemsGrossSubtotal, 155000);
		assert.equal(result.itemsMenuDiscountTotal, 5000);
		assert.equal(result.assignedItemsSubtotal, 150000);
		assert.equal(result.unassignedAmount, 0);

		// Discounts: 35k (capped) + 10k = 45k item discounts; delivery discount capped at 14k
		assert.equal(result.effectiveItemDiscount, 45000);
		assert.equal(result.effectiveDeliveryDiscount, 14000);
		assert.equal(result.totalDiscount, 5000 + 45000 + 14000);

		// Fees: net delivery = 0, service = 6,000 -> 2,000 each
		assert.equal(result.netDeliveryFees, 0);
		assert.equal(result.netFeesTotal, 6000);

		// Grand total = 150,000 - 45,000 + 6,000 = 111,000
		assert.equal(result.exactGrandTotal, 111000);
		assert.equal(result.grandTotal, 111000);

		// Proportional item discount = 30% of each person's subtotal:
		// Raka: 50,000 - 15,000 + 2,000 = 37,000
		// Dimas: 70,000 - 21,000 + 2,000 = 51,000
		// Siti: 30,000 - 9,000 + 2,000 = 23,000
		const byId = new Map(result.participants.map((p) => [p.participant.id, p]));
		assert.equal(byId.get('me')?.finalAmount, 37000);
		assert.equal(byId.get('dimas')?.finalAmount, 51000);
		assert.equal(byId.get('siti')?.finalAmount, 23000);

		assert.equal(result.myShare, 37000);
		// Only Dimas is unpaid
		assert.equal(result.unpaidCount, 1);
		assert.equal(result.outstandingAmount, 51000);
		assert.equal(result.status, 'open');
	});

	it('maintains exact grandTotal on prime/odd splits and supports roundingStep', () => {
		const base: SplitBillInput = {
			date: '2026-11-28',
			title: 'Ngopi Sore',
			merchant: 'Kopi',
			currency: 'IDR',
			participants: [
				{ id: 'me', name: 'Raka', isMe: true, color: '#0f172a', paid: true },
				{ id: 'a', name: 'Andi', isMe: false, color: '#0284c7', paid: true },
				{ id: 'b', name: 'Bagas', isMe: false, color: '#059669', paid: true }
			],
			items: [
				{ id: 'i1', name: 'Kopi A', price: 23000, qty: 1, itemDiscount: 0, shares: { me: 1 } },
				{ id: 'i2', name: 'Kopi B', price: 27000, qty: 1, itemDiscount: 0, shares: { a: 1 } },
				{ id: 'i3', name: 'Kopi C', price: 31000, qty: 1, itemDiscount: 0, shares: { b: 1 } }
			],
			discounts: [
				{ id: 'd1', label: 'Voucher', mode: 'fixed', value: 17500, target: 'items', allocation: 'proportional' }
			],
			fees: [
				{ id: 'f1', label: 'Ongkir', mode: 'fixed', value: 10000, kind: 'delivery', allocation: 'equal' }
			],
			roundingStep: 0,
			paymentInfo: '',
			categoryId: '',
			account: '',
			ledgerMode: 'none'
		};

		const exact = calculateSplitBill(base);
		// 81,000 - 17,500 + 10,000 = 73,500
		assert.equal(exact.exactGrandTotal, 73500);
		assert.equal(
			exact.participants.reduce((s, p) => s + p.finalAmount, 0),
			73500
		);
		assert.equal(exact.status, 'settled');

		const rounded500 = calculateSplitBill({ ...base, roundingStep: 500 });
		for (const p of rounded500.participants) {
			assert.equal(p.finalAmount % 500, 0);
		}
		assert.ok(rounded500.grandTotal >= exact.exactGrandTotal);
		assert.equal(rounded500.roundingSurplus, rounded500.grandTotal - exact.exactGrandTotal);
	});

	it('flags unassigned items and computes auto-discount from actual paid total', () => {
		const bill: SplitBillInput = {
			date: '2026-11-28',
			title: 'Test Unassigned',
			merchant: '',
			currency: 'IDR',
			participants: [{ id: 'me', name: 'Raka', isMe: true, color: '#0f172a', paid: true }],
			items: [
				{ id: 'i1', name: 'Belum dipilih', price: 25000, qty: 1, itemDiscount: 0, shares: {} }
			],
			discounts: [],
			fees: [],
			roundingStep: 0,
			paymentInfo: '',
			categoryId: '',
			account: '',
			ledgerMode: 'none'
		};

		const calc = calculateSplitBill(bill);
		assert.equal(calc.unassignedAmount, 25000);
		assert.equal(calc.unassignedItems.length, 1);

		assert.equal(computeAutoDiscountFromPaidTotal(150000, 18000, 118000), 50000);
		assert.equal(computeAutoDiscountFromPaidTotal(100000, 10000, 120000), 0);
	});
});

describe('sharing: WhatsApp formatter & stateless receipt URL codec', () => {
	it('encodes and decodes public receipt payloads losslessly and formats WhatsApp text', async () => {
		const bill: SplitBillInput = {
			date: '2026-11-28',
			title: 'Kopi Sore Tim',
			merchant: 'Fore Coffee',
			currency: 'IDR',
			participants: [
				{ id: 'me', name: 'Raka', isMe: true, color: '#0f172a', paid: true },
				{ id: 'rara', name: 'Rara', isMe: false, color: '#db2777', paid: false }
			],
			items: [
				{ id: 'i1', name: 'Butterscotch Sea Salt', price: 35000, qty: 1, itemDiscount: 0, shares: { me: 1 } },
				{ id: 'i2', name: 'Matcha Green Tea', price: 35000, qty: 1, itemDiscount: 0, shares: { rara: 1 } }
			],
			discounts: [
				{ id: 'd1', label: 'Voucher 30%', mode: 'percent', value: 30, maxAmount: 20000, target: 'items', allocation: 'proportional' }
			],
			fees: [
				{ id: 'f1', label: 'Ongkir', mode: 'fixed', value: 10000, kind: 'delivery', allocation: 'equal' }
			],
			roundingStep: 0,
			paymentInfo: 'BCA 9876543210 a/n Raka',
			categoryId: '',
			account: '',
			ledgerMode: 'my_share'
		};

		const calc = calculateSplitBill(bill);
		const token = await encodeReceiptPayload(bill, calc);
		assert.ok(token.startsWith('z.') || token.startsWith('j.'));

		const decoded = await decodeReceiptPayload(token);
		assert.ok(decoded !== null);
		assert.equal(decoded.title, 'Kopi Sore Tim');
		assert.equal(decoded.merchant, 'Fore Coffee');
		assert.equal(decoded.grandTotal, 60000);
		assert.equal(decoded.totalDiscount, 20000);
		assert.equal(decoded.paymentInfo, 'BCA 9876543210 a/n Raka');
		assert.equal(decoded.participants.length, 2);
		assert.equal(decoded.participants[1]?.name, 'Rara');
		assert.equal(decoded.participants[1]?.finalAmount, 30000);

		const wa = formatWhatsAppSummary(bill, calc, `https://sanku.app/s?d=${token}`);
		assert.match(wa, /Beli Rame-rame: Kopi Sore Tim \(Fore Coffee\)/);
		assert.match(wa, /Rara/);
		assert.match(wa, /BCA 9876543210 a\/n Raka/);
		assert.match(wa, /https:\/\/sanku\.app\/s\?d=/);

		// Invalid tokens safely return null
		assert.equal(await decodeReceiptPayload('invalid-token'), null);
		assert.equal(await decodeReceiptPayload(''), null);
	});
});
