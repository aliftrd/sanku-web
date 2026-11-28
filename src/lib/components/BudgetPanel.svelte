<script lang="ts">
	import type { BudgetProgress } from '#lib/types.ts';
	import { formatMoney } from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';

	let {
		budgets,
		currency,
		onmanage
	}: {
		budgets: BudgetProgress[];
		currency: string;
		onmanage: () => void;
	} = $props();

	let totalBudget = $derived(budgets.reduce((sum, budget) => sum + budget.budget, 0));
	let totalSpent = $derived(budgets.reduce((sum, budget) => sum + budget.spent, 0));
	let overallPercent = $derived(totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0);

	let primaryBudget = $derived(budgets[0] ?? null);
	let secondaryBudget = $derived(budgets[1] ?? null);
	let extraBudgets = $derived(budgets.slice(1, 4));
</script>

<!-- Stacked Folder-Tab Budgets Card (Stitch Editorial Pop Signature Motif) -->
<article class="flex h-full flex-col">
	<!-- Top Folder Tab (Coral) -->
	<div class="bg-coral text-on-coral font-label text-label-md sm:font-headline sm:text-headline-md -mb-3 rounded-t-xl px-5 pt-3 pb-5 uppercase">
		MONTHLY BUDGETS · {overallPercent}% USED
	</div>

	<!-- Middle Folder Tab (Charcoal) -->
	<div class="bg-surface-card text-on-surface border-outline-variant -mb-3 flex items-center justify-between gap-2 rounded-t-xl border-t px-5 pt-3 pb-5">
		{#if secondaryBudget}
			<span class="font-label text-label-sm text-on-surface-variant truncate uppercase">
				{secondaryBudget.category.emoji} {secondaryBudget.category.name} · {formatMoney(secondaryBudget.budget, currency)}
			</span>
			<span
				class={cn(
					'font-mono text-mono-sm shrink-0',
					secondaryBudget.percent > 95 ? 'text-coral' : 'text-income'
				)}
			>
				{Math.max(0, 100 - Math.round(secondaryBudget.percent))}% sisa
			</span>
		{:else}
			<span class="font-label text-label-sm text-on-surface-variant uppercase">
				{budgets.length > 0 ? `${budgets.length} KATEGORI AKTIF` : 'BELUM ADA LIMIT'}
			</span>
			<span class="font-mono text-mono-sm text-income">
				{formatMoney(Math.max(0, totalBudget - totalSpent), currency)} sisa
			</span>
		{/if}
	</div>

	<!-- Main Front Card (Marigold) -->
	<div class="bg-marigold text-on-marigold gap-gutter-md flex flex-1 flex-col justify-between rounded-xl p-6">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<span class="font-label text-label-sm block uppercase">
					{primaryBudget ? 'PRIMARY LIMIT' : 'BUDGET TRACKER'}
				</span>
				<h2 class="font-headline text-headline-lg mt-1 truncate uppercase">
					{#if primaryBudget}
						{primaryBudget.category.emoji} {primaryBudget.category.name}
					{:else}
						ATUR BATAS ANGGARAN
					{/if}
				</h2>
			</div>
			<button
				type="button"
				onclick={onmanage}
				aria-label="Atur Budget"
				class="bg-ink text-on-surface flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-105"
			>
				<span class="material-symbols-outlined text-[18px]" aria-hidden="true">north_east</span>
			</button>
		</div>

		{#if primaryBudget}
			{@const primaryClamped = Math.min(100, Math.max(0, primaryBudget.percent))}
			<div class="space-y-3">
				<div class="font-display text-headline-lg sm:text-display-md tabular-nums">
					{formatMoney(primaryBudget.budget, currency)}
				</div>

				<div
					class="bg-ink/15 h-2.5 w-full overflow-hidden rounded-full"
					role="progressbar"
					aria-valuenow={Math.round(primaryClamped)}
					aria-valuemin={0}
					aria-valuemax={100}
				>
					<div
						class={cn(
							'h-full rounded-full transition-all duration-300',
							primaryBudget.percent > 95 ? 'bg-coral' : 'bg-ink'
						)}
						style={`width: ${primaryClamped}%`}
					></div>
				</div>

				{#if extraBudgets.length > 0}
					<div class="space-y-1.5 pt-1">
						{#each extraBudgets as item (item.category.id)}
							<div class="bg-ink/10 flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-xs">
								<span class="font-title truncate font-bold">
									{item.category.emoji} {item.category.name}
								</span>
								<span class="font-mono shrink-0 tabular-nums">
									{Math.round(item.percent)}% · {formatMoney(item.spent, currency)}
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="border-ink/15 font-label text-label-sm flex items-center justify-between border-t pt-2.5 tabular-nums">
				<span>Terpakai: {formatMoney(totalSpent, currency)}</span>
				<span>Total Limit: {formatMoney(totalBudget, currency)}</span>
			</div>
		{:else}
			<div class="space-y-3">
				<p class="font-body text-body-md text-ink/80">
					Tetapkan batas anggaran bulanan tiap kategori untuk memantau pemakaian secara real-time.
				</p>
				<button
					type="button"
					onclick={onmanage}
					class="bg-ink text-on-surface font-label text-label-lg inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 transition-opacity hover:opacity-90"
				>
					<span>Set Up Budgets</span>
					<span class="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_forward</span>
				</button>
			</div>
		{/if}
	</div>
</article>
