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
	import { formatMoney, formatNumberWithDots, parseNumberWithDots } from '#lib/finance.ts';
	import {
		calculateSplitBill,
		computeAutoDiscountFromPaidTotal,
		encodeReceiptPayload,
		formatWhatsAppSummary,
		SPLIT_COLORS
	} from '#lib/split-bill.ts';
	import { cn } from '#lib/utils.ts';
	import * as Select from '#lib/components/ui/select/index.ts';

	const PAYMENT_STORAGE_KEY = 'sanku_split_payment_info';

	let {
		splitBills = [],
		categories,
		wallets = [],
		currency,
		today,
		userName = 'Saya',
		initialMode = 'calculator',
		onnotice
	}: {
		splitBills?: SplitBill[];
		categories: Category[];
		wallets?: Wallet[];
		currency: string;
		today: string;
		userName?: string;
		initialMode?: 'calculator' | 'history';
		onnotice?: (message: string) => void;
	} = $props();

	const firstName = untrack(() => userName.trim().split(/\s+/)[0] || 'Saya');
	const expenseCategories = $derived(categories.filter((c) => c.type === 'expense'));
	const defaultDiningCategoryId = $derived.by(() => {
		const dining = expenseCategories.find((c) =>
			/jajan|dining|food|makan|kopi|cafe|restaurant/i.test(c.name)
		);
		return dining?.id ?? expenseCategories[0]?.id ?? '';
	});

	let activePanel = $state<'calculator' | 'history'>(untrack(() => initialMode));
	let splitMode = $state<'itemized' | 'equal'>('itemized');
	let historyFilter = $state<'all' | 'open' | 'settled'>('all');
	let recordReimbursement = $state(true);

	// Calculator state
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

	function initialsFor(name: string): string {
		return (
			name
				.trim()
				.split(/\s+/)
				.slice(0, 2)
				.map((part) => part[0]?.toUpperCase() ?? '')
				.join('') || 'U'
		);
	}

	function createDefaultParticipants(): SplitParticipant[] {
		return [
			{ id: 'me', name: firstName, isMe: true, color: SPLIT_COLORS[0], paid: true },
			{ id: makeId('p'), name: 'Teman 1', isMe: false, color: SPLIT_COLORS[1], paid: false }
		];
	}

	let participants = $state<SplitParticipant[]>(createDefaultParticipants());
	let addingFriend = $state(false);
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

	let discounts = $state<SplitDiscount[]>([
		{
			id: makeId('disc'),
			label: 'Voucher Promo',
			mode: 'percent',
			value: 0,
			maxAmount: undefined,
			target: 'items',
			allocation: 'proportional'
		},
		{
			id: makeId('disc'),
			label: 'Potongan Nominal',
			mode: 'fixed',
			value: 0,
			target: 'items',
			allocation: 'proportional'
		},
		{
			id: makeId('disc'),
			label: 'Diskon Ongkir',
			mode: 'fixed',
			value: 0,
			target: 'delivery',
			allocation: 'equal'
		}
	]);

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
		},
		{
			id: makeId('fee'),
			label: 'Pajak PB1',
			mode: 'percent',
			value: 0,
			kind: 'tax',
			allocation: 'proportional'
		}
	]);

	let roundingStep = $state<SplitRoundingStep>(0);
	let paymentInfo = $state('');
	let ledgerMode = $state<SplitLedgerMode>('my_share');
	let categoryId = $state(untrack(() => defaultDiningCategoryId));
	let account = $state(untrack(() => wallets[0]?.name ?? ''));

	let autoDiscountEnabled = $state(false);
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
			// Ignore localStorage restrictions
		}
	});

	$effect(() => {
		if (!paymentInfo.trim()) return;
		try {
			localStorage.setItem(PAYMENT_STORAGE_KEY, paymentInfo);
		} catch {
			// Ignore localStorage restrictions
		}
	});

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

	const paidFriendsCount = $derived(
		participants.filter((p) => !p.isMe && p.paid).length
	);
	const unpaidFriendsCount = $derived(
		participants.filter((p) => !p.isMe && !p.paid).length
	);

	const serializedPayload = $derived(
		JSON.stringify({
			id: editingId ?? undefined,
			date,
			title: title.trim() || 'Beli Rame-rame',
			merchant: merchant.trim(),
			currency,
			participants,
			items,
			discounts: discounts.filter((d) => d.value > 0),
			fees: fees.filter((f) => f.value > 0),
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
		splitMode = 'itemized';
		participants = createDefaultParticipants();
		items = [
			{ id: makeId('item'), name: '', price: 0, qty: 1, itemDiscount: 0, shares: { me: 1 } }
		];
		discounts = [
			{ id: makeId('disc'), label: 'Voucher Promo', mode: 'percent', value: 0, target: 'items', allocation: 'proportional' },
			{ id: makeId('disc'), label: 'Potongan Nominal', mode: 'fixed', value: 0, target: 'items', allocation: 'proportional' },
			{ id: makeId('disc'), label: 'Diskon Ongkir', mode: 'fixed', value: 0, target: 'delivery', allocation: 'equal' }
		];
		fees = [
			{ id: makeId('fee'), label: 'Ongkir', mode: 'fixed', value: 0, kind: 'delivery', allocation: 'equal' },
			{ id: makeId('fee'), label: 'Biaya Layanan', mode: 'fixed', value: 0, kind: 'service', allocation: 'equal' },
			{ id: makeId('fee'), label: 'Pajak PB1', mode: 'percent', value: 0, kind: 'tax', allocation: 'proportional' }
		];
		roundingStep = 0;
		ledgerMode = 'my_share';
		categoryId = defaultDiningCategoryId;
		account = wallets[0]?.name ?? '';
		autoDiscountEnabled = false;
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
		items =
			bill.items.length > 0
				? bill.items.map((item) => ({ ...item, shares: { ...item.shares } }))
				: [{ id: makeId('item'), name: '', price: 0, qty: 1, itemDiscount: 0, shares: { me: 1 } }];
		discounts =
			bill.discounts.length > 0
				? bill.discounts.map((d) => ({ ...d }))
				: [
						{ id: makeId('disc'), label: 'Voucher Promo', mode: 'percent', value: 0, target: 'items', allocation: 'proportional' }
					];
		fees =
			bill.fees.length > 0
				? bill.fees.map((f) => ({ ...f }))
				: [
						{ id: makeId('fee'), label: 'Ongkir', mode: 'fixed', value: 0, kind: 'delivery', allocation: 'equal' }
					];
		roundingStep = bill.roundingStep;
		if (bill.paymentInfo) paymentInfo = bill.paymentInfo;
		categoryId = bill.categoryId || defaultDiningCategoryId;
		account = bill.account || wallets[0]?.name || '';
		ledgerMode = bill.ledgerMode;
		error = null;
		activePanel = 'calculator';
	}

	function switchSplitMode(mode: 'itemized' | 'equal') {
		splitMode = mode;
		if (mode === 'equal') {
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
		}
	}

	function addParticipant() {
		const trimmed = newFriendName.trim();
		if (!trimmed) return;
		const id = makeId('p');
		const color = SPLIT_COLORS[participants.length % SPLIT_COLORS.length];
		participants = [
			...participants,
			{ id, name: trimmed.slice(0, 40), isMe: false, color, paid: false }
		];
		if (splitMode === 'equal' && items[0]) {
			items[0] = { ...items[0], shares: { ...items[0].shares, [id]: 1 } };
		}
		newFriendName = '';
		addingFriend = false;
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

	function addItem() {
		splitMode = 'itemized';
		const defaultP = participants[0];
		items = [
			...items,
			{
				id: makeId('item'),
				name: '',
				price: 0,
				qty: 1,
				itemDiscount: 0,
				shares: defaultP ? { [defaultP.id]: 1 } : {}
			}
		];
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
			if (nextShares[pid]) delete nextShares[pid];
			else nextShares[pid] = 1;
			return { ...item, shares: nextShares };
		});
	}

	function toggleItemAllShares(itemId: string) {
		items = items.map((item) => {
			if (item.id !== itemId) return item;
			const allSelected = participants.every((p) => (item.shares[p.id] ?? 0) > 0);
			if (allSelected) return { ...item, shares: {} };
			const nextShares: Record<string, number> = {};
			for (const p of participants) nextShares[p.id] = 1;
			return { ...item, shares: nextShares };
		});
	}

	function addDiscountRow() {
		discounts = [
			...discounts,
			{
				id: makeId('disc'),
				label: 'Voucher Tambahan',
				mode: 'fixed',
				value: 0,
				target: 'items',
				allocation: 'proportional'
			}
		];
	}

	function removeDiscountRow(id: string) {
		discounts = discounts.filter((d) => d.id !== id);
	}

	function addFeeRow() {
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

	function removeFeeRow(id: string) {
		fees = fees.filter((f) => f.id !== id);
	}

	function applyAutoDiscountFromPaid() {
		const paidActual = parseNumberWithDots(autoPaidDisplay);
		if (paidActual <= 0) return;
		const implied = computeAutoDiscountFromPaidTotal(
			calc.assignedItemsSubtotal,
			calc.grossFeesTotal,
			paidActual
		);
		if (implied <= 0) {
			error = 'Total bayar akhir lebih besar atau sama dengan subtotal + biaya kotor.';
			return;
		}
		error = null;
		discounts = [
			{
				id: makeId('disc'),
				label: 'Total Diskon & Promo',
				mode: 'fixed',
				value: implied,
				target: 'items',
				allocation: 'proportional'
			}
		];
		autoDiscountEnabled = false;
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
		const draft = {
			title: title.trim() || 'Beli Rame-rame',
			merchant: merchant.trim(),
			date,
			currency,
			paymentInfo: paymentInfo.trim(),
			roundingStep
		};
		const shareUrl = await buildShareUrlFor(draft, calc);
		const text = formatWhatsAppSummary(draft, calc, shareUrl);
		await navigator.clipboard.writeText(text);
		flashCopied('wa-current');
	}

	async function copyLinkForCurrent() {
		const draft = {
			title: title.trim() || 'Beli Rame-rame',
			merchant: merchant.trim(),
			date,
			currency,
			paymentInfo: paymentInfo.trim(),
			roundingStep
		};
		const shareUrl = await buildShareUrlFor(draft, calc);
		await navigator.clipboard.writeText(shareUrl);
		flashCopied('link-current');
	}

	async function openPublicReceiptPreview() {
		const draft = {
			title: title.trim() || 'Beli Rame-rame',
			merchant: merchant.trim(),
			date,
			currency,
			paymentInfo: paymentInfo.trim(),
			roundingStep
		};
		const shareUrl = await buildShareUrlFor(draft, calc);
		window.open(shareUrl, '_blank', 'noopener,noreferrer');
	}

	async function copyWhatsAppForBill(bill: SplitBill) {
		const billCalc = calculateSplitBill(bill);
		const shareUrl = await buildShareUrlFor(bill, billCalc);
		await navigator.clipboard.writeText(formatWhatsAppSummary(bill, billCalc, shareUrl));
		flashCopied(`wa-${bill.id}`);
	}

	async function copyLinkForBill(bill: SplitBill) {
		const billCalc = calculateSplitBill(bill);
		const shareUrl = await buildShareUrlFor(bill, billCalc);
		await navigator.clipboard.writeText(shareUrl);
		flashCopied(`link-${bill.id}`);
	}
</script>

<div class="gap-gutter-lg flex flex-col">
	<!-- Top Banner with Stitch Editorial Illustration -->
	<div class="gap-gutter-md grid grid-cols-12 items-stretch">
		<div class="bg-coral text-on-coral gap-gutter-md col-span-12 flex flex-col justify-between rounded-xl p-6 lg:col-span-7">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex flex-wrap items-center gap-2">
					<span class="bg-ink text-on-surface font-label text-label-sm rounded-full px-3 py-1 uppercase">
						PROPORTIONAL SPLIT
					</span>
					{#if editingId}
						<span class="bg-marigold text-on-marigold font-label text-label-sm rounded-full px-3 py-1 uppercase">
							EDITING SESSION
						</span>
					{/if}
				</div>

				<div class="flex flex-wrap items-center gap-1.5">
					{#if activePanel === 'calculator'}
						<div class="bg-ink inline-flex items-center rounded-full p-1" role="tablist" aria-label="Split mode">
							<button
								type="button"
								role="tab"
								aria-selected={splitMode === 'itemized'}
								onclick={() => switchSplitMode('itemized')}
								class={cn(
									'font-label text-label-sm cursor-pointer rounded-full px-3 py-1 transition-colors',
									splitMode === 'itemized'
										? 'bg-pill-white text-on-pill-white'
										: 'text-on-surface-variant hover:text-on-surface'
								)}
							>
								Itemized
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={splitMode === 'equal'}
								onclick={() => switchSplitMode('equal')}
								class={cn(
									'font-label text-label-sm cursor-pointer rounded-full px-3 py-1 transition-colors',
									splitMode === 'equal'
										? 'bg-pill-white text-on-pill-white'
										: 'text-on-surface-variant hover:text-on-surface'
								)}
							>
								Equal
							</button>
						</div>
					{/if}

					<button
						type="button"
						onclick={() => (activePanel = activePanel === 'calculator' ? 'history' : 'calculator')}
						class="bg-pill-white text-on-pill-white font-label text-label-sm inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-opacity hover:opacity-90"
					>
						<span class="material-symbols-outlined text-[16px]" aria-hidden="true">
							{activePanel === 'history' ? 'calculate' : 'history'}
						</span>
						<span>{activePanel === 'history' ? 'Calculator' : 'History'}</span>
						{#if openBillsCount > 0}
							<span class="bg-marigold text-on-marigold rounded-full px-1.5 py-0 text-[10px] font-bold tabular-nums">
								{openBillsCount}
							</span>
						{/if}
					</button>
				</div>
			</div>

			<div>
				<h1 class="font-display text-headline-lg sm:text-display-md uppercase">
					BELI RAME-RAME{title.trim() ? ` · ${title.trim()}` : ''}
				</h1>
				<p class="font-body text-body-md text-ink/85 mt-1">
					Multi-diskon &amp; ongkir dibagi proporsional sesuai pesanan masing-masing.
				</p>
			</div>

			<div class="gap-gutter-md border-ink/15 flex flex-wrap items-center border-t pt-3">
				<div>
					<div class="font-label text-label-sm uppercase">GRAND TOTAL</div>
					<div class="font-display text-display-md-mobile sm:text-display-md tabular-nums">
						{formatMoney(calc.grandTotal, currency)}
					</div>
				</div>
				{#if calc.totalDiscount > 0}
					<div class="bg-sage-cream text-on-sage-cream rounded-lg px-4 py-2">
						<div class="font-label text-label-sm uppercase">VOUCHER DISKON</div>
						<div class="font-title text-title-md tabular-nums">
							-{formatMoney(calc.totalDiscount, currency)}
						</div>
					</div>
				{/if}
				{#if calc.grandTotal > 0}
					<button
						type="button"
						onclick={openPublicReceiptPreview}
						class="bg-ink text-on-surface font-label text-label-sm ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 transition-opacity hover:opacity-90"
					>
						<span class="material-symbols-outlined text-[16px]" aria-hidden="true">share</span>
						<span>Share Public Receipt</span>
					</button>
				{/if}
			</div>
		</div>

		<div class="bg-sage-cream text-on-sage-cream gap-gutter-sm col-span-12 flex flex-col justify-between rounded-xl p-4 lg:col-span-5">
			<div class="border-ink overflow-hidden rounded-lg border-2">
				<img
					src="/images/pop_split_bill.jpg"
					alt="Ilustrasi patungan makan bersama teman"
					class="h-48 w-full object-cover"
				/>
			</div>
			<div class="flex flex-wrap items-center justify-between gap-2 px-2">
				<span class="font-headline text-headline-md uppercase">
					{participants.length} PESERTA AKTIF
				</span>
				<span class="bg-income text-on-income font-label text-label-sm rounded-full px-3 py-1 uppercase tabular-nums">
					{paidFriendsCount} Lunas · {unpaidFriendsCount} Belum
				</span>
			</div>
		</div>
	</div>

	{#if activePanel === 'calculator'}
		<!-- 2-Column Split Workspace -->
		<div class="gap-gutter-lg grid grid-cols-1 items-start lg:grid-cols-12">
			<!-- Left Column: Builder (7 cols) -->
			<div class="gap-gutter-md flex flex-col lg:col-span-7">
				<!-- Card 1: Session Info & Participants -->
				<section class="bg-surface-card border-outline-variant gap-gutter-md flex flex-col rounded-xl border p-6">
					<header class="flex flex-wrap items-center justify-between gap-2">
						<h2 class="font-headline text-headline-md text-on-surface uppercase">
							1. Event &amp; Participants
						</h2>
						{#if editingId}
							<button
								type="button"
								onclick={resetForm}
								class="font-label text-label-sm text-marigold cursor-pointer hover:underline"
							>
								+ New Session
							</button>
						{:else}
							<span class="font-body text-body-sm text-on-surface-variant">
								Tambahkan teman yang ikut patungan
							</span>
						{/if}
					</header>

					<div class="gap-gutter-sm grid grid-cols-1 sm:grid-cols-12">
						<label class="flex flex-col gap-1 sm:col-span-5">
							<span class="font-label text-label-sm text-on-surface-variant uppercase">Event / Order Name</span>
							<input
								type="text"
								bind:value={title}
								placeholder="e.g. GoFood Makan Malam"
								maxlength={100}
								class="border-outline-variant bg-surface-container font-body text-body-md text-on-surface focus:border-primary rounded border px-3 py-2 outline-none"
							/>
						</label>
						<label class="flex flex-col gap-1 sm:col-span-4">
							<span class="font-label text-label-sm text-on-surface-variant uppercase">Merchant (optional)</span>
							<input
								type="text"
								bind:value={merchant}
								placeholder="e.g. Kopi Kenangan"
								maxlength={80}
								class="border-outline-variant bg-surface-container font-body text-body-md text-on-surface focus:border-primary rounded border px-3 py-2 outline-none"
							/>
						</label>
						<label class="flex flex-col gap-1 sm:col-span-3">
							<span class="font-label text-label-sm text-on-surface-variant uppercase">Date</span>
							<input
								type="date"
								bind:value={date}
								class="border-outline-variant bg-surface-container font-mono text-mono-sm text-on-surface focus:border-primary rounded border px-2.5 py-2 tabular-nums outline-none"
							/>
						</label>
					</div>

					<div class="gap-gutter-sm flex flex-wrap items-center">
						{#each participants as person (person.id)}
							{#if person.isMe}
								<span class="bg-marigold text-on-marigold font-label text-label-md inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1.5">
									<span class="bg-ink text-on-surface font-label text-label-sm flex size-6 items-center justify-center rounded-full">
										{initialsFor(person.name)}
									</span>
									<input
										type="text"
										bind:value={person.name}
										aria-label="Your name"
										maxlength={40}
										class="w-16 bg-transparent font-bold outline-none focus:w-24"
									/>
									<span class="text-xs opacity-75">(Paid)</span>
								</span>
							{:else}
								<span class="bg-surface-container border-outline-variant font-label text-label-md text-on-surface inline-flex items-center gap-2 rounded-full border py-1 pr-2.5 pl-1.5">
									<span
										class="font-label text-label-sm flex size-6 items-center justify-center rounded-full text-white"
										style={`background:${person.color}`}
									>
										{initialsFor(person.name)}
									</span>
									<input
										type="text"
										bind:value={person.name}
										aria-label={`Friend ${person.name}`}
										maxlength={40}
										class="w-20 bg-transparent outline-none focus:w-28"
									/>
									<button
										type="button"
										onclick={() => removeParticipant(person.id)}
										aria-label={`Remove ${person.name}`}
										class="text-on-surface-variant hover:text-coral cursor-pointer"
									>
										<span class="material-symbols-outlined text-[15px]" aria-hidden="true">close</span>
									</button>
								</span>
							{/if}
						{/each}

						{#if addingFriend}
							<div class="inline-flex items-center gap-1.5">
								<input
									type="text"
									bind:value={newFriendName}
									placeholder="Friend name..."
									maxlength={40}
									onkeydown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											addParticipant();
										} else if (e.key === 'Escape') {
											addingFriend = false;
										}
									}}
									class="border-primary bg-surface-container font-body text-body-sm text-on-surface h-8 w-36 rounded-full border px-3 outline-none"
								/>
								<button
									type="button"
									onclick={addParticipant}
									class="bg-pill-white text-on-pill-white font-label text-label-sm h-8 cursor-pointer rounded-full px-3.5"
								>
									Add
								</button>
							</div>
						{:else}
							<button
								type="button"
								onclick={() => (addingFriend = true)}
								class="border-outline-variant font-label text-label-sm text-sky-mint hover:bg-surface-container inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed px-3.5 py-1.5 transition-colors"
							>
								+ Add Friend
							</button>
						{/if}
					</div>
				</section>

				<!-- Card 2: Menu Items -->
				<section class="bg-surface-card border-outline-variant gap-gutter-md flex flex-col rounded-xl border p-6">
					<header class="flex items-center justify-between gap-2">
						<h2 class="font-headline text-headline-md text-on-surface uppercase">
							2. Menu Items ({items.length})
						</h2>
						<button
							type="button"
							onclick={addItem}
							class="bg-pill-white text-on-pill-white font-label text-label-sm inline-flex cursor-pointer items-center gap-1 rounded-full px-3.5 py-1.5 transition-opacity hover:opacity-90"
						>
							+ Add Item
						</button>
					</header>

					<div class="gap-gutter-sm flex flex-col">
						{#each items as item, idx (item.id)}
							{@const allSelected =
								participants.length > 0 &&
								participants.every((p) => (item.shares[p.id] ?? 0) > 0)}
							{@const itemNet = Math.max(
								0,
								(Number(item.price) || 0) * (Number(item.qty) || 0) -
									(Number(item.itemDiscount) || 0)
							)}
							<div class="bg-surface-container border-outline-variant flex flex-col gap-3 rounded-lg border p-3.5">
								<div class="grid grid-cols-12 items-center gap-2">
									<div class="col-span-12 sm:col-span-5">
										<input
											type="text"
											bind:value={item.name}
											placeholder={`Menu #${idx + 1} (e.g. Nasi Goreng Spesial)`}
											maxlength={80}
											class="border-outline-variant bg-surface font-title text-title-md text-on-surface focus:border-primary w-full rounded border px-3 py-1.5 outline-none"
										/>
									</div>
									<div class="col-span-3 sm:col-span-2">
										<div class="border-outline-variant bg-surface flex items-center rounded border px-2.5 py-1.5">
											<span class="font-mono text-mono-sm text-on-surface-variant mr-1">×</span>
											<input
												type="number"
												min="1"
												max="99"
												bind:value={item.qty}
												aria-label="Quantity"
												class="font-mono text-mono-sm text-on-surface w-full bg-transparent tabular-nums outline-none"
											/>
										</div>
									</div>
									<div class="col-span-7 sm:col-span-4">
										<div class="border-outline-variant bg-surface flex items-center gap-1 rounded border px-2.5 py-1.5">
											<span class="font-mono text-mono-sm text-on-surface-variant">{currency}</span>
											<input
												type="text"
												inputmode="numeric"
												placeholder="0"
												aria-label="Unit price"
												value={item.price > 0 ? formatNumberWithDots(item.price) : ''}
												oninput={(e) => {
													item.price = parseNumberWithDots((e.target as HTMLInputElement).value);
												}}
												class="font-mono text-mono-md text-on-surface w-full bg-transparent text-right tabular-nums outline-none"
											/>
										</div>
									</div>
									<div class="col-span-2 flex justify-end sm:col-span-1">
										<button
											type="button"
											onclick={() => removeItem(item.id)}
											aria-label="Remove item"
											class="bg-surface-card text-on-surface-variant hover:bg-coral hover:text-on-coral flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors"
										>
											<span class="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
										</button>
									</div>
								</div>

								<div class="flex flex-wrap items-center justify-between gap-2">
									<div class="flex flex-wrap items-center gap-1.5">
										<span class="font-label text-label-sm text-on-surface-variant uppercase">Eaters:</span>
										<button
											type="button"
											onclick={() => toggleItemAllShares(item.id)}
											class={cn(
												'font-label text-label-sm cursor-pointer rounded-full px-2.5 py-0.5 transition-colors',
												allSelected
													? 'bg-pill-white text-on-pill-white'
													: 'bg-surface-card text-on-surface-variant hover:text-on-surface'
											)}
										>
											All
										</button>
										{#each participants as person (person.id)}
											{@const active = (item.shares[person.id] ?? 0) > 0}
											<button
												type="button"
												onclick={() => toggleItemShare(item.id, person.id)}
												class={cn(
													'font-label text-label-sm cursor-pointer rounded-full px-2.5 py-0.5 transition-colors',
													active
														? 'bg-coral text-on-coral'
														: 'bg-surface-card text-on-surface-variant hover:text-on-surface'
												)}
											>
												{person.name}
											</button>
										{/each}
									</div>

									<label class="inline-flex items-center gap-1.5">
										<span class="font-body text-body-sm text-on-surface-variant">Item disc:</span>
										<input
											type="text"
											inputmode="numeric"
											placeholder="0"
											aria-label="Item discount"
											value={item.itemDiscount > 0 ? formatNumberWithDots(item.itemDiscount) : ''}
											oninput={(e) => {
												item.itemDiscount = parseNumberWithDots((e.target as HTMLInputElement).value);
											}}
											class={cn(
												'border-outline-variant bg-surface font-mono text-mono-sm w-24 rounded border px-2 py-0.5 text-right tabular-nums outline-none focus:border-primary',
												item.itemDiscount > 0 ? 'text-income' : 'text-on-surface-variant'
											)}
										/>
									</label>
								</div>

								{#if itemNet > 0 && !participants.some((p) => (item.shares[p.id] ?? 0) > 0)}
									<p class="font-body text-body-sm text-marigold font-semibold">
										⚠ Select at least one participant for this menu item.
									</p>
								{/if}
							</div>
						{/each}
					</div>
				</section>

				<!-- Card 3: Multi-Discount & Fees Engine -->
				<section class="bg-surface-card border-outline-variant gap-gutter-md flex flex-col rounded-xl border p-6">
					<header class="flex flex-wrap items-center justify-between gap-2">
						<h2 class="font-headline text-headline-md text-on-surface uppercase">
							3. Multi-Discount &amp; Fees Engine
						</h2>
						<label class="inline-flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								bind:checked={autoDiscountEnabled}
								class="accent-coral rounded"
							/>
							<span class="font-label text-label-sm text-on-surface-variant">
								Auto-calculate discount from Final Paid Total
							</span>
						</label>
					</header>

					{#if autoDiscountEnabled}
						<div class="bg-sky-mint text-on-sky-mint flex flex-wrap items-center gap-3 rounded-lg p-4">
							<div class="min-w-[200px] flex-1">
								<p class="font-body text-body-sm font-semibold">
									Gross subtotal + fees:
									<strong class="font-mono tabular-nums">
										{formatMoney(calc.assignedItemsSubtotal + calc.grossFeesTotal, currency)}
									</strong>
								</p>
								<input
									type="text"
									inputmode="numeric"
									placeholder={`Enter final paid total (${currency})`}
									value={autoPaidDisplay}
									oninput={(e) => {
										autoPaidDisplay = formatNumberWithDots((e.target as HTMLInputElement).value);
									}}
									class="border-ink/25 bg-sage-cream font-mono text-mono-md text-ink mt-1.5 w-full rounded border px-3 py-1.5 tabular-nums outline-none"
								/>
							</div>
							<button
								type="button"
								onclick={applyAutoDiscountFromPaid}
								class="bg-ink text-on-surface font-label text-label-sm cursor-pointer rounded-full px-4 py-2 transition-opacity hover:opacity-90"
							>
								Apply Implied Discount
							</button>
						</div>
					{/if}

					<!-- Discounts list -->
					<div class="flex flex-col gap-2.5">
						<div class="flex items-center justify-between">
							<span class="font-label text-label-sm text-on-surface-variant tracking-wider uppercase">
								Discounts &amp; Vouchers
							</span>
							<button
								type="button"
								onclick={addDiscountRow}
								class="font-label text-label-sm text-marigold cursor-pointer hover:underline"
							>
								+ Add Voucher
							</button>
						</div>

						<div class="gap-gutter-sm grid grid-cols-1 sm:grid-cols-2">
							{#each discounts as disc (disc.id)}
								<div class="bg-surface-container border-outline-variant flex flex-col gap-2 rounded-lg border p-3">
									<div class="flex items-center justify-between gap-2">
										<input
											type="text"
											bind:value={disc.label}
											aria-label="Discount label"
											class="font-label text-label-sm text-on-surface min-w-0 flex-1 bg-transparent outline-none"
										/>
										<div class="flex items-center gap-1">
											<button
												type="button"
												onclick={() => (disc.target = disc.target === 'items' ? 'delivery' : 'items')}
												class="bg-pill-white text-on-pill-white font-label cursor-pointer rounded-full px-2 py-0.5 text-[10px]"
											>
												{disc.target === 'delivery' ? 'Ongkir' : 'Menu'}
											</button>
											<button
												type="button"
												onclick={() => removeDiscountRow(disc.id)}
												aria-label="Remove discount"
												class="text-on-surface-variant hover:text-coral cursor-pointer"
											>
												<span class="material-symbols-outlined text-[15px]" aria-hidden="true">close</span>
											</button>
										</div>
									</div>

									<div class="flex items-center gap-1.5">
										<Select.Root type="single" bind:value={disc.mode}>
											<Select.Trigger
												aria-label="Discount type"
												size="xs"
												class="bg-surface font-label text-label-sm w-auto min-w-[68px]"
											>
												{disc.mode === 'percent' ? '%' : currency}
											</Select.Trigger>
											<Select.Content align="start" class="min-w-[84px]">
												<Select.Item value="percent" label="%">%</Select.Item>
												<Select.Item value="fixed" label={currency}>{currency}</Select.Item>
											</Select.Content>
										</Select.Root>

										{#if disc.mode === 'percent'}
											<input
												type="number"
												min="0"
												max="100"
												step="0.5"
												bind:value={disc.value}
												aria-label="Discount percentage"
												class="border-outline-variant bg-surface font-mono text-mono-sm text-on-surface w-20 rounded border px-2 py-1.5 text-right tabular-nums outline-none"
											/>
											<input
												type="text"
												inputmode="numeric"
												placeholder="Max cap"
												aria-label="Max discount cap"
												value={disc.maxAmount && disc.maxAmount > 0 ? formatNumberWithDots(disc.maxAmount) : ''}
												oninput={(e) => {
													const v = parseNumberWithDots((e.target as HTMLInputElement).value);
													disc.maxAmount = v > 0 ? v : undefined;
												}}
												class="border-outline-variant bg-surface font-mono text-mono-sm text-on-surface min-w-0 flex-1 rounded border px-2 py-1.5 text-right tabular-nums outline-none"
											/>
										{:else}
											<input
												type="text"
												inputmode="numeric"
												placeholder="0"
												aria-label="Discount fixed amount"
												value={disc.value > 0 ? formatNumberWithDots(disc.value) : ''}
												oninput={(e) => {
													disc.value = parseNumberWithDots((e.target as HTMLInputElement).value);
												}}
												class="border-outline-variant bg-surface font-mono text-mono-sm text-income min-w-0 flex-1 rounded border px-2.5 py-1.5 text-right tabular-nums outline-none"
											/>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>

					<!-- Fees list -->
					<div class="border-outline-variant gap-2.5 border-t pt-3 flex flex-col">
						<div class="flex items-center justify-between">
							<span class="font-label text-label-sm text-on-surface-variant tracking-wider uppercase">
								Delivery, Service &amp; Tax (PB1)
							</span>
							<button
								type="button"
								onclick={addFeeRow}
								class="font-label text-label-sm text-sky-mint cursor-pointer hover:underline"
							>
								+ Add Fee
							</button>
						</div>

						<div class="gap-gutter-sm grid grid-cols-1 sm:grid-cols-3">
							{#each fees as fee (fee.id)}
								<div class="bg-surface-container border-outline-variant flex flex-col gap-2 rounded-lg border p-3">
									<div class="flex items-center justify-between gap-1">
										<input
											type="text"
											bind:value={fee.label}
											aria-label="Fee label"
											class="font-label text-label-sm text-on-surface min-w-0 flex-1 bg-transparent outline-none"
										/>
										<button
											type="button"
											onclick={() => removeFeeRow(fee.id)}
											aria-label="Remove fee"
											class="text-on-surface-variant hover:text-coral cursor-pointer"
										>
											<span class="material-symbols-outlined text-[15px]" aria-hidden="true">close</span>
										</button>
									</div>

									<div class="flex items-center gap-1.5">
										<Select.Root type="single" bind:value={fee.mode}>
											<Select.Trigger
												aria-label="Fee unit"
												size="xs"
												class="bg-surface font-label text-label-sm w-auto min-w-[68px] px-1.5"
											>
												{fee.mode === 'percent' ? '%' : currency}
											</Select.Trigger>
											<Select.Content align="start" class="min-w-[84px]">
												<Select.Item value="fixed" label={currency}>{currency}</Select.Item>
												<Select.Item value="percent" label="%">%</Select.Item>
											</Select.Content>
										</Select.Root>

										{#if fee.mode === 'percent'}
											<input
												type="number"
												min="0"
												max="100"
												step="0.5"
												bind:value={fee.value}
												aria-label="Fee percentage"
												class="border-outline-variant bg-surface font-mono text-mono-sm text-on-surface min-w-0 flex-1 rounded border px-2 py-1 text-right tabular-nums outline-none"
											/>
										{:else}
											<input
												type="text"
												inputmode="numeric"
												placeholder="0"
												aria-label="Fee amount"
												value={fee.value > 0 ? formatNumberWithDots(fee.value) : ''}
												oninput={(e) => {
													fee.value = parseNumberWithDots((e.target as HTMLInputElement).value);
												}}
												class="border-outline-variant bg-surface font-mono text-mono-sm text-on-surface min-w-0 flex-1 rounded border px-2 py-1 text-right tabular-nums outline-none"
											/>
										{/if}
									</div>

									<button
										type="button"
										onclick={() =>
											(fee.allocation = fee.allocation === 'equal' ? 'proportional' : 'equal')}
										class="font-body text-on-surface-variant hover:text-on-surface cursor-pointer text-left text-[11px]"
									>
										Split: <strong class="text-on-surface font-semibold">{fee.allocation === 'equal' ? 'Equal' : 'Proportional'}</strong>
									</button>
								</div>
							{/each}
						</div>
					</div>
				</section>
			</div>

			<!-- Right Column: Proportional Breakdown & Save (5 cols) -->
			<div class="gap-gutter-md flex flex-col lg:sticky lg:top-24 lg:col-span-5">
				<section class="bg-surface-card border-outline-variant gap-gutter-md flex flex-col rounded-xl border p-6">
					<header class="border-outline-variant flex items-center justify-between border-b pb-3">
						<div>
							<h2 class="font-headline text-headline-md text-on-surface uppercase">
								PROPORTIONAL BREAKDOWN
							</h2>
							<p class="font-body text-body-sm text-on-surface-variant">
								Live calculation per person
							</p>
						</div>
						<div class="text-right">
							<span class="font-label text-label-sm text-on-surface-variant block uppercase">Final Total</span>
							<span class="font-headline text-headline-lg text-on-surface tabular-nums">
								{formatMoney(calc.grandTotal, currency)}
							</span>
						</div>
					</header>

					{#if isZeroDecimal}
						<div class="flex items-center justify-between gap-2">
							<span class="font-body text-body-sm text-on-surface-variant">Rounding per person</span>
							<div class="bg-ink inline-flex items-center gap-0.5 rounded-full p-1">
								{#each [
									{ value: 0, label: 'Exact' },
									{ value: 100, label: '100' },
									{ value: 500, label: '500' },
									{ value: 1000, label: '1k' }
								] as opt (opt.value)}
									<button
										type="button"
										onclick={() => (roundingStep = opt.value as SplitRoundingStep)}
										class={cn(
											'font-label cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] transition-colors',
											roundingStep === opt.value
												? 'bg-pill-white text-on-pill-white'
												: 'text-on-surface-variant hover:text-on-surface'
										)}
									>
										{opt.label}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Per-Person Color-Blocked Cards (Stitch Pop Style) -->
					<div class="gap-gutter-sm flex flex-col">
						{#each calc.participants as row (row.participant.id)}
							{@const cardClass = row.participant.isMe
								? 'bg-marigold text-on-marigold'
								: row.participant.paid
									? 'bg-sky-mint text-on-sky-mint'
									: 'bg-surface-container border border-outline-variant text-on-surface'}
							<div class={cn('flex flex-col gap-2.5 rounded-xl p-4', cardClass)}>
								<div class="flex items-center justify-between gap-2">
									<div class="flex min-w-0 items-center gap-2">
										{#if row.participant.isMe}
											<span class="bg-ink text-on-surface font-label text-label-sm rounded-full px-2.5 py-0.5 uppercase">
												PAYER (TALANGIN)
											</span>
										{:else}
											<button
												type="button"
												onclick={() => toggleParticipantPaidLocal(row.participant.id)}
												class={cn(
													'font-label text-label-sm cursor-pointer rounded-full px-2.5 py-0.5 uppercase transition-opacity hover:opacity-90',
													row.participant.paid
														? 'bg-income text-on-income'
														: 'bg-coral text-on-coral'
												)}
											>
												{row.participant.paid ? 'LUNAS' : 'BELUM LUNAS'}
											</button>
										{/if}
									</div>
									<span class="bg-ink text-on-surface font-title text-title-md flex size-8 shrink-0 items-center justify-center rounded-full">
										{initialsFor(row.participant.name).slice(0, 1)}
									</span>
								</div>

								<div class="flex items-end justify-between gap-2">
									<div class="min-w-0">
										<div class="font-headline text-headline-md truncate uppercase">
											{row.participant.name}{row.participant.isMe ? ' (KAMU)' : ''}
										</div>
										{#if row.discountShare > 0}
											<p class={cn('font-body text-body-sm', row.participant.isMe || row.participant.paid ? 'text-ink/80' : 'text-on-surface-variant')}>
												Diskon proporsional -{formatMoney(row.discountShare, currency)}
											</p>
										{/if}
									</div>
									<div class="text-right">
										<span class="font-display text-display-md-mobile tabular-nums">
											{formatMoney(row.finalAmount, currency)}
										</span>
									</div>
								</div>

								{#if !row.participant.isMe && !row.participant.paid}
									<div class="flex justify-end">
										<button
											type="button"
											onclick={() => toggleParticipantPaidLocal(row.participant.id)}
											class="bg-pill-white text-on-pill-white font-label text-label-sm cursor-pointer rounded-full px-3 py-1 uppercase transition-opacity hover:opacity-90"
										>
											Tandai Lunas
										</button>
									</div>
								{/if}

								{#if row.items.length > 0}
									<div
										class={cn(
											'font-body text-body-sm flex flex-col gap-1 border-t pt-2 tabular-nums',
											row.participant.isMe || row.participant.paid ? 'border-ink/15 text-ink/85' : 'border-outline-variant text-on-surface-variant'
										)}
									>
										<div class="flex justify-between gap-2">
											<span class="truncate">
												Items ({row.items.map((i) => `${i.name} ${i.shareLabel}`).join(', ')})
											</span>
											<span class="font-mono shrink-0">{formatMoney(row.itemsSubtotal, currency)}</span>
										</div>
										{#if row.feeShare > 0}
											<div class="flex justify-between gap-2">
												<span>Fees &amp; tax share</span>
												<span class="font-mono">+{formatMoney(row.feeShare, currency)}</span>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>

					<!-- Record to Sanku Ledger Form -->
					<form
						method="POST"
						action="?/saveSplitBill"
						class="border-outline-variant gap-gutter-sm flex flex-col border-t pt-4"
						use:enhance={({ cancel }) => {
							if (calc.unassignedAmount > 0) {
								error = 'Assign at least one participant to every menu item before saving.';
								cancel();
								return;
							}
							saving = true;
							error = null;
							return async ({ result, update }) => {
								saving = false;
								if (result.type === 'success') {
									await update({ reset: false });
									onnotice?.(
										`Saved "${title.trim() || 'Beli Rame-rame'}" to Google Sheet!`
									);
									editingId = null;
									activePanel = 'history';
								} else if (result.type === 'failure') {
									const d = result.data as { error?: string } | undefined;
									error = d?.error ?? 'Could not save split bill.';
								} else {
									await update();
								}
							};
						}}
					>
						<input type="hidden" name="splitBillJson" value={serializedPayload} />

						<span class="font-label text-label-sm text-on-surface-variant uppercase">
							Record to Sanku Ledger
						</span>
						<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
							<button
								type="button"
								onclick={() => (ledgerMode = 'my_share')}
								class={cn(
									'flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-left transition-colors',
									ledgerMode === 'my_share'
										? 'bg-pill-white text-on-pill-white'
										: 'bg-surface-container text-on-surface hover:bg-surface-container/80'
								)}
							>
								<span
									class={cn(
										'size-3 shrink-0 rounded-full border-2',
										ledgerMode === 'my_share' ? 'border-ink bg-coral' : 'border-on-surface-variant'
									)}
								></span>
								<span class="font-label text-label-sm">Porsi Saya Saja</span>
							</button>

							<button
								type="button"
								onclick={() => (ledgerMode = 'full_advance')}
								class={cn(
									'flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-left transition-colors',
									ledgerMode === 'full_advance'
										? 'bg-pill-white text-on-pill-white'
										: 'bg-surface-container text-on-surface hover:bg-surface-container/80'
								)}
							>
								<span
									class={cn(
										'size-3 shrink-0 rounded-full border-2',
										ledgerMode === 'full_advance' ? 'border-ink bg-coral' : 'border-on-surface-variant'
									)}
								></span>
								<span class="font-label text-label-sm">Talangan Penuh</span>
							</button>
						</div>

						<button
							type="button"
							onclick={() => (ledgerMode = 'none')}
							class={cn(
								'font-body text-body-sm cursor-pointer text-left transition-colors',
								ledgerMode === 'none'
									? 'text-marigold font-semibold'
									: 'text-on-surface-variant hover:text-on-surface'
							)}
						>
							{ledgerMode === 'none' ? '✓ ' : ''}Save to SplitBills history only (no expense entry)
						</button>

						{#if ledgerMode !== 'none'}
							{@const activeLedgerCat = expenseCategories.find((cat) => cat.id === categoryId)}
							<div class="grid grid-cols-2 gap-2">
								<Select.Root type="single" bind:value={account}>
									<Select.Trigger aria-label="Select Wallet" size="sm" class="font-body text-body-sm rounded px-2.5">
										{account || 'Unassigned Wallet'}
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="" label="Unassigned Wallet">Unassigned Wallet</Select.Item>
										{#each wallets as w (w.id)}
											<Select.Item value={w.name} label={w.name}>{w.name}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
								<Select.Root type="single" bind:value={categoryId}>
									<Select.Trigger aria-label="Select Category" size="sm" class="font-body text-body-sm rounded px-2.5">
										{activeLedgerCat ? `${activeLedgerCat.emoji} ${activeLedgerCat.name}` : 'Uncategorized'}
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="" label="Uncategorized">Uncategorized</Select.Item>
										{#each expenseCategories as cat (cat.id)}
											<Select.Item value={cat.id} label={`${cat.emoji} ${cat.name}`}>
												{cat.emoji} {cat.name}
											</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>
						{/if}

						<label class="flex flex-col gap-1">
							<span class="font-label text-label-sm text-on-surface-variant uppercase">
								Transfer / Payment Destination
							</span>
							<input
								type="text"
								bind:value={paymentInfo}
								placeholder="e.g. BCA 1234567890 a/n Nama Pemilik"
								maxlength={240}
								class="border-outline-variant bg-surface-container font-body text-body-sm text-on-surface rounded border px-3 py-2 outline-none focus:border-primary"
							/>
						</label>

						{#if error}
							<div class="bg-coral text-on-coral font-body text-body-sm rounded-lg px-3.5 py-2 font-semibold" role="alert">
								{error}
							</div>
						{/if}

						<button
							type="submit"
							disabled={saving || calc.unassignedAmount > 0}
							class="bg-coral text-on-coral font-label text-label-lg w-full cursor-pointer rounded-full py-3 uppercase transition-opacity duration-state-change hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
						>
							{saving
								? 'Saving to Google Sheet…'
								: editingId
									? 'Update Split Bill'
									: 'Save to Sanku Ledger'}
						</button>
					</form>

					<!-- Share Actions -->
					<div class="border-outline-variant grid grid-cols-1 gap-2 border-t pt-3 sm:grid-cols-2">
						<button
							type="button"
							onclick={copyWhatsAppForCurrent}
							disabled={calc.grandTotal <= 0}
							class="bg-surface-container text-on-surface hover:bg-surface-container/80 font-label text-label-sm inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 py-2.5 transition-colors disabled:opacity-45"
						>
							<span class="material-symbols-outlined text-[16px]" aria-hidden="true">content_copy</span>
							<span>{copiedState === 'wa-current' ? 'Copied!' : 'Copy WhatsApp Text'}</span>
						</button>

						<div class="flex gap-1.5">
							<button
								type="button"
								onclick={copyLinkForCurrent}
								disabled={calc.grandTotal <= 0}
								class="bg-pill-white text-on-pill-white font-label text-label-sm inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 py-2.5 transition-opacity hover:opacity-90 disabled:opacity-45"
							>
								<span class="material-symbols-outlined text-[16px]" aria-hidden="true">link</span>
								<span>{copiedState === 'link-current' ? 'Copied!' : 'Public Receipt'}</span>
							</button>
							<button
								type="button"
								onclick={openPublicReceiptPreview}
								disabled={calc.grandTotal <= 0}
								title="Open receipt preview"
								aria-label="Open receipt preview"
								class="bg-surface-container text-on-surface hover:bg-pill-white hover:text-on-pill-white inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors disabled:opacity-45"
							>
								<span class="material-symbols-outlined text-[17px]" aria-hidden="true">open_in_new</span>
							</button>
						</div>
					</div>
				</section>
			</div>
		</div>
	{:else}
		<!-- Saved History & Settlement Checklist -->
		<section class="gap-gutter-md flex flex-col">
			<div class="bg-surface-card border-outline-variant gap-gutter-sm flex flex-wrap items-center justify-between rounded-xl border p-4">
				<div class="bg-ink inline-flex items-center gap-1 rounded-full p-1">
					{#each [
						{ id: 'all', label: `All (${splitBills.length})` },
						{ id: 'open', label: `Unpaid (${openBillsCount})` },
						{ id: 'settled', label: `Settled (${splitBills.length - openBillsCount})` }
					] as tab (tab.id)}
						<button
							type="button"
							onclick={() => (historyFilter = tab.id as typeof historyFilter)}
							class={cn(
								'font-label text-label-sm cursor-pointer rounded-full px-3.5 py-1 transition-colors',
								historyFilter === tab.id
									? 'bg-pill-white text-on-pill-white'
									: 'text-on-surface-variant hover:text-on-surface'
							)}
						>
							{tab.label}
						</button>
					{/each}
				</div>

				<div class="flex flex-wrap items-center gap-3">
					<label class="font-body text-body-sm text-on-surface-variant inline-flex cursor-pointer items-center gap-2">
						<input
							type="checkbox"
							bind:checked={recordReimbursement}
							class="accent-coral rounded"
						/>
						<span>Record friend payment to Income (Full advance bills)</span>
					</label>
					<button
						type="button"
						onclick={() => {
							resetForm();
							activePanel = 'calculator';
						}}
						class="bg-coral text-on-coral font-label text-label-sm cursor-pointer rounded-full px-4 py-2 transition-opacity hover:opacity-90"
					>
						+ New Split Bill
					</button>
				</div>
			</div>

			{#if filteredHistory.length === 0}
				<div class="bg-surface-card border-outline-variant flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-14 text-center">
					<span class="bg-marigold text-on-marigold flex size-12 items-center justify-center rounded-full">
						<span class="material-symbols-outlined text-[24px]" aria-hidden="true">receipt_long</span>
					</span>
					<h2 class="font-headline text-headline-md text-on-surface uppercase">No saved split bills yet</h2>
					<p class="font-body text-body-sm text-on-surface-variant max-w-sm">
						Calculate a group order and click "Save to Sanku Ledger" to track friends' settlements here.
					</p>
				</div>
			{:else}
				<div class="gap-gutter-md flex flex-col">
					{#each filteredHistory as bill (bill.id)}
						{@const billCalc = calculateSplitBill(bill)}
						<article class="bg-surface-card border-outline-variant gap-gutter-sm flex flex-col rounded-xl border p-5">
							<div class="gap-gutter-sm flex flex-wrap items-start justify-between">
								<div>
									<div class="flex flex-wrap items-center gap-2">
										<h3 class="font-headline text-headline-md text-on-surface uppercase">{bill.title}</h3>
										{#if bill.merchant}
											<span class="font-body text-body-sm text-on-surface-variant">
												· {bill.merchant}
											</span>
										{/if}
										<span
											class={cn(
												'font-label text-label-sm rounded-full px-2.5 py-0.5 uppercase',
												bill.status === 'settled'
													? 'bg-income text-on-income'
													: 'bg-marigold text-on-marigold'
											)}
										>
											{bill.status === 'settled'
												? 'Settled'
												: `${billCalc.unpaidCount} unpaid · ${formatMoney(billCalc.outstandingAmount, bill.currency)}`}
										</span>
									</div>
									<p class="font-body text-body-sm text-on-surface-variant mt-1 tabular-nums">
										{bill.date} · Total <strong class="text-on-surface">{formatMoney(billCalc.grandTotal, bill.currency)}</strong> · My share <strong class="text-on-surface">{formatMoney(billCalc.myShare, bill.currency)}</strong>
										{#if billCalc.totalDiscount > 0}
											· <span class="text-income font-semibold">Saved {formatMoney(billCalc.totalDiscount, bill.currency)}</span>
										{/if}
									</p>
								</div>

								<div class="flex flex-wrap items-center gap-1.5">
									<button
										type="button"
										onclick={() => copyWhatsAppForBill(bill)}
										class="bg-surface-container text-on-surface hover:bg-pill-white hover:text-on-pill-white font-label text-label-sm cursor-pointer rounded-full px-3 py-1 transition-colors"
									>
										{copiedState === `wa-${bill.id}` ? 'Copied!' : 'WhatsApp'}
									</button>
									<button
										type="button"
										onclick={() => copyLinkForBill(bill)}
										class="bg-surface-container text-on-surface hover:bg-pill-white hover:text-on-pill-white font-label text-label-sm cursor-pointer rounded-full px-3 py-1 transition-colors"
									>
										{copiedState === `link-${bill.id}` ? 'Copied!' : 'Receipt Link'}
									</button>
									<button
										type="button"
										onclick={() => loadBillForEdit(bill)}
										class="bg-pill-white text-on-pill-white font-label text-label-sm cursor-pointer rounded-full px-3 py-1 transition-opacity hover:opacity-90"
									>
										Edit
									</button>
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
										<button
											type="submit"
											disabled={deletingBillId === bill.id}
											class="text-coral hover:bg-coral hover:text-on-coral font-label text-label-sm cursor-pointer rounded-full px-3 py-1 transition-colors"
										>
											{deletingBillId === bill.id ? '…' : 'Delete'}
										</button>
									</form>
								</div>
							</div>

							<!-- Settlement Checklist -->
							<div class="border-outline-variant grid grid-cols-1 gap-2.5 border-t pt-3 sm:grid-cols-2 lg:grid-cols-3">
								{#each billCalc.participants as p (p.participant.id)}
									{#if p.participant.isMe}
										<div class="bg-marigold text-on-marigold flex items-center justify-between rounded-lg px-4 py-3">
											<span class="font-title text-title-md">
												{p.participant.name} (You)
											</span>
											<span class="font-headline text-headline-md tabular-nums">
												{formatMoney(p.finalAmount, bill.currency)}
											</span>
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
														onnotice?.(
															!p.participant.paid
																? `Marked ${p.participant.name} as Paid!`
																: `Marked ${p.participant.name} as Unpaid.`
														);
													}
												};
											}}
											class={cn(
												'flex items-center justify-between gap-2 rounded-lg px-4 py-3',
												p.participant.paid
													? 'bg-sky-mint text-on-sky-mint'
													: 'bg-surface-container text-on-surface border border-outline-variant'
											)}
										>
											<input type="hidden" name="id" value={bill.id} />
											<input type="hidden" name="participantId" value={p.participant.id} />
											<input type="hidden" name="paid" value={p.participant.paid ? 'false' : 'true'} />
											<input
												type="hidden"
												name="recordReimbursement"
												value={bill.ledgerMode === 'full_advance' && recordReimbursement ? 'true' : 'false'}
											/>
											<input type="hidden" name="account" value={bill.account} />

											<div class="min-w-0">
												<div class="flex items-center gap-1.5">
													<span class="font-title text-title-md truncate">
														{p.participant.name}
													</span>
													<span
														class={cn(
															'font-label rounded-full px-2 py-0 text-[10px] uppercase',
															p.participant.paid ? 'bg-income text-on-income' : 'bg-coral text-on-coral'
														)}
													>
														{p.participant.paid ? 'Paid' : 'Unpaid'}
													</span>
												</div>
												<span class="font-headline text-headline-md tabular-nums">
													{formatMoney(p.finalAmount, bill.currency)}
												</span>
											</div>

											<button
												type="submit"
												disabled={busyToggleKey === toggleKey}
												class={cn(
													'font-label text-label-sm shrink-0 cursor-pointer rounded-full px-3 py-1.5 transition-opacity hover:opacity-90',
													p.participant.paid ? 'bg-ink text-on-surface' : 'bg-pill-white text-on-pill-white'
												)}
											>
												{p.participant.paid
													? 'Undo'
													: bill.ledgerMode === 'full_advance' && recordReimbursement
														? 'Record'
														: 'Mark Paid'}
											</button>
										</form>
									{/if}
								{/each}
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>
