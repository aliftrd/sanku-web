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
		return `${Math.max(3, (value / maxValue) * 100)}%`;
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
</script>

<div class="cashflow-chart">
	<div class="chart-head">
		<div class="chart-legend">
			<span><i class="dot income"></i> Income</span>
			<span><i class="dot expense"></i> Expenses</span>
		</div>

		<div class="chart-range-picker" role="group" aria-label="Cashflow time range">
			<button
				type="button"
				class="range-pill"
				class:active={selectedRange === '7D'}
				onclick={() => (selectedRange = '7D')}
			>
				7 Days
			</button>
			<button
				type="button"
				class="range-pill"
				class:active={selectedRange === '1M'}
				onclick={() => (selectedRange = '1M')}
			>
				1 Month
			</button>
			<button
				type="button"
				class="range-pill"
				class:active={selectedRange === '6M'}
				onclick={() => (selectedRange = '6M')}
			>
				6 Months
			</button>
			<button
				type="button"
				class="range-pill"
				class:active={selectedRange === '1Y'}
				onclick={() => (selectedRange = '1Y')}
			>
				1 Year
			</button>
		</div>

		{#if bestPeriod && (bestPeriod.income > 0 || bestPeriod.expense > 0)}
			<span class="chart-highlight">
				Best: <strong>{bestPeriod.shortLabel || bestPeriod.label}</strong>
				<em class:negative={bestPeriod.net < 0}>{formatMoney(bestPeriod.net, currency)}</em>
			</span>
		{/if}
	</div>

	<div class="chart-plot" role="img" aria-label={`Income and expenses for ${selectedRange}`}>
		{#each items as item (item.key)}
			<div
				class="chart-column"
				class:dimmed={hovered !== null && hovered !== item.key}
				onmouseenter={() => (hovered = item.key)}
				onmouseleave={() => (hovered = null)}
				role="presentation"
			>
				<div class="chart-tip" class:visible={hovered === item.key}>
					<strong>{item.label}</strong>
					<span><i class="dot income"></i>{formatMoney(item.income, currency)}</span>
					<span><i class="dot expense"></i>{formatMoney(item.expense, currency)}</span>
					<span class="tip-net" class:negative={item.net < 0}>
						Net {formatMoney(item.net, currency)}
					</span>
				</div>

				<div class="chart-bars">
					<span
						class="chart-bar income"
						style={`height:${barHeight(item.income)}`}
						aria-label={`Income ${formatMoney(item.income, currency)}`}
					></span>
					<span
						class="chart-bar expense"
						style={`height:${barHeight(item.expense)}`}
						aria-label={`Expenses ${formatMoney(item.expense, currency)}`}
					></span>
				</div>

				<div class="chart-axis">
					<span>{item.shortLabel}</span>
					<em class:negative={item.net < 0}>
						{item.net === 0 ? '—' : formatCompactMoney(item.net, currency)}
					</em>
				</div>
			</div>
		{/each}
	</div>

	<div class="chart-foot-totals">
		<div class="period-stat">
			<span class="p-label">Total in</span>
			<span class="p-val pos">+{formatMoney(totalPeriodIncome, currency)}</span>
		</div>
		<div class="period-stat">
			<span class="p-label">Total out</span>
			<span class="p-val neg">−{formatMoney(totalPeriodExpense, currency)}</span>
		</div>
		<div class="period-stat">
			<span class="p-label">Net surplus</span>
			<span
				class="p-val"
				class:pos={totalPeriodNet >= 0}
				class:neg={totalPeriodNet < 0}
			>
				{totalPeriodNet >= 0 ? '+' : ''}{formatMoney(totalPeriodNet, currency)}
			</span>
		</div>
	</div>
</div>