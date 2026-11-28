<script lang="ts">
	import type { CashflowRange, MonthTotal, Transaction } from '#lib/types.ts';
	import {
		buildDailyTotals,
		buildMonthTotals,
		buildMonthWeeklyTotals,
		currentMonthKey,
		formatCompactMoney,
		formatMoney,
		todayISO
	} from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';

	let {
		transactions = [],
		month = currentMonthKey(),
		currency,
		months: initialMonths = []
	}: {
		transactions?: Transaction[];
		month?: string;
		currency: string;
		months?: MonthTotal[];
	} = $props();

	let selectedRange = $state<CashflowRange>('1M');
	let hoveredIndex = $state<number | null>(null);

	const RANGES: Array<{ value: CashflowRange; label: string }> = [
		{ value: '7D', label: '7D' },
		{ value: '1M', label: '1M' },
		{ value: '6M', label: '6M' },
		{ value: '1Y', label: '1Y' }
	];

	let items = $derived.by(() => {
		if (selectedRange === '7D') {
			const isCurrentMonth = month === currentMonthKey();
			const today = todayISO();
			const [y, m] = month.split('-').map(Number);
			const lastDayOfMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
			const endDate = isCurrentMonth ? today : `${month}-${String(lastDayOfMonth).padStart(2, '0')}`;
			return buildDailyTotals(transactions, endDate, 7);
		}

		if (selectedRange === '1M') {
			return buildMonthWeeklyTotals(transactions, month);
		}

		if (selectedRange === '1Y') {
			return buildMonthTotals(transactions, month, 12);
		}

		if (initialMonths.length > 0 && initialMonths[initialMonths.length - 1]?.key === month) {
			return initialMonths;
		}
		return buildMonthTotals(transactions, month, 6);
	});

	let maxValue = $derived(
		Math.max(1, ...items.flatMap((item) => [item.income, item.expense]))
	);

	// Nice rounded ceiling for clean Y-axis ticks
	let yMax = $derived.by(() => {
		const raw = maxValue;
		if (raw <= 1) return 100;
		const mag = 10 ** Math.floor(Math.log10(raw));
		const step = mag / 2;
		return Math.ceil(raw / step) * step;
	});

	const PLOT_LEFT = 54;
	const PLOT_RIGHT = 544;
	const PLOT_TOP = 18;
	const PLOT_BOTTOM = 154;
	const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;
	const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT;

	let yTicks = $derived([
		{ y: PLOT_TOP, value: yMax },
		{ y: PLOT_TOP + PLOT_HEIGHT / 3, value: (yMax * 2) / 3 },
		{ y: PLOT_TOP + (PLOT_HEIGHT * 2) / 3, value: yMax / 3 },
		{ y: PLOT_BOTTOM, value: 0 }
	]);

	function barRectHeight(value: number): number {
		if (value <= 0) return 2;
		return Math.max(4, (value / yMax) * PLOT_HEIGHT);
	}

	function compactTick(value: number): string {
		if (value <= 0) return '0';
		return formatCompactMoney(value, currency)
			.replace(/^Rp\s?/, '')
			.replace(/^\$/, '')
			.trim();
	}

	let totalPeriodIncome = $derived(items.reduce((sum, item) => sum + item.income, 0));
	let totalPeriodExpense = $derived(items.reduce((sum, item) => sum + item.expense, 0));
	let totalPeriodNet = $derived(totalPeriodIncome - totalPeriodExpense);
	let hoveredItem = $derived(hoveredIndex !== null ? (items[hoveredIndex] ?? null) : null);
</script>

