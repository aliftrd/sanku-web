<script lang="ts">
	import type { Category, Transaction } from '#lib/types.ts';
	import { formatDate, formatMoney, formatShortDate, getTransferDestination } from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';
	import * as Select from '#lib/components/ui/select/index.ts';

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

	const SORT_COLUMNS: Array<{ id: SortColumn; label: string }> = [
		{ id: 'date', label: 'Date' },
		{ id: 'description', label: 'Description' },
		{ id: 'category', label: 'Category' },
		{ id: 'account', label: 'Account' },
		{ id: 'amount', label: 'Amount' }
	];

	function amountPillClass(type: Transaction['type']) {
		return cn(
			'font-title text-title-md sm:text-title-lg rounded-full px-3.5 py-1 tabular-nums whitespace-nowrap',
			type === 'income' && 'bg-income text-on-income',
			type === 'expense' && 'bg-coral text-on-coral',
			type === 'transfer' && 'bg-periwinkle text-on-periwinkle'
		);
	}

	function iconBubbleClass(type: Transaction['type'], idx: number) {
		if (type === 'income') return 'bg-income text-on-income';
		if (type === 'transfer') return 'bg-periwinkle text-on-periwinkle';
		const tones = [
			'bg-coral text-on-coral',
			'bg-marigold text-on-marigold',
			'bg-sage-cream text-on-sage-cream',
			'bg-sky-mint text-on-sky-mint'
		];
		return tones[idx % tones.length];
	}

	function iconFor(type: Transaction['type']) {
		if (type === 'income') return 'south_west';
		if (type === 'transfer') return 'swap_horiz';
		return 'receipt_long';
	}

	function amountPrefix(type: Transaction['type']) {
		if (type === 'income') return '+';
		if (type === 'expense') return '-';
		return '⇄ ';
	}
</script>

