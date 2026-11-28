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

	// --- Calculator state ---
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

	// Auto-discount from actual paid total helper
	let showAutoDiscount = $state(false);
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
	class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-xs sm:p-4"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget && !saving) onclose();
	}}
>
	<div
		class="bg-card text-card-foreground border-border flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="split-bill-modal-title"
	>
		<!-- Modal Header -->
		<header class="border-border flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-6">
			<div class="flex min-w-0 items-center gap-3">
				<span class="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl text-base shadow-xs">
					🧾
				</span>
				<div class="min-w-0">
					<div class="flex items-center gap-2">
						<h2 id="split-bill-modal-title" class="truncate text-base font-bold tracking-tight sm:text-lg">
							Beli Rame-rame
						</h2>
						{#if editingId}
							<Badge variant="secondary" class="text-[10px]">Mode Edit</Badge>
						{/if}
					</div>
					<p class="text-muted-foreground truncate text-xs">
						Hitung patungan grup, diskon proporsional &amp; status bayar teman
					</p>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<!-- Tab Switcher -->
				<div class="bg-muted inline-flex items-center gap-0.5 rounded-lg p-1" role="tablist">
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === 'calculator'}
						onclick={() => (activeTab = 'calculator')}
						class={cn(
							'cursor-pointer rounded-md px-3 py-1 text-xs font-semibold transition-all',
							activeTab === 'calculator'
								? 'bg-card text-foreground shadow-2xs'
								: 'text-muted-foreground hover:text-foreground'
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
							'inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all',
							activeTab === 'history'
								? 'bg-card text-foreground shadow-2xs'
								: 'text-muted-foreground hover:text-foreground'
						)}
					>
						<span>Riwayat</span>
						{#if openBillsCount > 0}
							<span class="rounded-full bg-amber-500 px-1.5 py-0 text-[10px] font-bold text-white tabular-nums">
								{openBillsCount}
							</span>
						{:else if splitBills.length > 0}
							<span class="text-muted-foreground text-[10px] tabular-nums">
								({splitBills.length})
							</span>
						{/if}
					</button>
				</div>

				<Button variant="ghost" size="icon-sm" aria-label="Tutup" onclick={onclose}>
					✕
				</Button>
			</div>
		</header>

		{#if activeTab === 'calculator'}
			<!-- Two-Column Calculator Workspace -->
			<div class="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12 lg:overflow-hidden">
				<!-- LEFT COLUMN: Inputs -->
				<div class="border-border flex flex-col gap-5 p-4 sm:p-6 lg:col-span-7 lg:overflow-y-auto lg:border-r">
					<!-- 1. Acara & Tanggal -->
					<section class="space-y-3">
						<div class="flex items-center justify-between">
							<h3 class="text-xs font-bold tracking-wider uppercase text-muted-foreground">
								1. Info Pesanan
							</h3>
							{#if editingId}
								<button
									type="button"
									class="text-muted-foreground hover:text-foreground cursor-pointer text-xs underline underline-offset-2"
									onclick={resetForm}
								>
									Buat Sesi Baru
								</button>
							{/if}
						</div>

						<div class="grid grid-cols-1 gap-3 sm:grid-cols-12">
							<div class="space-y-1 sm:col-span-5">
								<Label for="sb-title" class="text-xs">Nama Acara / Pesanan</Label>
								<Input
									id="sb-title"
									bind:value={title}
									placeholder="mis. GoFood Makan Siang"
									maxlength={100}
									class="h-9 text-sm"
								/>
							</div>
							<div class="space-y-1 sm:col-span-4">
								<Label for="sb-merchant" class="text-xs">
									Resto / Toko <span class="text-muted-foreground font-normal">(opsional)</span>
								</Label>
								<Input
									id="sb-merchant"
									bind:value={merchant}
									placeholder="mis. Kopi Kenangan"
									maxlength={80}
									class="h-9 text-sm"
								/>
							</div>
							<div class="space-y-1 sm:col-span-3">
								<Label for="sb-date" class="text-xs">Tanggal</Label>
								<Input id="sb-date" type="date" bind:value={date} class="h-9 text-xs" />
							</div>
						</div>
					</section>

					<!-- 2. Peserta -->
					<section class="border-border space-y-2.5 border-t pt-4">
						<div class="flex items-center justify-between gap-2">
							<h3 class="text-xs font-bold tracking-wider uppercase text-muted-foreground">
								2. Peserta ({participants.length} orang)
							</h3>
						</div>

						<div class="flex flex-wrap items-center gap-1.5">
							{#each participants as person (person.id)}
								<div
									class="border-border bg-muted/50 inline-flex items-center gap-1.5 rounded-full border py-1 pr-2 pl-2.5 text-xs font-medium"
								>
									<span
										class="size-2 shrink-0 rounded-full"
										style={`background-color: ${person.color}`}
									></span>
									{#if person.isMe}
										<input
											type="text"
											bind:value={person.name}
											aria-label="Nama Anda"
											maxlength={40}
											class="w-16 bg-transparent font-semibold outline-none focus:w-24"
										/>
										<span class="bg-primary/10 text-primary rounded px-1 text-[10px] font-semibold">
											Saya
										</span>
									{:else}
										<input
											type="text"
											bind:value={person.name}
											aria-label={`Nama ${person.name}`}
											maxlength={40}
											class="w-20 bg-transparent font-medium outline-none focus:w-28"
										/>
										<button
											type="button"
											class="text-muted-foreground hover:text-destructive ml-0.5 cursor-pointer text-xs leading-none"
											onclick={() => removeParticipant(person.id)}
											aria-label={`Hapus ${person.name}`}
										>
											×
										</button>
									{/if}
								</div>
							{/each}
						</div>

						<div class="flex items-center gap-2">
							<Input
								bind:value={newFriendName}
								placeholder="Ketik nama teman lalu tekan Enter..."
								maxlength={40}
								class="h-8 flex-1 text-xs"
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										addParticipant();
									}
								}}
							/>
							<Button type="button" variant="secondary" size="sm" onclick={addParticipant}>
								+ Tambah Teman
							</Button>
						</div>
					</section>

					<!-- 3. Daftar Pesanan / Menu -->
					<section class="border-border space-y-3 border-t pt-4">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h3 class="text-xs font-bold tracking-wider uppercase text-muted-foreground">
								3. Daftar Pesanan ({items.length})
							</h3>
							<div class="flex items-center gap-1.5">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									class="h-7 px-2 text-xs"
									onclick={setQuickEqualSplit}
									title="Gunakan 1 total belanja yang dibagi rata ke semua peserta"
								>
									⚡ Bagi Rata Cepat
								</Button>
								<Button type="button" variant="outline" size="sm" class="h-7 px-2.5 text-xs" onclick={() => addItem(false)}>
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
								<div class="border-border bg-muted/20 space-y-2.5 rounded-xl border p-3">
									<div class="grid grid-cols-12 items-center gap-2">
										<div class="col-span-12 sm:col-span-5">
											<Input
												bind:value={item.name}
												placeholder={`Menu #${idx + 1} (mis. Ayam Geprek)`}
												maxlength={80}
												class="h-8 bg-card text-xs"
											/>
										</div>
										<div class="col-span-3 sm:col-span-2">
											<div class="relative">
												<input
													type="number"
													min="1"
													max="99"
													bind:value={item.qty}
													aria-label="Jumlah porsi"
													class="border-input bg-card h-8 w-full rounded-md border pr-6 pl-2 font-mono text-xs font-medium tabular-nums outline-none focus:ring-1"
												/>
												<span class="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px]">
													x
												</span>
											</div>
										</div>
										<div class="col-span-7 sm:col-span-4">
											<div class="border-input bg-card flex h-8 items-center gap-1 rounded-md border px-2 focus-within:ring-1">
												<span class="text-muted-foreground text-[10px] font-semibold">{currency}</span>
												<input
													type="text"
													inputmode="numeric"
													aria-label="Harga satuan"
													placeholder="0"
													value={item.price > 0 ? formatNumberWithDots(item.price) : ''}
													oninput={(e) => {
														const target = e.target as HTMLInputElement;
														item.price = parseNumberWithDots(target.value);
													}}
													class="w-full bg-transparent text-right font-mono text-xs font-semibold tabular-nums outline-none"
												/>
											</div>
										</div>
										<div class="col-span-2 flex justify-end sm:col-span-1">
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												class="text-muted-foreground hover:text-destructive size-7"
												onclick={() => removeItem(item.id)}
												aria-label="Hapus menu"
											>
												✕
											</Button>
										</div>
									</div>

									<!-- Optional per-item discount row -->
									{#if showItemDiscountMap[item.id] || item.itemDiscount > 0}
										<div class="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50/70 px-2.5 py-1.5 text-xs">
											<span class="font-medium text-emerald-800">Diskon Menu / Harga Coret:</span>
											<div class="flex h-7 w-32 items-center gap-1 rounded border border-emerald-200 bg-white px-2">
												<span class="text-[10px] font-semibold text-emerald-700">−{currency}</span>
												<input
													type="text"
													inputmode="numeric"
													placeholder="0"
													value={item.itemDiscount > 0 ? formatNumberWithDots(item.itemDiscount) : ''}
													oninput={(e) => {
														const target = e.target as HTMLInputElement;
														item.itemDiscount = parseNumberWithDots(target.value);
													}}
													class="w-full bg-transparent text-right font-mono text-xs font-semibold text-emerald-800 tabular-nums outline-none"
												/>
											</div>
											<span class="text-muted-foreground ml-auto font-mono text-[11px] tabular-nums">
												Subtotal: <strong class="text-foreground">{formatMoney(itemNet, currency)}</strong>
											</span>
										</div>
									{/if}

									<!-- Participant assignment pills -->
									<div class="flex flex-wrap items-center justify-between gap-2">
										<div class="flex flex-wrap items-center gap-1.5">
											<button
												type="button"
												onclick={() => toggleItemAllShares(item.id)}
												class={cn(
													'cursor-pointer rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors',
													allSelected
														? 'border-primary bg-primary text-primary-foreground'
														: 'border-border bg-card text-muted-foreground hover:text-foreground'
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
														'inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-all',
														active
															? 'border-slate-900 bg-slate-900 text-white shadow-2xs'
															: 'border-border bg-card text-muted-foreground hover:border-slate-400 hover:text-foreground'
													)}
												>
													<span
														class="size-1.5 rounded-full"
														style={`background-color: ${active ? '#ffffff' : person.color}`}
													></span>
													<span>{person.name}</span>
												</button>
											{/each}
										</div>

										<div class="flex items-center gap-2 text-[11px]">
											{#if !showItemDiscountMap[item.id] && item.itemDiscount === 0}
												<button
													type="button"
													class="cursor-pointer font-medium text-emerald-700 hover:underline"
													onclick={() => (showItemDiscountMap = { ...showItemDiscountMap, [item.id]: true })}
												>
													+ Diskon menu
												</button>
											{/if}
											{#if assignedCount === 0 && itemNet > 0}
												<span class="font-semibold text-amber-600">⚠ Pilih pemesan</span>
											{:else if itemNet > 0}
												<span class="text-muted-foreground font-mono tabular-nums">
													{formatMoney(itemNet, currency)}
												</span>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>

						{#if calc.unassignedAmount > 0}
							<div class="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
								<span>⚠</span>
								<p>
									Ada pesanan senilai <strong class="font-mono">{formatMoney(calc.unassignedAmount, currency)}</strong> yang belum dipilih pemesannya. Klik nama peserta pada menu di atas.
								</p>
							</div>
						{/if}
					</section>

					<!-- 4. Diskon & Voucher -->
					<section class="border-border space-y-3 border-t pt-4">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h3 class="text-xs font-bold tracking-wider uppercase text-muted-foreground">
								4. Diskon &amp; Voucher Promo
							</h3>
							<button
								type="button"
								onclick={() => (showAutoDiscount = !showAutoDiscount)}
								class="cursor-pointer rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
							>
								⚡ Hitung dari Total Bayar Akhir
							</button>
						</div>

						{#if showAutoDiscount}
							<div class="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
								<p class="text-xs text-emerald-900">
									Bingung karena banyak promo berlapis di GoFood/GrabFood? Cukup masukkan <strong>Total Akhir yang Didebet</strong> di aplikasi, selisih diskonnya otomatis dihitung &amp; dibagi proporsional!
								</p>
								<div class="flex flex-wrap items-center gap-2">
									<div class="flex h-8 flex-1 items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-2.5">
										<span class="text-xs font-bold text-emerald-700">{currency}</span>
										<input
											type="text"
											inputmode="numeric"
											placeholder="Total akhir yang dibayar"
											value={autoPaidDisplay}
											oninput={(e) => {
												const target = e.target as HTMLInputElement;
												autoPaidDisplay = formatNumberWithDots(target.value);
											}}
											class="w-full bg-transparent font-mono text-sm font-bold tabular-nums outline-none"
										/>
									</div>
									<Button type="button" size="sm" class="h-8 bg-emerald-700 hover:bg-emerald-800" onclick={applyAutoDiscountFromPaid}>
										Terapkan Diskon
									</Button>
								</div>
								<p class="text-[11px] text-emerald-800/80">
									Subtotal + Biaya kotor saat ini: <strong class="font-mono">{formatMoney(calc.assignedItemsSubtotal + calc.grossFeesTotal, currency)}</strong>
								</p>
							</div>
						{/if}

						<!-- Quick Discount Presets -->
						<div class="flex flex-wrap items-center gap-1.5">
							<Button type="button" variant="outline" size="sm" class="h-7 px-2.5 text-xs" onclick={() => addDiscountPreset('voucher_pct')}>
								+ Voucher % (Maks Rp)
							</Button>
							<Button type="button" variant="outline" size="sm" class="h-7 px-2.5 text-xs" onclick={() => addDiscountPreset('fixed_rp')}>
								+ Potongan Rp
							</Button>
							<Button type="button" variant="outline" size="sm" class="h-7 px-2.5 text-xs" onclick={() => addDiscountPreset('delivery_off')}>
								+ Diskon Ongkir
							</Button>
						</div>

						{#if discounts.length > 0}
							<div class="space-y-2">
								{#each discounts as disc (disc.id)}
									{@const applied = calc.appliedDiscounts.find((d) => d.id === disc.id)}
									<div class="border-border space-y-2 rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-3">
										<div class="grid grid-cols-12 items-center gap-2">
											<div class="col-span-12 sm:col-span-4">
												<Input
													bind:value={disc.label}
													placeholder="Nama Voucher / Promo"
													maxlength={60}
													class="h-8 bg-card text-xs"
												/>
											</div>
											<div class="col-span-4 sm:col-span-2">
												<select
													bind:value={disc.mode}
													aria-label="Tipe diskon"
													class="border-input bg-card h-8 w-full rounded-md border px-2 text-xs font-semibold outline-none"
												>
													<option value="percent">%</option>
													<option value="fixed">{currency}</option>
												</select>
											</div>
											<div class="col-span-6 sm:col-span-3">
												{#if disc.mode === 'percent'}
													<div class="border-input bg-card flex h-8 items-center gap-1 rounded-md border px-2">
														<input
															type="number"
															min="0"
															max="100"
															step="0.5"
															bind:value={disc.value}
															aria-label="Persentase diskon"
															class="w-full bg-transparent text-right font-mono text-xs font-semibold tabular-nums outline-none"
														/>
														<span class="text-muted-foreground text-xs font-bold">%</span>
													</div>
												{:else}
													<div class="border-input bg-card flex h-8 items-center gap-1 rounded-md border px-2">
														<span class="text-muted-foreground text-[10px] font-semibold">{currency}</span>
														<input
															type="text"
															inputmode="numeric"
															aria-label="Nominal diskon"
															value={disc.value > 0 ? formatNumberWithDots(disc.value) : ''}
															oninput={(e) => {
																disc.value = parseNumberWithDots((e.target as HTMLInputElement).value);
															}}
															class="w-full bg-transparent text-right font-mono text-xs font-semibold tabular-nums outline-none"
														/>
													</div>
												{/if}
											</div>
											<div class="col-span-2 flex justify-end sm:col-span-3">
												<div class="flex items-center gap-1.5">
													{#if applied && applied.effectiveAmount > 0}
														<span class="hidden font-mono text-xs font-bold text-emerald-700 tabular-nums sm:inline">
															−{formatMoney(applied.effectiveAmount, currency)}
														</span>
													{/if}
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														class="text-muted-foreground hover:text-destructive size-7"
														onclick={() => removeDiscount(disc.id)}
														aria-label="Hapus diskon"
													>
														✕
													</Button>
												</div>
											</div>
										</div>

										<div class="flex flex-wrap items-center gap-2 text-[11px]">
											{#if disc.mode === 'percent'}
												<label class="flex items-center gap-1.5">
													<span class="text-muted-foreground">Maks potongan:</span>
													<input
														type="text"
														inputmode="numeric"
														placeholder="Tanpa batas"
														value={disc.maxAmount && disc.maxAmount > 0 ? formatNumberWithDots(disc.maxAmount) : ''}
														oninput={(e) => {
															const v = parseNumberWithDots((e.target as HTMLInputElement).value);
															disc.maxAmount = v > 0 ? v : undefined;
														}}
														class="border-input bg-card h-6 w-24 rounded border px-1.5 text-right font-mono text-[11px] tabular-nums outline-none"
													/>
												</label>
											{/if}

											<div class="flex items-center gap-1">
												<span class="text-muted-foreground">Potong:</span>
												<button
													type="button"
													onclick={() => (disc.target = disc.target === 'items' ? 'delivery' : 'items')}
													class="border-border bg-card hover:bg-accent cursor-pointer rounded border px-2 py-0.5 font-medium"
												>
													{disc.target === 'delivery' ? '🛵 Ongkir' : '🍽️ Menu'}
												</button>
											</div>

											{#if disc.target === 'items'}
												<div class="flex items-center gap-1">
													<span class="text-muted-foreground">Bagi:</span>
													<button
														type="button"
														onclick={() =>
															(disc.allocation =
																disc.allocation === 'proportional' ? 'equal' : 'proportional')}
														class="border-border bg-card hover:bg-accent cursor-pointer rounded border px-2 py-0.5 font-medium"
													>
														{disc.allocation === 'proportional' ? 'Proporsional' : 'Sama Rata'}
													</button>
												</div>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground text-xs">
								Belum ada voucher diskon. Klik tombol preset di atas untuk menambahkan voucher % (dengan maks potongan), potongan Rp, atau diskon ongkir.
							</p>
						{/if}
					</section>

					<!-- 5. Biaya Tambahan (Ongkir, Layanan, Pajak) -->
					<section class="border-border space-y-3 border-t pt-4">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h3 class="text-xs font-bold tracking-wider uppercase text-muted-foreground">
								5. Ongkir, Pajak &amp; Biaya Tambahan
							</h3>
							<div class="flex flex-wrap items-center gap-1">
								<Button type="button" variant="ghost" size="sm" class="h-6 px-2 text-[11px]" onclick={() => addFeePreset('delivery')}>
									+ Ongkir
								</Button>
								<Button type="button" variant="ghost" size="sm" class="h-6 px-2 text-[11px]" onclick={() => addFeePreset('service')}>
									+ Layanan
								</Button>
								<Button type="button" variant="ghost" size="sm" class="h-6 px-2 text-[11px]" onclick={() => addFeePreset('tax')}>
									+ PB1 10%
								</Button>
								<Button type="button" variant="ghost" size="sm" class="h-6 px-2 text-[11px]" onclick={() => addFeePreset('other')}>
									+ Lainnya
								</Button>
							</div>
						</div>

						{#if fees.length > 0}
							<div class="space-y-2">
								{#each fees as fee (fee.id)}
									<div class="border-border bg-muted/20 grid grid-cols-12 items-center gap-2 rounded-xl border p-2.5">
										<div class="col-span-12 sm:col-span-4">
											<Input
												bind:value={fee.label}
												placeholder="Nama biaya"
												maxlength={60}
												class="h-8 bg-card text-xs"
											/>
										</div>
										<div class="col-span-3 sm:col-span-2">
											<select
												bind:value={fee.mode}
												aria-label="Satuan biaya"
												class="border-input bg-card h-8 w-full rounded-md border px-1.5 text-xs font-semibold outline-none"
											>
												<option value="fixed">{currency}</option>
												<option value="percent">%</option>
											</select>
										</div>
										<div class="col-span-5 sm:col-span-3">
											{#if fee.mode === 'percent'}
												<div class="border-input bg-card flex h-8 items-center gap-1 rounded-md border px-2">
													<input
														type="number"
														min="0"
														max="100"
														step="0.5"
														bind:value={fee.value}
														aria-label="Persen biaya"
														class="w-full bg-transparent text-right font-mono text-xs font-semibold tabular-nums outline-none"
													/>
													<span class="text-muted-foreground text-xs font-bold">%</span>
												</div>
											{:else}
												<div class="border-input bg-card flex h-8 items-center gap-1 rounded-md border px-2">
													<span class="text-muted-foreground text-[10px] font-semibold">{currency}</span>
													<input
														type="text"
														inputmode="numeric"
														aria-label="Nominal biaya"
														placeholder="0"
														value={fee.value > 0 ? formatNumberWithDots(fee.value) : ''}
														oninput={(e) => {
															fee.value = parseNumberWithDots((e.target as HTMLInputElement).value);
														}}
														class="w-full bg-transparent text-right font-mono text-xs font-semibold tabular-nums outline-none"
													/>
												</div>
											{/if}
										</div>
										<div class="col-span-4 flex items-center justify-end gap-1 sm:col-span-3">
											<button
												type="button"
												onclick={() =>
													(fee.allocation = fee.allocation === 'equal' ? 'proportional' : 'equal')}
												title="Klik untuk ganti cara pembagian biaya"
												class="border-border bg-card hover:bg-accent cursor-pointer rounded border px-2 py-1 text-[10px] font-semibold"
											>
												{fee.allocation === 'equal' ? 'Bagi Rata' : 'Proporsional'}
											</button>
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												class="text-muted-foreground hover:text-destructive size-7"
												onclick={() => removeFee(fee.id)}
												aria-label="Hapus biaya"
											>
												✕
											</Button>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</section>
				</div>

				<!-- RIGHT COLUMN: Real-Time Summary, Share & Save -->
				<div class="bg-muted/25 flex flex-col gap-4 p-4 sm:p-6 lg:col-span-5 lg:overflow-y-auto">
					<!-- Grand Total Hero Card -->
					<div class="bg-primary text-primary-foreground rounded-xl p-4 shadow-sm">
						<div class="flex items-start justify-between gap-2">
							<div>
								<span class="text-[11px] font-medium opacity-80">Grand Total Bayar</span>
								<div class="mt-0.5 font-mono text-2xl font-bold tracking-tight tabular-nums">
									{formatMoney(calc.grandTotal, currency)}
								</div>
							</div>
							{#if calc.totalDiscount > 0}
								<span class="rounded-full bg-emerald-400/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 tabular-nums">
									Hemat {formatMoney(calc.totalDiscount, currency)}
								</span>
							{/if}
						</div>

						<div class="mt-3 grid grid-cols-3 gap-2 border-t border-white/15 pt-2.5 text-[11px]">
							<div>
								<span class="block opacity-75">Menu</span>
								<strong class="font-mono tabular-nums">{formatMoney(calc.assignedItemsSubtotal, currency)}</strong>
							</div>
							<div>
								<span class="block opacity-75">Diskon</span>
								<strong class="font-mono text-emerald-300 tabular-nums">
									−{formatMoney(calc.effectiveItemDiscount + calc.effectiveDeliveryDiscount, currency)}
								</strong>
							</div>
							<div>
								<span class="block opacity-75">Biaya Bersih</span>
								<strong class="font-mono tabular-nums">+{formatMoney(calc.netFeesTotal, currency)}</strong>
							</div>
						</div>

						<div class="mt-2.5 flex items-center justify-between border-t border-white/15 pt-2 text-xs">
							<span class="opacity-85">Porsi Saya ({participants.find((p) => p.isMe)?.name ?? 'Saya'})</span>
							<strong class="font-mono text-sm font-bold tabular-nums">
								{formatMoney(calc.myShare, currency)}
							</strong>
						</div>
					</div>

					<!-- Rounding Selector (IDR / zero-decimal) -->
					{#if isZeroDecimal}
						<div class="flex flex-wrap items-center justify-between gap-2 text-xs">
							<span class="text-muted-foreground font-medium">Pembulatan per orang:</span>
							<div class="bg-card border-border inline-flex items-center gap-0.5 rounded-lg border p-0.5">
								{#each [
									{ value: 0, label: 'Tepat' },
									{ value: 100, label: '100' },
									{ value: 500, label: '500' },
									{ value: 1000, label: '1.000' }
								] as opt (opt.value)}
									<button
										type="button"
										onclick={() => (roundingStep = opt.value as SplitRoundingStep)}
										class={cn(
											'cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors',
											roundingStep === opt.value
												? 'bg-primary text-primary-foreground'
												: 'text-muted-foreground hover:text-foreground'
										)}
									>
										{opt.label}
									</button>
								{/each}
							</div>
						</div>
						{#if calc.roundingSurplus > 0}
							<p class="text-muted-foreground -mt-2 text-[11px]">
								Pembulatan ke atas menambah selisih total <strong class="font-mono">+{formatMoney(calc.roundingSurplus, currency)}</strong> dari tagihan tepat {formatMoney(calc.exactGrandTotal, currency)}.
							</p>
						{/if}
					{/if}

					<!-- Per-Person Breakdown List -->
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<h3 class="text-xs font-bold tracking-wider uppercase text-muted-foreground">
								Rincian per Orang
							</h3>
							{#if calc.outstandingAmount > 0}
								<span class="text-[11px] font-semibold text-amber-700 tabular-nums">
									Belum bayar: {formatMoney(calc.outstandingAmount, currency)}
								</span>
							{/if}
						</div>

						<div class="space-y-2">
							{#each calc.participants as row (row.participant.id)}
								<div class="border-border bg-card rounded-xl border p-3 shadow-2xs">
									<div class="flex items-center justify-between gap-2">
										<div class="flex min-w-0 items-center gap-2">
											<span
												class="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
												style={`background-color: ${row.participant.color}`}
											>
												{row.participant.name.slice(0, 1).toUpperCase()}
											</span>
											<div class="min-w-0">
												<div class="flex items-center gap-1.5">
													<strong class="truncate text-xs font-semibold">{row.participant.name}</strong>
													{#if row.participant.isMe}
														<Badge variant="secondary" class="px-1.5 py-0 text-[10px]">Saya</Badge>
													{:else}
														<button
															type="button"
															onclick={() => toggleParticipantPaidLocal(row.participant.id)}
															class={cn(
																'cursor-pointer rounded-full px-2 py-0 text-[10px] font-semibold transition-colors',
																row.participant.paid
																	? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
																	: 'bg-amber-100 text-amber-800 hover:bg-amber-200'
															)}
														>
															{row.participant.paid ? '✓ Lunas' : '⏳ Belum'}
														</button>
													{/if}
												</div>
											</div>
										</div>
										<div class="text-right">
											<div class="font-mono text-sm font-bold tabular-nums">
												{formatMoney(row.finalAmount, currency)}
											</div>
											{#if row.savingsPercent > 0}
												<span class="text-[10px] font-medium text-emerald-700">
													Hemat {row.savingsPercent.toFixed(0)}%
												</span>
											{/if}
										</div>
									</div>

									{#if row.items.length > 0}
										<div class="text-muted-foreground mt-2 space-y-0.5 border-t pt-2 text-[11px]">
											{#each row.items as line (line.itemId)}
												<div class="flex items-center justify-between gap-2">
													<span class="truncate">
														{line.name} <span class="opacity-75">({line.shareLabel})</span>
													</span>
													<span class="shrink-0 font-mono tabular-nums">
														{formatMoney(line.amount, currency)}
													</span>
												</div>
											{/each}
											{#if row.discountShare > 0}
												<div class="flex items-center justify-between gap-2 text-emerald-700">
													<span>Potongan diskon</span>
													<span class="font-mono font-medium tabular-nums">
														−{formatMoney(row.discountShare, currency)}
													</span>
												</div>
											{/if}
											{#if row.feeShare > 0}
												<div class="flex items-center justify-between gap-2">
													<span>Ongkir &amp; biaya</span>
													<span class="font-mono tabular-nums">
														+{formatMoney(row.feeShare, currency)}
													</span>
												</div>
											{/if}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>

					<!-- Payment Info & Share Actions -->
					<div class="border-border bg-card space-y-2.5 rounded-xl border p-3">
						<div class="space-y-1">
							<Label for="sb-payment" class="text-xs">Rekening / E-Wallet Tujuan Transfer</Label>
							<Input
								id="sb-payment"
								bind:value={paymentInfo}
								placeholder="mis. BCA 1234567890 a/n Alif · GoPay 0812xxx"
								maxlength={240}
								class="h-8 text-xs"
							/>
							{#if wallets.length > 0 && !paymentInfo.trim()}
								<div class="flex flex-wrap gap-1 pt-0.5">
									{#each wallets.slice(0, 3) as w (w.id)}
										<button
											type="button"
											onclick={() => (paymentInfo = `${w.name} a/n ${userName}`)}
											class="border-border bg-muted/60 hover:bg-accent cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-medium"
										>
											{w.icon} {w.name}
										</button>
									{/each}
								</div>
							{/if}
						</div>

						<div class="grid grid-cols-2 gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								class="w-full text-xs"
								onclick={copyWhatsAppForCurrent}
								disabled={calc.grandTotal <= 0}
							>
								{copiedState === 'wa-current' ? '✓ Tersalin!' : '📋 Salin Teks WA'}
							</Button>
							<div class="flex gap-1">
								<Button
									type="button"
									variant="outline"
									size="sm"
									class="flex-1 text-xs"
									onclick={copyLinkForCurrent}
									disabled={calc.grandTotal <= 0}
								>
									{copiedState === 'link-current' ? '✓ Link Tersalin!' : '🔗 Link Struk'}
								</Button>
								<Button
									type="button"
									variant="outline"
									size="icon-sm"
									class="size-8 shrink-0"
									title="Buka pratinjau struk publik di tab baru"
									aria-label="Pratinjau struk publik"
									onclick={previewReceiptForCurrent}
									disabled={calc.grandTotal <= 0}
								>
									↗
								</Button>
							</div>
						</div>
					</div>

					<!-- Save & Ledger Integration Form -->
					<form
						method="POST"
						action="?/saveSplitBill"
						class="border-border bg-card space-y-3 rounded-xl border p-3.5"
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
									const modeLabel =
										ledgerMode === 'my_share'
											? `Porsi saya (${formatMoney(calc.myShare, currency)}) dicatat ke Expense.`
											: ledgerMode === 'full_advance'
												? `Talangan penuh (${formatMoney(calc.grandTotal, currency)}) dicatat ke Expense.`
												: 'Disimpan ke riwayat Beli Rame-rame.';
									onnotice?.(`Sesi "${title.trim() || 'Beli Rame-rame'}" tersimpan! ${modeLabel}`);
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

						<div class="space-y-1.5">
							<Label class="text-xs font-semibold">Pencatatan ke Transaksi Sanku</Label>
							<div class="grid grid-cols-1 gap-1.5">
								{#each [
									{
										id: 'my_share',
										title: 'Catat Porsi Saya Saja ke Expense',
										desc: `Catat ${formatMoney(calc.myShare, currency)} agar budget tetap akurat`
									},
									{
										id: 'full_advance',
										title: 'Catat Talangan Penuh ke Expense',
										desc: `Catat ${formatMoney(calc.grandTotal, currency)} + catat pemasukan saat teman bayar`
									},
									{
										id: 'none',
										title: 'Simpan Riwayat Saja (Tanpa Transaksi)',
										desc: 'Hanya simpan checklist lunas di tab SplitBills'
									}
								] as opt (opt.id)}
									<button
										type="button"
										onclick={() => (ledgerMode = opt.id as SplitLedgerMode)}
										class={cn(
											'flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-left transition-all',
											ledgerMode === opt.id
												? 'border-primary bg-primary/5 ring-1 ring-primary/20'
												: 'border-border hover:bg-accent/50'
										)}
									>
										<span class="text-xs font-semibold">{opt.title}</span>
										<span class="text-muted-foreground text-[11px]">{opt.desc}</span>
									</button>
								{/each}
							</div>
						</div>

						{#if ledgerMode !== 'none'}
							<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
								<div class="space-y-1">
									<Label class="text-[11px]">Kategori</Label>
									<CustomSelect
										bind:value={categoryId}
										options={categoryOptions}
										size="sm"
										placeholder="Pilih kategori"
									/>
								</div>
								<div class="space-y-1">
									<Label class="text-[11px]">Akun / Wallet</Label>
									<CustomSelect
										bind:value={account}
										options={accountOptions}
										size="sm"
										placeholder="Pilih akun"
									/>
								</div>
							</div>
						{/if}

						{#if error}
							<div class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700" role="alert">
								{error}
							</div>
						{/if}

						<Button type="submit" class="w-full" disabled={saving || calc.unassignedAmount > 0}>
							{saving
								? 'Menyimpan ke Google Sheet…'
								: editingId
									? 'Simpan Perubahan Sesi'
									: 'Simpan Beli Rame-rame'}
						</Button>
					</form>
				</div>
			</div>
		{:else}
			<!-- HISTORY & SETTLEMENT TRACKING VIEW -->
			<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div class="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
					<div class="bg-muted inline-flex items-center gap-0.5 rounded-lg p-1">
						{#each [
							{ id: 'all', label: `Semua (${splitBills.length})` },
							{ id: 'open', label: `Belum Lunas (${openBillsCount})` },
							{ id: 'settled', label: `Selesai (${splitBills.length - openBillsCount})` }
						] as tab (tab.id)}
							<button
								type="button"
								onclick={() => (historyFilter = tab.id as typeof historyFilter)}
								class={cn(
									'cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-all',
									historyFilter === tab.id
										? 'bg-card text-foreground shadow-2xs'
										: 'text-muted-foreground hover:text-foreground'
								)}
							>
								{tab.label}
							</button>
						{/each}
					</div>

					<div class="flex items-center gap-3">
						<label class="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
							<input type="checkbox" bind:checked={recordReimbursement} class="accent-primary rounded" />
							<span>Catat pelunasan teman (talangan) ke Income</span>
						</label>
						<Button
							type="button"
							size="sm"
							onclick={() => {
								resetForm();
								activeTab = 'calculator';
							}}
						>
							+ Hitung Baru
						</Button>
					</div>
				</div>

				<div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
					{#if filteredHistory.length === 0}
						<div class="border-border flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-12 text-center">
							<span class="bg-muted flex size-11 items-center justify-center rounded-full text-xl">🧾</span>
							<h4 class="text-sm font-semibold">Belum ada riwayat Beli Rame-rame</h4>
							<p class="text-muted-foreground max-w-sm text-xs">
								Mulai hitung pesanan bareng teman-teman, tambahkan voucher diskon &amp; ongkir, lalu simpan untuk memantau siapa yang sudah transfer.
							</p>
							<Button
								type="button"
								size="sm"
								class="mt-2"
								onclick={() => {
									resetForm();
									activeTab = 'calculator';
								}}
							>
								Mulai Hitung Patungan
							</Button>
						</div>
					{:else}
						<div class="space-y-3">
							{#each filteredHistory as bill (bill.id)}
								{@const billCalc = calculateSplitBill(bill)}
								<div class="border-border bg-card rounded-xl border p-4 shadow-2xs">
									<div class="flex flex-wrap items-start justify-between gap-3">
										<div class="min-w-0 space-y-0.5">
											<div class="flex flex-wrap items-center gap-2">
												<h4 class="text-sm font-bold">{bill.title}</h4>
												{#if bill.merchant}
													<span class="text-muted-foreground text-xs">· {bill.merchant}</span>
												{/if}
												<Badge variant={bill.status === 'settled' ? 'success' : 'secondary'} class="text-[10px]">
													{bill.status === 'settled' ? '✓ Lunas Semua' : `⏳ ${billCalc.unpaidCount} belum bayar`}
												</Badge>
												{#if bill.ledgerMode !== 'none'}
													<Badge variant="outline" class="text-[10px]">
														{bill.ledgerMode === 'full_advance' ? 'Talangan Penuh' : 'Porsi Saya'}
													</Badge>
												{/if}
											</div>
											<p class="text-muted-foreground text-xs tabular-nums">
												{bill.date} · Total <strong class="text-foreground">{formatMoney(billCalc.grandTotal, bill.currency)}</strong> · Porsi saya <strong>{formatMoney(billCalc.myShare, bill.currency)}</strong>
												{#if billCalc.totalDiscount > 0}
													· <span class="text-emerald-700 font-medium">Hemat {formatMoney(billCalc.totalDiscount, bill.currency)}</span>
												{/if}
											</p>
										</div>

										<div class="flex flex-wrap items-center gap-1.5">
											<Button
												type="button"
												variant="outline"
												size="sm"
												class="h-7 px-2.5 text-xs"
												onclick={() => copyWhatsAppForBill(bill)}
											>
												{copiedState === `wa-${bill.id}` ? '✓ Tersalin' : '📋 WA'}
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												class="h-7 px-2.5 text-xs"
												onclick={() => copyLinkForBill(bill)}
											>
												{copiedState === `link-${bill.id}` ? '✓ Tersalin' : '🔗 Link'}
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												class="h-7 px-2.5 text-xs"
												onclick={() => loadBillForEdit(bill)}
											>
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
												<Button
													type="submit"
													variant="ghost"
													size="sm"
													class="text-muted-foreground hover:text-destructive h-7 px-2 text-xs"
													disabled={deletingBillId === bill.id}
												>
													{deletingBillId === bill.id ? '…' : 'Hapus'}
												</Button>
											</form>
										</div>
									</div>

									<!-- Per-friend settlement checklist -->
									<div class="border-border mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
										{#each billCalc.participants as p (p.participant.id)}
											{#if p.participant.isMe}
												<div class="bg-muted/60 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs">
													<span class="size-2 rounded-full" style={`background-color: ${p.participant.color}`}></span>
													<span class="font-medium">{p.participant.name} (Saya)</span>
													<span class="font-mono font-semibold tabular-nums">
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
																		? `${p.participant.name} ditandai sudah lunas!`
																		: `Status bayar ${p.participant.name} diubah ke belum lunas.`
																);
															}
														};
													}}
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
													<button
														type="submit"
														disabled={busyToggleKey === toggleKey}
														class={cn(
															'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all',
															p.participant.paid
																? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
																: 'border-amber-200 bg-amber-50/70 text-amber-900 hover:bg-amber-100'
														)}
														title={p.participant.paid ? 'Klik untuk ubah ke belum lunas' : 'Klik untuk tandai sudah lunas'}
													>
														<span>{p.participant.paid ? '✅' : '⏳'}</span>
														<span class="font-semibold">{p.participant.name}</span>
														<span class="font-mono font-bold tabular-nums">
															{formatMoney(p.finalAmount, bill.currency)}
														</span>
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