<article class="bg-surface-card border-outline flex h-full flex-col justify-between gap-gutter-md rounded-md border p-gutter-md">
	<header class="flex flex-wrap items-center justify-between gap-gutter-sm">
		<div>
			<h2 class="font-title text-title-lg text-on-surface">Cashflow Dynamics</h2>
			<p class="font-body text-body-sm text-on-surface-variant">Income vs expenses over time</p>
		</div>

		<div
			class="bg-surface-container-low border-outline inline-flex items-center rounded border p-0.5"
			role="tablist"
			aria-label="Cashflow range"
		>
			{#each RANGES as r (r.value)}
				<button
					type="button"
					role="tab"
					aria-selected={selectedRange === r.value}
					onclick={() => (selectedRange = r.value)}
					class={cn(
						'font-label text-label-sm cursor-pointer rounded-sm px-2.5 py-1 transition-colors duration-state-change',
						selectedRange === r.value
							? 'bg-surface-card text-on-surface shadow-xs'
							: 'text-on-surface-variant hover:text-on-surface'
					)}
				>
					{r.label}
				</button>
			{/each}
		</div>
	</header>

	<div class="relative w-full py-1">
		<div class="mb-3 flex items-center justify-between gap-2">
			<div class="font-body text-body-sm text-on-surface-variant min-h-[18px] tabular-nums">
				{#if hoveredItem}
					<span class="text-on-surface font-semibold">{hoveredItem.label}:</span>
					<span class="text-on-income-container ml-1.5 font-medium">
						+{formatMoney(hoveredItem.income, currency)}
					</span>
					<span class="mx-1 opacity-40">/</span>
					<span class="text-on-expense-container font-medium">
						-{formatMoney(hoveredItem.expense, currency)}
					</span>
				{/if}
			</div>
			<div class="flex items-center gap-gutter-md">
				<span class="font-body text-body-sm text-on-surface-variant inline-flex items-center gap-1.5">
					<span class="bg-income size-2.5 rounded-sm" aria-hidden="true"></span> Income
				</span>
				<span class="font-body text-body-sm text-on-surface-variant inline-flex items-center gap-1.5">
					<span class="bg-expense size-2.5 rounded-sm" aria-hidden="true"></span> Expenses
				</span>
			</div>
		</div>

		<svg
			viewBox="0 0 560 186"
			class="h-44 w-full overflow-visible sm:h-48"
			role="img"
			aria-label={`Grouped bar chart for ${selectedRange}`}
		>
			<!-- Horizontal gridlines & Y ticks -->
			{#each yTicks as tick, idx (idx)}
				<line
					x1={PLOT_LEFT}
					y1={tick.y}
					x2={PLOT_RIGHT}
					y2={tick.y}
					stroke={tick.value === 0 ? '#CBD5E1' : '#E2E8F0'}
					stroke-dasharray={tick.value === 0 ? undefined : '3 3'}
				/>
				<text
					x={PLOT_LEFT - 8}
					y={tick.y + 4}
					text-anchor="end"
					fill="#475569"
					font-size="11"
					font-family="Instrument Sans, sans-serif"
				>
					{compactTick(tick.value)}
				</text>
			{/each}

			<!-- Grouped bar pairs -->
			{#each items as item, idx (item.key)}
				{@const slotW = PLOT_WIDTH / Math.max(1, items.length)}
				{@const centerX = PLOT_LEFT + slotW * idx + slotW / 2}
				{@const barW = Math.min(18, Math.max(6, slotW * 0.24))}
				{@const gap = Math.min(4, Math.max(2, slotW * 0.05))}
				{@const incH = barRectHeight(item.income)}
				{@const expH = barRectHeight(item.expense)}
				{@const isDimmed = hoveredIndex !== null && hoveredIndex !== idx}
				{@const hasActivity = item.income > 0 || item.expense > 0}
				<g
					class="cursor-pointer transition-opacity duration-150"
					opacity={isDimmed ? 0.35 : 1}
					onmouseenter={() => (hoveredIndex = idx)}
					onmouseleave={() => (hoveredIndex = null)}
					role="presentation"
				>
					<rect
						x={PLOT_LEFT + slotW * idx}
						y={PLOT_TOP}
						width={slotW}
						height={PLOT_HEIGHT + 28}
						fill="transparent"
					/>
					<rect
						x={centerX - barW - gap / 2}
						y={PLOT_BOTTOM - incH}
						width={barW}
						height={incH}
						rx={item.income > 0 ? 3 : 1}
						fill="#10B981"
						opacity={item.income > 0 ? 1 : 0.3}
					/>
					<rect
						x={centerX + gap / 2}
						y={PLOT_BOTTOM - expH}
						width={barW}
						height={expH}
						rx={item.expense > 0 ? 3 : 1}
						fill="#F43F5E"
						opacity={item.expense > 0 ? 1 : 0.3}
					/>
					<text
						x={centerX}
						y={PLOT_BOTTOM + 20}
						text-anchor="middle"
						fill={hasActivity || hoveredIndex === idx ? '#0F172A' : '#475569'}
						font-weight={hasActivity || hoveredIndex === idx ? '600' : '400'}
						font-size={items.length > 8 ? '10' : '11'}
						font-family="Instrument Sans, sans-serif"
					>
						{item.shortLabel}
					</text>
				</g>
			{/each}
		</svg>
	</div>

	<footer class="border-outline flex flex-wrap items-center justify-between gap-gutter-md border-t pt-gutter-sm">
		<div class="flex flex-wrap items-center gap-gutter-lg">
			<span class="font-body text-body-sm text-on-surface-variant">
				Total in:
				<strong class="text-on-income-container font-semibold tabular-nums">
					+{formatMoney(totalPeriodIncome, currency)}
				</strong>
			</span>
			<span class="font-body text-body-sm text-on-surface-variant">
				Total out:
				<strong class="text-on-expense-container font-semibold tabular-nums">
					-{formatMoney(totalPeriodExpense, currency)}
				</strong>
			</span>
		</div>
		<span class="font-body text-body-sm text-on-surface-variant">
			Net:
			<strong
				class={cn(
					'font-semibold tabular-nums',
					totalPeriodNet < 0 ? 'text-on-expense-container' : 'text-on-surface'
				)}
			>
				{totalPeriodNet >= 0 ? '+' : ''}{formatMoney(totalPeriodNet, currency)}
			</strong>
		</span>
	</footer>
</article>
