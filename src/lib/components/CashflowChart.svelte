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

	let yMax = $derived.by(() => {
		const raw = maxValue;
		if (raw <= 1) return 100;
		const mag = 10 ** Math.floor(Math.log10(raw));
		const step = mag / 2;
		return Math.ceil(raw / step) * step;
	});

	const PLOT_LEFT = 54;
	const PLOT_RIGHT = 538;
	const PLOT_TOP = 18;
	const PLOT_BOTTOM = 172;
	const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;
	const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT;

	let yTicks = $derived([
		{ y: PLOT_TOP, value: yMax },
		{ y: PLOT_TOP + PLOT_HEIGHT / 3, value: (yMax * 2) / 3 },
		{ y: PLOT_TOP + (PLOT_HEIGHT * 2) / 3, value: yMax / 3 },
		{ y: PLOT_BOTTOM, value: 0 }
	]);

	function xFor(idx: number): number {
		if (items.length <= 1) return PLOT_LEFT + PLOT_WIDTH / 2;
		return PLOT_LEFT + (PLOT_WIDTH * idx) / (items.length - 1);
	}

	function yFor(value: number): number {
		const ratio = Math.min(1, Math.max(0, value / yMax));
		return PLOT_BOTTOM - ratio * PLOT_HEIGHT;
	}

	let points = $derived(
		items.map((item, idx) => ({
			...item,
			x: xFor(idx),
			incomeY: yFor(item.income),
			expenseY: yFor(item.expense)
		}))
	);

	function linePath(coords: Array<{ x: number; y: number }>): string {
		if (coords.length === 0) return '';
		return coords
			.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
			.join(' ');
	}

	function areaPath(coords: Array<{ x: number; y: number }>): string {
		if (coords.length === 0) return '';
		const first = coords[0];
		const last = coords[coords.length - 1];
		return `${linePath(coords)} L ${last.x.toFixed(1)} ${PLOT_BOTTOM} L ${first.x.toFixed(1)} ${PLOT_BOTTOM} Z`;
	}

	let incomeLinePath = $derived(linePath(points.map((p) => ({ x: p.x, y: p.incomeY }))));
	let expenseLinePath = $derived(linePath(points.map((p) => ({ x: p.x, y: p.expenseY }))));
	let incomeAreaPath = $derived(areaPath(points.map((p) => ({ x: p.x, y: p.incomeY }))));
	let expenseAreaPath = $derived(areaPath(points.map((p) => ({ x: p.x, y: p.expenseY }))));

	function compactTick(value: number): string {
		if (value <= 0) return '0';
		return formatCompactMoney(value, currency)
			.replace(/^Rp\s?/, '')
			.replace(/^\$/, '')
			.trim();
	}

	let hoveredItem = $derived(hoveredIndex !== null ? (points[hoveredIndex] ?? null) : null);
</script>

