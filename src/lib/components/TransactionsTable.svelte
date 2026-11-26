<script lang="ts">
	import type { Category, Transaction } from '#lib/types.ts';
	import { formatDate, formatMoney, formatShortDate, getTransferDestination } from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';
	import * as Table from '#lib/components/ui/table/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';

	type SortColumn = 'date' | 'description' | 'category' | 'account' | 'amount';

	let {
		transactions,
		currency,
		sortBy,
		sortOrder,
		categoryFor,
		onSort,
		onEdit,
		onDuplicate,
		onDelete,
		onFilterCategory,
		onFilterAccount
	}: {
		transactions: Transaction[];
		currency: string;
		sortBy: SortColumn;
		sortOrder: 'asc' | 'desc';
		categoryFor: (transaction: Transaction) => Category | null;
		onSort: (column: SortColumn) => void;
		onEdit: (transaction: Transaction) => void;
		onDuplicate: (transaction: Transaction) => void;
		onDelete: (transaction: Transaction) => void;
		onFilterCategory: (categoryId: string) => void;
		onFilterAccount: (account: string) => void;
	} = $props();

	const SORT_COLUMNS: Array<{ key: SortColumn; label: string }> = [
		{ key: 'date', label: 'Date' },
		{ key: 'amount', label: 'Amount' },
		{ key: 'description', label: 'Description' },
		{ key: 'category', label: 'Category' },
		{ key: 'account', label: 'Account' }
	];

	function sortIndicator(column: SortColumn) {
		if (sortBy !== column) return '↕';
		return sortOrder === 'asc' ? '↑' : '↓';
	}

	function amountClass(type: Transaction['type']) {
		return cn(
			'font-semibold tabular-nums',
			type === 'income' && 'text-emerald-700',
			type === 'expense' && 'text-foreground',
			type === 'transfer' && 'text-sky-600'
		);
	}

	function amountPrefix(type: Transaction['type']) {
		if (type === 'income') return '+';
		if (type === 'expense') return '−';
		return '⇄ ';
	}
</script>

{#snippet sortHead(
	column: SortColumn,
	label: string,
	options?: { align?: 'left' | 'right'; class?: string }
)}
	<Table.Head class={cn(options?.align === 'right' && 'text-right', options?.class)}>
		<Button
			variant="ghost"
			size="sm"
			class={cn(
				'text-muted-foreground hover:text-foreground -ml-2 h-8 px-2 font-medium',
				options?.align === 'right' && 'ml-auto -mr-2'
			)}
			onclick={() => onSort(column)}
		>
			{label}
			<span class="text-foreground/60 text-xs">{sortIndicator(column)}</span>
		</Button>
	</Table.Head>
{/snippet}