<div class="bg-surface-card border-outline-variant gap-gutter-md flex flex-col rounded-xl border p-4 sm:p-6">
	<!-- Editorial Sort Strip -->
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sort transactions">
			<span class="font-label text-label-sm text-on-surface-variant mr-1 uppercase">Sort:</span>
			{#each SORT_COLUMNS as col (col.id)}
				{@const active = sortBy === col.id}
				<button
					type="button"
					onclick={() => onSort(col.id)}
					aria-pressed={active}
					class={cn(
						'font-label text-label-sm inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 transition-colors duration-state-change',
						active
							? 'bg-pill-white text-on-pill-white'
							: 'bg-surface-container text-on-surface-variant hover:text-on-surface'
					)}
				>
					<span>{col.label}</span>
					{#if active}
						<span class="material-symbols-outlined text-[14px]" aria-hidden="true">
							{sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
						</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>

	<!-- Editorial Bento Transaction Rows -->
	<div class="gap-gutter-sm flex flex-col">
		{#each transactions as transaction, idx (transaction.id)}
			{@const category = categoryFor(transaction)}
			{@const dest = getTransferDestination(transaction)}
			<div
				class="bg-surface-container hover:bg-surface-container/80 gap-gutter-sm sm:gap-gutter-md flex flex-wrap items-center justify-between rounded-lg p-3.5 sm:p-4 transition-colors duration-state-change cursor-pointer"
				role="button"
				tabindex={0}
				onclick={() => onEdit(transaction)}
				onkeydown={(e) => {
					if (e.key === 'Enter' && e.target === e.currentTarget) onEdit(transaction);
				}}
			>
				<div class="gap-gutter-md flex min-w-0 flex-1 items-center">
					<span
						class={cn(
							'flex size-11 shrink-0 items-center justify-center rounded-full',
							iconBubbleClass(transaction.type, idx)
						)}
						aria-hidden="true"
					>
						{#if category?.emoji && transaction.type !== 'transfer'}
							<span class="text-lg leading-none">{category.emoji}</span>
						{:else}
							<span class="material-symbols-outlined text-[20px]">{iconFor(transaction.type)}</span>
						{/if}
					</span>

					<div class="min-w-0 flex-1">
						<div class="font-title text-title-md text-on-surface truncate">
							{transaction.description}
						</div>
						{#if transaction.notes}
							<p class="font-body text-body-sm text-on-surface-variant line-clamp-1 mt-0.5">
								{transaction.notes}
							</p>
						{/if}

						<div class="gap-gutter-xs mt-1.5 flex flex-wrap items-center">
							{#if transaction.type === 'transfer'}
								<span class="bg-periwinkle text-on-periwinkle font-label text-label-sm rounded-full px-2.5 py-0.5">
									⇄ Transfer
								</span>
							{:else if category}
								<button
									type="button"
									class="bg-marigold text-on-marigold font-label text-label-sm cursor-pointer rounded-full px-2.5 py-0.5 transition-opacity hover:opacity-90"
									title={`Filter by ${category.name}`}
									onclick={(e) => {
										e.stopPropagation();
										onFilterCategory(category.id);
									}}
								>
									{category.name}
								</button>
							{:else}
								<span class="bg-surface-card text-on-surface-variant font-label text-label-sm rounded-full px-2.5 py-0.5">
									Uncategorized
								</span>
							{/if}

							{#if dest}
								<span class="bg-sky-mint text-on-sky-mint font-label text-label-sm rounded-full px-2.5 py-0.5">
									{transaction.account} → {dest}
								</span>
							{:else if transaction.account}
								<button
									type="button"
									class="bg-sky-mint text-on-sky-mint font-label text-label-sm cursor-pointer rounded-full px-2.5 py-0.5 transition-opacity hover:opacity-90"
									title={`Filter by ${transaction.account}`}
									onclick={(e) => {
										e.stopPropagation();
										onFilterAccount(transaction.account);
									}}
								>
									{transaction.account}
								</button>
							{/if}

							<span
								class="font-mono text-on-surface-variant text-[12px] tabular-nums"
								title={formatDate(transaction.date)}
							>
								{formatShortDate(transaction.date)}
							</span>
						</div>
					</div>
				</div>

				<div class="gap-gutter-sm flex shrink-0 items-center">
					<div class="flex flex-col items-end gap-1">
						<span class={amountPillClass(transaction.type)}>
							{amountPrefix(transaction.type)}{formatMoney(transaction.amount, currency)}
						</span>
						{#if transaction.currency && transaction.currency !== currency && transaction.originalAmount}
							<span
								class="bg-ink text-on-surface border-outline-variant font-mono rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums"
								title={transaction.exchangeRate ? `1 ${transaction.currency} = ${transaction.exchangeRate} ${currency}` : undefined}
							>
								{formatMoney(transaction.originalAmount, transaction.currency)}{transaction.exchangeRate
									? ` · @${transaction.exchangeRate}`
									: ''}
							</span>
						{/if}
					</div>

					<div class="flex items-center gap-1">
						<button
							type="button"
							title="Duplicate"
							aria-label={`Duplicate ${transaction.description}`}
							onclick={(e) => {
								e.stopPropagation();
								onDuplicate(transaction);
							}}
							class="bg-surface-card text-on-surface-variant hover:bg-pill-white hover:text-on-pill-white hidden size-8 cursor-pointer items-center justify-center rounded-full transition-colors sm:inline-flex"
						>
							<span class="material-symbols-outlined text-[15px]" aria-hidden="true">content_copy</span>
						</button>
						<button
							type="button"
							title="Delete"
							aria-label={`Delete ${transaction.description}`}
							onclick={(e) => {
								e.stopPropagation();
								onDelete(transaction);
							}}
							class="bg-surface-card text-on-surface-variant hover:bg-coral hover:text-on-coral inline-flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors"
						>
							<span class="material-symbols-outlined text-[15px]" aria-hidden="true">delete</span>
						</button>
						<button
							type="button"
							title="Edit"
							aria-label={`Edit ${transaction.description}`}
							onclick={(e) => {
								e.stopPropagation();
								onEdit(transaction);
							}}
							class="bg-pill-white text-on-pill-white inline-flex size-9 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-105"
						>
							<span class="material-symbols-outlined text-[16px]" aria-hidden="true">north_east</span>
						</button>
					</div>
				</div>
			</div>
		{/each}
	</div>

	{#if onPageChange && onPageSizeChange && totalItems > 0}
		<div class="border-outline-variant flex flex-wrap items-center justify-between gap-3 border-t pt-4">
			<div class="flex items-center gap-2">
				<label for="rows-per-page" class="font-body text-body-sm text-on-surface-variant">
					Rows per page:
				</label>
				<Select.Root
					type="single"
					value={String(pageSize)}
					onValueChange={(v) => onPageSizeChange(Number(v))}
				>
					<Select.Trigger id="rows-per-page" size="sm" class="h-8 w-auto min-w-[74px] px-3 py-1">
						{pageSize === 0 ? 'All' : pageSize}
					</Select.Trigger>
					<Select.Content align="start" class="min-w-[90px]">
						<Select.Item value="15" label="15">15</Select.Item>
						<Select.Item value="25" label="25">25</Select.Item>
						<Select.Item value="50" label="50">50</Select.Item>
						<Select.Item value="100" label="100">100</Select.Item>
						<Select.Item value="0" label="All">All</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>

			<div class="flex items-center gap-1.5">
				<button
					type="button"
					disabled={page <= 1}
					onclick={() => onPageChange(page - 1)}
					class={cn(
						'font-label text-label-sm rounded-full px-3.5 py-1.5 transition-colors',
						page <= 1
							? 'bg-surface-container text-on-surface-variant cursor-not-allowed opacity-50'
							: 'bg-surface-container text-on-surface hover:bg-pill-white hover:text-on-pill-white cursor-pointer'
					)}
				>
					Previous
				</button>
				<span class="bg-pill-white text-on-pill-white font-mono text-mono-sm inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2.5 tabular-nums">
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
						'font-label text-label-sm rounded-full px-3.5 py-1.5 transition-colors',
						page >= totalPages
							? 'bg-surface-container text-on-surface-variant cursor-not-allowed opacity-50'
							: 'bg-surface-container text-on-surface hover:bg-pill-white hover:text-on-pill-white cursor-pointer'
					)}
				>
					Next
				</button>
			</div>
		</div>
	{/if}
</div>