<article class="bg-periwinkle text-on-periwinkle gap-gutter-md flex h-full flex-col justify-between rounded-xl p-5 sm:p-6">
	<header class="gap-gutter-sm flex flex-wrap items-center justify-between">
		<div>
			<h2 class="font-headline text-headline-md sm:text-headline-lg uppercase">CASHFLOW DYNAMICS</h2>
			<p class="font-body text-body-sm text-on-periwinkle/85">
				Tren pemasukan vs pengeluaran periode aktif
			</p>
		</div>

		<div
			class="bg-ink text-on-surface flex items-center gap-1 rounded-full p-1"
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
						'font-label text-label-sm cursor-pointer rounded-full px-3 py-1 transition-colors duration-state-change',
						selectedRange === r.value
							? 'bg-pill-white text-on-pill-white'
							: 'text-on-surface-variant hover:text-on-surface'
					)}
				>
					{r.label}
				</button>
			{/each}
		</div>
	</header>

	<!-- Sage Cream Line Chart Canvas -->
	<div class="bg-sage-cream text-on-sage-cream gap-gutter-sm flex flex-1 flex-col justify-between rounded-lg p-4">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div class="font-body text-body-sm text-ink/80 min-h-[22px] tabular-nums">
				{#if hoveredItem}
					<span class="bg-ink text-on-surface inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 font-mono text-xs">
						<span class="font-bold">{hoveredItem.label}:</span>
						<span class="text-income">+{formatMoney(hoveredItem.income, currency)}</span>
						<span class="opacity-50">/</span>
						<span class="text-coral">-{formatMoney(hoveredItem.expense, currency)}</span>
					</span>
				{:else}
					<span class="font-label text-label-sm text-ink/70 uppercase">
						Hover titik untuk detail periode
					</span>
				{/if}
			</div>
			<div class="gap-gutter-md flex items-center">
				<span class="font-label text-label-sm inline-flex items-center gap-1.5">
					<span class="border-ink size-2.5 rounded-full border bg-[#059669]" aria-hidden="true"></span>
					Income
				</span>
				<span class="font-label text-label-sm inline-flex items-center gap-1.5">
					<span class="bg-coral border-ink size-2.5 rounded-full border" aria-hidden="true"></span>
					Expenses
				</span>
			</div>
		</div>

		<svg
			viewBox="0 0 560 206"
			class="h-48 w-full overflow-visible sm:h-56"
			role="img"
			aria-label={`Line chart for ${selectedRange}`}
		>
			{#each yTicks as tick, idx (idx)}
				<line
					x1={PLOT_LEFT}
					y1={tick.y}
					x2={PLOT_RIGHT}
					y2={tick.y}
					stroke={tick.value === 0 ? '#141517' : 'rgba(20, 21, 23, 0.16)'}
					stroke-width={tick.value === 0 ? 1.5 : 1}
					stroke-dasharray={tick.value === 0 ? undefined : '3 3'}
				/>
				<text
					x={PLOT_LEFT - 8}
					y={tick.y + 4}
					text-anchor="end"
					fill="#141517"
					font-size="11"
					font-weight="600"
					font-family="JetBrains Mono, monospace"
				>
					{compactTick(tick.value)}
				</text>
			{/each}

			{#if points.length > 1}
				<path d={incomeAreaPath} fill="rgba(5, 150, 105, 0.13)" />
				<path d={expenseAreaPath} fill="rgba(242, 100, 76, 0.14)" />
				<path
					d={incomeLinePath}
					fill="none"
					stroke="#059669"
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<path
					d={expenseLinePath}
					fill="none"
					stroke="#F2644C"
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			{/if}

			{#if hoveredItem}
				<line
					x1={hoveredItem.x}
					y1={PLOT_TOP}
					x2={hoveredItem.x}
					y2={PLOT_BOTTOM}
					stroke="#141517"
					stroke-width="1.25"
					stroke-dasharray="3 3"
					opacity="0.45"
				/>
			{/if}

			{#each points as pt, idx (pt.key)}
				{@const isHovered = hoveredIndex === idx}
				{@const hitWidth = points.length <= 1 ? PLOT_WIDTH : PLOT_WIDTH / Math.max(1, points.length - 1)}
				{@const hitX = Math.max(PLOT_LEFT - 10, pt.x - hitWidth / 2)}
				{@const hasActivity = pt.income > 0 || pt.expense > 0}
				<g
					class="cursor-pointer"
					onmouseenter={() => (hoveredIndex = idx)}
					onmouseleave={() => (hoveredIndex = null)}
					role="presentation"
				>
					<rect
						x={hitX}
						y={PLOT_TOP}
						width={hitWidth}
						height={PLOT_HEIGHT + 28}
						fill="transparent"
					/>
					<circle
						cx={pt.x}
						cy={pt.incomeY}
						r={isHovered ? 6 : 4}
						fill="#34D399"
						stroke="#141517"
						stroke-width="2"
					/>
					<circle
						cx={pt.x}
						cy={pt.expenseY}
						r={isHovered ? 6 : 4}
						fill="#F2644C"
						stroke="#141517"
						stroke-width="2"
					/>
					<text
						x={pt.x}
						y={PLOT_BOTTOM + 20}
						text-anchor="middle"
						fill={hasActivity || isHovered ? '#141517' : 'rgba(20, 21, 23, 0.55)'}
						font-weight={hasActivity || isHovered ? '700' : '500'}
						font-size={points.length > 8 ? '10' : '11'}
						font-family="Plus Jakarta Sans, sans-serif"
					>
						{pt.shortLabel}
					</text>
				</g>
			{/each}
		</svg>
	</div>
</article>