{#snippet categoryBadge(transaction: Transaction)}
	{@const category = categoryFor(transaction)}
	{#if transaction.type === 'transfer'}
		<span class="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
			⇄ Transfer
		</span>
	{:else if category}
		<button
			type="button"
			class="bg-muted hover:bg-accent text-foreground inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-colors"
			title={`Filter by ${category.name}`}
			onclick={(e) => {
				e.stopPropagation();
				onFilterCategory(category.id);
			}}
		>
			<span class="size-1.5 shrink-0 rounded-full" style={`background:${category.color}`}></span>
			<span class="truncate">{category.emoji} {category.name}</span>
		</button>
	{:else}
		<span class="text-muted-foreground text-xs">Uncategorized</span>
	{/if}
{/snippet}

{#snippet accountBadge(transaction: Transaction, dest: string | null)}
	{#if dest}
		<span
			class="text-muted-foreground bg-muted/60 inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-xs"
			title={`${transaction.account} → ${dest}`}
		>
			<span class="truncate">{transaction.account} → {dest}</span>
		</span>
	{:else if transaction.account}
		<button
			type="button"
			class="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex max-w-full cursor-pointer items-center rounded-md px-1.5 py-0.5 text-xs transition-colors"
			title={`Filter by ${transaction.account}`}
			onclick={(e) => {
				e.stopPropagation();
				onFilterAccount(transaction.account);
			}}
		>
			<span class="truncate">{transaction.account}</span>
		</button>
	{:else}
		<span class="text-muted-foreground text-xs">—</span>
	{/if}
{/snippet}

{#snippet rowActions(transaction: Transaction)}
	<div class="flex items-center justify-end gap-1">
		<Button
			variant="ghost"
			size="icon-sm"
			class="text-muted-foreground hover:text-foreground size-7 sm:size-8"
			title="Edit transaction"
			aria-label={`Edit ${transaction.description}`}
			onclick={(e) => {
				e.stopPropagation();
				onEdit(transaction);
			}}
		>
			<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
				<path d="M11.5 2.5a1.77 1.77 0 0 1 2.5 2.5L5 14H2v-3l9.5-8.5z" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</Button>
		<Button
			variant="ghost"
			size="icon-sm"
			class="text-muted-foreground hover:text-foreground hidden size-7 sm:inline-flex sm:size-8"
			title="Duplicate transaction"
			aria-label={`Duplicate ${transaction.description}`}
			onclick={(e) => {
				e.stopPropagation();
				onDuplicate(transaction);
			}}
		>
			<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
				<rect x="5" y="5" width="8" height="8" rx="1.5" />
				<path d="M3 11V3a1.5 1.5 0 0 1 1.5-1.5H11" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</Button>
		<Button
			variant="ghost"
			size="icon-sm"
			class="text-muted-foreground hover:bg-rose-50 hover:text-rose-600 size-7 sm:size-8"
			title="Delete transaction"
			aria-label={`Delete ${transaction.description}`}
			onclick={(e) => {
				e.stopPropagation();
				onDelete(transaction);
			}}
		>
			<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
				<path
					d="M2.5 4.5h11M5.5 4.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5M13 4.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-9"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<path d="M6.5 7.5v4M9.5 7.5v4" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</Button>
	</div>
{/snippet}

<div class="border-border bg-card overflow-hidden rounded-xl border shadow-2xs">
	<!-- Quick-sort bar for screens where Category / Account columns are collapsed inline -->
	<div class="border-border bg-muted/30 flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs xl:hidden">
		<span class="text-muted-foreground font-medium">Sort by</span>
		<div class="flex flex-wrap items-center gap-1">
			{#each SORT_COLUMNS as col (col.key)}
				<Button
					variant={sortBy === col.key ? 'secondary' : 'ghost'}
					size="sm"
					class="h-6 px-2 text-xs font-medium"
					onclick={() => onSort(col.key)}
				>
					{col.label}
					{#if sortBy === col.key}
						<span class="text-foreground/70">{sortOrder === 'asc' ? '↑' : '↓'}</span>
					{/if}
				</Button>
			{/each}
		</div>
	</div>

	<Table.Root>
		<Table.Header>
			<Table.Row class="bg-muted/40 hover:bg-muted/40">
				{@render sortHead('date', 'Date', { class: 'w-[76px] sm:w-[96px]' })}
				{@render sortHead('description', 'Description')}
				{@render sortHead('category', 'Category', { class: 'hidden lg:table-cell w-[170px]' })}
				{@render sortHead('account', 'Account', { class: 'hidden xl:table-cell w-[160px]' })}
				{@render sortHead('amount', 'Amount', { align: 'right', class: 'text-right w-[110px] sm:w-[136px]' })}
				<Table.Head class="w-[68px] sm:w-[112px] text-right">
					<span class="sr-only">Actions</span>
				</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each transactions as transaction (transaction.id)}
				{@const dest = getTransferDestination(transaction)}
				<Table.Row
					class="cursor-pointer"
					tabindex={0}
					role="button"
					onclick={() => onEdit(transaction)}
					onkeydown={(e) => {
						if (e.key === 'Enter' && e.target === e.currentTarget) onEdit(transaction);
					}}
				>
					<Table.Cell class="text-muted-foreground text-xs tabular-nums" title={formatDate(transaction.date)}>
						{formatShortDate(transaction.date)}
					</Table.Cell>

					<Table.Cell class="min-w-[140px] max-w-[200px] whitespace-normal sm:max-w-xs lg:max-w-md">
						<div class="min-w-0 space-y-0.5">
							<p class="text-foreground truncate text-sm font-medium">{transaction.description}</p>
							{#if transaction.notes}
								<p class="text-muted-foreground line-clamp-1 text-xs">{transaction.notes}</p>
							{/if}
							<!-- Inline metadata when Category (<lg) or Account (<xl) columns are collapsed -->
							<div class="flex flex-wrap items-center gap-1.5 pt-1 xl:hidden">
								<span class="inline-flex max-w-full lg:hidden">
									{@render categoryBadge(transaction)}
								</span>
								<span class="inline-flex max-w-full">
									{@render accountBadge(transaction, dest)}
								</span>
							</div>
						</div>
					</Table.Cell>

					<Table.Cell class="hidden max-w-[180px] lg:table-cell">
						{@render categoryBadge(transaction)}
					</Table.Cell>

					<Table.Cell class="hidden max-w-[170px] xl:table-cell">
						{@render accountBadge(transaction, dest)}
					</Table.Cell>

					<Table.Cell class={cn('text-right text-sm', amountClass(transaction.type))}>
						{amountPrefix(transaction.type)}{formatMoney(transaction.amount, currency)}
					</Table.Cell>

					<Table.Cell class="text-right">
						{@render rowActions(transaction)}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
