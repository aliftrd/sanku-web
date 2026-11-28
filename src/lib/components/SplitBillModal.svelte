<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type {
		Category,
		SplitBill,
		SplitDiscount,
		SplitFee,
		SplitItem,
		SplitLedgerMode,
		SplitParticipant,
		SplitRoundingStep,
		Wallet
	} from '#lib/types.ts';
	import {
		formatMoney,
		formatNumberWithDots,
		parseNumberWithDots
	} from '#lib/finance.ts';
	import {
		calculateSplitBill,
		computeAutoDiscountFromPaidTotal,
		encodeReceiptPayload,
		formatWhatsAppSummary,
		SPLIT_COLORS
	} from '#lib/split-bill.ts';
	import { cn } from '#lib/utils.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import * as Select from '#lib/components/ui/select/index.ts';
	import CustomSelect from './CustomSelect.svelte';

	const PAYMENT_STORAGE_KEY = 'sanku_split_payment_info';

	let {
		splitBills = [],
		categories,
		wallets = [],
		currency,
		today,
		userName = 'Saya',
		initialTab = 'calculator',
		onclose,
		onnotice
	}: {
		splitBills?: SplitBill[];
		categories: Category[];
		wallets?: Wallet[];
		currency: string;
		today: string;
		userName?: string;
		initialTab?: 'calculator' | 'history';
		onclose: () => void;
		onnotice?: (message: string) => void;
	} = $props();

	const firstName = untrack(() => userName.trim().split(/\s+/)[0] || 'Saya');
	const expenseCategories = $derived(categories.filter((c) => c.type === 'expense'));
	const defaultDiningCategoryId = $derived.by(() => {
		const dining = expenseCategories.find((c) =>
			/dining|food|makan|kopi|cafe|restaurant/i.test(c.name)
		);
		return dining?.id ?? expenseCategories[0]?.id ?? '';
	});

	let activeTab = $state<'calculator' | 'history'>(untrack(() => initialTab));
	let historyFilter = $state<'all' | 'open' | 'settled'>('all');
	let recordReimbursement = $state(true);

	let editingId = $state<string | null>(null);
	let ledgerTxId = $state<string | undefined>(undefined);
	let title = $state('');
	let merchant = $state('');
	let date = $state(untrack(() => today));

	function makeId(prefix: string): string {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
		}
		return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
	}

	function createDefaultParticipants(): SplitParticipant[] {
		return [
			{
				id: 'me',
				name: firstName,
				isMe: true,
				color: SPLIT_COLORS[0],
				paid: true
			},
			{
				id: makeId('p'),
				name: 'Teman 1',
				isMe: false,
				color: SPLIT_COLORS[1],
				paid: false
			}
		];
	}

	let participants = $state<SplitParticipant[]>(createDefaultParticipants());
	let newFriendName = $state('');

	let items = $state<SplitItem[]>([
		{
			id: makeId('item'),
			name: '',
			price: 0,
			qty: 1,
			itemDiscount: 0,
			shares: { me: 1 }
		}
	]);
	let showItemDiscountMap = $state<Record<string, boolean>>({});

	let discounts = $state<SplitDiscount[]>([]);
	let fees = $state<SplitFee[]>([
		{
			id: makeId('fee'),
			label: 'Ongkir',
			mode: 'fixed',
			value: 0,
			kind: 'delivery',
			allocation: 'equal'
		},
		{
			id: makeId('fee'),
			label: 'Biaya Layanan',
			mode: 'fixed',
			value: 0,
			kind: 'service',
			allocation: 'equal'
		}
	]);

	let roundingStep = $state<SplitRoundingStep>(0);
	let paymentInfo = $state('');
	let ledgerMode = $state<SplitLedgerMode>('my_share');
	let categoryId = $state(untrack(() => defaultDiningCategoryId));
	let account = $state(untrack(() => wallets[0]?.name ?? ''));

	let showAutoDiscount = $state(false);
	let autoPaidDisplay = $state('');

	let saving = $state(false);
	let busyToggleKey = $state<string | null>(null);
	let deletingBillId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let copiedState = $state<string | null>(null);

	onMount(() => {
		try {
			const savedPayment = localStorage.getItem(PAYMENT_STORAGE_KEY);
			if (savedPayment && !paymentInfo) {
				paymentInfo = savedPayment;
			}
		} catch {
			// Ignore localStorage access errors
		}
	});

	$effect(() => {
		if (!paymentInfo.trim()) return;
		try {
			localStorage.setItem(PAYMENT_STORAGE_KEY, paymentInfo);
		} catch {
			// Ignore localStorage write errors
		}
	});

	const categoryOptions = $derived([
		{ value: '', label: 'Uncategorized', icon: '📦' },
		...expenseCategories.map((c) => ({
			value: c.id,
			label: c.name,
			icon: c.emoji,
			color: c.color
		}))
	]);

	const accountOptions = $derived([
		{ value: '', label: 'Unassigned Account', icon: '—' },
		...wallets.map((w) => ({
			value: w.name,
			label: w.name,
			icon: w.icon,
			color: w.color
		}))
	]);

	const calc = $derived(
		calculateSplitBill({
			currency,
			participants,
			items,
			discounts,
			fees,
			roundingStep
		})
	);

	const openBillsCount = $derived(splitBills.filter((b) => b.status === 'open').length);

	const filteredHistory = $derived.by(() => {
		if (historyFilter === 'all') return splitBills;
		return splitBills.filter((b) => b.status === historyFilter);
	});

	const isZeroDecimal = $derived(calc.decimals === 0);

	const serializedPayload = $derived(
		JSON.stringify({
			id: editingId ?? undefined,
			date,
			title: title.trim() || 'Beli Rame-rame',
			merchant: merchant.trim(),
			currency,
			participants,
			items,
			discounts,
			fees,
			roundingStep,
			paymentInfo: paymentInfo.trim(),
			categoryId,
			account,
			ledgerMode,
			ledgerTxId
		})
	);

	function resetForm() {
		editingId = null;
		ledgerTxId = undefined;
		title = '';
		merchant = '';
		date = today;
		participants = createDefaultParticipants();
		items = [
			{
				id: makeId('item'),
				name: '',
				price: 0,
				qty: 1,
				itemDiscount: 0,
				shares: { me: 1 }
			}
		];
		showItemDiscountMap = {};
		discounts = [];
		fees = [
			{
				id: makeId('fee'),
				label: 'Ongkir',
				mode: 'fixed',
				value: 0,
				kind: 'delivery',
				allocation: 'equal'
			},
			{
				id: makeId('fee'),
				label: 'Biaya Layanan',
				mode: 'fixed',
				value: 0,
				kind: 'service',
				allocation: 'equal'
			}
		];
		roundingStep = 0;
		ledgerMode = 'my_share';
		categoryId = defaultDiningCategoryId;
		account = wallets[0]?.name ?? '';
		showAutoDiscount = false;
		autoPaidDisplay = '';
		error = null;
	}

	function loadBillForEdit(bill: SplitBill) {
		editingId = bill.id;
		ledgerTxId = bill.ledgerTxId;
		title = bill.title;
		merchant = bill.merchant;
		date = bill.date;
		participants = bill.participants.map((p) => ({ ...p }));
		items = bill.items.map((item) => ({
			...item,
			shares: { ...item.shares }
		}));
		showItemDiscountMap = Object.fromEntries(
			bill.items.filter((i) => i.itemDiscount > 0).map((i) => [i.id, true])
		);
		discounts = bill.discounts.map((d) => ({ ...d }));
		fees = bill.fees.map((f) => ({ ...f }));
		roundingStep = bill.roundingStep;
		if (bill.paymentInfo) paymentInfo = bill.paymentInfo;
		categoryId = bill.categoryId || defaultDiningCategoryId;
		account = bill.account || wallets[0]?.name || '';
		ledgerMode = bill.ledgerMode;
		error = null;
		activeTab = 'calculator';
	}

	function addParticipant() {
		const trimmed = newFriendName.trim();
		if (!trimmed) return;
		const id = makeId('p');
		const color = SPLIT_COLORS[participants.length % SPLIT_COLORS.length];
		participants = [
			...participants,
			{
				id,
				name: trimmed.slice(0, 40),
				isMe: false,
				color,
				paid: false
			}
		];
		newFriendName = '';
	}

	function removeParticipant(pid: string) {
		const target = participants.find((p) => p.id === pid);
		if (!target || target.isMe || participants.length <= 1) return;
		participants = participants.filter((p) => p.id !== pid);
		items = items.map((item) => {
			if (!(pid in item.shares)) return item;
			const nextShares = { ...item.shares };
			delete nextShares[pid];
			return { ...item, shares: nextShares };
		});
	}

	function toggleParticipantPaidLocal(pid: string) {
		participants = participants.map((p) =>
			p.id === pid && !p.isMe ? { ...p, paid: !p.paid } : p
		);
	}

	function addItem(assignToAll = false) {
		const shares: Record<string, number> = {};
		if (assignToAll) {
			for (const p of participants) shares[p.id] = 1;
		} else {
			const defaultP = participants[0];
			if (defaultP) shares[defaultP.id] = 1;
		}
		items = [
			...items,
			{
				id: makeId('item'),
				name: '',
				price: 0,
				qty: 1,
				itemDiscount: 0,
				shares
			}
		];
	}

	function setQuickEqualSplit() {
		const allShares: Record<string, number> = {};
		for (const p of participants) allShares[p.id] = 1;
		const currentSum = calc.itemsNetSubtotal;
		items = [
			{
				id: makeId('item'),
				name: 'Total Pesanan Bersama',
				price: currentSum > 0 ? currentSum : 0,
				qty: 1,
				itemDiscount: 0,
				shares: allShares
			}
		];
		showItemDiscountMap = {};
	}

	function removeItem(itemId: string) {
		if (items.length <= 1) {
			items = [
				{
					id: makeId('item'),
					name: '',
					price: 0,
					qty: 1,
					itemDiscount: 0,
					shares: participants[0] ? { [participants[0].id]: 1 } : {}
				}
			];
			return;
		}
		items = items.filter((item) => item.id !== itemId);
	}

	function toggleItemShare(itemId: string, pid: string) {
		items = items.map((item) => {
			if (item.id !== itemId) return item;
			const nextShares = { ...item.shares };
			if (nextShares[pid]) {
				delete nextShares[pid];
			} else {
				nextShares[pid] = 1;
			}
			return { ...item, shares: nextShares };
		});
	}

	function toggleItemAllShares(itemId: string) {
		items = items.map((item) => {
			if (item.id !== itemId) return item;
			const allSelected = participants.every((p) => (item.shares[p.id] ?? 0) > 0);
			if (allSelected) {
				return { ...item, shares: {} };
			}
			const nextShares: Record<string, number> = {};
			for (const p of participants) nextShares[p.id] = 1;
			return { ...item, shares: nextShares };
		});
	}

	function addDiscountPreset(preset: 'voucher_pct' | 'fixed_rp' | 'delivery_off') {
		if (preset === 'voucher_pct') {
			discounts = [
				...discounts,
				{
					id: makeId('disc'),
					label: 'Voucher Promo',
					mode: 'percent',
					value: 30,
					maxAmount: 30000,
					target: 'items',
					allocation: 'proportional'
				}
			];
		} else if (preset === 'fixed_rp') {
			discounts = [
				...discounts,
				{
					id: makeId('disc'),
					label: 'Potongan Promo',
					mode: 'fixed',
					value: 20000,
					target: 'items',
					allocation: 'proportional'
				}
			];
		} else {
			discounts = [
				...discounts,
				{
					id: makeId('disc'),
					label: 'Diskon Ongkir',
					mode: 'fixed',
					value: 10000,
					target: 'delivery',
					allocation: 'equal'
				}
			];
		}
	}

	function removeDiscount(discountId: string) {
		discounts = discounts.filter((d) => d.id !== discountId);
	}

	function applyAutoDiscountFromPaid() {
		const paidActual = parseNumberWithDots(autoPaidDisplay);
		if (paidActual <= 0) return;

		const impliedDiscount = computeAutoDiscountFromPaidTotal(
			calc.assignedItemsSubtotal,
			calc.grossFeesTotal,
			paidActual
		);

		if (impliedDiscount <= 0) {
			error = 'Total bayar akhir lebih besar atau sama dengan subtotal + biaya, tidak ada selisih diskon.';
			return;
		}

		error = null;
		discounts = [
			{
				id: makeId('disc'),
				label: 'Total Diskon & Promo',
				mode: 'fixed',
				value: impliedDiscount,
				target: 'items',
				allocation: 'proportional'
			}
		];
		showAutoDiscount = false;
	}

	function addFeePreset(preset: 'delivery' | 'service' | 'tax' | 'other') {
		if (preset === 'delivery') {
			fees = [
				...fees,
				{
					id: makeId('fee'),
					label: 'Ongkir',
					mode: 'fixed',
					value: 12000,
					kind: 'delivery',
					allocation: 'equal'
				}
			];
		} else if (preset === 'service') {
			fees = [
				...fees,
				{
					id: makeId('fee'),
					label: 'Biaya Layanan & Kemasan',
					mode: 'fixed',
					value: 5000,
					kind: 'service',
					allocation: 'equal'
				}
			];
		} else if (preset === 'tax') {
			fees = [
				...fees,
				{
					id: makeId('fee'),
					label: 'Pajak PB1',
					mode: 'percent',
					value: 10,
					kind: 'tax',
					allocation: 'proportional'
				}
			];
		} else {
			fees = [
				...fees,
				{
					id: makeId('fee'),
					label: 'Biaya Lain',
					mode: 'fixed',
					value: 0,
					kind: 'other',
					allocation: 'equal'
				}
			];
		}
	}

	function removeFee(feeId: string) {
		fees = fees.filter((f) => f.id !== feeId);
	}

	function flashCopied(key: string) {
		copiedState = key;
		setTimeout(() => {
			if (copiedState === key) copiedState = null;
		}, 2400);
	}

	async function buildShareUrlFor(
		billLike: Pick<
			SplitBill,
			'title' | 'merchant' | 'date' | 'currency' | 'paymentInfo' | 'roundingStep'
		>,
		billCalc = calc
	): Promise<string> {
		const token = await encodeReceiptPayload(billLike, billCalc);
		const origin = typeof window !== 'undefined' ? window.location.origin : '';
		return `${origin}/s?d=${token}`;
	}

	async function copyWhatsAppForCurrent() {
		const billDraft = {
			title: title.trim() || 'Beli Rame-rame',
			merchant: merchant.trim(),
			date,
			currency,
			paymentInfo: paymentInfo.trim(),
			roundingStep
		};
		const shareUrl = await buildShareUrlFor(billDraft, calc);
		const text = formatWhatsAppSummary(billDraft, calc, shareUrl);
		await navigator.clipboard.writeText(text);
		flashCopied('wa-current');
	}

	async function copyLinkForCurrent() {
		const billDraft = {
			title: title.trim() || 'Beli Rame-rame',
			merchant: merchant.trim(),
			date,
			currency,
			paymentInfo: paymentInfo.trim(),
			roundingStep
		};
		const shareUrl = await buildShareUrlFor(billDraft, calc);
		await navigator.clipboard.writeText(shareUrl);
		flashCopied('link-current');
	}

	async function previewReceiptForCurrent() {
		const billDraft = {
			title: title.trim() || 'Beli Rame-rame',
			merchant: merchant.trim(),
			date,
			currency,
			paymentInfo: paymentInfo.trim(),
			roundingStep
		};
		const shareUrl = await buildShareUrlFor(billDraft, calc);
		window.open(shareUrl, '_blank', 'noopener,noreferrer');
	}

	async function copyWhatsAppForBill(bill: SplitBill) {
		const billCalc = calculateSplitBill(bill);
		const shareUrl = await buildShareUrlFor(bill, billCalc);
		const text = formatWhatsAppSummary(bill, billCalc, shareUrl);
		await navigator.clipboard.writeText(text);
		flashCopied(`wa-${bill.id}`);
	}

	async function copyLinkForBill(bill: SplitBill) {
		const billCalc = calculateSplitBill(bill);
		const shareUrl = await buildShareUrlFor(bill, billCalc);
		await navigator.clipboard.writeText(shareUrl);
		flashCopied(`link-${bill.id}`);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && !saving) onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="bg-ink/80 fixed inset-0 z-50 flex items-center justify-center p-3 backdrop-blur-[2px] sm:p-4"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget && !saving) onclose();
	}}
