<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Category, CategorySpend, Wallet, WalletKind } from '#lib/types.ts';
	import { formatMoney, formatNumberWithDots, parseNumberWithDots } from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';
	import ConfirmDialog from './ConfirmDialog.svelte';

	type WalletWithStats = Wallet & { count: number };

	let {
		wallets,
		categories,
		categorySpending,
		currency,
		onAddWallet,
		onEditWallet,
		onTransfer,
		onFilterWallet,
		onAddCategory,
		onEditCategory,
		onnotice
	}: {
		wallets: WalletWithStats[];
		categories: Category[];
		categorySpending: CategorySpend[];
		currency: string;
		onAddWallet: () => void;
		onEditWallet: (wallet: Wallet) => void;
		onTransfer: () => void;
		onFilterWallet: (accountName: string) => void;
		onAddCategory: () => void;
		onEditCategory: (category: Category) => void;
		onnotice?: (message: string) => void;
	} = $props();

	let categoryTab = $state<'expense' | 'income'>('expense');
	let budgetDrafts = $state<Record<string, string>>({});
	let savingBudgetId = $state<string | null>(null);

	let deletingWallet = $state<Wallet | null>(null);
	let isDeletingWallet = $state(false);
	let deleteWalletForm = $state<HTMLFormElement | null>(null);

	let deletingCategory = $state<Category | null>(null);
	let isDeletingCategory = $state(false);
	let deleteCategoryForm = $state<HTMLFormElement | null>(null);

	const KIND_META: Record<WalletKind, { label: string; icon: string }> = {
		bank: { label: 'BANK', icon: 'account_balance' },
		cash: { label: 'CASH', icon: 'payments' },
		card: { label: 'CARD', icon: 'credit_card' },
		savings: { label: 'SAVINGS', icon: 'savings' },
		investment: { label: 'INVEST', icon: 'trending_up' }
	};

	const KIND_ORDER: WalletKind[] = ['bank', 'cash', 'card', 'savings', 'investment'];

	const WALLET_CARD_THEMES = [
		{
			card: 'bg-sky-mint text-on-sky-mint',
			badge: 'bg-ink text-on-surface',
			action: 'bg-ink text-on-surface',
			sub: 'text-ink/75',
			footer: 'border-ink/15'
		},
		{
			card: 'bg-sage-cream text-on-sage-cream',
			badge: 'bg-ink text-on-surface',
			action: 'bg-ink text-on-surface',
			sub: 'text-ink/75',
			footer: 'border-ink/15'
		},
		{
			card: 'bg-surface-card text-on-surface border border-outline-variant',
			badge: 'bg-coral text-on-coral',
			action: 'bg-pill-white text-on-pill-white',
			sub: 'text-on-surface-variant',
			footer: 'border-outline-variant'
		},
		{
			card: 'bg-periwinkle text-on-periwinkle',
			badge: 'bg-pill-white text-on-pill-white',
			action: 'bg-pill-white text-on-pill-white',
			sub: 'text-on-periwinkle/85',
			footer: 'border-white/20'
		}
	] as const;

	const combinedBalance = $derived(wallets.reduce((sum, w) => sum + w.balance, 0));

	const kindTotals = $derived.by(() => {
		const map = new Map<WalletKind, number>();
		for (const w of wallets) {
			const k: WalletKind = w.kind in KIND_META ? w.kind : 'bank';
			map.set(k, (map.get(k) ?? 0) + w.balance);
		}
		return KIND_ORDER.filter((k) => map.has(k)).map((k) => ({
			kind: k,
			label: KIND_META[k].label,
			total: map.get(k) ?? 0
		}));
	});

	const spendMap = $derived(new Map(categorySpending.map((item) => [item.category.id, item.amount])));

	const expenseCategories = $derived(
		categories.filter((c) => c.type === 'expense').sort((a, b) => a.name.localeCompare(b.name))
	);
	const incomeCategories = $derived(
		categories.filter((c) => c.type === 'income').sort((a, b) => a.name.localeCompare(b.name))
	);
	const activeCategories = $derived(
		categoryTab === 'expense' ? expenseCategories : incomeCategories
	);

	const totalAllocated = $derived(
		expenseCategories.reduce((sum, cat) => sum + (cat.budget > 0 ? cat.budget : 0), 0)
	);
	const totalBudgetedSpent = $derived(
		expenseCategories
			.filter((cat) => cat.budget > 0)
			.reduce((sum, cat) => sum + (spendMap.get(cat.id) ?? 0), 0)
	);
	const overallBudgetPct = $derived(
		totalAllocated > 0 ? Math.round((totalBudgetedSpent / totalAllocated) * 100) : 0
	);

	function budgetInputValue(cat: Category): string {
		if (cat.id in budgetDrafts) return budgetDrafts[cat.id];
		return cat.budget > 0 ? formatNumberWithDots(cat.budget) : '';
	}

	function barColor(pct: number, hasLimit: boolean): string {
		if (!hasLimit) return 'bg-ink';
		if (pct > 95) return 'bg-coral';
		if (pct >= 75) return 'bg-marigold';
		return 'bg-income';
	}

	function executeDeleteWallet() {
		if (!deletingWallet || !deleteWalletForm) return;
		isDeletingWallet = true;
		deleteWalletForm.requestSubmit();
	}

	function executeDeleteCategory() {
		if (!deletingCategory || !deleteCategoryForm) return;
		isDeletingCategory = true;
		deleteCategoryForm.requestSubmit();
	}
