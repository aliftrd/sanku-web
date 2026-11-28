<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import type {
		Category,
		CategorySpend,
		Transaction,
		TransactionType,
		Wallet
	} from '#lib/types.ts';
	import {
		buildDailyTotals,
		currentMonthKey,
		formatMoney,
		getTransferDestination,
		monthLabel,
		percentChange,
		shiftMonth,
		todayISO
	} from '#lib/finance.ts';
	import { calculateSplitBill } from '#lib/split-bill.ts';
	import { cn } from '#lib/utils.ts';
	import * as Select from '#lib/components/ui/select/index.ts';
	import CustomSelect from '#lib/components/CustomSelect.svelte';
	import TransactionModal from '#lib/components/TransactionModal.svelte';
	import CategoryManager from '#lib/components/CategoryManager.svelte';
	import WalletModal from '#lib/components/WalletModal.svelte';
	import SettingsSheet from '#lib/components/SettingsSheet.svelte';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import CashflowChart from '#lib/components/CashflowChart.svelte';
	import CategoryDonut from '#lib/components/CategoryDonut.svelte';
	import BudgetPanel from '#lib/components/BudgetPanel.svelte';
	import TransactionsTable from '#lib/components/TransactionsTable.svelte';
	import StatementImportModal from '#lib/components/StatementImportModal.svelte';
	import AccountsBudgetsView from '#lib/components/AccountsBudgetsView.svelte';
	import SplitBillWorkspace from '#lib/components/SplitBillWorkspace.svelte';

	type WorkspaceView = 'overview' | 'transactions' | 'budgets' | 'accounts' | 'split';

	let { data, form }: PageProps = $props();

	let activeView = $state<WorkspaceView>('overview');
	let splitInitialMode = $state<'calculator' | 'history'>('calculator');

	onMount(() => {
		const viewParam = new URLSearchParams(window.location.search).get('view');
		if (
			viewParam === 'overview' ||
			viewParam === 'transactions' ||
			viewParam === 'budgets' ||
			viewParam === 'accounts' ||
			viewParam === 'split'
		) {
			activeView = viewParam;
		}
	});

	function navigateView(next: WorkspaceView, opts?: { scrollTo?: string; splitTab?: 'calculator' | 'history' }) {
		if (opts?.splitTab) {
			splitInitialMode = opts.splitTab;
		}
		activeView = next;

		if (typeof window !== 'undefined') {
			const url = new URL(window.location.href);
			if (next === 'overview') url.searchParams.delete('view');
			else url.searchParams.set('view', next);
			window.history.replaceState({}, '', url);
		}

		if (opts?.scrollTo) {
			requestAnimationFrame(() => {
				document.querySelector(opts.scrollTo!)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			});
		} else if (typeof window !== 'undefined') {
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}

	let walletBreakdown = $derived.by(() => {
		const counts = new Map<string, number>();
		const netDeltas = new Map<string, number>();

		for (const t of data.transactions) {
			const src = t.account.trim().toLowerCase();
			counts.set(src, (counts.get(src) ?? 0) + 1);

			if (t.type === 'income') {
				netDeltas.set(src, (netDeltas.get(src) ?? 0) + t.amount);
			} else if (t.type === 'expense') {
				netDeltas.set(src, (netDeltas.get(src) ?? 0) - t.amount);
			} else if (t.type === 'transfer') {
				netDeltas.set(src, (netDeltas.get(src) ?? 0) - t.amount);
				const dest = getTransferDestination(t)?.trim().toLowerCase();
				if (dest) {
					counts.set(dest, (counts.get(dest) ?? 0) + 1);
					netDeltas.set(dest, (netDeltas.get(dest) ?? 0) + t.amount);
				}
			}
		}

		return (data.wallets ?? []).map((w) => {
			const k = w.name.trim().toLowerCase();
			const initial = w.initialBalance ?? 0;
			const delta = netDeltas.get(k) ?? 0;
			return {
				...w,
				balance: initial + delta,
				count: counts.get(k) ?? 0
			};
		});
	});

	let combinedBalance = $derived(walletBreakdown.reduce((total, w) => total + w.balance, 0));
	let previewWallets = $derived(walletBreakdown.slice(0, 3));

	type FormState = {
		error?: string;
		action?: string;
		id?: string | null;
		success?: boolean;
		importedCount?: number;
	};
	let message = $derived(form as FormState | null);

	let showTransactionModal = $state(false);
	let editingTransaction = $state<Transaction | null>(null);
	let createInitialType = $state<TransactionType>('expense');
	let showCategories = $state(false);
	let editingCategory = $state<Category | null>(null);
	let showWalletModal = $state(false);
	let editingWallet = $state<Wallet | null>(null);
	let showStatementImport = $state(false);
	let showSettings = $state(false);

	let toastNotice = $state<string | null>(null);
	let dismissedError = $state<string | null>(null);

	let showLogoutConfirm = $state(false);
	let isLoggingOut = $state(false);
	let logoutForm = $state<HTMLFormElement | null>(null);

	let deletingTransaction = $state<Transaction | null>(null);
	let isDeletingTx = $state(false);
	let deleteTxForm = $state<HTMLFormElement | null>(null);

	let monthForm: HTMLFormElement | null = $state(null);

	// Transactions ledger state
	let filterType = $state<'all' | 'income' | 'expense' | 'transfer'>('all');
	let filterCategory = $state('all');
	let filterAccount = $state('all');
	let search = $state('');
	let sortBy = $state<'date' | 'description' | 'category' | 'account' | 'amount'>('date');
	let sortOrder = $state<'asc' | 'desc'>('desc');
	let page = $state(1);
	let pageSize = $state<number>(25);
	let searchInputEl = $state<HTMLInputElement | null>(null);
	let headerHidden = $state(false);
	let lastScrollY = 0;

	function handleWindowScroll() {
		if (typeof window === 'undefined') return;
		if (
			showTransactionModal ||
			showCategories ||
			showWalletModal ||
			showStatementImport ||
			showSettings ||
			showLogoutConfirm ||
			deletingTransaction
		) {
			headerHidden = false;
			return;
		}
		const currentY = Math.max(0, window.scrollY);
		if (currentY <= 32) {
			headerHidden = false;
		} else if (currentY - lastScrollY > 6) {
			headerHidden = true;
		} else if (lastScrollY - currentY > 6) {
			headerHidden = false;
		}
		lastScrollY = currentY;
	}

	let splitBillOverview = $derived.by(() => {
		const openBills = (data.splitBills ?? []).filter((bill) => bill.status === 'open');
		let outstandingTotal = 0;
		let unpaidFriends = 0;
		for (const bill of openBills) {
			const c = calculateSplitBill(bill);
			outstandingTotal += c.outstandingAmount;
			unpaidFriends += c.unpaidCount;
		}
		return {
			openCount: openBills.length,
			outstandingTotal,
			unpaidFriends
		};
	});

	// 7-day daily outflow spark bars for Coral Hero KPI Card
	let dailyPulseBars = $derived.by(() => {
		const isCurrent = data.month === currentMonthKey();
		const [y, m] = data.month.split('-').map(Number);
		const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
		const endDate = isCurrent ? todayISO() : `${data.month}-${String(lastDay).padStart(2, '0')}`;
		const pts = buildDailyTotals(data.monthTransactions, endDate, 7);
		const maxExp = Math.max(1, ...pts.map((p) => p.expense));
		let peakVal = 0;
		let peakIdx = -1;
		pts.forEach((p, idx) => {
			if (p.expense > peakVal) {
				peakVal = p.expense;
				peakIdx = idx;
			}
		});
		return {
			peakVal,
			bars: pts.map((p, idx) => ({
				label: p.shortLabel,
				value: p.expense,
				heightPct: p.expense > 0 ? Math.max(18, Math.round((p.expense / maxExp) * 100)) : 14,
				isPeak: idx === peakIdx && peakVal > 0
			}))
		};
	});

	function showToast(text: string) {
		toastNotice = text;
		setTimeout(() => {
			if (toastNotice === text) toastNotice = null;
		}, 5000);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (document.activeElement === searchInputEl) {
				if (search) search = '';
				else searchInputEl?.blur();
			}
		} else if (
			event.key === '/' &&
			document.activeElement?.tagName !== 'INPUT' &&
			document.activeElement?.tagName !== 'TEXTAREA' &&
			document.activeElement?.tagName !== 'SELECT' &&
			!showTransactionModal &&
			!showCategories &&
			!showWalletModal &&
			!showStatementImport &&
			!showSettings &&
			!showLogoutConfirm &&
			!deletingTransaction
		) {
			event.preventDefault();
			if (activeView !== 'transactions') {
				navigateView('transactions');
				requestAnimationFrame(() => searchInputEl?.focus());
			} else {
				searchInputEl?.focus();
			}
		}
	}

	function toggleSort(column: 'date' | 'description' | 'category' | 'account' | 'amount') {
		if (sortBy === column) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = column;
			sortOrder =
				column === 'description' || column === 'category' || column === 'account' ? 'asc' : 'desc';
		}
		page = 1;
	}

	function duplicateTransaction(transaction: Transaction) {
		editingTransaction = { ...transaction, id: '', date: data.today };
		createInitialType = transaction.type;
		showTransactionModal = true;
	}

	function exportToCSV() {
		if (filteredTransactions.length === 0) return;
		const headers = [
			'Date',
			'Type',
			'Description',
			'Category',
			'Account',
			'Destination Account',
			'Amount',
			'Currency',
			'Original Amount',
			'Original Currency',
			'Exchange Rate',
			'Notes'
		];
		const rows = filteredTransactions.map((t) => {
			const cat =
				t.type === 'transfer' ? 'Transfer' : (categoryMap.get(t.categoryId)?.name ?? 'Uncategorized');
			const dest = getTransferDestination(t) ?? '';
			return [
				t.date,
				t.type,
				`"${(t.description || '').replace(/"/g, '""')}"`,
				`"${cat.replace(/"/g, '""')}"`,
				`"${(t.account || '').replace(/"/g, '""')}"`,
				`"${dest.replace(/"/g, '""')}"`,
				t.amount,
				data.currency,
				t.originalAmount ?? t.amount,
				t.currency ?? data.currency,
				t.exchangeRate ?? 1,
				`"${(t.notes || '').replace(/"/g, '""')}"`
			];
		});
		const csvContent =
			'data:text/csv;charset=utf-8,' +
			encodeURIComponent([headers.join(','), ...rows.map((r) => r.join(','))].join('\n'));
		const link = document.createElement('a');
		link.setAttribute('href', csvContent);
		link.setAttribute('download', `sanku-transactions-${data.month}.csv`);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	function executeDeleteTransaction() {
		if (!deletingTransaction || !deleteTxForm) return;
		isDeletingTx = true;
		deleteTxForm.requestSubmit();
	}

	function executeLogout() {
		if (!logoutForm) return;
		isLoggingOut = true;
		logoutForm.requestSubmit();
	}

	$effect(() => {
		if (data.theme) {
			document.documentElement.setAttribute('data-theme', data.theme);
		}
	});

	let bannerError = $derived(
		message?.error && !message.success && message.error !== dismissedError ? message.error : null
	);

	let categoryMap = $derived(new Map(data.categories.map((category) => [category.id, category])));

	let filteredTransactions = $derived.by(() => {
		const needle = search.trim().toLowerCase();

		return data.monthTransactions.filter((transaction) => {
			if (filterType !== 'all' && transaction.type !== filterType) return false;
			if (filterCategory !== 'all' && transaction.categoryId !== filterCategory) return false;
			if (filterAccount !== 'all') {
				const dest = getTransferDestination(transaction) ?? '';
				if (
					transaction.account.trim().toLowerCase() !== filterAccount.trim().toLowerCase() &&
					dest.trim().toLowerCase() !== filterAccount.trim().toLowerCase()
				) {
					return false;
				}
			}
			if (!needle) return true;

			const category = categoryMap.get(transaction.categoryId);

			return [transaction.description, transaction.account, transaction.notes, category?.name ?? '']
				.join(' ')
				.toLowerCase()
				.includes(needle);
		});
	});

	let incomeChange = $derived(percentChange(data.summary.income, data.summary.previousIncome));
	let expenseChange = $derived(percentChange(data.summary.expense, data.summary.previousExpense));
	let netChange = $derived(percentChange(data.summary.net, data.summary.previousNet));

	let expenses = $derived(
		data.monthTransactions.filter((transaction) => transaction.type === 'expense')
	);

	let largestExpense = $derived(
		expenses.reduce<Transaction | null>((largest, transaction) => {
			if (!largest || transaction.amount > largest.amount) return transaction;
			return largest;
		}, null)
	);

	let averageExpense = $derived(
		expenses.length > 0
			? expenses.reduce((sum, transaction) => sum + transaction.amount, 0) / expenses.length
			: 0
	);

	let mostUsedCategory = $derived(
		data.categorySpending.reduce<CategorySpend | null>((best, item) => {
			if (!best || item.count > best.count) return item;
			return best;
		}, null)
	);

	let activeDays = $derived(new Set(expenses.map((transaction) => transaction.date)).size);

	let initials = $derived(
		data.user.name
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('') || 'S'
	);

	let shortMonthText = $derived(monthLabel(data.month, 'short'));

	let hasFilters = $derived(
		filterType !== 'all' ||
			filterCategory !== 'all' ||
			filterAccount !== 'all' ||
			search.trim() !== ''
	);

	let sortedTransactions = $derived.by(() => {
		const list = [...filteredTransactions];
		return list.sort((a, b) => {
			let result = 0;
			if (sortBy === 'date') {
				result = a.date.localeCompare(b.date);
			} else if (sortBy === 'amount') {
				result = a.amount - b.amount;
			} else if (sortBy === 'description') {
				result = (a.description || '').localeCompare(b.description || '');
			} else if (sortBy === 'category') {
				const catA =
					a.type === 'transfer' ? 'Transfer' : (categoryMap.get(a.categoryId)?.name ?? 'Uncategorized');
				const catB =
					b.type === 'transfer' ? 'Transfer' : (categoryMap.get(b.categoryId)?.name ?? 'Uncategorized');
				result = catA.localeCompare(catB);
			} else if (sortBy === 'account') {
				result = (a.account || '').localeCompare(b.account || '');
			}
			return sortOrder === 'asc' ? result : -result;
		});
	});

	let totalPages = $derived(
		pageSize > 0 ? Math.max(1, Math.ceil(sortedTransactions.length / pageSize)) : 1
	);

	let paginatedTransactions = $derived.by(() => {
		if (pageSize <= 0) return sortedTransactions;
		const safePage = Math.min(Math.max(1, page), totalPages);
		const start = (safePage - 1) * pageSize;
		return sortedTransactions.slice(start, start + pageSize);
	});

	let filteredStats = $derived.by(() => {
		let totalIncome = 0;
		let totalExpense = 0;
		for (const t of filteredTransactions) {
			if (t.type === 'income') totalIncome += t.amount;
			else if (t.type === 'expense') totalExpense += t.amount;
		}
		return {
			count: filteredTransactions.length,
			income: totalIncome,
			expense: totalExpense,
			net: totalIncome - totalExpense
		};
	});

	let sortSummaryLabel = $derived.by(() => {
		const colNames: Record<typeof sortBy, string> = {
			date: 'Date',
			description: 'Description',
			category: 'Category',
			account: 'Account',
			amount: 'Amount'
		};
		const dir =
			sortBy === 'date'
				? sortOrder === 'desc'
					? 'Newest'
					: 'Oldest'
				: sortOrder === 'desc'
					? 'High–Low'
					: 'A–Z';
		return `Sorted by ${colNames[sortBy]} (${dir})`;
	});

	function openCreate(initial: TransactionType = 'expense') {
		editingTransaction = null;
		createInitialType = initial;
		showTransactionModal = true;
	}

	function openEdit(transaction: Transaction) {
		editingTransaction = transaction;
		showTransactionModal = true;
	}

	function filterByWalletAndOpenLedger(accountName: string) {
		filterCategory = 'all';
		filterAccount = accountName;
		search = '';
		page = 1;
		navigateView('transactions');
	}

	function clearFilters() {
		filterType = 'all';
		filterCategory = 'all';
		filterAccount = 'all';
		search = '';
		page = 1;
	}

	function categoryFor(transaction: Transaction) {
		return categoryMap.get(transaction.categoryId) ?? null;
	}

	function monthHref(targetMonth: string): string {
		const params = new URLSearchParams();
		params.set('month', targetMonth);
		if (activeView !== 'overview') params.set('view', activeView);
		return `/app?${params.toString()}`;
	}

	const WALLET_DOT_TONES = ['bg-income', 'bg-sky-mint', 'bg-marigold', 'bg-coral'];
</script>

<svelte:window onkeydown={handleKeyDown} onscroll={handleWindowScroll} />

<svelte:head>
	<title>{data.monthLabel} — Sanku Pop</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if bannerError}
	<div
		class="bg-coral text-on-coral fixed bottom-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-full px-5 py-3 text-sm font-semibold shadow-2xl"
		role="alert"
	>
		<span class="material-symbols-outlined shrink-0 text-[18px]" aria-hidden="true">error</span>
		<p class="font-body text-body-sm flex-1 font-semibold">{bannerError}</p>
		<button
			type="button"
			aria-label="Dismiss error"
			onclick={() => (dismissedError = message?.error ?? null)}
			class="bg-ink text-on-surface inline-flex size-6 cursor-pointer items-center justify-center rounded-full"
		>
			<span class="material-symbols-outlined text-[15px]" aria-hidden="true">close</span>
		</button>
	</div>
{/if}

