<script lang="ts">
	import type { Category, Transaction } from '#lib/types.ts';
	import { formatDate, formatMoney, formatShortDate, getTransferDestination } from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';

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
		onFilterAccount,
		page = 1,
		totalPages = 1,
		pageSize = 25,
		totalItems = 0,
		onPageChange,
		onPageSizeChange
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
		page?: number;
		totalPages?: number;
		pageSize?: number;
		totalItems?: number;
		onPageChange?: (nextPage: number) => void;
		onPageSizeChange?: (nextSize: number) => void;
	} = $props();

	function amountClass(type: Transaction['type']) {
		return cn(
			'font-label text-label-lg tabular-nums',
			type === 'income' && 'text-on-income-container',
			type === 'expense' && 'text-on-expense-container',
			type === 'transfer' && 'text-theme-sky'
		);
	}

	function amountPrefix(type: Transaction['type']) {
		if (type === 'income') return '+';
		if (type === 'expense') return '-';
		return '⇄ ';
	}
</script>

{#snippet sortHead(
	column: SortColumn,
	label: string,
	options?: { align?: 'left' | 'right'; class?: string }
)}
	<th
		scope="col"
		aria-sort={sortBy === column ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
		class={cn(
			'font-label text-label-sm text-on-surface-variant px-gutter-md py-3 tracking-wider uppercase',
			options?.align === 'right' && 'text-right',
			options?.class
		)}
	>
		<button
			type="button"
			onclick={() => onSort(column)}
			class={cn(
				'hover:text-on-surface inline-flex cursor-pointer items-center gap-1 uppercase transition-colors duration-state-change',
				options?.align === 'right' && 'ml-auto'
			)}
		>
			<span>{label}</span>
			{#if sortBy === column}
				<span class="material-symbols-outlined text-[15px]" aria-hidden="true">
					{sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
				</span>
			{/if}
		</button>
	</th>
{/snippet}

{#snippet categoryBadge(transaction: Transaction)}
	{@const category = categoryFor(transaction)}
	{#if transaction.type === 'transfer'}
		<span class="bg-secondary-container text-on-secondary-container font-label text-label-sm inline-flex items-center gap-1 rounded-full px-2.5 py-0.5">
			⇄ Transfer
		</span>
	{:else if category}
		<button
			type="button"
			class="bg-primary-container text-on-primary-container font-label text-label-sm inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full px-2.5 py-0.5 transition-opacity hover:opacity-90"
			title={`Filter by ${category.name}`}
			onclick={(e) => {
				e.stopPropagation();
				onFilterCategory(category.id);
			}}
		>
			<span class="truncate">{category.emoji} {category.name}</span>
		</button>
	{:else}
		<span class="bg-surface-container-low text-on-surface-variant font-label text-label-sm inline-flex items-center rounded-full px-2.5 py-0.5">
			Uncategorized
		</span>
	{/if}
{/snippet}

{#snippet accountBadge(transaction: Transaction, dest: string | null)}
	{#if dest}
		<span
			class="font-body text-body-md text-on-surface-variant inline-flex max-w-full items-center gap-1"
			title={`${transaction.account} → ${dest}`}
		>
			<span class="truncate">{transaction.account} → {dest}</span>
		</span>
	{:else if transaction.account}
		<button
			type="button"
			class="font-body text-body-md text-on-surface-variant hover:text-on-surface inline-flex max-w-full cursor-pointer items-center transition-colors"
			title={`Filter by ${transaction.account}`}
			onclick={(e) => {
				e.stopPropagation();
				onFilterAccount(transaction.account);
			}}
		>
			<span class="truncate">{transaction.account}</span>
		</button>
	{:else}
		<span class="font-body text-body-sm text-on-surface-variant">—</span>
	{/if}
{/snippet}

<div class="bg-surface-card border-outline overflow-hidden rounded-md border">
	<div class="overflow-x-auto">
		<table class="w-full border-collapse text-left">
			<thead>
				<tr class="border-outline bg-surface-container-high border-b">
					{@render sortHead('date', 'Date', { class: 'w-[96px]' })}
					{@render sortHead('description', 'Description')}
					{@render sortHead('category', 'Category', { class: 'hidden md:table-cell w-[180px]' })}
					{@render sortHead('account', 'Account', { class: 'hidden lg:table-cell w-[170px]' })}
					{@render sortHead('amount', 'Amount', { align: 'right', class: 'w-[140px]' })}
					<th scope="col" class="font-label text-label-sm text-on-surface-variant w-[116px] px-gutter-md py-3 text-right tracking-wider uppercase">
						Actions
					</th>
				</tr>
			</thead>
			<tbody class="divide-outline divide-y">
				{#each transactions as transaction (transaction.id)}
					{@const dest = getTransferDestination(transaction)}
					<tr
						class="group hover:bg-surface-container-low/60 cursor-pointer transition-colors duration-state-change"
						tabindex={0}
						onclick={() => onEdit(transaction)}
						onkeydown={(e) => {
							if (e.key === 'Enter' && e.target === e.currentTarget) onEdit(transaction);
						}}
					>
						<td class="px-gutter-md py-3.5 whitespace-nowrap" title={formatDate(transaction.date)}>
							<span class="font-body text-body-sm text-on-surface-variant tabular-nums">
								{formatShortDate(transaction.date)}
							</span>
						</td>

						<td class="max-w-[220px] px-gutter-md py-3.5 sm:max-w-xs lg:max-w-md">
							<div class="min-w-0">
								<p class="font-title text-title-md text-on-surface truncate">
									{transaction.description}
								</p>
								{#if transaction.notes}
									<p class="font-body text-body-sm text-on-surface-variant line-clamp-1">
										{transaction.notes}
									</p>
								{/if}
								<div class="mt-1 flex flex-wrap items-center gap-1.5 lg:hidden">
									<span class="md:hidden">
										{@render categoryBadge(transaction)}
									</span>
									<span class="text-on-surface-variant text-xs">
										{@render accountBadge(transaction, dest)}
									</span>
								</div>
							</div>
						</td>

						<td class="hidden px-gutter-md py-3.5 whitespace-nowrap md:table-cell">
							{@render categoryBadge(transaction)}
						</td>

						<td class="hidden px-gutter-md py-3.5 whitespace-nowrap lg:table-cell">
							{@render accountBadge(transaction, dest)}
						</td>

						<td class="px-gutter-md py-3.5 text-right whitespace-nowrap">
							<span class={amountClass(transaction.type)}>
								{amountPrefix(transaction.type)}{formatMoney(transaction.amount, currency)}
							</span>
						</td>

						<td class="px-gutter-md py-3.5 text-right whitespace-nowrap">
							<div class="inline-flex items-center gap-0.5">
								<button
									type="button"
									title="Edit"
									aria-label={`Edit ${transaction.description}`}
									onclick={(e) => {
										e.stopPropagation();
										onEdit(transaction);
									}}
									class="text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface cursor-pointer rounded p-1.5 transition-colors"
								>
									<span class="material-symbols-outlined text-[17px]" aria-hidden="true">edit</span>
								</button>
								<button
									type="button"
									title="Duplicate"
									aria-label={`Duplicate ${transaction.description}`}
									onclick={(e) => {
										e.stopPropagation();
										onDuplicate(transaction);
									}}
									class="text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface hidden cursor-pointer rounded p-1.5 transition-colors sm:inline-flex"
								>
									<span class="material-symbols-outlined text-[17px]" aria-hidden="true">
										content_copy
									</span>
								</button>
								<button
									type="button"
									title="Delete"
									aria-label={`Delete ${transaction.description}`}
									onclick={(e) => {
										e.stopPropagation();
										onDelete(transaction);
									}}
									class="text-on-surface-variant hover:bg-expense-container hover:text-on-expense-container cursor-pointer rounded p-1.5 transition-colors"
								>
									<span class="material-symbols-outlined text-[17px]" aria-hidden="true">delete</span>
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if onPageChange && onPageSizeChange && totalItems > 0}
		<div class="border-outline bg-surface-container-high flex flex-wrap items-center justify-between gap-gutter-sm border-t px-gutter-md py-3">
			<div class="flex items-center gap-2">
				<label for="rows-per-page" class="font-body text-body-sm text-on-surface-variant">
					Rows per page:
				</label>
				<select
					id="rows-per-page"
					value={pageSize}
					onchange={(e) => onPageSizeChange(Number((e.target as HTMLSelectElement).value))}
					class="border-outline bg-surface-card font-label text-label-sm text-on-surface rounded border px-2 py-1 outline-none focus:border-primary"
				>
					<option value={15}>15</option>
					<option value={25}>25</option>
					<option value={50}>50</option>
					<option value={100}>100</option>
					<option value={0}>All</option>
				</select>
			</div>

			<div class="flex items-center gap-1.5">
				<button
					type="button"
					disabled={page <= 1}
					onclick={() => onPageChange(page - 1)}
					class={cn(
						'border-outline font-label text-label-sm rounded border px-2.5 py-1 transition-colors',
						page <= 1
							? 'bg-surface-container-low text-on-surface-variant cursor-not-allowed opacity-60'
							: 'bg-surface-card text-on-surface hover:bg-surface-container-low cursor-pointer'
					)}
				>
					Previous
				</button>
				<span class="bg-primary text-on-primary font-label text-label-sm inline-flex h-7 min-w-7 items-center justify-center rounded px-2 tabular-nums">
					{page}
				</span>
				{#if totalPages > 1}
					<span class="font-body text-body-sm text-on-surface-variant px-1 tabular-nums">
						of {totalPages}
					</span>
				{/if}
				<button
					type="button"
					disabled={page >= totalPages}
					onclick={() => onPageChange(page + 1)}
					class={cn(
						'border-outline font-label text-label-sm rounded border px-2.5 py-1 transition-colors',
						page >= totalPages
							? 'bg-surface-container-low text-on-surface-variant cursor-not-allowed opacity-60'
							: 'bg-surface-card text-on-surface hover:bg-surface-container-low cursor-pointer'
					)}
				>
					Next
				</button>
			</div>
		</div>
	{/if}
</div>