>
	<div
		class="bg-surface-card text-on-surface border-outline-variant flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="split-bill-modal-title"
	>
		<!-- Modal Header -->
		<header class="border-outline-variant flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-6">
			<div class="flex min-w-0 items-center gap-3">
				<span class="bg-coral text-on-coral flex size-10 shrink-0 items-center justify-center rounded-full text-base">
					🧾
				</span>
				<div class="min-w-0">
					<div class="flex items-center gap-2">
						<h2 id="split-bill-modal-title" class="font-headline text-headline-md text-on-surface truncate uppercase">
							Beli Rame-rame
						</h2>
						{#if editingId}
							<Badge variant="marigold" class="text-[10px]">Mode Edit</Badge>
						{/if}
					</div>
					<p class="font-body text-body-sm text-on-surface-variant truncate">
						Hitung patungan grup, diskon proporsional &amp; status bayar teman
					</p>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<div class="bg-ink inline-flex items-center gap-0.5 rounded-full p-1" role="tablist">
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === 'calculator'}
						onclick={() => (activeTab = 'calculator')}
						class={cn(
							'font-label text-label-sm cursor-pointer rounded-full px-3.5 py-1 transition-colors',
							activeTab === 'calculator'
								? 'bg-pill-white text-on-pill-white'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
					>
						{editingId ? 'Edit Sesi' : 'Kalkulator'}
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === 'history'}
						onclick={() => (activeTab = 'history')}
						class={cn(
							'font-label text-label-sm inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1 transition-colors',
							activeTab === 'history'
								? 'bg-pill-white text-on-pill-white'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
					>
						<span>Riwayat</span>
						{#if openBillsCount > 0}
							<span class="bg-marigold text-on-marigold rounded-full px-1.5 py-0 text-[10px] font-bold tabular-nums">
								{openBillsCount}
							</span>
						{:else if splitBills.length > 0}
							<span class="text-[10px] opacity-75 tabular-nums">
								({splitBills.length})
							</span>
						{/if}
					</button>
				</div>

				<button
					type="button"
					aria-label="Tutup"
					onclick={onclose}
					class="bg-pill-white text-on-pill-white inline-flex size-8 cursor-pointer items-center justify-center rounded-full"
				>
					<span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
				</button>
			</div>
		</header>

		{#if activeTab === 'calculator'}
			<div class="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12 lg:overflow-hidden">
				<!-- LEFT COLUMN -->
				<div class="border-outline-variant flex flex-col gap-5 p-4 sm:p-6 lg:col-span-7 lg:overflow-y-auto lg:border-r">
					<section class="space-y-3">
						<div class="flex items-center justify-between">
							<h3 class="font-label text-label-sm text-on-surface-variant uppercase">
								1. Info Pesanan
							</h3>
							{#if editingId}
								<button
									type="button"
									class="text-marigold cursor-pointer text-xs font-bold hover:underline"
									onclick={resetForm}
								>
									Buat Sesi Baru
								</button>
							{/if}
						</div>

						<div class="grid grid-cols-1 gap-3 sm:grid-cols-12">
							<div class="space-y-1 sm:col-span-5">
								<Label for="sb-title">Nama Acara / Pesanan</Label>
								<Input id="sb-title" bind:value={title} placeholder="mis. GoFood Makan Siang" maxlength={100} class="h-9 text-sm" />
							</div>
							<div class="space-y-1 sm:col-span-4">
								<Label for="sb-merchant">Resto / Toko</Label>
								<Input id="sb-merchant" bind:value={merchant} placeholder="mis. Kopi Kenangan" maxlength={80} class="h-9 text-sm" />
							</div>
							<div class="space-y-1 sm:col-span-3">
								<Label for="sb-date">Tanggal</Label>
								<Input id="sb-date" type="date" bind:value={date} class="h-9 text-xs" />
							</div>
						</div>
					</section>

					<section class="border-outline-variant space-y-2.5 border-t pt-4">
						<h3 class="font-label text-label-sm text-on-surface-variant uppercase">
							2. Peserta ({participants.length} orang)
						</h3>

						<div class="flex flex-wrap items-center gap-1.5">
							{#each participants as person (person.id)}
								<div
									class={cn(
										'inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 text-xs font-semibold',
										person.isMe ? 'bg-marigold text-on-marigold' : 'bg-surface-container text-on-surface border border-outline-variant'
									)}
								>
									<span class="size-2 shrink-0 rounded-full" style={`background-color: ${person.color}`}></span>
									{#if person.isMe}
										<input type="text" bind:value={person.name} aria-label="Nama Anda" maxlength={40} class="w-16 bg-transparent font-bold outline-none focus:w-24" />
										<span class="bg-ink text-on-surface rounded-full px-1.5 text-[10px] font-bold">Saya</span>
									{:else}
										<input type="text" bind:value={person.name} aria-label={`Nama ${person.name}`} maxlength={40} class="w-20 bg-transparent outline-none focus:w-28" />
										<button type="button" class="hover:text-coral ml-0.5 cursor-pointer text-xs" onclick={() => removeParticipant(person.id)} aria-label={`Hapus ${person.name}`}>×</button>
									{/if}
								</div>
							{/each}
						</div>

						<div class="flex items-center gap-2">
							<Input
								bind:value={newFriendName}
								placeholder="Ketik nama teman lalu tekan Enter..."
								maxlength={40}
								class="h-9 flex-1 text-xs"
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										addParticipant();
									}
								}}
							/>
							<Button type="button" variant="pill-white" size="sm" onclick={addParticipant}>
								+ Tambah Teman
							</Button>
						</div>
					</section>

					<section class="border-outline-variant space-y-3 border-t pt-4">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h3 class="font-label text-label-sm text-on-surface-variant uppercase">
								3. Daftar Pesanan ({items.length})
							</h3>
							<div class="flex items-center gap-1.5">
								<Button type="button" variant="ghost" size="sm" class="h-7 px-2.5 text-xs" onclick={setQuickEqualSplit}>
									⚡ Bagi Rata
								</Button>
								<Button type="button" variant="pill-white" size="sm" class="h-7 px-3 text-xs" onclick={() => addItem(false)}>
									+ Tambah Menu
								</Button>
							</div>
						</div>

						<div class="space-y-2.5">
							{#each items as item, idx (item.id)}
								{@const itemGross = (Number(item.price) || 0) * (Number(item.qty) || 0)}
								{@const itemNet = Math.max(0, itemGross - (Number(item.itemDiscount) || 0))}
								{@const allSelected = participants.length > 0 && participants.every((p) => (item.shares[p.id] ?? 0) > 0)}
								{@const assignedCount = participants.filter((p) => (item.shares[p.id] ?? 0) > 0).length}
								<div class="border-outline-variant bg-surface-container space-y-2.5 rounded-lg border p-3">
									<div class="grid grid-cols-12 items-center gap-2">
										<div class="col-span-12 sm:col-span-5">
											<Input bind:value={item.name} placeholder={`Menu #${idx + 1}`} maxlength={80} class="bg-surface h-8 text-xs" />
										</div>
										<div class="col-span-3 sm:col-span-2">
											<input
												type="number"
												min="1"
												max="99"
												bind:value={item.qty}
												aria-label="Jumlah porsi"
												class="border-outline-variant bg-surface text-on-surface h-8 w-full rounded border px-2 font-mono text-xs font-semibold tabular-nums outline-none"
											/>
										</div>
										<div class="col-span-7 sm:col-span-4">
											<div class="border-outline-variant bg-surface flex h-8 items-center gap-1 rounded border px-2">
												<span class="text-on-surface-variant text-[10px] font-bold">{currency}</span>
												<input
													type="text"
													inputmode="numeric"
													aria-label="Harga satuan"
													placeholder="0"
													value={item.price > 0 ? formatNumberWithDots(item.price) : ''}
													oninput={(e) => {
														item.price = parseNumberWithDots((e.target as HTMLInputElement).value);
													}}
													class="text-on-surface w-full bg-transparent text-right font-mono text-xs font-semibold tabular-nums outline-none"
												/>
											</div>
										</div>
										<div class="col-span-2 flex justify-end sm:col-span-1">
											<button
												type="button"
												onclick={() => removeItem(item.id)}
												aria-label="Hapus menu"
												class="bg-surface-card text-on-surface-variant hover:bg-coral hover:text-on-coral flex size-7 cursor-pointer items-center justify-center rounded-full"
											>
												✕
											</button>
										</div>
									</div>

									{#if showItemDiscountMap[item.id] || item.itemDiscount > 0}
										<div class="bg-income/15 border-income/30 flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
											<span class="text-income font-semibold">Diskon Menu:</span>
											<input
												type="text"
												inputmode="numeric"
												placeholder="0"
												value={item.itemDiscount > 0 ? formatNumberWithDots(item.itemDiscount) : ''}
												oninput={(e) => {
													item.itemDiscount = parseNumberWithDots((e.target as HTMLInputElement).value);
												}}
												class="border-outline-variant bg-surface text-income h-7 w-28 rounded border px-2 text-right font-mono text-xs font-semibold tabular-nums outline-none"
											/>
											<span class="text-on-surface-variant ml-auto font-mono text-[11px] tabular-nums">
												Subtotal: <strong class="text-on-surface">{formatMoney(itemNet, currency)}</strong>
											</span>
										</div>
									{/if}

									<div class="flex flex-wrap items-center justify-between gap-2">
										<div class="flex flex-wrap items-center gap-1.5">
											<button
												type="button"
												onclick={() => toggleItemAllShares(item.id)}
												class={cn(
													'cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-colors',
													allSelected ? 'bg-pill-white text-on-pill-white' : 'bg-surface-card text-on-surface-variant'
												)}
											>
												Semua
											</button>
											{#each participants as person (person.id)}
												{@const active = (item.shares[person.id] ?? 0) > 0}
												<button
													type="button"
													onclick={() => toggleItemShare(item.id, person.id)}
													class={cn(
														'inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors',
														active ? 'bg-coral text-on-coral' : 'bg-surface-card text-on-surface-variant hover:text-on-surface'
													)}
												>
													<span>{person.name}</span>
												</button>
											{/each}
										</div>

										<div class="flex items-center gap-2 text-[11px]">
											{#if !showItemDiscountMap[item.id] && item.itemDiscount === 0}
												<button
													type="button"
													class="text-income cursor-pointer font-semibold hover:underline"
													onclick={() => (showItemDiscountMap = { ...showItemDiscountMap, [item.id]: true })}
												>
													+ Diskon menu
												</button>
											{/if}
											{#if assignedCount === 0 && itemNet > 0}
												<span class="text-marigold font-bold">⚠ Pilih pemesan</span>
											{:else if itemNet > 0}
												<span class="text-on-surface-variant font-mono tabular-nums">
													{formatMoney(itemNet, currency)}
												</span>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>

						{#if calc.unassignedAmount > 0}
							<div class="bg-marigold text-on-marigold flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold">
								<span>⚠</span>
								<p>
									Ada pesanan senilai <strong class="font-mono">{formatMoney(calc.unassignedAmount, currency)}</strong> yang belum dipilih pemesannya.
								</p>
							</div>
						{/if}
					</section>

					<section class="border-outline-variant space-y-3 border-t pt-4">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h3 class="font-label text-label-sm text-on-surface-variant uppercase">
								4. Diskon &amp; Voucher Promo
							</h3>
							<button
								type="button"
								onclick={() => (showAutoDiscount = !showAutoDiscount)}
								class="bg-sky-mint text-on-sky-mint cursor-pointer rounded-full px-3 py-1 text-[11px] font-bold transition-opacity hover:opacity-90"
							>
								⚡ Hitung dari Total Bayar Akhir
							</button>
						</div>

						{#if showAutoDiscount}
							<div class="bg-sky-mint text-on-sky-mint space-y-2 rounded-lg p-3.5">
								<p class="text-xs font-medium">
									Masukkan <strong>Total Akhir yang Didebet</strong> untuk menghitung total diskon secara otomatis.
								</p>
								<div class="flex flex-wrap items-center gap-2">
									<div class="bg-sage-cream border-ink/25 flex h-8 flex-1 items-center gap-1.5 rounded border px-2.5">
										<span class="text-ink text-xs font-bold">{currency}</span>
										<input
											type="text"
											inputmode="numeric"
											placeholder="Total akhir"
											value={autoPaidDisplay}
											oninput={(e) => {
												autoPaidDisplay = formatNumberWithDots((e.target as HTMLInputElement).value);
											}}
											class="text-ink w-full bg-transparent font-mono text-sm font-bold tabular-nums outline-none"
										/>
									</div>
									<Button type="button" variant="ink" size="sm" onclick={applyAutoDiscountFromPaid}>
										Terapkan
									</Button>
								</div>
							</div>
						{/if}

						<div class="flex flex-wrap items-center gap-1.5">
							<Button type="button" variant="outline" size="sm" class="h-7 px-3 text-xs" onclick={() => addDiscountPreset('voucher_pct')}>
								+ Voucher %
							</Button>
							<Button type="button" variant="outline" size="sm" class="h-7 px-3 text-xs" onclick={() => addDiscountPreset('fixed_rp')}>
								+ Potongan Rp
							</Button>
							<Button type="button" variant="outline" size="sm" class="h-7 px-3 text-xs" onclick={() => addDiscountPreset('delivery_off')}>
								+ Diskon Ongkir
							</Button>
						</div>

						{#if discounts.length > 0}
							<div class="space-y-2">
								{#each discounts as disc (disc.id)}
									{@const applied = calc.appliedDiscounts.find((d) => d.id === disc.id)}
									<div class="border-outline-variant bg-surface-container space-y-2 rounded-lg border p-3">
										<div class="grid grid-cols-12 items-center gap-2">
											<div class="col-span-12 sm:col-span-4">
												<Input bind:value={disc.label} placeholder="Nama Voucher" maxlength={60} class="bg-surface h-8 text-xs" />
											</div>
											<div class="col-span-4 sm:col-span-2">
												<Select.Root type="single" bind:value={disc.mode}>
													<Select.Trigger aria-label="Tipe diskon" size="xs" class="bg-surface font-semibold">
														{disc.mode === 'percent' ? '%' : currency}
													</Select.Trigger>
													<Select.Content align="start" class="min-w-[84px]">
														<Select.Item value="percent" label="%">%</Select.Item>
														<Select.Item value="fixed" label={currency}>{currency}</Select.Item>
													</Select.Content>
												</Select.Root>
											</div>
											<div class="col-span-6 sm:col-span-3">
												{#if disc.mode === 'percent'}
													<input type="number" min="0" max="100" step="0.5" bind:value={disc.value} class="border-outline-variant bg-surface text-on-surface h-8 w-full rounded border px-2 text-right font-mono text-xs font-semibold outline-none" />
												{:else}
													<input
														type="text"
														inputmode="numeric"
														value={disc.value > 0 ? formatNumberWithDots(disc.value) : ''}
														oninput={(e) => {
															disc.value = parseNumberWithDots((e.target as HTMLInputElement).value);
														}}
														class="border-outline-variant bg-surface text-income h-8 w-full rounded border px-2 text-right font-mono text-xs font-semibold outline-none"
													/>
												{/if}
											</div>
											<div class="col-span-2 flex items-center justify-end gap-1 sm:col-span-3">
												{#if applied && applied.effectiveAmount > 0}
													<span class="text-income hidden font-mono text-xs font-bold tabular-nums sm:inline">
														−{formatMoney(applied.effectiveAmount, currency)}
													</span>
												{/if}
												<button type="button" onclick={() => removeDiscount(disc.id)} aria-label="Hapus diskon" class="text-on-surface-variant hover:text-coral cursor-pointer px-1">✕</button>
											</div>
										</div>
										<div class="flex flex-wrap items-center gap-2 text-[11px]">
											{#if disc.mode === 'percent'}
												<input
													type="text"
													inputmode="numeric"
													placeholder="Maks Rp"
													value={disc.maxAmount && disc.maxAmount > 0 ? formatNumberWithDots(disc.maxAmount) : ''}
													oninput={(e) => {
														const v = parseNumberWithDots((e.target as HTMLInputElement).value);
														disc.maxAmount = v > 0 ? v : undefined;
													}}
													class="border-outline-variant bg-surface text-on-surface h-6 w-24 rounded border px-2 text-right font-mono text-[11px] outline-none"
												/>
											{/if}
											<button type="button" onclick={() => (disc.target = disc.target === 'items' ? 'delivery' : 'items')} class="bg-pill-white text-on-pill-white cursor-pointer rounded-full px-2 py-0.5 font-bold">
												{disc.target === 'delivery' ? 'Ongkir' : 'Menu'}
											</button>
											{#if disc.target === 'items'}
												<button type="button" onclick={() => (disc.allocation = disc.allocation === 'proportional' ? 'equal' : 'proportional')} class="bg-surface-card text-on-surface cursor-pointer rounded-full px-2 py-0.5 font-semibold">
													{disc.allocation === 'proportional' ? 'Proporsional' : 'Sama Rata'}
												</button>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</section>

					<section class="border-outline-variant space-y-3 border-t pt-4">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h3 class="font-label text-label-sm text-on-surface-variant uppercase">
								5. Ongkir, Pajak &amp; Biaya Tambahan
							</h3>
							<div class="flex flex-wrap items-center gap-1">
								<Button type="button" variant="ghost" size="sm" class="h-7 px-2 text-[11px]" onclick={() => addFeePreset('delivery')}>+ Ongkir</Button>
								<Button type="button" variant="ghost" size="sm" class="h-7 px-2 text-[11px]" onclick={() => addFeePreset('service')}>+ Layanan</Button>
								<Button type="button" variant="ghost" size="sm" class="h-7 px-2 text-[11px]" onclick={() => addFeePreset('tax')}>+ PB1</Button>
								<Button type="button" variant="ghost" size="sm" class="h-7 px-2 text-[11px]" onclick={() => addFeePreset('other')}>+ Lainnya</Button>
							</div>
						</div>

						{#if fees.length > 0}
							<div class="space-y-2">
								{#each fees as fee (fee.id)}
									<div class="border-outline-variant bg-surface-container grid grid-cols-12 items-center gap-2 rounded-lg border p-2.5">
										<div class="col-span-12 sm:col-span-4">
											<Input bind:value={fee.label} placeholder="Nama biaya" maxlength={60} class="bg-surface h-8 text-xs" />
										</div>
										<div class="col-span-3 sm:col-span-2">
											<Select.Root type="single" bind:value={fee.mode}>
												<Select.Trigger aria-label="Satuan biaya" size="xs" class="bg-surface px-1.5 font-semibold">
													{fee.mode === 'percent' ? '%' : currency}
												</Select.Trigger>
												<Select.Content align="start" class="min-w-[84px]">
													<Select.Item value="fixed" label={currency}>{currency}</Select.Item>
													<Select.Item value="percent" label="%">%</Select.Item>
												</Select.Content>
											</Select.Root>
										</div>
										<div class="col-span-5 sm:col-span-3">
											{#if fee.mode === 'percent'}
												<input type="number" min="0" max="100" step="0.5" bind:value={fee.value} class="border-outline-variant bg-surface text-on-surface h-8 w-full rounded border px-2 text-right font-mono text-xs font-semibold outline-none" />
											{:else}
												<input
													type="text"
													inputmode="numeric"
													placeholder="0"
													value={fee.value > 0 ? formatNumberWithDots(fee.value) : ''}
													oninput={(e) => {
														fee.value = parseNumberWithDots((e.target as HTMLInputElement).value);
													}}
													class="border-outline-variant bg-surface text-on-surface h-8 w-full rounded border px-2 text-right font-mono text-xs font-semibold outline-none"
												/>
											{/if}
										</div>
										<div class="col-span-4 flex items-center justify-end gap-1 sm:col-span-3">
											<button
												type="button"
												onclick={() => (fee.allocation = fee.allocation === 'equal' ? 'proportional' : 'equal')}
												class="bg-surface-card text-on-surface cursor-pointer rounded-full px-2 py-1 text-[10px] font-bold"
											>
												{fee.allocation === 'equal' ? 'Rata' : 'Prop.'}
											</button>
											<button type="button" onclick={() => removeFee(fee.id)} aria-label="Hapus biaya" class="text-on-surface-variant hover:text-coral cursor-pointer px-1">✕</button>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</section>
				</div>

				<!-- RIGHT COLUMN -->
				<div class="bg-surface-container-low flex flex-col gap-4 p-4 sm:p-6 lg:col-span-5 lg:overflow-y-auto">
					<div class="bg-coral text-on-coral rounded-xl p-5">
						<div class="flex items-start justify-between gap-2">
							<div>
								<span class="font-label text-label-sm uppercase">Grand Total Bayar</span>
								<div class="font-display text-display-md-mobile mt-0.5 tabular-nums">
									{formatMoney(calc.grandTotal, currency)}
								</div>
							</div>
							{#if calc.totalDiscount > 0}
								<span class="bg-ink text-on-surface font-mono text-mono-sm rounded-full px-3 py-1 tabular-nums">
									Hemat {formatMoney(calc.totalDiscount, currency)}
								</span>
							{/if}
						</div>

						<div class="border-ink/15 mt-3 grid grid-cols-3 gap-2 border-t pt-2.5 text-[11px]">
							<div>
								<span class="block opacity-75">Menu</span>
								<strong class="font-mono tabular-nums">{formatMoney(calc.assignedItemsSubtotal, currency)}</strong>
							</div>
							<div>
								<span class="block opacity-75">Diskon</span>
								<strong class="font-mono tabular-nums">−{formatMoney(calc.effectiveItemDiscount + calc.effectiveDeliveryDiscount, currency)}</strong>
							</div>
							<div>
								<span class="block opacity-75">Biaya</span>
								<strong class="font-mono tabular-nums">+{formatMoney(calc.netFeesTotal, currency)}</strong>
							</div>
						</div>
					</div>

					{#if isZeroDecimal}
						<div class="flex flex-wrap items-center justify-between gap-2 text-xs">
							<span class="text-on-surface-variant font-medium">Pembulatan:</span>
							<div class="bg-ink inline-flex items-center gap-0.5 rounded-full p-1">
								{#each [
									{ value: 0, label: 'Tepat' },
									{ value: 100, label: '100' },
									{ value: 500, label: '500' },
									{ value: 1000, label: '1k' }
								] as opt (opt.value)}
									<button
										type="button"
										onclick={() => (roundingStep = opt.value as SplitRoundingStep)}
										class={cn(
											'cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-colors',
											roundingStep === opt.value ? 'bg-pill-white text-on-pill-white' : 'text-on-surface-variant'
										)}
									>
										{opt.label}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<div class="space-y-2">
						{#each calc.participants as row (row.participant.id)}
							<div
								class={cn(
									'rounded-lg p-3.5',
									row.participant.isMe
										? 'bg-marigold text-on-marigold'
										: row.participant.paid
											? 'bg-sky-mint text-on-sky-mint'
											: 'bg-surface-card border border-outline-variant text-on-surface'
								)}
							>
								<div class="flex items-center justify-between gap-2">
									<div class="flex min-w-0 items-center gap-2">
										<strong class="font-title text-title-md truncate">{row.participant.name}</strong>
										{#if row.participant.isMe}
											<span class="bg-ink text-on-surface rounded-full px-2 py-0.5 text-[10px] font-bold uppercase">Saya</span>
										{:else}
											<button
												type="button"
												onclick={() => toggleParticipantPaidLocal(row.participant.id)}
												class={cn(
													'cursor-pointer rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
													row.participant.paid ? 'bg-income text-on-income' : 'bg-coral text-on-coral'
												)}
											>
												{row.participant.paid ? 'Lunas' : 'Belum'}
											</button>
										{/if}
									</div>
									<div class="font-mono text-sm font-bold tabular-nums">
										{formatMoney(row.finalAmount, currency)}
									</div>
								</div>
							</div>
						{/each}
					</div>

					<div class="bg-surface-card border-outline-variant space-y-2.5 rounded-xl border p-3.5">
						<Label for="sb-payment">Rekening / E-Wallet Tujuan Transfer</Label>
						<Input id="sb-payment" bind:value={paymentInfo} placeholder="mis. BCA 1234567890 a/n Nama Pemilik" maxlength={240} class="h-8 text-xs" />
						<div class="grid grid-cols-2 gap-2">
							<Button type="button" variant="outline" size="sm" class="w-full text-xs" onclick={copyWhatsAppForCurrent} disabled={calc.grandTotal <= 0}>
								{copiedState === 'wa-current' ? '✓ Tersalin!' : 'Salin Teks WA'}
							</Button>
							<div class="flex gap-1">
								<Button type="button" variant="pill-white" size="sm" class="flex-1 text-xs" onclick={copyLinkForCurrent} disabled={calc.grandTotal <= 0}>
									{copiedState === 'link-current' ? '✓ Tersalin!' : 'Link Struk'}
								</Button>
								<Button type="button" variant="outline" size="icon-sm" class="size-8 shrink-0" onclick={previewReceiptForCurrent} disabled={calc.grandTotal <= 0} aria-label="Pratinjau">
									↗
								</Button>
							</div>
						</div>
					</div>

					<form
						method="POST"
						action="?/saveSplitBill"
						class="bg-surface-card border-outline-variant space-y-3 rounded-xl border p-3.5"
						use:enhance={({ cancel }) => {
							if (calc.unassignedAmount > 0) {
								error = 'Masih ada pesanan yang belum dipilih pemesannya.';
								cancel();
								return;
							}
							saving = true;
							error = null;
							return async ({ result, update }) => {
								saving = false;
								if (result.type === 'success') {
									await update({ reset: false });
									onnotice?.(`Sesi "${title.trim() || 'Beli Rame-rame'}" tersimpan!`);
									editingId = null;
									activeTab = 'history';
								} else if (result.type === 'failure') {
									const d = result.data as { error?: string } | undefined;
									error = d?.error ?? 'Gagal menyimpan sesi Beli Rame-rame.';
								} else {
									await update();
								}
							};
						}}
					>
						<input type="hidden" name="splitBillJson" value={serializedPayload} />
						<Label>Pencatatan ke Transaksi Sanku</Label>
						<div class="grid grid-cols-1 gap-1.5">
							{#each [
								{ id: 'my_share', title: 'Catat Porsi Saya Saja ke Expense' },
								{ id: 'full_advance', title: 'Catat Talangan Penuh ke Expense' },
								{ id: 'none', title: 'Simpan Riwayat Saja' }
							] as opt (opt.id)}
								<button
									type="button"
									onclick={() => (ledgerMode = opt.id as SplitLedgerMode)}
									class={cn(
										'cursor-pointer rounded-full px-3.5 py-2 text-left text-xs font-bold transition-colors',
										ledgerMode === opt.id ? 'bg-pill-white text-on-pill-white' : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
									)}
								>
									{opt.title}
								</button>
							{/each}
						</div>

						{#if ledgerMode !== 'none'}
							<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
								<CustomSelect bind:value={categoryId} options={categoryOptions} size="sm" placeholder="Kategori" />
								<CustomSelect bind:value={account} options={accountOptions} size="sm" placeholder="Akun" />
							</div>
						{/if}

						{#if error}
							<div class="bg-coral text-on-coral rounded-lg px-3 py-2 text-xs font-semibold" role="alert">
								{error}
							</div>
						{/if}

						<Button type="submit" class="w-full" disabled={saving || calc.unassignedAmount > 0}>
							{saving ? 'Menyimpan…' : editingId ? 'Simpan Perubahan' : 'Simpan Beli Rame-rame'}
						</Button>
					</form>
				</div>
			</div>
		{:else}
			<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div class="border-outline-variant flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
					<div class="bg-ink inline-flex items-center gap-0.5 rounded-full p-1">
						{#each [
							{ id: 'all', label: `Semua (${splitBills.length})` },
							{ id: 'open', label: `Belum Lunas (${openBillsCount})` },
							{ id: 'settled', label: `Selesai (${splitBills.length - openBillsCount})` }
						] as tab (tab.id)}
							<button
								type="button"
								onclick={() => (historyFilter = tab.id as typeof historyFilter)}
								class={cn(
									'cursor-pointer rounded-full px-3 py-1 text-xs font-bold transition-colors',
									historyFilter === tab.id ? 'bg-pill-white text-on-pill-white' : 'text-on-surface-variant'
								)}
							>
								{tab.label}
							</button>
						{/each}
					</div>

					<div class="flex items-center gap-3">
						<label class="text-on-surface-variant flex cursor-pointer items-center gap-1.5 text-xs">
							<input type="checkbox" bind:checked={recordReimbursement} class="accent-coral rounded" />
							<span>Catat pelunasan ke Income</span>
						</label>
						<Button type="button" size="sm" onclick={() => { resetForm(); activeTab = 'calculator'; }}>
							+ Hitung Baru
						</Button>
					</div>
				</div>

				<div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
					{#if filteredHistory.length === 0}
						<div class="border-outline-variant flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-12 text-center">
							<h4 class="font-headline text-headline-md text-on-surface uppercase">Belum ada riwayat</h4>
							<Button type="button" size="sm" class="mt-2" onclick={() => { resetForm(); activeTab = 'calculator'; }}>
								Mulai Hitung Patungan
							</Button>
						</div>
					{:else}
						<div class="space-y-3">
							{#each filteredHistory as bill (bill.id)}
								{@const billCalc = calculateSplitBill(bill)}
								<div class="border-outline-variant bg-surface-container rounded-xl border p-4">
									<div class="flex flex-wrap items-start justify-between gap-3">
										<div>
											<div class="flex flex-wrap items-center gap-2">
												<h4 class="font-headline text-headline-md text-on-surface uppercase">{bill.title}</h4>
												<Badge variant={bill.status === 'settled' ? 'success' : 'marigold'} class="text-[10px]">
													{bill.status === 'settled' ? 'Lunas' : `${billCalc.unpaidCount} belum`}
												</Badge>
											</div>
											<p class="text-on-surface-variant text-xs tabular-nums">
												{bill.date} · Total <strong class="text-on-surface">{formatMoney(billCalc.grandTotal, bill.currency)}</strong>
											</p>
										</div>

										<div class="flex flex-wrap items-center gap-1.5">
											<Button type="button" variant="outline" size="sm" class="h-7 px-2.5 text-xs" onclick={() => copyWhatsAppForBill(bill)}>
												{copiedState === `wa-${bill.id}` ? '✓' : 'WA'}
											</Button>
											<Button type="button" variant="outline" size="sm" class="h-7 px-2.5 text-xs" onclick={() => copyLinkForBill(bill)}>
												{copiedState === `link-${bill.id}` ? '✓' : 'Link'}
											</Button>
											<Button type="button" variant="pill-white" size="sm" class="h-7 px-2.5 text-xs" onclick={() => loadBillForEdit(bill)}>
												Edit
											</Button>
											<form
												method="POST"
												action="?/deleteSplitBill"
												use:enhance={() => {
													deletingBillId = bill.id;
													return async ({ update }) => {
														deletingBillId = null;
														await update({ reset: false });
													};
												}}
											>
												<input type="hidden" name="id" value={bill.id} />
												<Button type="submit" variant="ghost" size="sm" class="text-coral h-7 px-2 text-xs" disabled={deletingBillId === bill.id}>
													Hapus
												</Button>
											</form>
										</div>
									</div>

									<div class="border-outline-variant mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
										{#each billCalc.participants as p (p.participant.id)}
											{#if p.participant.isMe}
												<div class="bg-marigold text-on-marigold inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold">
													<span>{p.participant.name} (Saya)</span>
													<span class="font-mono tabular-nums">{formatMoney(p.finalAmount, bill.currency)}</span>
												</div>
											{:else}
												{@const toggleKey = `${bill.id}:${p.participant.id}`}
												<form
													method="POST"
													action="?/toggleSplitParticipantPaid"
													use:enhance={() => {
														busyToggleKey = toggleKey;
														return async ({ result, update }) => {
															busyToggleKey = null;
															await update({ reset: false });
															if (result.type === 'success') {
																onnotice?.(`${p.participant.name} updated!`);
															}
														};
													}}
												>
													<input type="hidden" name="id" value={bill.id} />
													<input type="hidden" name="participantId" value={p.participant.id} />
													<input type="hidden" name="paid" value={p.participant.paid ? 'false' : 'true'} />
													<input type="hidden" name="recordReimbursement" value={bill.ledgerMode === 'full_advance' && recordReimbursement ? 'true' : 'false'} />
													<input type="hidden" name="account" value={bill.account} />
													<button
														type="submit"
														disabled={busyToggleKey === toggleKey}
														class={cn(
															'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-opacity hover:opacity-90',
															p.participant.paid ? 'bg-sky-mint text-on-sky-mint' : 'bg-coral text-on-coral'
														)}
													>
														<span>{p.participant.name}</span>
														<span class="font-mono tabular-nums">{formatMoney(p.finalAmount, bill.currency)}</span>
													</button>
												</form>
											{/if}
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
