<script lang="ts">
	import type { BudgetProgress } from '#lib/types.ts';
	import { formatMoney } from '#lib/finance.ts';

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
	let overallPercent = $derived(totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0);
</script>

<div class="budget-panel">
	{#if budgets.length === 0}
		<div class="panel-empty">
			<div class="panel-empty-icon">◐</div>
			<p>No budgets set for this month.</p>
			<span>Give a category a monthly budget to track how much is left.</span>
			<button type="button" class="text-button" onclick={onmanage}>Set up budgets</button>
		</div>
	{:else}
		<div class="budget-overview">
			<div>
				<span>Overall budget</span>
				<strong>{formatMoney(totalSpent, currency)}</strong>
				<em>of {formatMoney(totalBudget, currency)}</em>
			</div>
			<span class="budget-percent" class:over={overallPercent > 100}>
				{Math.round(overallPercent)}%
			</span>
		</div>

		<ul class="budget-list">
			{#each budgets as budget (budget.category.id)}
				{@const percent = Math.min(100, Math.max(0, budget.percent))}
				{@const over = budget.remaining < 0}
				<li class="budget-item" class:over>
					<div class="budget-top">
						<span class="budget-name">
							<i style={`background:${budget.category.color}`}></i>
							{budget.category.emoji}
							{budget.category.name}
						</span>
						<span class="budget-numbers">
							{formatMoney(budget.spent, currency)}
							<em>/ {formatMoney(budget.budget, currency)}</em>
						</span>
					</div>
					<div class="budget-track" aria-hidden="true">
						<span
							class="budget-fill"
							class:warning={budget.percent >= 75 && !over}
							style={`width:${percent}%; background:${over ? 'var(--danger, #f43f5e)' : budget.category.color}`}
						></span>
					</div>
					<div class="budget-foot">
						<span>
							{over
								? `${formatMoney(Math.abs(budget.remaining), currency)} over`
								: `${formatMoney(budget.remaining, currency)} left`}
						</span>
						<span>{Math.round(budget.percent)}% used</span>
					</div>
				</li>
			{/each}
		</ul>

		<button type="button" class="text-button" onclick={onmanage}>Edit budgets</button>
	{/if}
</div>
