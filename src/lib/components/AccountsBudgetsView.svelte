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
		bank: { label: 'Bank', icon: 'account_balance' },
		cash: { label: 'Cash', icon: 'payments' },
		card: { label: 'Card', icon: 'credit_card' },
		savings: { label: 'Savings', icon: 'savings' },
		investment: { label: 'Investment', icon: 'trending_up' }
	};

	const KIND_ORDER: WalletKind[] = ['bank', 'cash', 'card', 'savings', 'investment'];

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
		if (!hasLimit) return 'bg-accent-orange';
		if (pct > 95) return 'bg-expense';
		if (pct >= 75) return 'bg-warning';
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

<div class="flex flex-col gap-gutter-xl">
	<!-- Section 1: Accounts & Wallets -->
	<section id="wallets_manager" class="flex flex-col gap-gutter-md">
		<div class="flex flex-wrap items-center justify-between gap-gutter-md">
			<div>
				<h1 class="font-headline text-headline-lg text-on-surface">Accounts &amp; Wallets</h1>
				<p class="font-body text-body-md text-on-surface-variant">
					Real-time balance calculated from initial balance, transactions, and transfers
				</p>
			</div>

			<div class="flex flex-wrap items-center gap-gutter-sm">
				<button
					type="button"
					onclick={onTransfer}
					class="bg-surface-card border-outline font-label text-label-md text-on-surface hover:bg-surface-container-low inline-flex cursor-pointer items-center gap-1.5 rounded border px-3 py-2 transition-colors duration-state-change"
				>
					<span class="material-symbols-outlined text-on-surface-variant text-[18px]" aria-hidden="true">
						swap_horiz
					</span>
					<span>Transfer Funds</span>
				</button>
				<button
					type="button"
					onclick={onAddWallet}
					class="bg-primary text-on-primary font-label text-label-md inline-flex cursor-pointer items-center gap-1.5 rounded px-3.5 py-2 transition-opacity duration-state-change hover:opacity-95"
				>
					<span class="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
					<span>Add Account</span>
				</button>
			</div>
		</div>

		<!-- Combined Balance Summary Banner -->
		<div class="bg-surface-card border-outline flex flex-wrap items-center justify-between gap-gutter-md rounded-md border p-gutter-md">
			<div class="flex flex-col gap-0.5">
				<span class="font-label text-label-sm text-on-surface-variant tracking-wider uppercase">
					Combined Balance
				</span>
				<span
					class={cn(
						'font-headline text-headline-lg tabular-nums',
						combinedBalance < 0 ? 'text-on-expense-container' : 'text-on-surface'
					)}
				>
					{formatMoney(combinedBalance, currency)}
				</span>
			</div>

			{#if kindTotals.length > 0}
				<div class="flex flex-wrap items-center gap-gutter-sm">
					{#each kindTotals as group (group.kind)}
						<span
							class={cn(
								'bg-surface-container-high border-outline font-body text-body-sm rounded border px-3 py-1.5 tabular-nums',
								group.total < 0 ? 'text-on-expense-container' : 'text-on-surface'
							)}
						>
							{group.label}: <strong class="font-semibold">{formatMoney(group.total, currency)}</strong>
						</span>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Wallet Grid -->
		{#if wallets.length === 0}
			<div class="bg-surface-card border-outline flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-12 text-center">
				<span class="material-symbols-outlined text-on-surface-variant text-[28px]" aria-hidden="true">
					account_balance_wallet
				</span>
				<h2 class="font-title text-title-md text-on-surface">No accounts configured yet</h2>
				<p class="font-body text-body-sm text-on-surface-variant max-w-sm">
					Add your bank accounts, e-wallets, cards, or cash to track balances automatically.
				</p>
				<button
					type="button"
					onclick={onAddWallet}
					class="bg-primary text-on-primary font-label text-label-md mt-2 cursor-pointer rounded px-4 py-2 hover:opacity-95"
				>
					+ Create First Account
				</button>
			</div>
		{:else}
			<div class="grid grid-cols-1 items-stretch gap-gutter-md sm:grid-cols-2 lg:grid-cols-4">
				{#each wallets as wallet (wallet.id)}
					{@const meta = KIND_META[wallet.kind] ?? KIND_META.bank}
					<article class="bg-surface-card border-outline flex h-full flex-col justify-between overflow-hidden rounded-md border">
						<div class="h-1.5 w-full" style={`background:${wallet.color || '#E9762B'}`}></div>
						<div class="flex flex-1 flex-col justify-between gap-gutter-md p-gutter-md">
							<header class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<h2 class="font-title text-title-md text-on-surface truncate">{wallet.name}</h2>
									<span class="bg-surface-container-low font-label text-label-sm text-on-surface-variant mt-1 inline-block rounded-full px-2 py-0.5">
										{meta.label}
									</span>
								</div>
								<span
									class="material-symbols-outlined shrink-0 text-[20px]"
									style={`color:${wallet.color || '#475569'}`}
									aria-hidden="true"
								>
									{meta.icon}
								</span>
							</header>

							<div>
								<p
									class={cn(
										'font-headline text-headline-md tabular-nums',
										wallet.balance < 0 ? 'text-on-expense-container' : 'text-on-surface'
									)}
								>
									{formatMoney(wallet.balance, currency)}
								</p>
								<p class="font-body text-body-sm text-on-surface-variant tabular-nums">
									Initial {formatMoney(wallet.initialBalance ?? 0, currency)} · {wallet.count}
									{wallet.count === 1 ? 'tx' : 'txs'}
								</p>
							</div>

							<footer class="border-outline flex items-center justify-between border-t pt-gutter-sm">
								<button
									type="button"
									onclick={() => onFilterWallet(wallet.name)}
									class="font-label text-label-sm text-primary cursor-pointer hover:underline"
								>
									Filter Transactions
								</button>
								<div class="flex items-center gap-2.5">
									<button
										type="button"
										onclick={() => onEditWallet(wallet)}
										class="font-label text-label-sm text-on-surface-variant hover:text-on-surface cursor-pointer"
									>
										Edit
									</button>
									<button
										type="button"
										onclick={() => (deletingWallet = wallet)}
										class="font-label text-label-sm text-on-expense-container cursor-pointer hover:underline"
									>
										Delete
									</button>
								</div>
							</footer>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Section 2: Categories & Monthly Budgets -->
	<section id="categories_and_budgets" class="flex scroll-mt-24 flex-col gap-gutter-md">
		<div class="flex flex-wrap items-center justify-between gap-gutter-md">
			<div>
				<h2 class="font-headline text-headline-lg text-on-surface">
					Categories &amp; Monthly Budgets
				</h2>
				<p class="font-body text-body-md text-on-surface-variant">
					Set monthly spending caps per category and track real-time utilization
				</p>
			</div>

			<div class="flex flex-wrap items-center gap-gutter-sm">
				<div
					class="bg-surface-container-low border-outline inline-flex items-center rounded border p-0.5"
					role="tablist"
					aria-label="Category type"
				>
					<button
						type="button"
						role="tab"
						aria-selected={categoryTab === 'expense'}
						onclick={() => (categoryTab = 'expense')}
						class={cn(
							'font-label text-label-sm cursor-pointer rounded-sm px-3 py-1.5 transition-colors',
							categoryTab === 'expense'
								? 'bg-surface-card text-on-surface shadow-xs'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
					>
						Expense Categories &amp; Limits
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={categoryTab === 'income'}
						onclick={() => (categoryTab = 'income')}
						class={cn(
							'font-label text-label-sm cursor-pointer rounded-sm px-3 py-1.5 transition-colors',
							categoryTab === 'income'
								? 'bg-surface-card text-on-surface shadow-xs'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
					>
						Income Categories
					</button>
				</div>

				<button
					type="button"
					onclick={onAddCategory}
					class="bg-primary text-on-primary font-label text-label-md inline-flex cursor-pointer items-center gap-1 rounded px-3.5 py-2 hover:opacity-95"
				>
					+ New Category
				</button>
			</div>
		</div>

		{#if categoryTab === 'expense'}
			<!-- Budget Summary Bar -->
			<div class="bg-surface-card border-outline flex flex-wrap items-center justify-between gap-gutter-sm rounded-md border px-gutter-md py-3">
				<p class="font-body text-body-md text-on-surface tabular-nums">
					Total Allocated: <strong class="font-semibold">{formatMoney(totalAllocated, currency)}</strong>
					· Total Spent:
					<strong
						class={cn(
							'font-semibold',
							overallBudgetPct > 95
								? 'text-on-expense-container'
								: overallBudgetPct >= 75
									? 'text-on-warning-container'
									: 'text-on-income-container'
						)}
					>
						{formatMoney(totalBudgetedSpent, currency)} ({overallBudgetPct}%)
					</strong>
				</p>
				<div class="font-body text-body-sm text-on-surface-variant flex items-center gap-3">
					<span class="inline-flex items-center gap-1">
						<span class="bg-income size-2 rounded-full"></span> &lt; 75%
					</span>
					<span class="inline-flex items-center gap-1">
						<span class="bg-warning size-2 rounded-full"></span> 75–95%
					</span>
					<span class="inline-flex items-center gap-1">
						<span class="bg-expense size-2 rounded-full"></span> &gt; 95%
					</span>
				</div>
			</div>
		{/if}

		<!-- Category Rows -->
		{#if activeCategories.length === 0}
			<div class="bg-surface-card border-outline rounded-md border border-dashed py-10 text-center">
				<p class="font-title text-title-md text-on-surface">
					No {categoryTab} categories yet
				</p>
				<button
					type="button"
					onclick={onAddCategory}
					class="bg-primary text-on-primary font-label text-label-sm mt-3 cursor-pointer rounded px-3.5 py-1.5"
				>
					+ Create Category
				</button>
			</div>
		{:else}
			<div class="bg-surface-card border-outline divide-outline divide-y rounded-md border">
				{#each activeCategories as cat (cat.id)}
					{@const spent = spendMap.get(cat.id) ?? 0}
					{@const hasLimit = cat.type === 'expense' && cat.budget > 0}
					{@const pct = hasLimit ? (spent / cat.budget) * 100 : spent > 0 ? 25 : 0}
					{@const clamped = Math.min(100, Math.max(0, pct))}
					{@const remaining = cat.budget - spent}
					{@const currentDraft = budgetInputValue(cat)}
					{@const parsedDraft = parseNumberWithDots(currentDraft)}
					{@const isDirty = cat.type === 'expense' && parsedDraft !== cat.budget}
					<div class="grid grid-cols-1 items-center gap-gutter-md p-gutter-md lg:grid-cols-12">
						<div class="flex items-center gap-3 lg:col-span-3">
							<span
								class="size-3 shrink-0 rounded-full"
								style={`background:${cat.color}`}
								aria-hidden="true"
							></span>
							<span class="font-title text-title-md text-on-surface truncate">
								{cat.emoji} {cat.name}
							</span>
						</div>

						{#if cat.type === 'expense'}
							<form
								method="POST"
								action="?/saveCategory"
								class="flex items-center gap-2 lg:col-span-3"
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

								<span class="font-body text-body-sm text-on-surface-variant shrink-0">
									Limit {currency}
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
									class="border-outline bg-surface-container-high font-label text-label-md text-on-surface focus:border-primary focus:bg-surface-card focus:ring-primary w-32 rounded border px-2.5 py-1 tabular-nums outline-none focus:ring-1"
								/>
								{#if isDirty}
									<button
										type="submit"
										disabled={savingBudgetId === cat.id}
										class="bg-primary text-on-primary font-label text-label-sm cursor-pointer rounded px-2 py-1 hover:opacity-95 disabled:opacity-50"
									>
										{savingBudgetId === cat.id ? '…' : 'Save'}
									</button>
								{/if}
							</form>

							<div class="flex flex-col gap-1.5 lg:col-span-4">
								<div
									class="bg-surface-container-low h-2 w-full overflow-hidden rounded-full"
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
									{#if hasLimit}
										<span
											class={cn(
												'font-medium',
												remaining < 0 ? 'text-on-expense-container' : 'text-on-income-container'
											)}
										>
											{remaining < 0
												? `${formatMoney(Math.abs(remaining), currency)} over`
												: `${formatMoney(remaining, currency)} left`}
										</span>
										<span class="text-on-surface-variant">{Math.round(pct)}% used</span>
									{:else}
										<span class="text-on-surface-variant">
											{formatMoney(spent, currency)} spent
										</span>
										<span class="text-on-surface-variant">Unbudgeted</span>
									{/if}
								</div>
							</div>
						{:else}
							<div class="font-body text-body-sm text-on-surface-variant lg:col-span-7">
								Income source category
							</div>
						{/if}

						<div class="flex items-center justify-end gap-1 lg:col-span-2">
							<button
								type="button"
								aria-label={`Edit ${cat.name}`}
								onclick={() => onEditCategory(cat)}
								class="text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface cursor-pointer rounded p-1.5 transition-colors"
							>
								<span class="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span>
							</button>
							<button
								type="button"
								aria-label={`Delete ${cat.name}`}
								onclick={() => (deletingCategory = cat)}
								class="text-on-surface-variant hover:bg-expense-container hover:text-on-expense-container cursor-pointer rounded p-1.5 transition-colors"
							>
								<span class="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span>
							</button>
						</div>
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