</script>

<div class="gap-gutter-lg flex flex-col">
	<!-- Page Header -->
	<div class="gap-gutter-md flex flex-wrap items-center justify-between">
		<div>
			<h1 class="font-display text-headline-lg sm:text-display-md text-on-surface uppercase">
				ACCOUNTS &amp; BUDGETS
			</h1>
			<p class="font-body text-body-md text-on-surface-variant">
				Kelola {wallets.length} dompet bank, e-wallet, tabungan, serta batas anggaran bulanan.
			</p>
		</div>

		<div class="gap-gutter-sm flex flex-wrap items-center">
			<button
				type="button"
				onclick={onTransfer}
				class="bg-pill-white text-on-pill-white font-label text-label-lg flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 transition-opacity hover:opacity-90"
			>
				<span class="material-symbols-outlined text-[16px]" aria-hidden="true">swap_horiz</span>
				<span>Transfer</span>
			</button>
			<button
				type="button"
				onclick={onAddWallet}
				class="bg-marigold text-on-marigold font-label text-label-lg flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 transition-opacity hover:opacity-90"
			>
				<span class="material-symbols-outlined text-[16px]" aria-hidden="true">add</span>
				<span>Add Account</span>
			</button>
		</div>
	</div>

	<!-- Row 1: Marigold Hero Wallets Card + Wallets Bento Grid -->
	<section id="wallets_manager" class="gap-gutter-md grid grid-cols-12 items-stretch">
		<!-- Marigold Hero Liquidity Card (Stacked Folder Motif on Mobile) -->
		<div class="col-span-12 flex flex-col lg:col-span-5">
			<div class="bg-coral text-on-coral font-label text-label-sm -mb-3 rounded-t-xl px-4 pt-2.5 pb-4 uppercase sm:hidden">
				{wallets.length} ACTIVE {wallets.length === 1 ? 'ACCOUNT' : 'ACCOUNTS'}
			</div>
			<div class="bg-surface-card text-on-surface border-outline-variant font-label text-label-sm -mb-3 rounded-t-xl border-t px-4 pt-2.5 pb-4 uppercase sm:hidden">
				NET LIQUIDITY
			</div>
			<div class="bg-marigold text-on-marigold gap-gutter-md flex flex-1 flex-col justify-between rounded-xl p-5 sm:p-6">
			<div class="hidden items-center justify-between gap-2 sm:flex">
				<span class="bg-ink text-on-surface font-label text-label-sm rounded-full px-3 py-1 uppercase">
					{wallets.length} ACTIVE {wallets.length === 1 ? 'WALLET' : 'WALLETS'}
				</span>
				<span class="font-mono text-mono-md tabular-nums">SYNCED</span>
			</div>

			<div class="border-ink overflow-hidden rounded-lg border-2">
				<img
					src="/images/pop_wallets_sync.jpg"
					alt="Ilustrasi dompet dan brankas Sanku"
					class="h-36 w-full object-cover sm:h-44"
				/>
			</div>

			<div class="flex items-end justify-between gap-3">
				<div class="min-w-0">
					<div class="font-label text-label-sm hidden uppercase sm:block">NET LIQUIDITY</div>
					<div class="font-display text-display-md-mobile sm:text-display-md truncate tabular-nums">
						{formatMoney(combinedBalance, currency)}
					</div>
				</div>
				<span class="bg-ink text-on-surface flex size-10 shrink-0 items-center justify-center rounded-full">
					<span class="material-symbols-outlined text-[18px]" aria-hidden="true">
						account_balance_wallet
					</span>
				</span>
			</div>

			{#if kindTotals.length > 0}
				<div class="border-ink/15 flex flex-wrap gap-1.5 border-t pt-3">
					{#each kindTotals as group (group.kind)}
						<span class="bg-ink/10 text-ink font-mono text-mono-sm rounded-full px-2.5 py-0.5 tabular-nums">
							{group.label}: {formatMoney(group.total, currency)}
						</span>
					{/each}
				</div>
			{/if}
			</div>
		</div>

		<!-- Wallets Bento Grid -->
		<div class="col-span-12 lg:col-span-7">
			{#if wallets.length === 0}
				<div class="bg-surface-card border-outline-variant flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-12 text-center">
					<span class="bg-sky-mint text-on-sky-mint flex size-12 items-center justify-center rounded-full">
						<span class="material-symbols-outlined text-[24px]" aria-hidden="true">
							account_balance_wallet
						</span>
					</span>
					<h2 class="font-headline text-headline-md text-on-surface uppercase">Belum ada dompet</h2>
					<p class="font-body text-body-sm text-on-surface-variant max-w-sm">
						Tambahkan rekening bank, e-wallet, kartu, atau kas untuk melacak saldo otomatis.
					</p>
					<button
						type="button"
						onclick={onAddWallet}
						class="bg-primary text-on-primary font-label text-label-lg mt-1 cursor-pointer rounded-full px-5 py-2 transition-opacity hover:opacity-90"
					>
						+ Create First Account
					</button>
				</div>
			{:else}
				<div class="gap-gutter-md grid grid-cols-1 sm:grid-cols-2">
					{#each wallets as wallet, idx (wallet.id)}
						{@const meta = KIND_META[wallet.kind] ?? KIND_META.bank}
						{@const theme = WALLET_CARD_THEMES[idx % WALLET_CARD_THEMES.length]}
						<article class={cn('gap-gutter-sm flex flex-col justify-between rounded-xl p-5', theme.card)}>
							<div class="flex items-center justify-between gap-2">
								<span class={cn('font-label text-label-sm rounded-full px-2.5 py-0.5 uppercase', theme.badge)}>
									{meta.label}
								</span>
								<button
									type="button"
									onclick={() => onFilterWallet(wallet.name)}
									aria-label={`Filter transaksi ${wallet.name}`}
									title="Filter transaksi dompet ini"
									class={cn(
										'flex size-8 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-105',
										theme.action
									)}
								>
									<span class="material-symbols-outlined text-[16px]" aria-hidden="true">north_east</span>
								</button>
							</div>

							<div>
								<h2 class="font-headline text-headline-md truncate uppercase">
									{wallet.name}
								</h2>
								<p class="font-headline text-headline-md sm:text-headline-lg mt-1 truncate tabular-nums">
									{formatMoney(wallet.balance, currency)}
								</p>
							</div>

							<div class={cn('flex items-center justify-between gap-2 border-t pt-2.5 text-xs', theme.footer)}>
								<span class={cn('font-body text-body-sm truncate tabular-nums', theme.sub)}>
									{wallet.count} {wallet.count === 1 ? 'tx' : 'txs'} · Awal {formatMoney(wallet.initialBalance ?? 0, currency)}
								</span>
								<div class="flex shrink-0 items-center gap-2 font-bold">
									<button
										type="button"
										onclick={() => onEditWallet(wallet)}
										class="cursor-pointer underline-offset-2 hover:underline"
									>
										Edit
									</button>
									<button
										type="button"
										onclick={() => (deletingWallet = wallet)}
										class="cursor-pointer opacity-80 underline-offset-2 hover:opacity-100 hover:underline"
									>
										Delete
									</button>
								</div>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<!-- Row 2: Monthly Budget Limits & Categories -->
	<section
		id="categories_and_budgets"
		class="bg-surface-card border-outline-variant gap-gutter-md flex scroll-mt-24 flex-col rounded-xl border p-6"
	>
		<div class="gap-gutter-md flex flex-wrap items-center justify-between">
			<div>
				<h2 class="font-headline text-headline-lg text-on-surface uppercase">
					MONTHLY BUDGET LIMITS
				</h2>
				<p class="font-body text-body-sm text-on-surface-variant tabular-nums">
					Total anggaran {formatMoney(totalAllocated, currency)} · Terpakai {formatMoney(totalBudgetedSpent, currency)} ({overallBudgetPct}%)
				</p>
			</div>

			<div class="gap-gutter-sm flex flex-wrap items-center">
				<div
					class="bg-ink inline-flex items-center gap-1 rounded-full p-1"
					role="tablist"
					aria-label="Category type"
				>
					<button
						type="button"
						role="tab"
						aria-selected={categoryTab === 'expense'}
						onclick={() => (categoryTab = 'expense')}
						class={cn(
							'font-label text-label-sm cursor-pointer rounded-full px-3.5 py-1.5 transition-colors',
							categoryTab === 'expense'
								? 'bg-pill-white text-on-pill-white'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
					>
						Expense &amp; Limits
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={categoryTab === 'income'}
						onclick={() => (categoryTab = 'income')}
						class={cn(
							'font-label text-label-sm cursor-pointer rounded-full px-3.5 py-1.5 transition-colors',
							categoryTab === 'income'
								? 'bg-pill-white text-on-pill-white'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
					>
						Income Categories
					</button>
				</div>

				<button
					type="button"
					onclick={onAddCategory}
					class="bg-pill-white text-on-pill-white font-label text-label-lg cursor-pointer rounded-full px-4 py-2 transition-opacity hover:opacity-90"
				>
					+ New Category
				</button>
			</div>
		</div>

		{#if activeCategories.length === 0}
			<div class="bg-surface-container border-outline-variant rounded-lg border border-dashed py-10 text-center">
				<p class="font-title text-title-md text-on-surface">
					Belum ada kategori {categoryTab}
				</p>
				<button
					type="button"
					onclick={onAddCategory}
					class="bg-primary text-on-primary font-label text-label-sm mt-3 cursor-pointer rounded-full px-4 py-2"
				>
					+ Create Category
				</button>
			</div>
		{:else}
			<div class="gap-gutter-md grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
				{#each activeCategories as cat (cat.id)}
					{@const spent = spendMap.get(cat.id) ?? 0}
					{@const hasLimit = cat.type === 'expense' && cat.budget > 0}
					{@const pct = hasLimit ? (spent / cat.budget) * 100 : spent > 0 ? 100 : 0}
					{@const clamped = Math.min(100, Math.max(0, pct))}
					{@const remaining = cat.budget - spent}
					{@const currentDraft = budgetInputValue(cat)}
					{@const parsedDraft = parseNumberWithDots(currentDraft)}
					{@const isDirty = cat.type === 'expense' && parsedDraft !== cat.budget}
					{@const isUnbudgetedAlert = cat.type === 'expense' && !hasLimit && spent > 0}
					<div
						class={cn(
							'gap-gutter-sm flex flex-col justify-between rounded-lg p-5',
							isUnbudgetedAlert ? 'bg-coral text-on-coral' : 'bg-surface-container text-on-surface'
						)}
					>
						<div class="flex items-start justify-between gap-2">
							<div class="flex min-w-0 items-center gap-2">
								<span
									class="size-3 shrink-0 rounded-full"
									style={`background:${cat.color}`}
									aria-hidden="true"
								></span>
								<span class="font-title text-title-md truncate">
									{cat.emoji} {cat.name}{isUnbudgetedAlert ? ' (Unbudgeted)' : ''}
								</span>
							</div>

							<div class="flex shrink-0 items-center gap-1">
								{#if cat.type === 'expense' && hasLimit}
									<span
										class={cn(
											'font-label text-label-sm rounded-full px-2.5 py-0.5 tabular-nums',
											pct > 95
												? 'bg-coral text-on-coral'
												: pct >= 75
													? 'bg-marigold text-on-marigold'
													: 'bg-income text-on-income'
										)}
									>
										{Math.round(pct)}%
									</span>
								{:else if isUnbudgetedAlert}
									<span class="bg-ink text-on-surface font-label text-label-sm rounded-full px-2.5 py-0.5">
										No Limit
									</span>
								{/if}

								<button
									type="button"
									aria-label={`Edit ${cat.name}`}
									onclick={() => onEditCategory(cat)}
									class={cn(
										'flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors',
										isUnbudgetedAlert
											? 'bg-ink/15 hover:bg-ink hover:text-on-surface'
											: 'bg-surface-card text-on-surface-variant hover:text-on-surface'
									)}
								>
									<span class="material-symbols-outlined text-[15px]" aria-hidden="true">edit</span>
								</button>
								<button
									type="button"
									aria-label={`Delete ${cat.name}`}
									onclick={() => (deletingCategory = cat)}
									class={cn(
										'flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors',
										isUnbudgetedAlert
											? 'bg-ink/15 hover:bg-ink hover:text-on-surface'
											: 'bg-surface-card text-on-surface-variant hover:bg-coral hover:text-on-coral'
									)}
								>
									<span class="material-symbols-outlined text-[15px]" aria-hidden="true">delete</span>
								</button>
							</div>
						</div>

						{#if cat.type === 'expense'}
							<div class="space-y-2">
								<div class="font-mono text-mono-md tabular-nums">
									{#if hasLimit}
										{formatMoney(spent, currency)} / {formatMoney(cat.budget, currency)}
									{:else}
										{formatMoney(spent, currency)} spent
									{/if}
								</div>

								{#if hasLimit}
									<div
										class="bg-surface h-3 w-full overflow-hidden rounded-full"
										role="progressbar"
										aria-valuenow={Math.round(clamped)}
										aria-valuemin={0}
										aria-valuemax={100}
									>
										<div
											class={cn('h-full rounded-full transition-all', barColor(pct, hasLimit))}
											style={`width:${clamped}%`}
										></div>
									</div>
									<div class="font-body text-body-sm flex items-center justify-between tabular-nums">
										<span class={remaining < 0 ? 'text-coral font-bold' : 'text-income font-semibold'}>
											{remaining < 0
												? `${formatMoney(Math.abs(remaining), currency)} over`
												: `${formatMoney(remaining, currency)} left`}
										</span>
									</div>
								{:else}
									<p class={cn('font-body text-body-sm', isUnbudgetedAlert ? 'text-ink/80' : 'text-on-surface-variant')}>
										Set limit untuk kategori ini
									</p>
								{/if}
							</div>

							<!-- Inline Monthly Limit Editor -->
							<form
								method="POST"
								action="?/saveCategory"
								class={cn(
									'flex items-center gap-2 border-t pt-2.5',
									isUnbudgetedAlert ? 'border-ink/15' : 'border-outline-variant'
								)}
								use:enhance={() => {
									savingBudgetId = cat.id;
									return async ({ result, update }) => {
										savingBudgetId = null;
										if (result.type === 'success') {
											const next = { ...budgetDrafts };
											delete next[cat.id];
											budgetDrafts = next;
											await update({ reset: false });
											onnotice?.(`Updated monthly limit for ${cat.name}.`);
										} else {
											await update();
										}
									};
								}}
							>
								<input type="hidden" name="id" value={cat.id} />
								<input type="hidden" name="name" value={cat.name} />
								<input type="hidden" name="type" value={cat.type} />
								<input type="hidden" name="color" value={cat.color} />
								<input type="hidden" name="emoji" value={cat.emoji} />
								<input type="hidden" name="budget" value={parsedDraft} />

								<span class={cn('font-label text-label-sm shrink-0', isUnbudgetedAlert ? 'text-ink/80' : 'text-on-surface-variant')}>
									Limit
								</span>
								<input
									type="text"
									inputmode="numeric"
									placeholder="No limit"
									aria-label={`Monthly budget limit for ${cat.name}`}
									value={currentDraft}
									oninput={(e) => {
										budgetDrafts = {
											...budgetDrafts,
											[cat.id]: formatNumberWithDots((e.target as HTMLInputElement).value)
										};
									}}
									class={cn(
										'font-mono text-mono-sm min-w-0 flex-1 rounded-full border px-3 py-1 tabular-nums outline-none',
										isUnbudgetedAlert
											? 'border-ink/25 bg-sage-cream text-ink placeholder:text-ink/50'
											: 'border-outline-variant bg-surface text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary'
									)}
								/>
								{#if isDirty}
									<button
										type="submit"
										disabled={savingBudgetId === cat.id}
										class={cn(
											'font-label text-label-sm shrink-0 cursor-pointer rounded-full px-3 py-1 transition-opacity hover:opacity-90 disabled:opacity-50',
											isUnbudgetedAlert ? 'bg-ink text-on-surface' : 'bg-pill-white text-on-pill-white'
										)}
									>
										{savingBudgetId === cat.id ? '…' : 'Save'}
									</button>
								{/if}
							</form>
						{:else}
							<p class="font-body text-body-sm text-on-surface-variant">
								Income source category
							</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

<!-- Hidden Delete Forms -->
<form
	method="POST"
	action="?/deleteWallet"
	bind:this={deleteWalletForm}
	use:enhance={() => {
		return async ({ update }) => {
			isDeletingWallet = false;
			const deletedName = deletingWallet?.name;
			deletingWallet = null;
			await update({ reset: false });
			if (deletedName) onnotice?.(`Deleted account "${deletedName}".`);
		};
	}}
>
	<input type="hidden" name="id" value={deletingWallet?.id ?? ''} />
</form>

<form
	method="POST"
	action="?/deleteCategory"
	bind:this={deleteCategoryForm}
	use:enhance={() => {
		return async ({ update }) => {
			isDeletingCategory = false;
			const deletedName = deletingCategory?.name;
			deletingCategory = null;
			await update({ reset: false });
			if (deletedName) onnotice?.(`Deleted category "${deletedName}".`);
		};
	}}
>
	<input type="hidden" name="id" value={deletingCategory?.id ?? ''} />
</form>

<ConfirmDialog
	open={deletingWallet !== null}
	title={`Delete "${deletingWallet?.name}"?`}
	message="Are you sure you want to delete this account? Existing transactions will retain their account name."
	confirmLabel="Delete Account"
	cancelLabel="Cancel"
	variant="danger"
	icon="delete"
	loading={isDeletingWallet}
	onconfirm={executeDeleteWallet}
	oncancel={() => (deletingWallet = null)}
/>

<ConfirmDialog
	open={deletingCategory !== null}
	title={`Delete "${deletingCategory?.name}"?`}
	message="Existing transactions under this category will remain and display as Uncategorized."
	confirmLabel="Delete Category"
	cancelLabel="Cancel"
	variant="danger"
	icon="delete"
	loading={isDeletingCategory}
	onconfirm={executeDeleteCategory}
	oncancel={() => (deletingCategory = null)}
/>
