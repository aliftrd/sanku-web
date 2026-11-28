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

	// Structured multi-discount & fee rows matching Stitch Screen 4
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

	// Auto-calculate discount from final paid total
	let autoDiscountEnabled = $state(false);
	let autoPaidDisplay = $state('');

	// UI state
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

<div class="flex flex-col gap-gutter-md">
	<!-- Workspace Header -->
	<div class="flex flex-wrap items-center justify-between gap-gutter-md">
		<div>
			<div class="flex items-center gap-2">
				<h1 class="font-headline text-headline-lg text-on-surface">
					Beli Rame-rame (Split Bill)
				</h1>
				{#if editingId}
					<span class="bg-primary-container text-on-primary-container font-label text-label-sm rounded-full px-2.5 py-0.5">
						Editing
					</span>
				{/if}
			</div>
			<p class="font-body text-body-md text-on-surface-variant">
				Proportional group discount, tax, and delivery calculator synced to your Sanku ledger.
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-gutter-sm">
			{#if activePanel === 'calculator'}
				<div
					class="bg-surface-container-low border-outline inline-flex items-center rounded border p-0.5"
					role="tablist"
					aria-label="Split mode"
				>
					<button
						type="button"
						role="tab"
						aria-selected={splitMode === 'itemized'}
						onclick={() => switchSplitMode('itemized')}
						class={cn(
							'font-label text-label-sm cursor-pointer rounded-sm px-3 py-1.5 transition-colors',
							splitMode === 'itemized'
								? 'bg-surface-card text-on-surface shadow-xs'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
					>
						Itemized per Menu
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={splitMode === 'equal'}
						onclick={() => switchSplitMode('equal')}
						class={cn(
							'font-label text-label-sm cursor-pointer rounded-sm px-3 py-1.5 transition-colors',
							splitMode === 'equal'
								? 'bg-surface-card text-on-surface shadow-xs'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
					>
						Quick Equal Split
					</button>
				</div>
			{/if}

			<button
				type="button"
				onclick={() => (activePanel = activePanel === 'calculator' ? 'history' : 'calculator')}
				class={cn(
					'border-outline font-label text-label-md inline-flex cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 transition-colors duration-state-change',
					activePanel === 'history'
						? 'bg-primary-container text-on-primary-container border-accent-orange/40'
						: 'bg-surface-card text-on-surface hover:bg-surface-container-low'
				)}
			>
				<span class="material-symbols-outlined text-[18px]" aria-hidden="true">
					{activePanel === 'history' ? 'calculate' : 'history'}
				</span>
				<span>
					{activePanel === 'history' ? 'Back to Calculator' : 'Saved History & Settlement Checklist'}
				</span>
				{#if openBillsCount > 0}
					<span class="bg-warning-container text-on-warning-container font-label text-label-sm rounded-full px-2 py-0 tabular-nums">
						{openBillsCount}
					</span>
				{/if}
			</button>
		</div>
	</div>

	{#if activePanel === 'calculator'}
		<!-- 2-Column Split Workspace -->
		<div class="grid grid-cols-1 items-start gap-gutter-lg lg:grid-cols-12">
			<!-- Left Column: Builder (7 cols) -->
			<div class="flex flex-col gap-gutter-md lg:col-span-7">
				<!-- Card 1: Session Info & Participants -->
				<section class="bg-surface-card border-outline flex flex-col gap-gutter-md rounded-md border p-gutter-md">
					<header class="flex flex-wrap items-center justify-between gap-2">
						<h2 class="font-title text-title-md text-on-surface">1. Event &amp; Participants</h2>
						{#if editingId}
							<button
								type="button"
								onclick={resetForm}
								class="font-label text-label-sm text-primary cursor-pointer hover:underline"
							>
								+ New Session
							</button>
						{:else}
							<span class="font-body text-body-sm text-on-surface-variant">
								Add friends joining this order
							</span>
						{/if}
					</header>

					<div class="grid grid-cols-1 gap-gutter-sm sm:grid-cols-12">
						<label class="flex flex-col gap-1 sm:col-span-5">
							<span class="font-label text-label-sm text-on-surface-variant">Event / Order Name</span>
							<input
								type="text"
								bind:value={title}
								placeholder="e.g. GoFood Makan Siang"
								maxlength={100}
								class="border-outline bg-surface-container-high font-body text-body-md text-on-surface focus:border-primary focus:bg-surface-card focus:ring-primary rounded border px-3 py-1.5 outline-none focus:ring-1"
							/>
						</label>
						<label class="flex flex-col gap-1 sm:col-span-4">
							<span class="font-label text-label-sm text-on-surface-variant">Merchant (optional)</span>
							<input
								type="text"
								bind:value={merchant}
								placeholder="e.g. Kopi Kenangan"
								maxlength={80}
								class="border-outline bg-surface-container-high font-body text-body-md text-on-surface focus:border-primary focus:bg-surface-card focus:ring-primary rounded border px-3 py-1.5 outline-none focus:ring-1"
							/>
						</label>
						<label class="flex flex-col gap-1 sm:col-span-3">
							<span class="font-label text-label-sm text-on-surface-variant">Date</span>
							<input
								type="date"
								bind:value={date}
								class="border-outline bg-surface-container-high font-body text-body-sm text-on-surface focus:border-primary focus:bg-surface-card focus:ring-primary rounded border px-2.5 py-1.5 tabular-nums outline-none focus:ring-1"
							/>
						</label>
					</div>

					<div class="flex flex-wrap items-center gap-gutter-sm">
						{#each participants as person (person.id)}
							{#if person.isMe}
								<span class="bg-primary-container border-accent-orange/30 font-label text-label-md text-on-primary-container inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-1.5">
									<span class="bg-primary text-on-primary font-label text-label-sm flex size-6 items-center justify-center rounded-full">
										{initialsFor(person.name)}
									</span>
									<input
										type="text"
										bind:value={person.name}
										aria-label="Your name"
										maxlength={40}
										class="w-16 bg-transparent font-semibold outline-none focus:w-24"
									/>
									<span class="text-xs opacity-75">(Paid)</span>
								</span>
							{:else}
								<span class="bg-surface-container-high border-outline font-label text-label-md text-on-surface inline-flex items-center gap-2 rounded-full border py-1 pr-2.5 pl-1.5">
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
										class="text-on-surface-variant hover:text-expense cursor-pointer"
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
									class="border-primary bg-surface-card font-body text-body-sm text-on-surface h-8 w-36 rounded-full border px-3 outline-none"
								/>
								<button
									type="button"
									onclick={addParticipant}
									class="bg-primary text-on-primary font-label text-label-sm h-8 cursor-pointer rounded-full px-3"
								>
									Add
								</button>
							</div>
						{:else}
							<button
								type="button"
								onclick={() => (addingFriend = true)}
								class="border-outline-variant font-label text-label-sm text-primary hover:bg-primary-container/30 inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed px-3 py-1.5 transition-colors"
							>
								+ Add Friend
							</button>
						{/if}
					</div>
				</section>

				<!-- Card 2: Menu Items -->
				<section class="bg-surface-card border-outline flex flex-col gap-gutter-md rounded-md border p-gutter-md">
					<header class="flex items-center justify-between gap-2">
						<h2 class="font-title text-title-md text-on-surface">
							2. Menu Items ({items.length})
						</h2>
						<button
							type="button"
							onclick={addItem}
							class="bg-surface-container-high border-outline font-label text-label-sm text-primary hover:bg-primary-container/40 inline-flex cursor-pointer items-center gap-1 rounded border px-3 py-1 transition-colors"
						>
							+ Add Item
						</button>
					</header>

					<div class="flex flex-col gap-gutter-sm">
						{#each items as item, idx (item.id)}
							{@const allSelected =
								participants.length > 0 &&
								participants.every((p) => (item.shares[p.id] ?? 0) > 0)}
							{@const itemNet = Math.max(
								0,
								(Number(item.price) || 0) * (Number(item.qty) || 0) -
									(Number(item.itemDiscount) || 0)
							)}
							<div class="bg-surface-container-high border-outline flex flex-col gap-2.5 rounded border p-3">
								<div class="grid grid-cols-12 items-center gap-2">
									<div class="col-span-12 sm:col-span-5">
										<input
											type="text"
											bind:value={item.name}
											placeholder={`Menu #${idx + 1} (e.g. Nasi Goreng Spesial)`}
											maxlength={80}
											class="border-outline bg-surface-card font-title text-title-md text-on-surface focus:border-primary w-full rounded border px-2.5 py-1.5 outline-none"
										/>
									</div>
									<div class="col-span-3 sm:col-span-2">
										<div class="border-outline bg-surface-card flex items-center rounded border px-2 py-1.5">
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
										<div class="border-outline bg-surface-card flex items-center gap-1 rounded border px-2.5 py-1.5">
											<span class="font-body text-body-sm text-on-surface-variant">{currency}</span>
											<input
												type="text"
												inputmode="numeric"
												placeholder="0"
												aria-label="Unit price"
												value={item.price > 0 ? formatNumberWithDots(item.price) : ''}
												oninput={(e) => {
													item.price = parseNumberWithDots((e.target as HTMLInputElement).value);
												}}
												class="font-label text-label-lg text-on-surface w-full bg-transparent text-right tabular-nums outline-none"
											/>
										</div>
									</div>
									<div class="col-span-2 flex justify-end sm:col-span-1">
										<button
											type="button"
											onclick={() => removeItem(item.id)}
											aria-label="Remove item"
											class="text-on-surface-variant hover:bg-expense-container hover:text-on-expense-container cursor-pointer rounded p-1 transition-colors"
										>
											<span class="material-symbols-outlined text-[17px]" aria-hidden="true">close</span>
										</button>
									</div>
								</div>

								<div class="flex flex-wrap items-center justify-between gap-2">
									<div class="flex flex-wrap items-center gap-1.5">
										<span class="font-body text-body-sm text-on-surface-variant">Eaters:</span>
										<button
											type="button"
											onclick={() => toggleItemAllShares(item.id)}
											class={cn(
												'font-label text-label-sm cursor-pointer rounded-full border px-2 py-0.5 transition-colors',
												allSelected
													? 'bg-primary text-on-primary border-primary'
													: 'bg-surface-card border-outline text-on-surface-variant hover:text-on-surface'
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
													'font-label text-label-sm cursor-pointer rounded-full border px-2.5 py-0.5 transition-colors',
													active
														? 'bg-primary-container border-accent-orange/40 text-on-primary-container'
														: 'bg-surface-card border-outline text-on-surface-variant hover:text-on-surface'
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
												'border-outline bg-surface-card font-label text-label-sm w-24 rounded border px-2 py-0.5 text-right tabular-nums outline-none focus:border-primary',
												item.itemDiscount > 0 ? 'text-on-income-container' : 'text-on-surface-variant'
											)}
										/>
									</label>
								</div>

								{#if itemNet > 0 && !participants.some((p) => (item.shares[p.id] ?? 0) > 0)}
									<p class="font-body text-body-sm text-on-warning-container">
										⚠ Select at least one participant for this menu item.
									</p>
								{/if}
							</div>
						{/each}
					</div>
				</section>

				<!-- Card 3: Multi-Discount & Fees Engine -->
				<section class="bg-surface-card border-outline flex flex-col gap-gutter-md rounded-md border p-gutter-md">
					<header class="flex flex-wrap items-center justify-between gap-2">
						<h2 class="font-title text-title-md text-on-surface">
							3. Multi-Discount &amp; Fees Engine
						</h2>
						<label class="inline-flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								bind:checked={autoDiscountEnabled}
								class="border-outline text-primary focus:ring-primary rounded"
							/>
							<span class="font-label text-label-sm text-on-surface-variant">
								Auto-calculate discount from Final Paid Total
							</span>
						</label>
					</header>

					{#if autoDiscountEnabled}
						<div class="bg-income-container/50 border-income/30 flex flex-wrap items-center gap-2 rounded border p-3">
							<div class="min-w-[200px] flex-1">
								<p class="font-body text-body-sm text-on-income-container">
									Gross subtotal + fees:
									<strong class="tabular-nums">
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
									class="border-outline bg-surface-card font-label text-label-lg text-on-surface mt-1.5 w-full rounded border px-3 py-1.5 tabular-nums outline-none focus:border-primary"
								/>
							</div>
							<button
								type="button"
								onclick={applyAutoDiscountFromPaid}
								class="bg-tertiary text-white font-label text-label-sm cursor-pointer rounded px-3.5 py-2 hover:opacity-95"
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
								class="font-label text-label-sm text-primary cursor-pointer hover:underline"
							>
								+ Add Voucher
							</button>
						</div>

						<div class="grid grid-cols-1 gap-gutter-sm sm:grid-cols-2">
							{#each discounts as disc (disc.id)}
								<div class="bg-surface-container-high border-outline flex flex-col gap-2 rounded border p-3">
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
												class="bg-surface-card border-outline font-label text-[11px] text-on-surface-variant cursor-pointer rounded border px-1.5 py-0.5"
											>
												{disc.target === 'delivery' ? 'Ongkir' : 'Menu'}
											</button>
											<button
												type="button"
												onclick={() => removeDiscountRow(disc.id)}
												aria-label="Remove discount"
												class="text-on-surface-variant hover:text-expense cursor-pointer"
											>
												<span class="material-symbols-outlined text-[15px]" aria-hidden="true">close</span>
											</button>
										</div>
									</div>

									<div class="flex items-center gap-1.5">
										<select
											bind:value={disc.mode}
											aria-label="Discount type"
											class="border-outline bg-surface-card font-label text-label-sm text-on-surface rounded border px-2 py-1.5 outline-none"
										>
											<option value="percent">%</option>
											<option value="fixed">{currency}</option>
										</select>

										{#if disc.mode === 'percent'}
											<input
												type="number"
												min="0"
												max="100"
												step="0.5"
												bind:value={disc.value}
												aria-label="Discount percentage"
												class="border-outline bg-surface-card font-body text-body-md text-on-surface w-20 rounded border px-2 py-1 text-right tabular-nums outline-none"
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
												class="border-outline bg-surface-card font-body text-body-sm text-on-surface min-w-0 flex-1 rounded border px-2 py-1.5 text-right tabular-nums outline-none"
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
												class="border-outline bg-surface-card font-body text-body-md text-on-income-container min-w-0 flex-1 rounded border px-2.5 py-1 text-right tabular-nums outline-none"
											/>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>

					<!-- Fees list -->
					<div class="border-outline flex flex-col gap-2.5 border-t pt-gutter-sm">
						<div class="flex items-center justify-between">
							<span class="font-label text-label-sm text-on-surface-variant tracking-wider uppercase">
								Delivery, Service &amp; Tax (PB1)
							</span>
							<button
								type="button"
								onclick={addFeeRow}
								class="font-label text-label-sm text-primary cursor-pointer hover:underline"
							>
								+ Add Fee
							</button>
						</div>

						<div class="grid grid-cols-1 gap-gutter-sm sm:grid-cols-3">
							{#each fees as fee (fee.id)}
								<div class="bg-surface-container-high border-outline flex flex-col gap-2 rounded border p-3">
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
											class="text-on-surface-variant hover:text-expense cursor-pointer"
										>
											<span class="material-symbols-outlined text-[15px]" aria-hidden="true">close</span>
										</button>
									</div>

									<div class="flex items-center gap-1.5">
										<select
											bind:value={fee.mode}
											aria-label="Fee unit"
											class="border-outline bg-surface-card font-label text-label-sm text-on-surface rounded border px-1.5 py-1 outline-none"
										>
											<option value="fixed">{currency}</option>
											<option value="percent">%</option>
										</select>

										{#if fee.mode === 'percent'}
											<input
												type="number"
												min="0"
												max="100"
												step="0.5"
												bind:value={fee.value}
												aria-label="Fee percentage"
												class="border-outline bg-surface-card font-body text-body-md text-on-surface min-w-0 flex-1 rounded border px-2 py-1 text-right tabular-nums outline-none"
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
												class="border-outline bg-surface-card font-body text-body-md text-on-surface min-w-0 flex-1 rounded border px-2 py-1 text-right tabular-nums outline-none"
											/>
										{/if}
									</div>

									<button
										type="button"
										onclick={() =>
											(fee.allocation = fee.allocation === 'equal' ? 'proportional' : 'equal')}
										class="font-body text-[11px] text-on-surface-variant hover:text-on-surface cursor-pointer text-left"
									>
										Split: <strong class="font-semibold">{fee.allocation === 'equal' ? 'Equal' : 'Proportional'}</strong>
									</button>
								</div>
							{/each}
						</div>
					</div>
				</section>
			</div>

			<!-- Right Column: Live Proportional Breakdown & Actions (5 cols) -->
			<div class="flex flex-col gap-gutter-md lg:sticky lg:top-20 lg:col-span-5">
				<section class="bg-surface-card border-outline flex flex-col gap-gutter-md rounded-md border p-gutter-md">
					<header class="border-outline flex items-center justify-between border-b pb-gutter-sm">
						<div>
							<h2 class="font-title text-title-lg text-on-surface">Proportional Breakdown</h2>
							<p class="font-body text-body-sm text-on-surface-variant">
								Live calculation per person
								{#if calc.totalDiscount > 0}
									· <span class="text-on-income-container font-medium">Saved {formatMoney(calc.totalDiscount, currency)}</span>
								{/if}
							</p>
						</div>
						<div class="text-right">
							<span class="font-body text-body-sm text-on-surface-variant block">Final Total</span>
							<span class="font-headline text-headline-md text-on-surface tabular-nums">
								{formatMoney(calc.grandTotal, currency)}
							</span>
						</div>
					</header>

					{#if isZeroDecimal}
						<div class="flex items-center justify-between gap-2">
							<span class="font-body text-body-sm text-on-surface-variant">Rounding per person</span>
							<div class="bg-surface-container-low border-outline inline-flex items-center rounded border p-0.5">
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
											'font-label text-[11px] cursor-pointer rounded-sm px-2 py-0.5 transition-colors',
											roundingStep === opt.value
												? 'bg-surface-card text-on-surface shadow-xs'
												: 'text-on-surface-variant hover:text-on-surface'
										)}
									>
										{opt.label}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Per-Person Breakdown Cards -->
					<div class="flex flex-col gap-gutter-sm">
						{#each calc.participants as row (row.participant.id)}
							<div
								class={cn(
									'flex flex-col gap-2 rounded border p-3',
									row.participant.isMe
										? 'border-accent-orange/40 bg-surface-container-high'
										: 'border-outline bg-surface-card'
								)}
							>
								<div class="flex items-center justify-between gap-2">
									<div class="flex min-w-0 items-center gap-2">
										<span class="font-title text-title-md text-on-surface truncate">
											{row.participant.name}{row.participant.isMe ? ' (You)' : ''}
										</span>
										{#if row.participant.isMe}
											<span class="bg-income-container text-on-income-container font-label text-label-sm rounded-full px-2 py-0.5">
												Paid
											</span>
										{:else}
											<button
												type="button"
												onclick={() => toggleParticipantPaidLocal(row.participant.id)}
												class={cn(
													'font-label text-label-sm cursor-pointer rounded-full px-2 py-0.5 transition-opacity hover:opacity-85',
													row.participant.paid
														? 'bg-income-container text-on-income-container'
														: 'bg-warning-container text-on-warning-container'
												)}
											>
												{row.participant.paid ? 'Paid' : 'Unpaid'}
											</button>
										{/if}
									</div>
									<span class="font-headline text-headline-md text-on-surface shrink-0 tabular-nums">
										{formatMoney(row.finalAmount, currency)}
									</span>
								</div>

								{#if row.items.length > 0}
									<div class="border-outline font-body text-body-sm text-on-surface-variant flex flex-col gap-1 border-t pt-2 tabular-nums">
										<div class="flex justify-between gap-2">
											<span class="truncate">
												Items ({row.items.map((i) => `${i.name} ${i.shareLabel}`).join(', ')})
											</span>
											<span class="shrink-0">{formatMoney(row.itemsSubtotal, currency)}</span>
										</div>
										{#if row.discountShare > 0}
											<div class="text-on-income-container flex justify-between gap-2">
												<span>Proportional discounts</span>
												<span>-{formatMoney(row.discountShare, currency)}</span>
											</div>
										{/if}
										{#if row.feeShare > 0}
											<div class="flex justify-between gap-2">
												<span>Fees &amp; tax share</span>
												<span>+{formatMoney(row.feeShare, currency)}</span>
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
						class="border-outline flex flex-col gap-gutter-sm border-t pt-gutter-sm"
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

						<span class="font-label text-label-md text-on-surface">Record to Sanku Ledger</span>
						<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
							<button
								type="button"
								onclick={() => (ledgerMode = 'my_share')}
								class={cn(
									'flex cursor-pointer items-center gap-2 rounded border p-2.5 text-left transition-colors',
									ledgerMode === 'my_share'
										? 'border-primary bg-primary-container/40'
										: 'border-outline bg-surface-card hover:bg-surface-container-low'
								)}
							>
								<span
									class={cn(
										'size-3.5 shrink-0 rounded-full border-2',
										ledgerMode === 'my_share' ? 'border-primary bg-primary' : 'border-outline-variant'
									)}
								></span>
								<span class="font-label text-label-sm text-on-surface">
									Porsi Saya Saja (My Share)
								</span>
							</button>

							<button
								type="button"
								onclick={() => (ledgerMode = 'full_advance')}
								class={cn(
									'flex cursor-pointer items-center gap-2 rounded border p-2.5 text-left transition-colors',
									ledgerMode === 'full_advance'
										? 'border-primary bg-primary-container/40'
										: 'border-outline bg-surface-card hover:bg-surface-container-low'
								)}
							>
								<span
									class={cn(
										'size-3.5 shrink-0 rounded-full border-2',
										ledgerMode === 'full_advance' ? 'border-primary bg-primary' : 'border-outline-variant'
									)}
								></span>
								<span class="font-label text-label-sm text-on-surface">
									Talangan Penuh (Full)
								</span>
							</button>
						</div>

						<button
							type="button"
							onclick={() => (ledgerMode = 'none')}
							class={cn(
								'font-body text-body-sm cursor-pointer text-left transition-colors',
								ledgerMode === 'none'
									? 'text-primary font-semibold'
									: 'text-on-surface-variant hover:text-on-surface'
							)}
						>
							{ledgerMode === 'none' ? '✓ ' : ''}Save to SplitBills history only (no expense entry)
						</button>

						{#if ledgerMode !== 'none'}
							<div class="grid grid-cols-2 gap-2">
								<select
									bind:value={account}
									aria-label="Select Wallet"
									class="border-outline bg-surface-card font-body text-body-sm text-on-surface rounded border px-2.5 py-2 outline-none focus:border-primary"
								>
									<option value="">Unassigned Wallet</option>
									{#each wallets as w (w.id)}
										<option value={w.name}>{w.name}</option>
									{/each}
								</select>
								<select
									bind:value={categoryId}
									aria-label="Select Category"
									class="border-outline bg-surface-card font-body text-body-sm text-on-surface rounded border px-2.5 py-2 outline-none focus:border-primary"
								>
									<option value="">Uncategorized</option>
									{#each expenseCategories as cat (cat.id)}
										<option value={cat.id}>{cat.emoji} {cat.name}</option>
									{/each}
								</select>
							</div>
						{/if}

						<label class="flex flex-col gap-1">
							<span class="font-label text-label-sm text-on-surface-variant">
								Transfer / Payment Destination
							</span>
							<input
								type="text"
								bind:value={paymentInfo}
								placeholder="e.g. BCA 1234567890 a/n Alif"
								maxlength={240}
								class="border-outline bg-surface-container-high font-body text-body-sm text-on-surface focus:border-primary focus:bg-surface-card rounded border px-2.5 py-1.5 outline-none"
							/>
						</label>

						{#if error}
							<div class="bg-expense-container text-on-expense-container font-body text-body-sm rounded px-3 py-2" role="alert">
								{error}
							</div>
						{/if}

						<button
							type="submit"
							disabled={saving || calc.unassignedAmount > 0}
							class="bg-primary text-on-primary font-label text-label-lg w-full cursor-pointer rounded py-2.5 transition-opacity duration-state-change hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45"
						>
							{saving
								? 'Saving to Google Sheet…'
								: editingId
									? 'Update Split Bill'
									: 'Save to Sanku Ledger'}
						</button>
					</form>

					<!-- Share Actions -->
					<div class="border-outline grid grid-cols-1 gap-2 border-t pt-gutter-sm sm:grid-cols-2">
						<button
							type="button"
							onclick={copyWhatsAppForCurrent}
							disabled={calc.grandTotal <= 0}
							class="bg-surface-card border-outline font-label text-label-md text-on-surface hover:bg-surface-container-low inline-flex cursor-pointer items-center justify-center gap-1.5 rounded border px-3 py-2 transition-colors disabled:opacity-45"
						>
							<span class="material-symbols-outlined text-[17px]" aria-hidden="true">
								content_copy
							</span>
							<span>{copiedState === 'wa-current' ? 'Copied!' : 'Copy WhatsApp Text'}</span>
						</button>

						<div class="flex gap-1.5">
							<button
								type="button"
								onclick={copyLinkForCurrent}
								disabled={calc.grandTotal <= 0}
								class="bg-on-surface text-surface-card font-label text-label-md inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded px-3 py-2 transition-opacity hover:opacity-95 disabled:opacity-45"
							>
								<span class="material-symbols-outlined text-[17px]" aria-hidden="true">link</span>
								<span>{copiedState === 'link-current' ? 'Link Copied!' : 'Public Receipt (/s)'}</span>
							</button>
							<button
								type="button"
								onclick={openPublicReceiptPreview}
								disabled={calc.grandTotal <= 0}
								title="Open receipt preview"
								aria-label="Open receipt preview"
								class="bg-surface-card border-outline text-on-surface hover:bg-surface-container-low inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded border disabled:opacity-45"
							>
								<span class="material-symbols-outlined text-[17px]" aria-hidden="true">
									open_in_new
								</span>
							</button>
						</div>
					</div>
				</section>
			</div>
		</div>
	{:else}
		<!-- Saved History & Settlement Checklist -->
		<section class="flex flex-col gap-gutter-md">
			<div class="bg-surface-card border-outline flex flex-wrap items-center justify-between gap-gutter-sm rounded-md border p-3">
				<div class="bg-surface-container-low border-outline inline-flex items-center rounded border p-0.5">
					{#each [
						{ id: 'all', label: `All (${splitBills.length})` },
						{ id: 'open', label: `Unpaid (${openBillsCount})` },
						{ id: 'settled', label: `Settled (${splitBills.length - openBillsCount})` }
					] as tab (tab.id)}
						<button
							type="button"
							onclick={() => (historyFilter = tab.id as typeof historyFilter)}
							class={cn(
								'font-label text-label-sm cursor-pointer rounded-sm px-3 py-1 transition-colors',
								historyFilter === tab.id
									? 'bg-surface-card text-on-surface shadow-xs'
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
							class="border-outline text-primary focus:ring-primary rounded"
						/>
						<span>Record friend payment to Income (Full advance bills)</span>
					</label>
					<button
						type="button"
						onclick={() => {
							resetForm();
							activePanel = 'calculator';
						}}
						class="bg-primary text-on-primary font-label text-label-sm cursor-pointer rounded px-3 py-1.5 hover:opacity-95"
					>
						+ New Split Bill
					</button>
				</div>
			</div>

			{#if filteredHistory.length === 0}
				<div class="bg-surface-card border-outline flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-14 text-center">
					<span class="material-symbols-outlined text-on-surface-variant text-[30px]" aria-hidden="true">
						receipt_long
					</span>
					<h2 class="font-title text-title-md text-on-surface">No saved split bills yet</h2>
					<p class="font-body text-body-sm text-on-surface-variant max-w-sm">
						Calculate a group order and click "Save to Sanku Ledger" to track friends' settlements here.
					</p>
				</div>
			{:else}
				<div class="flex flex-col gap-gutter-md">
					{#each filteredHistory as bill (bill.id)}
						{@const billCalc = calculateSplitBill(bill)}
						<article class="bg-surface-card border-outline flex flex-col gap-gutter-sm rounded-md border p-gutter-md">
							<div class="flex flex-wrap items-start justify-between gap-gutter-sm">
								<div>
									<div class="flex flex-wrap items-center gap-2">
										<h3 class="font-title text-title-lg text-on-surface">{bill.title}</h3>
										{#if bill.merchant}
											<span class="font-body text-body-sm text-on-surface-variant">
												· {bill.merchant}
											</span>
										{/if}
										<span
											class={cn(
												'font-label text-label-sm rounded-full px-2.5 py-0.5',
												bill.status === 'settled'
													? 'bg-income-container text-on-income-container'
													: 'bg-warning-container text-on-warning-container'
											)}
										>
											{bill.status === 'settled'
												? 'Settled'
												: `${billCalc.unpaidCount} unpaid · ${formatMoney(billCalc.outstandingAmount, bill.currency)}`}
										</span>
									</div>
									<p class="font-body text-body-sm text-on-surface-variant mt-0.5 tabular-nums">
										{bill.date} · Total <strong class="text-on-surface">{formatMoney(billCalc.grandTotal, bill.currency)}</strong> · My share <strong class="text-on-surface">{formatMoney(billCalc.myShare, bill.currency)}</strong>
										{#if billCalc.totalDiscount > 0}
											· <span class="text-on-income-container font-medium">Saved {formatMoney(billCalc.totalDiscount, bill.currency)}</span>
										{/if}
									</p>
								</div>

								<div class="flex flex-wrap items-center gap-1.5">
									<button
										type="button"
										onclick={() => copyWhatsAppForBill(bill)}
										class="bg-surface-card border-outline font-label text-label-sm text-on-surface hover:bg-surface-container-low cursor-pointer rounded border px-2.5 py-1"
									>
										{copiedState === `wa-${bill.id}` ? 'Copied!' : 'WhatsApp'}
									</button>
									<button
										type="button"
										onclick={() => copyLinkForBill(bill)}
										class="bg-surface-card border-outline font-label text-label-sm text-on-surface hover:bg-surface-container-low cursor-pointer rounded border px-2.5 py-1"
									>
										{copiedState === `link-${bill.id}` ? 'Copied!' : 'Receipt Link'}
									</button>
									<button
										type="button"
										onclick={() => loadBillForEdit(bill)}
										class="bg-surface-card border-outline font-label text-label-sm text-on-surface hover:bg-surface-container-low cursor-pointer rounded border px-2.5 py-1"
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
											class="text-on-expense-container hover:bg-expense-container font-label text-label-sm cursor-pointer rounded px-2 py-1"
										>
											{deletingBillId === bill.id ? '…' : 'Delete'}
										</button>
									</form>
								</div>
							</div>

							<!-- Settlement Checklist -->
							<div class="border-outline grid grid-cols-1 gap-2 border-t pt-gutter-sm sm:grid-cols-2 lg:grid-cols-3">
								{#each billCalc.participants as p (p.participant.id)}
									{#if p.participant.isMe}
										<div class="bg-surface-container-high border-accent-orange/30 flex items-center justify-between rounded border px-3 py-2">
											<span class="font-title text-title-md text-on-surface">
												{p.participant.name} (You)
											</span>
											<span class="font-headline text-headline-md text-on-surface tabular-nums">
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
											class="bg-surface-card border-outline flex items-center justify-between gap-2 rounded border px-3 py-2"
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
													<span class="font-title text-title-md text-on-surface truncate">
														{p.participant.name}
													</span>
													<span
														class={cn(
															'font-label text-[11px] rounded-full px-2 py-0',
															p.participant.paid
																? 'bg-income-container text-on-income-container'
																: 'bg-warning-container text-on-warning-container'
														)}
													>
														{p.participant.paid ? 'Paid' : 'Unpaid'}
													</span>
												</div>
												<span class="font-headline text-headline-md text-on-surface tabular-nums">
													{formatMoney(p.finalAmount, bill.currency)}
												</span>
											</div>

											<button
												type="submit"
												disabled={busyToggleKey === toggleKey}
												class={cn(
													'font-label text-label-sm shrink-0 cursor-pointer rounded px-2.5 py-1.5 transition-opacity hover:opacity-90',
													p.participant.paid
														? 'bg-surface-container-low text-on-surface-variant'
														: 'bg-income-container text-on-income-container'
												)}
											>
												{p.participant.paid
													? 'Undo'
													: bill.ledgerMode === 'full_advance' && recordReimbursement
														? 'Record to Income'
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