<div class="bg-surface text-on-surface flex min-h-screen flex-col" data-theme={data.theme}>
	<!-- Shared Editorial Topbar Navigation (Stitch Desktop / Tablet / Mobile) -->
	<header
		class={cn(
			'border-outline-variant bg-surface/95 sticky top-0 z-30 border-b backdrop-blur-sm transition-transform duration-200 ease-out',
			headerHidden && '-translate-y-full pointer-events-none md:translate-y-0 md:pointer-events-auto'
		)}
	>
		<div class="px-gutter-md sm:px-gutter-lg gap-gutter-sm mx-auto flex h-16 max-w-[1280px] items-center justify-between lg:h-20">
			<!-- Left: Brand + Tablet Compact Nav + Desktop Pill Nav -->
			<div class="gap-gutter-sm lg:gap-gutter-md flex min-w-0 items-center">
				<button
					type="button"
					onclick={() => navigateView('overview')}
					class="gap-gutter-xs sm:gap-gutter-sm flex shrink-0 cursor-pointer items-center rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
					aria-label="Sanku Overview"
				>
					<span class="bg-coral text-on-coral font-headline text-headline-md flex size-9 items-center justify-center rounded-full uppercase lg:size-10">
						S
					</span>
					<span class="font-headline text-headline-lg text-on-surface tracking-tight uppercase">
						SANKU
					</span>
				</button>

				<!-- Tablet Compact Inline Pill Nav (768px–1023px) -->
				<nav
					aria-label="Tablet Navigation"
					class="bg-surface-card border-outline-variant hidden items-center gap-1 rounded-full border p-1 md:flex lg:hidden"
				>
					{#each [
						{ id: 'overview', label: 'Overview' },
						{ id: 'transactions', label: 'Ledger' },
						{ id: 'accounts', label: 'Wallets' },
						{ id: 'split', label: 'Split' }
					] as tab (tab.id)}
						{@const isCurrent =
							tab.id === 'accounts'
								? activeView === 'accounts' || activeView === 'budgets'
								: activeView === tab.id}
						<button
							type="button"
							aria-current={isCurrent ? 'page' : undefined}
							onclick={() => navigateView(tab.id as WorkspaceView)}
							class={cn(
								'font-label text-label-sm cursor-pointer rounded-full px-3 py-1 whitespace-nowrap transition-colors duration-state-change',
								isCurrent
									? 'bg-pill-white text-on-pill-white'
									: 'text-on-surface-variant hover:text-on-surface'
							)}
						>
							{tab.label}
						</button>
					{/each}
				</nav>

				<!-- Desktop Full Pill Nav (1024px+) -->
				<nav
					aria-label="Primary Navigation"
					class="bg-surface-card border-outline-variant gap-gutter-xs hidden min-w-0 items-center rounded-full border p-1.5 lg:flex"
				>
					<button
						type="button"
						aria-current={activeView === 'overview' ? 'page' : undefined}
						onclick={() => navigateView('overview')}
						class={cn(
							'px-gutter-md font-label text-label-lg cursor-pointer rounded-full py-1.5 whitespace-nowrap transition-colors duration-state-change',
							activeView === 'overview'
								? 'bg-pill-white text-on-pill-white'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
					>
						Overview
					</button>
					<button
						type="button"
						aria-current={activeView === 'transactions' ? 'page' : undefined}
						onclick={() => navigateView('transactions')}
						class={cn(
							'px-gutter-md font-label text-label-lg cursor-pointer rounded-full py-1.5 whitespace-nowrap transition-colors duration-state-change',
							activeView === 'transactions'
								? 'bg-pill-white text-on-pill-white'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
					>
						Transactions
					</button>
					<button
						type="button"
						aria-current={activeView === 'accounts' || activeView === 'budgets' ? 'page' : undefined}
						onclick={() => navigateView('accounts')}
						class={cn(
							'px-gutter-md font-label text-label-lg cursor-pointer rounded-full py-1.5 whitespace-nowrap transition-colors duration-state-change',
							activeView === 'accounts' || activeView === 'budgets'
								? 'bg-pill-white text-on-pill-white'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
					>
						Accounts &amp; Budgets
					</button>
					<button
						type="button"
						aria-current={activeView === 'split' ? 'page' : undefined}
						onclick={() => navigateView('split', { splitTab: 'calculator' })}
						class={cn(
							'px-gutter-md font-label text-label-lg inline-flex cursor-pointer items-center gap-1.5 rounded-full py-1.5 whitespace-nowrap transition-colors duration-state-change',
							activeView === 'split'
								? 'bg-pill-white text-on-pill-white'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
					>
						<span>Beli Rame-rame</span>
						{#if splitBillOverview.openCount > 0}
							<span class="bg-coral text-on-coral font-label text-label-sm rounded-full px-2 py-0.5 tabular-nums uppercase">
								{splitBillOverview.openCount}
							</span>
						{:else}
							<span class="bg-marigold text-on-marigold font-label text-label-sm rounded-full px-2 py-0.5 uppercase">
								Split
							</span>
						{/if}
					</button>
				</nav>
			</div>

			<!-- Right: White Pill Month Switcher + New Entry + Settings + Avatar -->
			<div class="gap-gutter-xs sm:gap-gutter-sm flex shrink-0 items-center">
				<div class="bg-pill-white text-on-pill-white font-label text-label-sm lg:text-label-lg hidden items-center gap-0.5 rounded-full px-1.5 py-0.5 lg:px-2 lg:py-1 sm:flex">
					<a
						href={monthHref(shiftMonth(data.month, -1))}
						aria-label="Bulan sebelumnya"
						class="inline-flex size-7 items-center justify-center rounded-full transition-opacity hover:opacity-70"
					>
						<span class="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_left</span>
					</a>
					<form method="GET" action="/app" bind:this={monthForm} class="min-w-[88px] lg:min-w-[104px]">
						{#if activeView !== 'overview'}
							<input type="hidden" name="view" value={activeView} />
						{/if}
						<CustomSelect
							value={data.month}
							name="month"
							options={data.availableMonths.map((m) => ({ value: m.key, label: m.label }))}
							onchange={() => monthForm?.requestSubmit()}
							size="sm"
							variant="pill-white"
						/>
					</form>
					<a
						href={monthHref(shiftMonth(data.month, 1))}
						aria-label="Bulan berikutnya"
						class="inline-flex size-7 items-center justify-center rounded-full transition-opacity hover:opacity-70"
					>
						<span class="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_right</span>
					</a>
				</div>

				<button
					type="button"
					onclick={() => openCreate('expense')}
					class="gap-gutter-xs px-3 lg:px-gutter-md bg-primary text-on-primary font-label text-label-sm lg:text-label-lg inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full py-1.5 lg:py-2 whitespace-nowrap transition-opacity duration-state-change hover:opacity-90"
				>
					<span class="material-symbols-outlined text-[16px] lg:text-[18px]" aria-hidden="true">add</span>
					<span class="lg:hidden">Entry</span>
					<span class="hidden lg:inline">New Entry</span>
				</button>

				<button
					type="button"
					onclick={() => (showSettings = true)}
					aria-label="Open Settings and Google Drive Sync"
					title="Settings & Google Drive Sync"
					class="bg-surface-card border-outline-variant text-on-surface hover:bg-surface-container relative inline-flex size-9 lg:size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors duration-state-change"
				>
					<span class="material-symbols-outlined text-[18px] lg:text-[20px]" aria-hidden="true">tune</span>
					<span class="bg-income border-surface absolute top-1.5 right-1.5 size-2 rounded-full border" aria-hidden="true"></span>
				</button>

				<button
					type="button"
					onclick={() => (showSettings = true)}
					aria-label="Account menu"
					title={data.user.name}
					class="border-outline-variant bg-surface-card hover:bg-surface-container hidden size-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border transition-colors lg:inline-flex"
				>
					{#if data.user.picture}
						<img
							src={data.user.picture}
							alt=""
							referrerpolicy="no-referrer"
							class="size-full object-cover"
						/>
					{:else}
						<span class="bg-marigold text-on-marigold font-label text-label-sm flex size-full items-center justify-center">
							{initials}
						</span>
					{/if}
				</button>
			</div>
		</div>

		<!-- Mobile Row 2: Compact Month Switcher + Import (<sm) -->
		<div class="border-outline-variant bg-surface-container-low flex items-center justify-between gap-2 border-t px-4 py-2 sm:hidden">
			<div class="bg-pill-white text-on-pill-white inline-flex items-center rounded-full px-2 py-0.5">
				<a
					href={monthHref(shiftMonth(data.month, -1))}
					aria-label="Bulan sebelumnya"
					class="inline-flex size-7 items-center justify-center"
				>
					<span class="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_left</span>
				</a>
				<span class="font-headline text-headline-md px-2 uppercase tabular-nums">
					{shortMonthText}
				</span>
				<a
					href={monthHref(shiftMonth(data.month, 1))}
					aria-label="Bulan berikutnya"
					class="inline-flex size-7 items-center justify-center"
				>
					<span class="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_right</span>
				</a>
			</div>

			<button
				type="button"
				onclick={() => (showStatementImport = true)}
				class="bg-surface-card border-outline-variant font-label text-label-sm text-on-surface inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1.5 whitespace-nowrap"
			>
				<span class="material-symbols-outlined text-[15px]" aria-hidden="true">upload_file</span>
				<span>Import</span>
			</button>
		</div>
	</header>

	<!-- Main Bento Workspace -->
	<main class="px-gutter-md sm:px-gutter-lg gap-gutter-lg mx-auto flex w-full max-w-[1280px] flex-1 flex-col pt-5 pb-24 sm:pt-8 md:pb-8">
		{#if activeView === 'overview'}
			<!-- OVERVIEW VIEW (Stitch Editorial Pop) -->
			<div class="gap-gutter-md flex flex-wrap items-center justify-between">
				<div>
					<h1 class="font-display text-headline-lg sm:text-display-md text-on-surface uppercase">
						OVERVIEW &amp; CASHFLOW
					</h1>
					<p class="font-body text-body-md text-on-surface-variant">
						Ringkasan arus kas, likuiditas {walletBreakdown.length} dompet, dan detak pengeluaran {data.monthLabel}.
					</p>
				</div>

				<div class="gap-gutter-sm flex flex-wrap items-center">
					<button
						type="button"
						onclick={() => (showSettings = true)}
						class="bg-pill-white text-on-pill-white font-label text-label-lg flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 transition-opacity hover:opacity-90"
					>
						<span>{data.currency}</span>
						<span class="material-symbols-outlined text-[16px]" aria-hidden="true">expand_more</span>
					</button>
					<button
						type="button"
						onclick={() => (showStatementImport = true)}
						class="bg-surface-card border-outline-variant text-on-surface font-label text-label-lg hover:bg-surface-container flex cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 transition-colors"
					>
						<span class="material-symbols-outlined text-[16px]" aria-hidden="true">upload_file</span>
						<span>Import e-Statement</span>
					</button>
				</div>
			</div>

			<!-- Contextual Beli Rame-rame Receivable Banner -->
			{#if splitBillOverview.openCount > 0 && splitBillOverview.outstandingTotal > 0}
				<section class="bg-marigold text-on-marigold flex flex-col justify-between gap-3 rounded-xl px-6 py-4 sm:flex-row sm:items-center">
					<div class="flex items-center gap-3">
						<span class="bg-ink text-on-surface flex size-10 shrink-0 items-center justify-center rounded-full">
							<span class="material-symbols-outlined text-[20px]" aria-hidden="true">receipt_long</span>
						</span>
						<div>
							<p class="font-headline text-headline-md uppercase">
								Tagihan Beli Rame-rame ({splitBillOverview.openCount} sesi · {splitBillOverview.unpaidFriends} teman belum lunas)
							</p>
							<p class="font-body text-body-sm text-ink/80 tabular-nums">
								Total piutang menunggu transfer:
								<strong class="font-mono font-bold">
									{formatMoney(splitBillOverview.outstandingTotal, data.currency)}
								</strong>
							</p>
						</div>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onclick={() => navigateView('split', { splitTab: 'history' })}
							class="bg-pill-white text-on-pill-white font-label text-label-sm cursor-pointer rounded-full px-4 py-2 transition-opacity hover:opacity-90"
						>
							Check Settlements
						</button>
						<button
							type="button"
							onclick={() => navigateView('split', { splitTab: 'calculator' })}
							class="bg-ink text-on-surface font-label text-label-sm cursor-pointer rounded-full px-4 py-2 transition-opacity hover:opacity-90"
						>
							+ New Split
						</button>
					</div>
				</section>
			{/if}

			<!-- Row 1: Hero Coral KPI Card (5 cols) + Periwinkle Cashflow Dynamics Card (7 cols) -->
			<section aria-label="Cashflow Overview" class="gap-gutter-md grid grid-cols-12 items-stretch">
				<!-- Coral Hero KPI Card -->
				<article class="bg-coral text-on-coral gap-gutter-md col-span-12 flex flex-col justify-between rounded-xl p-6 lg:col-span-5">
					<div class="flex items-center justify-between gap-2">
						<span class="font-label text-label-sm font-bold tracking-wider uppercase">
							NET SURPLUS / DEFICIT
						</span>
						<div class="flex items-center gap-1.5">
							{#if netChange !== null}
								<span class="bg-sage-cream text-on-sage-cream font-mono text-mono-sm rounded-full px-2.5 py-0.5 tabular-nums">
									{netChange >= 0 ? '↑' : '↓'} {Math.abs(netChange).toFixed(1)}%
								</span>
							{/if}
							<span class="bg-ink text-on-surface font-mono text-mono-md rounded-full px-3 py-1 uppercase tabular-nums">
								{data.summary.net >= 0 ? 'SURPLUS' : 'DEFICIT'}
							</span>
						</div>
					</div>

					<div class="font-display text-display-md-mobile sm:text-display-md tabular-nums">
						{data.summary.net >= 0 ? '+' : ''}{formatMoney(data.summary.net, data.currency)}
					</div>

					<div class="gap-gutter-sm border-ink/15 grid grid-cols-2 border-t pt-3">
						<div class="bg-sage-cream text-on-sage-cream rounded-lg p-3.5">
							<div class="font-label text-label-sm uppercase">TOTAL INFLOW</div>
							<div class="font-title text-title-lg mt-1 tabular-nums">
								{formatMoney(data.summary.income, data.currency)}
							</div>
							{#if incomeChange !== null}
								<div class="font-mono text-ink/70 mt-0.5 text-[11px] tabular-nums">
									{incomeChange >= 0 ? '↑' : '↓'} {Math.abs(incomeChange).toFixed(1)}% vs lalu
								</div>
							{/if}
						</div>
						<div class="bg-sage-cream text-on-sage-cream rounded-lg p-3.5">
							<div class="font-label text-label-sm uppercase">TOTAL OUTFLOW</div>
							<div class="font-title text-title-lg mt-1 tabular-nums">
								{formatMoney(data.summary.expense, data.currency)}
							</div>
							{#if expenseChange !== null}
								<div class="font-mono text-ink/70 mt-0.5 text-[11px] tabular-nums">
									{expenseChange >= 0 ? '↑' : '↓'} {Math.abs(expenseChange).toFixed(1)}% vs lalu
								</div>
							{/if}
						</div>
					</div>

					<!-- 7-Day Outflow Bar Sparkline with Dark Pill Peak -->
					<div class="pt-2">
						<div class="mb-2 flex justify-center">
							<span class="bg-ink text-on-surface font-mono text-mono-sm rounded-full px-3 py-1 tabular-nums">
								Peak: {formatMoney(dailyPulseBars.peakVal, data.currency)}
							</span>
						</div>
						<div class="gap-gutter-sm grid h-24 grid-cols-7 items-end">
							{#each dailyPulseBars.bars as bar, idx (`d-${idx}-${bar.label}`)}
								<div class="flex h-full flex-col items-center justify-end gap-1">
									<div
										class={cn(
											'w-full rounded-md transition-all',
											bar.isPeak ? 'bg-ink' : 'bg-ink/20'
										)}
										style={`height: ${Math.max(12, Math.round(bar.heightPct * 0.72))}%`}
										title={`${bar.label}: ${formatMoney(bar.value, data.currency)}`}
									></div>
									<span class={cn('font-label text-label-sm', bar.isPeak && 'font-extrabold')}>
										{bar.label}
									</span>
								</div>
							{/each}
						</div>
					</div>
				</article>

				<!-- Periwinkle Cashflow Dynamics Card -->
				<div class="col-span-12 lg:col-span-7">
					<CashflowChart
						transactions={data.transactions}
						month={data.month}
						months={data.monthTotals}
						currency={data.currency}
					/>
				</div>
			</section>

			<!-- Row 2: Liquidity & Wallets (5) + Stacked Folder-Tab Budgets (4) + Sage Cream Pulse (3) -->
			<section aria-label="Wallets, Budgets, and Financial Pulse" class="gap-gutter-md grid grid-cols-12 items-stretch">
				<!-- Combined Balance & Wallets -->
				<article class="bg-surface-card border-outline-variant gap-gutter-md col-span-12 flex flex-col justify-between rounded-xl border p-5 sm:p-6 md:col-span-6 lg:col-span-5">
					<div class="flex items-center justify-between gap-2">
						<div>
							<h2 class="font-headline text-headline-lg text-on-surface uppercase">
								LIQUIDITY &amp; WALLETS
							</h2>
							<p class="font-body text-body-sm text-on-surface-variant">
								{walletBreakdown.length} dompet aktif tersambung
							</p>
						</div>
						<div class="flex items-center gap-1.5">
							<button
								type="button"
								onclick={() => {
									editingWallet = null;
									showWalletModal = true;
								}}
								class="bg-surface-container text-on-surface hover:bg-marigold hover:text-on-marigold font-label text-label-sm cursor-pointer rounded-full px-3 py-1.5 transition-colors"
							>
								+ Add
							</button>
							<button
								type="button"
								onclick={() => navigateView('accounts')}
								aria-label="Lihat semua dompet"
								class="bg-pill-white text-on-pill-white flex size-10 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-105"
							>
								<span class="material-symbols-outlined text-[18px]" aria-hidden="true">north_east</span>
							</button>
						</div>
					</div>

					<div class="bg-sky-mint text-on-sky-mint flex items-center justify-between gap-2 rounded-lg p-4">
						<div class="min-w-0">
							<div class="font-label text-label-sm uppercase">COMBINED BALANCE</div>
							<div class="font-headline text-headline-lg mt-0.5 truncate tabular-nums">
								{formatMoney(combinedBalance, data.currency)}
							</div>
						</div>
						<span class="bg-ink text-on-surface font-label text-label-sm shrink-0 rounded-full px-3 py-1">
							{walletBreakdown.length} {walletBreakdown.length === 1 ? 'Account' : 'Accounts'}
						</span>
					</div>

					<div class="gap-gutter-sm flex flex-col">
						{#if previewWallets.length === 0}
							<div class="bg-surface-container rounded-lg px-4 py-5 text-center">
								<p class="font-body text-body-sm text-on-surface-variant">
									Belum ada dompet. Tambahkan akun bank atau e-wallet pertama.
								</p>
							</div>
						{:else}
							{#each previewWallets as wallet, idx (wallet.id)}
								<button
									type="button"
									onclick={() => filterByWalletAndOpenLedger(wallet.name)}
									class="bg-surface-container hover:bg-surface-container/75 flex cursor-pointer items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors"
								>
									<div class="gap-gutter-sm flex min-w-0 items-center">
										<span
											class={cn('size-3 shrink-0 rounded-full', WALLET_DOT_TONES[idx % WALLET_DOT_TONES.length])}
											aria-hidden="true"
										></span>
										<div class="min-w-0">
											<span class="font-title text-title-md text-on-surface block truncate">
												{wallet.name}
											</span>
											<span class="font-body text-body-sm text-on-surface-variant">
												{wallet.count} {wallet.count === 1 ? 'tx' : 'txs'} · Filter
											</span>
										</div>
									</div>
									<span
										class={cn(
											'font-mono text-mono-md shrink-0 tabular-nums',
											wallet.balance < 0 ? 'text-coral' : 'text-on-surface'
										)}
									>
										{formatMoney(wallet.balance, data.currency)}
									</span>
								</button>
							{/each}
						{/if}
					</div>
				</article>

				<!-- Stacked Folder-Tab Budgets Card -->
				<div class="col-span-12 md:col-span-6 lg:col-span-4">
					<BudgetPanel
						budgets={data.budgets}
						currency={data.currency}
						onmanage={() => navigateView('budgets', { scrollTo: '#categories_and_budgets' })}
					/>
				</div>

				<!-- Sage Cream Financial Pulse Card -->
				<article class="bg-sage-cream text-on-sage-cream gap-gutter-md col-span-12 flex flex-col justify-between rounded-xl p-5 sm:p-6 lg:col-span-3">
					<div class="flex items-center justify-between gap-2">
						<h2 class="font-headline text-headline-lg uppercase">PULSE</h2>
						<span class="bg-ink text-on-surface font-label text-label-sm rounded-full px-3 py-1 uppercase tabular-nums">
							{expenses.length} TXS
						</span>
					</div>

					<div class="gap-gutter-sm grid grid-cols-2 lg:grid-cols-1">
						<div class="bg-ink/5 rounded-lg p-3">
							<div class="font-label text-label-sm text-ink/70 uppercase">LARGEST EXPENSE</div>
							{#if largestExpense}
								<div class="font-title text-title-lg mt-0.5 tabular-nums">
									{formatMoney(largestExpense.amount, data.currency)}
								</div>
								<div class="font-body text-body-sm text-ink/70 truncate">
									{largestExpense.description}
								</div>
							{:else}
								<div class="font-title text-title-lg mt-0.5">—</div>
								<div class="font-body text-body-sm text-ink/70">Belum ada pengeluaran</div>
							{/if}
						</div>

						<div class="bg-ink/5 rounded-lg p-3">
							<div class="font-label text-label-sm text-ink/70 uppercase">AVERAGE EXPENSE</div>
							<div class="font-title text-title-lg mt-0.5 tabular-nums">
								{formatMoney(averageExpense, data.currency)}
							</div>
						</div>

						<div class="bg-ink/5 rounded-lg p-3">
							<div class="font-label text-label-sm text-ink/70 uppercase">TOP CATEGORY</div>
							{#if mostUsedCategory}
								<div class="font-title text-title-md mt-0.5 truncate">
									{mostUsedCategory.category.emoji} {mostUsedCategory.category.name}
								</div>
								<div class="font-body text-body-sm text-ink/70 tabular-nums">
									{mostUsedCategory.count}x · {formatMoney(mostUsedCategory.amount, data.currency)}
								</div>
							{:else}
								<div class="font-title text-title-md mt-0.5">—</div>
							{/if}
						</div>

						<div class="bg-ink/5 rounded-lg p-3">
							<div class="font-label text-label-sm text-ink/70 uppercase">DAILY BURN</div>
							<div class="font-title text-title-lg mt-0.5 tabular-nums">
								{formatMoney(data.summary.dailyAverage, data.currency)}
							</div>
						</div>
					</div>
				</article>
			</section>

			<!-- Row 3: Savings Rate Highlight (5 cols) + Expense Distribution Donut (7 cols) -->
			<section aria-label="Savings Rate and Category Distribution" class="gap-gutter-md grid grid-cols-12 items-stretch">
				<article class="bg-surface-card border-outline-variant gap-gutter-md col-span-12 flex flex-col justify-between rounded-xl border p-6 lg:col-span-5">
					<div class="flex items-center justify-between gap-2">
						<div>
							<h2 class="font-headline text-headline-lg text-on-surface uppercase">SAVINGS RATE</h2>
							<p class="font-body text-body-sm text-on-surface-variant">
								Rasio tabungan bersih bulan {shortMonthText}
							</p>
						</div>
						<span class="bg-marigold text-on-marigold font-mono text-mono-sm rounded-full px-3 py-1 tabular-nums">
							{activeDays}d active
						</span>
					</div>

					<div class="space-y-3">
						<div class="font-display text-display-md-mobile sm:text-display-md text-on-surface tabular-nums">
							{data.summary.savingsRate === null ? '—' : `${Math.round(data.summary.savingsRate)}%`}
						</div>
						<div
							class="bg-surface h-3 w-full overflow-hidden rounded-full"
							role="progressbar"
							aria-valuenow={Math.min(100, Math.max(0, Math.round(data.summary.savingsRate ?? 0)))}
							aria-valuemin={0}
							aria-valuemax={100}
						>
							<div
								class="bg-income h-full rounded-full transition-all duration-300"
								style={`width:${Math.min(100, Math.max(0, data.summary.savingsRate ?? 0))}%`}
							></div>
						</div>
					</div>

					<div class="flex flex-wrap items-center justify-between gap-2 pt-2">
						<span class="font-body text-body-sm text-on-surface-variant">
							Target sehat: &ge; 20% dari pemasukan
						</span>
						<button
							type="button"
							onclick={() => navigateView('transactions')}
							class="bg-pill-white text-on-pill-white font-label text-label-sm inline-flex cursor-pointer items-center gap-1 rounded-full px-3.5 py-1.5 transition-opacity hover:opacity-90"
						>
							<span>Lihat Ledger</span>
							<span class="material-symbols-outlined text-[15px]" aria-hidden="true">north_east</span>
						</button>
					</div>
				</article>

				<div class="col-span-12 lg:col-span-7">
					<CategoryDonut
						items={data.categorySpending}
						currency={data.currency}
						monthLabel={shortMonthText}
					/>
				</div>
			</section>
		{:else if activeView === 'transactions'}
			<!-- TRANSACTIONS LEDGER VIEW (Stitch Editorial Pop) -->
			<div class="gap-gutter-md grid grid-cols-12 items-stretch">
				<div class="gap-gutter-md col-span-12 flex flex-col justify-between lg:col-span-7">
					<div class="flex flex-wrap items-end justify-between gap-3">
						<div>
							<h1 class="font-display text-headline-lg sm:text-display-md text-on-surface uppercase">
								TRANSACTIONS LEDGER
							</h1>
							<p class="font-body text-body-md text-on-surface-variant">
								Cari cepat dengan shortcut <code class="bg-surface-card rounded px-1.5 py-0.5 font-mono text-xs">/</code>, filter per dompet, atau ekspor CSV.
							</p>
						</div>

						<div class="flex flex-wrap items-center gap-2">
							<button
								type="button"
								onclick={() => openCreate('transfer')}
								class="bg-surface-card border-outline-variant font-label text-label-sm text-on-surface hover:bg-surface-container inline-flex cursor-pointer items-center gap-1 rounded-full border px-3.5 py-1.5 transition-colors"
							>
								<span class="material-symbols-outlined text-[16px]" aria-hidden="true">swap_horiz</span>
								<span>Transfer</span>
							</button>
							<button
								type="button"
								onclick={() => openCreate('expense')}
								class="bg-primary text-on-primary font-label text-label-sm inline-flex cursor-pointer items-center gap-1 rounded-full px-3.5 py-1.5 transition-opacity hover:opacity-90"
							>
								<span class="material-symbols-outlined text-[16px]" aria-hidden="true">add</span>
								<span>Add Entry</span>
							</button>
						</div>
					</div>

					<!-- Search & Export Floating Pill Bar -->
					<div class="bg-surface-card border-outline-variant gap-gutter-sm flex flex-wrap items-center rounded-full border p-2">
						<label class="gap-gutter-sm flex min-w-[200px] flex-1 items-center px-3">
							<span class="sr-only">Search transactions</span>
							<span class="material-symbols-outlined text-on-surface-variant text-[20px]" aria-hidden="true">
								search
							</span>
							<input
								bind:this={searchInputEl}
								bind:value={search}
								oninput={() => (page = 1)}
								type="search"
								placeholder="Search merchant, note, or category..."
								class="text-on-surface placeholder:text-on-surface-variant font-body text-body-md w-full border-0 bg-transparent p-0 outline-none focus:ring-0"
							/>
							{#if search}
								<button
									type="button"
									onclick={() => {
										search = '';
										page = 1;
									}}
									aria-label="Clear search"
									class="text-on-surface-variant hover:text-on-surface cursor-pointer"
								>
									<span class="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
								</button>
							{:else}
								<span class="bg-ink text-on-surface-variant font-mono text-mono-sm hidden rounded-full px-2 py-0.5 sm:inline-block">
									/
								</span>
							{/if}
						</label>

						<button
							type="button"
							onclick={exportToCSV}
							disabled={filteredTransactions.length === 0}
							class="bg-marigold text-on-marigold font-label text-label-sm inline-flex cursor-pointer items-center gap-1 rounded-full px-3.5 py-1.5 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
						>
							<span class="material-symbols-outlined text-[15px]" aria-hidden="true">download</span>
							<span>Export CSV</span>
						</button>
					</div>
				</div>

				<!-- Coral Quick Import Card -->
				<div class="bg-coral text-on-coral gap-gutter-md col-span-12 flex items-center justify-between rounded-xl p-6 lg:col-span-5">
					<div class="gap-gutter-xs flex flex-col">
						<span class="bg-ink text-on-surface font-label text-label-sm self-start rounded-full px-2.5 py-0.5 uppercase">
							E-STATEMENT
						</span>
						<h2 class="font-headline text-headline-lg mt-1 uppercase">IMPORT MUTASI PDF / CSV</h2>
						<p class="font-body text-body-sm text-ink/85">
							Krom, BCA, Mandiri, BNI, BRI, Jago &amp; SeaBank otomatis terbaca.
						</p>
					</div>
					<button
						type="button"
						onclick={() => (showStatementImport = true)}
						aria-label="Unggah mutasi e-Statement"
						class="bg-ink text-on-surface flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-105"
					>
						<span class="material-symbols-outlined text-[22px]" aria-hidden="true">upload_file</span>
					</button>
				</div>
			</div>

			<!-- Filter Pills & Select Controls -->
			<section
				aria-label="Transaction Filters"
				class="bg-surface-card border-outline-variant gap-gutter-sm flex flex-wrap items-center justify-between rounded-xl border p-3.5"
			>
				<div
					class="bg-ink inline-flex flex-wrap items-center gap-1 rounded-full p-1"
					role="tablist"
					aria-label="Transaction type"
				>
					{#each [
						{ id: 'all', label: 'All' },
						{ id: 'expense', label: 'Expenses' },
						{ id: 'income', label: 'Income' },
						{ id: 'transfer', label: 'Transfers' }
					] as tab (tab.id)}
						<button
							type="button"
							role="tab"
							aria-selected={filterType === tab.id}
							onclick={() => {
								filterType = tab.id as typeof filterType;
								page = 1;
							}}
							class={cn(
								'font-label text-label-sm cursor-pointer rounded-full px-3.5 py-1 transition-colors',
								filterType === tab.id
									? 'bg-pill-white text-on-pill-white'
									: 'text-on-surface-variant hover:text-on-surface'
							)}
						>
							{tab.label}
						</button>
					{/each}
				</div>

				<div class="gap-gutter-sm flex flex-wrap items-center">
					<Select.Root
						type="single"
						value={filterCategory}
						onValueChange={(v) => {
							filterCategory = v;
							page = 1;
						}}
					>
						<Select.Trigger
							aria-label="Filter by category"
							size="sm"
							class="w-auto min-w-[150px] max-w-[220px] px-3.5 py-1.5"
						>
							{#if filterCategory === 'all'}
								All Categories
							{:else}
								{@const activeFilterCategory = data.categories.find((cat) => cat.id === filterCategory)}
								{activeFilterCategory
									? `${activeFilterCategory.emoji} ${activeFilterCategory.name}`
									: 'All Categories'}
							{/if}
						</Select.Trigger>
						<Select.Content align="start">
							<Select.Item value="all" label="All Categories">All Categories</Select.Item>
							{#each data.categories as cat (cat.id)}
								<Select.Item value={cat.id} label={`${cat.emoji} ${cat.name}`}>
									{cat.emoji} {cat.name}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>

					<Select.Root
						type="single"
						value={filterAccount}
						onValueChange={(v) => {
							filterAccount = v;
							page = 1;
						}}
					>
						<Select.Trigger
							aria-label="Filter by account"
							size="sm"
							class="w-auto min-w-[135px] max-w-[210px] px-3.5 py-1.5"
						>
							{filterAccount === 'all' ? 'All Wallets' : filterAccount}
						</Select.Trigger>
						<Select.Content align="start">
							<Select.Item value="all" label="All Wallets">All Wallets</Select.Item>
							{#each walletBreakdown as w (w.id)}
								<Select.Item value={w.name} label={w.name}>{w.name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>

					{#if hasFilters}
						<button
							type="button"
							onclick={clearFilters}
							class="bg-coral text-on-coral font-label text-label-sm cursor-pointer rounded-full px-3 py-1.5 transition-opacity hover:opacity-90"
						>
							Reset
						</button>
					{/if}
				</div>
			</section>

			<!-- Summary Strip -->
			<div class="bg-surface-card border-outline-variant gap-gutter-sm flex flex-wrap items-center justify-between rounded-xl border px-5 py-3">
				<div class="flex flex-wrap items-center gap-2">
					<span class="font-label text-label-sm text-on-surface-variant uppercase">
						{filteredStats.count} {filteredStats.count === 1 ? 'TRANSACTION' : 'TRANSACTIONS'} · {data.monthLabel.toUpperCase()}
					</span>
					<span class="bg-income text-on-income font-mono text-mono-sm rounded-full px-2.5 py-0.5 tabular-nums">
						+{formatMoney(filteredStats.income, data.currency)}
					</span>
					<span class="bg-coral text-on-coral font-mono text-mono-sm rounded-full px-2.5 py-0.5 tabular-nums">
						-{formatMoney(filteredStats.expense, data.currency)}
					</span>
				</div>

				<div class="flex items-center gap-2">
					<span class="font-body text-body-sm text-on-surface-variant hidden sm:inline">{sortSummaryLabel}</span>
					<span class="bg-sky-mint text-on-sky-mint font-mono text-mono-md rounded-full px-3 py-1 tabular-nums">
						Net: {filteredStats.net >= 0 ? '+' : ''}{formatMoney(filteredStats.net, data.currency)}
					</span>
				</div>
			</div>

			<!-- Ledger Bento List or Empty State -->
			{#if sortedTransactions.length === 0}
				<div class="bg-surface-card border-outline-variant flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-14 text-center">
					<span class="bg-coral text-on-coral flex size-12 items-center justify-center rounded-full">
						<span class="material-symbols-outlined text-[24px]" aria-hidden="true">receipt_long</span>
					</span>
					{#if data.monthTransactions.length === 0}
						<h2 class="font-headline text-headline-md text-on-surface uppercase">
							Belum ada transaksi untuk {data.monthLabel}
						</h2>
						<p class="font-body text-body-sm text-on-surface-variant max-w-sm">
							Catat pemasukan atau pengeluaran pertamamu, atau impor mutasi e-Statement bank.
						</p>
						<button
							type="button"
							onclick={() => openCreate('expense')}
							class="bg-primary text-on-primary font-label text-label-lg mt-1 cursor-pointer rounded-full px-5 py-2.5 transition-opacity hover:opacity-90"
						>
							+ Record Transaction
						</button>
					{:else}
						<h2 class="font-headline text-headline-md text-on-surface uppercase">Tidak ada transaksi cocok</h2>
						<p class="font-body text-body-sm text-on-surface-variant">
							Coba ubah kata kunci pencarian atau reset filter yang aktif.
						</p>
						<button
							type="button"
							onclick={clearFilters}
							class="bg-pill-white text-on-pill-white font-label text-label-sm mt-1 cursor-pointer rounded-full px-4 py-2"
						>
							Clear Filters
						</button>
					{/if}
				</div>
			{:else}
				<TransactionsTable
					transactions={paginatedTransactions}
					currency={data.currency}
					{sortBy}
					{sortOrder}
					{categoryFor}
					onSort={toggleSort}
					onEdit={openEdit}
					onDuplicate={duplicateTransaction}
					onDelete={(transaction) => (deletingTransaction = transaction)}
					onFilterCategory={(catId) => {
						filterCategory = catId;
						page = 1;
					}}
					onFilterAccount={(acc) => {
						filterAccount = acc;
						page = 1;
					}}
					{page}
					{totalPages}
					{pageSize}
					totalItems={sortedTransactions.length}
					onPageChange={(nextPage) => (page = nextPage)}
					onPageSizeChange={(nextSize) => {
						pageSize = nextSize;
						page = 1;
					}}
				/>
			{/if}
		{:else if activeView === 'accounts' || activeView === 'budgets'}
			<!-- ACCOUNTS, CATEGORIES & MONTHLY BUDGETS VIEW -->
			<AccountsBudgetsView
				wallets={walletBreakdown}
				categories={data.categories}
				categorySpending={data.categorySpending}
				currency={data.currency}
				onAddWallet={() => {
					editingWallet = null;
					showWalletModal = true;
				}}
				onEditWallet={(wallet) => {
					editingWallet = wallet;
					showWalletModal = true;
				}}
				onTransfer={() => openCreate('transfer')}
				onFilterWallet={filterByWalletAndOpenLedger}
				onAddCategory={() => {
					editingCategory = null;
					showCategories = true;
				}}
				onEditCategory={(cat) => {
					editingCategory = cat;
					showCategories = true;
				}}
				onnotice={showToast}
			/>
		{:else if activeView === 'split'}
			<!-- BELI RAME-RAME WORKSPACE VIEW -->
			<SplitBillWorkspace
				splitBills={data.splitBills}
				categories={data.categories}
				wallets={data.wallets}
				currency={data.currency}
				today={data.today}
				userName={data.user.name}
				initialMode={splitInitialMode}
				onnotice={showToast}
			/>
		{/if}
	</main>

	<!-- Floating Action Button (Quick New Transaction Entry) -->
	{#if !showTransactionModal && !showCategories && !showWalletModal && !showStatementImport && !showSettings && !showLogoutConfirm && !deletingTransaction}
		<button
			type="button"
			onclick={() => openCreate('expense')}
			aria-label="Tambah transaksi baru"
			title="Tambah transaksi baru"
			class="bg-coral text-on-coral border-ink fixed right-4 bottom-24 z-35 flex size-14 cursor-pointer items-center justify-center rounded-full border-2 shadow-2xl transition-transform duration-150 hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none md:hidden"
		>
			<span class="material-symbols-outlined text-[26px]" aria-hidden="true">add</span>
		</button>
	{/if}

	<!-- Stitch Mobile Signature Floating Bottom Pill Nav (<md) -->
	<nav
		aria-label="Mobile Navigation"
		class="bg-surface-card/95 border-outline-variant fixed bottom-4 left-1/2 z-40 flex w-[min(358px,calc(100vw-2rem))] -translate-x-1/2 items-center justify-between rounded-full border px-3 py-2 shadow-2xl backdrop-blur-md md:hidden"
	>
		<button
			type="button"
			aria-label="Overview"
			aria-current={activeView === 'overview' ? 'page' : undefined}
			onclick={() => navigateView('overview')}
			class={cn(
				'flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors',
				activeView === 'overview'
					? 'bg-pill-white text-on-pill-white'
					: 'text-on-surface-variant hover:text-on-surface'
			)}
		>
			<span class="material-symbols-outlined text-[20px]" aria-hidden="true">home</span>
		</button>
		<button
			type="button"
			aria-label="Transactions"
			aria-current={activeView === 'transactions' ? 'page' : undefined}
			onclick={() => navigateView('transactions')}
			class={cn(
				'flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors',
				activeView === 'transactions'
					? 'bg-pill-white text-on-pill-white'
					: 'text-on-surface-variant hover:text-on-surface'
			)}
		>
			<span class="material-symbols-outlined text-[20px]" aria-hidden="true">receipt_long</span>
		</button>
		<button
			type="button"
			aria-label="Accounts & Budgets"
			aria-current={activeView === 'accounts' || activeView === 'budgets' ? 'page' : undefined}
			onclick={() => navigateView('accounts')}
			class={cn(
				'flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors',
				activeView === 'accounts' || activeView === 'budgets'
					? 'bg-pill-white text-on-pill-white'
					: 'text-on-surface-variant hover:text-on-surface'
			)}
		>
			<span class="material-symbols-outlined text-[20px]" aria-hidden="true">account_balance_wallet</span>
		</button>
		<button
			type="button"
			aria-label="Beli Rame-rame"
			aria-current={activeView === 'split' ? 'page' : undefined}
			onclick={() => navigateView('split', { splitTab: 'calculator' })}
			class={cn(
				'relative flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors',
				activeView === 'split'
					? 'bg-pill-white text-on-pill-white'
					: 'text-on-surface-variant hover:text-on-surface'
			)}
		>
			<span class="material-symbols-outlined text-[20px]" aria-hidden="true">group</span>
			{#if splitBillOverview.openCount > 0}
				<span
					class="bg-coral border-surface-card absolute top-2 right-2 size-2 rounded-full border"
					aria-hidden="true"
				></span>
			{/if}
		</button>
	</nav>
</div>

<!-- Transaction Entry / Edit Modal -->
{#if showTransactionModal}
	<TransactionModal
		transaction={editingTransaction}
		categories={data.categories}
		wallets={data.wallets}
		currency={data.currency}
		today={data.today}
		initialType={createInitialType}
		onclose={() => (showTransactionModal = false)}
	/>
{/if}

<!-- Categories & Budgets Modal -->
{#if showCategories}
	<CategoryManager
		categories={data.categories}
		currency={data.currency}
		initialEditCategory={editingCategory}
		onclose={() => {
			showCategories = false;
			editingCategory = null;
		}}
	/>
{/if}

<!-- Account / Wallet Modal -->
{#if showWalletModal}
	<WalletModal
		wallet={editingWallet}
		currency={data.currency}
		onclose={() => (showWalletModal = false)}
	/>
{/if}

<!-- e-Statement Import Modal -->
{#if showStatementImport}
	<StatementImportModal
		categories={data.categories}
		wallets={data.wallets}
		currency={data.currency}
		onclose={() => (showStatementImport = false)}
		onimported={(count) => {
			showToast(
				`Imported ${count} ${count === 1 ? 'transaction' : 'transactions'} directly to your Google Sheet.`
			);
		}}
	/>
{/if}

<!-- Toast Notification -->
{#if toastNotice}
	<div
		class="bg-income text-on-income fixed bottom-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-full px-5 py-3 text-sm font-semibold shadow-2xl"
		role="status"
	>
		<span class="material-symbols-outlined shrink-0 text-[18px]" aria-hidden="true">check_circle</span>
		<p class="font-body text-body-sm flex-1 font-semibold">{toastNotice}</p>
		<button
			type="button"
			aria-label="Dismiss notice"
			onclick={() => (toastNotice = null)}
			class="bg-ink text-on-surface inline-flex size-6 cursor-pointer items-center justify-center rounded-full"
		>
			<span class="material-symbols-outlined text-[15px]" aria-hidden="true">close</span>
		</button>
	</div>
{/if}

<!-- Settings & Sync Right Slide-Over Drawer -->
<SettingsSheet
	open={showSettings}
	user={data.user}
	currency={data.currency}
	theme={data.theme}
	sheetUrl={data.sheetUrl}
	onclose={() => (showSettings = false)}
	onmanagecategories={() => {
		showSettings = false;
		navigateView('budgets', { scrollTo: '#categories_and_budgets' });
	}}
	onmanageaccounts={() => {
		showSettings = false;
		navigateView('accounts');
	}}
	onlogout={() => {
		showSettings = false;
		showLogoutConfirm = true;
	}}
/>

<!-- Hidden Forms for Actions -->
<form
	method="POST"
	action="?/delete"
	bind:this={deleteTxForm}
	use:enhance={() => {
		return async ({ update }) => {
			isDeletingTx = false;
			deletingTransaction = null;
			await update({ reset: false });
		};
	}}
>
	<input type="hidden" name="id" value={deletingTransaction?.id ?? ''} />
</form>

<form method="POST" action="/auth/logout" bind:this={logoutForm}></form>

<!-- Delete Transaction Confirm Dialog -->
<ConfirmDialog
	open={deletingTransaction !== null}
	title="Delete Transaction?"
	message={`Are you sure you want to delete "${deletingTransaction?.description}" (${deletingTransaction ? formatMoney(deletingTransaction.amount, data.currency) : ''})? This action cannot be undone.`}
	confirmLabel="Delete Transaction"
	cancelLabel="Cancel"
	variant="danger"
	icon="delete"
	loading={isDeletingTx}
	onconfirm={executeDeleteTransaction}
	oncancel={() => (deletingTransaction = null)}
/>

<!-- Logout Confirm Dialog -->
<ConfirmDialog
	open={showLogoutConfirm}
	title="Sign out of Sanku?"
	message="Are you sure you want to sign out? You will need to sign in again with your Google account to access your workspace."
	confirmLabel="Sign Out"
	cancelLabel="Cancel"
	variant="primary"
	icon="logout"
	loading={isLoggingOut}
	onconfirm={executeLogout}
	oncancel={() => (showLogoutConfirm = false)}
/>
