<script lang="ts">
	import type { CategorySpend } from '#lib/types.ts';
	import { formatMoney, groupCategorySpending } from '#lib/finance.ts';

	let { items, currency }: { items: CategorySpend[]; currency: string } = $props();

	const RADIUS = 54;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

	let slices = $derived(groupCategorySpending(items));
	let total = $derived(slices.reduce((sum, item) => sum + item.amount, 0));

	let segments = $derived.by(() => {
		let offset = 0;

		return slices.map((item) => {
			const length = total > 0 ? (item.amount / total) * CIRCUMFERENCE : 0;
			const segment = {
				...item,
				dash: `${length} ${CIRCUMFERENCE - length}`,
				offset: -offset
			};
			offset += length;
			return segment;
		});
	});
</script>

{#if items.length === 0}
	<div class="panel-empty">
		<div class="panel-empty-icon">◎</div>
		<p>No expenses in this month yet.</p>
		<span>Add an expense to see where your money goes.</span>
	</div>
{:else}
	<div class="donut-layout">
		<div class="donut-wrap">
			<svg viewBox="0 0 140 140" role="img" aria-label="Expenses by category">
				<circle cx="70" cy="70" r={RADIUS} fill="none" stroke="var(--bg-subtle, #f4f4f5)" stroke-width="16" />
				{#each segments as segment (segment.category.id)}
					<circle
						cx="70"
						cy="70"
						r={RADIUS}
						fill="none"
						stroke={segment.category.color}
						stroke-width="18"
						stroke-dasharray={segment.dash}
						stroke-dashoffset={segment.offset}
						transform="rotate(-90 70 70)"
					/>
				{/each}
			</svg>
			<div class="donut-center">
				<span>Spent</span>
				<strong>{formatMoney(total, currency)}</strong>
			</div>
		</div>

		<ul class="donut-legend">
			{#each segments as segment (segment.category.id)}
				<li>
					<i class="legend-swatch" style={`background:${segment.category.color}`}></i>
					<span class="legend-name">
						{segment.category.emoji}
						{segment.category.name}
					</span>
					<span class="legend-percent">{Math.round(segment.percent)}%</span>
					<span class="legend-amount">{formatMoney(segment.amount, currency)}</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}
