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

	function barColorClass(percent: number): string {
		if (percent > 95) return 'bg-expense';
		if (percent >= 75) return 'bg-warning';
		return 'bg-income';
	}
</script>

<article class="bg-surface-card border-outline flex h-full flex-col justify-between gap-gutter-md rounded-md border p-gutter-md">
	<header class="flex items-center justify-between gap-gutter-sm">
		<div>
			<h2 class="font-title text-title-lg text-on-surface">Monthly Budgets</h2>
			<p class="font-body text-body-sm text-on-surface-variant tabular-nums">
				{#if budgets.length > 0}
					{formatMoney(totalSpent, currency)} of {formatMoney(totalBudget, currency)} ({overallPercent}%)
				{:else}
					Track monthly spending caps per category
				{/if}
			</p>
		</div>
		<button
			type="button"
			onclick={onmanage}
			class="bg-surface-card border-outline font-label text-label-md text-on-surface hover:bg-surface-container-low cursor-pointer rounded border px-3 py-1.5 transition-colors duration-state-change"
		>
			Edit Limits
		</button>
	</header>

	{#if budgets.length === 0}
		<div class="border-outline bg-surface-container-high flex flex-1 flex-col items-center justify-center gap-1.5 rounded border border-dashed px-4 py-8 text-center">
			<span class="material-symbols-outlined text-on-surface-variant text-[24px]" aria-hidden="true">
				pie_chart
			</span>
			<p class="font-title text-title-md text-on-surface">No budgets set for this month</p>
			<span class="font-body text-body-sm text-on-surface-variant max-w-xs">
				Give an expense category a monthly limit to track utilization in real time.
			</span>
			<button
				type="button"
				onclick={onmanage}
				class="bg-surface-card border-outline font-label text-label-sm text-primary hover:bg-primary-container/40 mt-2 cursor-pointer rounded border px-3 py-1.5 transition-colors"
			>
				Set Up Budgets
			</button>
		</div>
	{:else}
		<div class="flex flex-1 flex-col gap-gutter-sm">
			{#each budgets as budget (budget.category.id)}
				{@const clamped = Math.min(100, Math.max(0, budget.percent))}
				{@const over = budget.remaining < 0}
				<div class="bg-surface-container-high border-outline flex flex-col gap-2 rounded border p-3">
					<div class="flex items-center justify-between gap-2">
						<span class="font-title text-title-md text-on-surface truncate">
							{budget.category.emoji} {budget.category.name}
						</span>
						<span class="font-label text-label-md text-on-surface shrink-0 tabular-nums">
							{formatMoney(budget.spent, currency)} / {formatMoney(budget.budget, currency)}
						</span>
					</div>

					<div
						class="bg-surface-container-low h-2 w-full overflow-hidden rounded-full"
						role="progressbar"
						aria-valuenow={Math.round(clamped)}
						aria-valuemin={0}
						aria-valuemax={100}
					>
						<div
							class={cn('h-full rounded-full transition-all duration-300', barColorClass(budget.percent))}
							style={`width: ${clamped}%`}
						></div>
					</div>

					<div class="flex items-center justify-between gap-2 tabular-nums">
						<span class="font-body text-body-sm text-on-surface-variant">
							{Math.round(budget.percent)}% used
						</span>
						<span
							class={cn(
								'font-body text-body-sm font-medium',
								over ? 'text-on-expense-container' : 'text-on-income-container'
							)}
						>
							{over
								? `${formatMoney(Math.abs(budget.remaining), currency)} over`
								: `${formatMoney(budget.remaining, currency)} left`}
						</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</article>
