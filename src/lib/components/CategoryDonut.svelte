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
	<div class="border-border flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center">
		<div class="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-full text-base">
			◎
		</div>
		<p class="text-xs font-semibold sm:text-sm">No expenses in this month yet.</p>
		<span class="text-muted-foreground max-w-xs text-xs">
			Add an expense to see where your money goes.
		</span>
	</div>
{:else}
	<div class="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
		<div class="relative size-28 shrink-0 sm:size-32">
			<svg viewBox="0 0 140 140" class="size-full" role="img" aria-label="Expenses by category">
				<circle cx="70" cy="70" r={RADIUS} fill="none" stroke="#f1f5f9" stroke-width="16" />
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
			<div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
				<span class="text-muted-foreground text-[10px] font-medium">Spent</span>
				<strong class="text-xs font-bold tabular-nums sm:text-sm">{formatMoney(total, currency)}</strong>
			</div>
		</div>

		<ul class="w-full min-w-0 flex-1 space-y-1.5">
			{#each segments as segment (segment.category.id)}
				<li class="bg-muted/30 flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs">
					<div class="flex min-w-0 items-center gap-2">
						<span class="size-2 shrink-0 rounded-full" style={`background:${segment.category.color}`}></span>
						<span class="truncate font-medium">
							{segment.category.emoji} {segment.category.name}
						</span>
					</div>
					<div class="flex shrink-0 items-center gap-2 tabular-nums">
						<span class="text-muted-foreground text-[11px]">{Math.round(segment.percent)}%</span>
						<span class="font-semibold">{formatMoney(segment.amount, currency)}</span>
					</div>
				</li>
			{/each}
		</ul>
	</div>
{/if}
