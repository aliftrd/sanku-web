<script lang="ts">
	import type { CategorySpend } from '#lib/types.ts';
	import { formatMoney, groupCategorySpending } from '#lib/finance.ts';

	let {
		items,
		currency,
		monthLabel = ''
	}: {
		items: CategorySpend[];
		currency: string;
		monthLabel?: string;
	} = $props();

	const RADIUS = 60;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

	let slices = $derived(groupCategorySpending(items));
	let total = $derived(slices.reduce((sum, item) => sum + item.amount, 0));

	let segments = $derived.by(() => {
		let offset = 0;

		return slices.map((item) => {
			const length = total > 0 ? (item.amount / total) * CIRCUMFERENCE : 0;
			const segment = {
				...item,
				dash: `${length} ${Math.max(0, CIRCUMFERENCE - length)}`,
				offset: -offset
			};
			offset += length;
			return segment;
		});
	});
</script>

<article class="bg-surface-card border-outline flex h-full flex-col justify-between gap-gutter-md rounded-md border p-gutter-md">
	<header class="flex items-center justify-between gap-2">
		<div>
			<h2 class="font-title text-title-lg text-on-surface">Expense Distribution</h2>
			<p class="font-body text-body-sm text-on-surface-variant">Share by category</p>
		</div>
		{#if monthLabel}
			<span class="font-label text-label-sm text-on-surface-variant">{monthLabel}</span>
		{/if}
	</header>

	{#if items.length === 0}
		<div class="border-outline bg-surface-container-high flex flex-1 flex-col items-center justify-center gap-1.5 rounded border border-dashed px-4 py-8 text-center">
			<span class="material-symbols-outlined text-on-surface-variant text-[24px]" aria-hidden="true">
				donut_large
			</span>
			<p class="font-title text-title-md text-on-surface">No expenses yet</p>
			<span class="font-body text-body-sm text-on-surface-variant max-w-xs">
				Add an expense entry to visualize your category breakdown.
			</span>
		</div>
	{:else}
		<div class="flex flex-row items-center justify-between gap-4 py-1 sm:flex-col sm:justify-center sm:py-2">
			<div class="relative flex size-28 shrink-0 items-center justify-center sm:size-44">
				<svg viewBox="0 0 160 160" class="size-full -rotate-90" role="img" aria-label="Expenses by category">
					<circle cx="80" cy="80" r={RADIUS} fill="none" stroke="#F1F5F9" stroke-width="18" />
					{#each segments as segment (segment.category.id)}
						<circle
							cx="80"
							cy="80"
							r={RADIUS}
							fill="none"
							stroke={segment.category.color}
							stroke-width="18"
							stroke-dasharray={segment.dash}
							stroke-dashoffset={segment.offset}
							stroke-linecap={segments.length === 1 ? 'round' : 'butt'}
						/>
					{/each}
				</svg>
				<div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
					<span class="font-body text-body-sm text-on-surface-variant">Spent</span>
					<span class="font-headline text-label-md text-on-surface sm:text-headline-md truncate max-w-full tabular-nums">
						{formatMoney(total, currency)}
					</span>
				</div>
			</div>

			<div class="border-outline flex flex-1 flex-col gap-gutter-xs sm:w-full sm:border-t sm:pt-gutter-sm">
				{#each segments as segment (segment.category.id)}
					<div class="flex items-center justify-between gap-2 py-1">
						<span class="font-body text-body-sm text-on-surface sm:text-body-md inline-flex min-w-0 items-center gap-2">
							<span
								class="size-2.5 shrink-0 rounded-full"
								style={`background:${segment.category.color}`}
								aria-hidden="true"
							></span>
							<span class="truncate">{segment.category.emoji} {segment.category.name}</span>
						</span>
						<span class="font-label text-label-sm text-on-surface sm:text-label-md shrink-0 tabular-nums">
							{Math.round(segment.percent)}% · {formatMoney(segment.amount, currency)}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</article>
