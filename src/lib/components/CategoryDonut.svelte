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

<article class="bg-surface-card border-outline-variant gap-gutter-md flex h-full flex-col justify-between rounded-xl border p-6">
	<header class="flex items-center justify-between gap-2">
		<div>
			<h2 class="font-headline text-headline-lg text-on-surface uppercase">EXPENSE DISTRIBUTION</h2>
			<p class="font-body text-body-sm text-on-surface-variant">Porsi pengeluaran per kategori</p>
		</div>
		{#if monthLabel}
			<span class="bg-pill-white text-on-pill-white font-label text-label-sm rounded-full px-3 py-1 uppercase">
				{monthLabel}
			</span>
		{/if}
	</header>

	{#if items.length === 0}
		<div class="border-outline-variant bg-surface-container flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
			<span class="bg-coral text-on-coral flex size-11 items-center justify-center rounded-full">
				<span class="material-symbols-outlined text-[22px]" aria-hidden="true">donut_large</span>
			</span>
			<p class="font-title text-title-md text-on-surface">Belum ada pengeluaran</p>
			<span class="font-body text-body-sm text-on-surface-variant max-w-xs">
				Tambahkan transaksi pengeluaran untuk melihat visualisasi distribusi kategori.
			</span>
		</div>
	{:else}
		<div class="flex flex-col items-center justify-between gap-5 py-1 sm:flex-row">
			<div class="relative flex size-40 shrink-0 items-center justify-center sm:size-44">
				<svg viewBox="0 0 160 160" class="size-full -rotate-90" role="img" aria-label="Expenses by category">
					<circle cx="80" cy="80" r={RADIUS} fill="none" stroke="#2A2C30" stroke-width="18" />
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
					<span class="font-label text-label-sm text-on-surface-variant uppercase">Spent</span>
					<span class="font-headline text-headline-md text-on-surface max-w-full truncate tabular-nums">
						{formatMoney(total, currency)}
					</span>
				</div>
			</div>

			<div class="flex w-full flex-1 flex-col gap-2">
				{#each segments as segment (segment.category.id)}
					<div class="bg-surface-container flex items-center justify-between gap-2 rounded-lg px-3.5 py-2.5">
						<span class="font-title text-title-md text-on-surface inline-flex min-w-0 items-center gap-2">
							<span
								class="size-3 shrink-0 rounded-full"
								style={`background:${segment.category.color}`}
								aria-hidden="true"
							></span>
							<span class="truncate">{segment.category.emoji} {segment.category.name}</span>
						</span>
						<span class="bg-ink text-on-surface font-mono text-mono-sm shrink-0 rounded-full px-2.5 py-0.5 tabular-nums">
							{Math.round(segment.percent)}% · {formatMoney(segment.amount, currency)}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</article>
