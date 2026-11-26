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

	let selectedRange = $state<CashflowRange>('7D');
	let hovered = $state<string | null>(null);

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

		// '6M' default
		if (initialMonths.length > 0 && initialMonths[initialMonths.length - 1]?.key === month) {
			return initialMonths;
		}
		return buildMonthTotals(transactions, month, 6);
	});

	let maxValue = $derived(
		Math.max(1, ...items.flatMap((item) => [item.income, item.expense]))
	);

	function barHeight(value: number): string {
		if (value <= 0) return '0%';
		return `${Math.max(4, (value / maxValue) * 100)}%`;
	}

	let bestPeriod = $derived(
		items.reduce<MonthTotal | null>((best, item) => {
			if (!best || item.net > best.net) return item;
			return best;
		}, null)
	);

	let totalPeriodIncome = $derived(items.reduce((sum, item) => sum + item.income, 0));
	let totalPeriodExpense = $derived(items.reduce((sum, item) => sum + item.expense, 0));
	let totalPeriodNet = $derived(totalPeriodIncome - totalPeriodExpense);

	const RANGES: Array<{ value: CashflowRange; label: string }> = [
		{ value: '7D', label: '7D' },
		{ value: '1M', label: '1M' },
		{ value: '6M', label: '6M' },
		{ value: '1Y', label: '1Y' }
	];
</script>

<div class="flex flex-col gap-3">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="text-muted-foreground flex items-center gap-3 text-xs font-medium">
			<span class="inline-flex items-center gap-1.5">
				<span class="size-2 rounded-full bg-emerald-500"></span>
				Income
			</span>
			<span class="inline-flex items-center gap-1.5">
				<span class="size-2 rounded-full bg-rose-500"></span>
				Expenses
			</span>
		</div>

		<div class="bg-muted inline-flex items-center gap-0.5 rounded-lg p-0.5" role="group" aria-label="Cashflow time range">
			{#each RANGES as r (r.value)}
				<button
					type="button"
					class={cn(
						'cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
						selectedRange === r.value
							? 'bg-card text-foreground shadow-2xs'
							: 'text-muted-foreground hover:text-foreground'
					)}
					onclick={() => (selectedRange = r.value)}
				>
					{r.label}
				</button>
			{/each}
		</div>

		{#if bestPeriod && (bestPeriod.income > 0 || bestPeriod.expense > 0)}
			<span class="text-muted-foreground text-xs">
				Best: <strong class="text-foreground">{bestPeriod.shortLabel || bestPeriod.label}</strong>
				<span class={cn('font-semibold tabular-nums', bestPeriod.net < 0 ? 'text-rose-600' : 'text-emerald-700')}>
					{formatMoney(bestPeriod.net, currency)}
				</span>
			</span>
		{/if}
	</div>

	<div class="overflow-visible pt-2" role="img" aria-label={`Income and expenses for ${selectedRange}`}>
		<div
			class="grid items-end gap-1 sm:gap-1.5"
			style={`grid-template-columns: repeat(${items.length}, minmax(0, 1fr));`}
		>
			{#each items as item, idx (item.key)}
				<div
					class={cn(
						'group relative flex flex-col items-center gap-1.5 transition-opacity',
						hovered !== null && hovered !== item.key && 'opacity-45'
					)}
					onmouseenter={() => (hovered = item.key)}
					onmouseleave={() => (hovered = null)}
					role="presentation"
				>
					<!-- Edge-aware Hover Tooltip -->
					{#if hovered === item.key}
						<div
							class={cn(
								'bg-popover text-popover-foreground border-border pointer-events-none absolute bottom-full z-40 mb-1.5 flex min-w-[140px] flex-col gap-0.5 rounded-lg border p-2 text-[11px] whitespace-nowrap shadow-md',
								idx <= 1 ? 'left-0' : idx >= items.length - 2 ? 'right-0' : 'left-1/2 -translate-x-1/2'
							)}
						>
							<strong class="text-foreground font-semibold">{item.label}</strong>
							<span class="flex items-center justify-between gap-3 text-emerald-700 tabular-nums">
								<span>In</span>
								<span>{formatMoney(item.income, currency)}</span>
							</span>
							<span class="flex items-center justify-between gap-3 text-rose-600 tabular-nums">
								<span>Out</span>
								<span>{formatMoney(item.expense, currency)}</span>
							</span>
							<span
								class={cn(
									'border-border mt-0.5 flex items-center justify-between gap-3 border-t pt-0.5 font-semibold tabular-nums',
									item.net < 0 ? 'text-rose-600' : 'text-foreground'
								)}
							>
								<span>Net</span>
								<span>{formatMoney(item.net, currency)}</span>
							</span>
						</div>
					{/if}

					<!-- Bar Pair -->
					<div class="border-border/60 flex h-24 w-full items-end justify-center gap-0.5 border-b pb-0.5 sm:h-28 sm:gap-1">
						<span
							class="w-2 rounded-t-sm bg-emerald-500 transition-all duration-300 sm:w-3"
							style={`height:${barHeight(item.income)}`}
							aria-label={`Income ${formatMoney(item.income, currency)}`}
						></span>
						<span
							class="w-2 rounded-t-sm bg-rose-500 transition-all duration-300 sm:w-3"
							style={`height:${barHeight(item.expense)}`}
							aria-label={`Expenses ${formatMoney(item.expense, currency)}`}
						></span>
					</div>

					<!-- Axis Label -->
					<div class="flex flex-col items-center text-center leading-tight">
						<span class="text-muted-foreground text-[10px] font-medium sm:text-[11px]">{item.shortLabel}</span>
						<span class={cn('text-[9px] font-medium tabular-nums sm:text-[10px]', item.net < 0 ? 'text-rose-600' : 'text-muted-foreground')}>
							{item.net === 0 ? '—' : formatCompactMoney(item.net, currency)}
						</span>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<div class="border-border grid grid-cols-3 gap-2 border-t pt-2.5">
		<div class="space-y-0.5">
			<span class="text-muted-foreground block text-[11px]">Total in</span>
			<span class="block text-xs font-semibold text-emerald-700 tabular-nums sm:text-sm">
				+{formatMoney(totalPeriodIncome, currency)}
			</span>
		</div>
		<div class="space-y-0.5">
			<span class="text-muted-foreground block text-[11px]">Total out</span>
			<span class="text-foreground block text-xs font-semibold tabular-nums sm:text-sm">
				−{formatMoney(totalPeriodExpense, currency)}
			</span>
		</div>
		<div class="space-y-0.5">
			<span class="text-muted-foreground block text-[11px]">Net surplus</span>
			<span
				class={cn(
					'block text-xs font-semibold tabular-nums sm:text-sm',
					totalPeriodNet >= 0 ? 'text-emerald-700' : 'text-rose-600'
				)}
			>
				{totalPeriodNet >= 0 ? '+' : ''}{formatMoney(totalPeriodNet, currency)}
			</span>
		</div>
	</div>
</div>
