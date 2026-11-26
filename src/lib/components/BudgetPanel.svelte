<script lang="ts">
	import type { BudgetProgress } from '#lib/types.ts';
	import { formatMoney } from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import { Progress } from '#lib/components/ui/progress/index.ts';

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

<div class="flex flex-col gap-3">
	{#if budgets.length === 0}
		<div class="border-border flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center">
			<div class="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-full text-base">
				◐
			</div>
			<p class="text-xs font-semibold sm:text-sm">No budgets set for this month.</p>
			<span class="text-muted-foreground max-w-xs text-xs">
				Give a category a monthly budget to track how much is left.
			</span>
			<Button variant="outline" size="sm" class="mt-1.5" onclick={onmanage}>
				Set up budgets
			</Button>
		</div>
	{:else}
		<div class="border-border bg-muted/40 flex items-center justify-between gap-3 rounded-lg border p-2.5">
			<div class="space-y-0.5">
				<span class="text-muted-foreground block text-[11px]">Overall budget</span>
				<div class="flex flex-wrap items-baseline gap-1.5">
					<strong class="text-sm font-bold tabular-nums">{formatMoney(totalSpent, currency)}</strong>
					<em class="text-muted-foreground text-xs not-italic">of {formatMoney(totalBudget, currency)}</em>
				</div>
			</div>
			<Badge variant={overallPercent > 100 ? 'destructive' : 'secondary'} class="tabular-nums">
				{Math.round(overallPercent)}%
			</Badge>
		</div>

		<ul class="space-y-2.5">
			{#each budgets as budget (budget.category.id)}
				{@const percent = Math.min(100, Math.max(0, budget.percent))}
				{@const over = budget.remaining < 0}
				<li class="space-y-1">
					<div class="flex items-center justify-between gap-2 text-xs">
						<span class="flex min-w-0 items-center gap-2 font-medium">
							<span class="size-2 shrink-0 rounded-full" style={`background:${budget.category.color}`}></span>
							<span class="truncate">{budget.category.emoji} {budget.category.name}</span>
						</span>
						<span class="shrink-0 font-semibold tabular-nums">
							{formatMoney(budget.spent, currency)}
							<em class="text-muted-foreground font-normal not-italic">/ {formatMoney(budget.budget, currency)}</em>
						</span>
					</div>

					<Progress
						value={percent}
						max={100}
						class="h-1.5"
						indicatorStyle={`background:${over ? '#f43f5e' : budget.category.color}`}
					/>

					<div class="text-muted-foreground flex items-center justify-between text-[11px] tabular-nums">
						<span class={cn(over && 'font-semibold text-rose-600')}>
							{over
								? `${formatMoney(Math.abs(budget.remaining), currency)} over`
								: `${formatMoney(budget.remaining, currency)} left`}
						</span>
						<span>{Math.round(budget.percent)}% used</span>
					</div>
				</li>
			{/each}
		</ul>

		<div>
			<Button variant="link" size="sm" class="h-auto p-0 text-xs" onclick={onmanage}>
				Edit budgets →
			</Button>
		</div>
	{/if}
</div>
