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
		formatMoney,
		getTransferDestination,
		monthLabel,
		percentChange,
		shiftMonth
	} from '#lib/finance.ts';
	import { calculateSplitBill } from '#lib/split-bill.ts';
	import { cn } from '#lib/utils.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
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
</script>

<svelte:window onkeydown={handleKeyDown} />

<svelte:head>
	<title>{data.monthLabel} — Sanku Finance</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if bannerError}
	<div
		class="bg-expense-container border-expense/30 text-on-expense-container fixed bottom-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-md border px-4 py-3 text-sm shadow-lg"
		role="alert"
	>
		<span class="material-symbols-outlined shrink-0 text-[18px]" aria-hidden="true">error</span>
		<p class="font-body text-body-sm flex-1 font-medium">{bannerError}</p>
		<button
			type="button"
			aria-label="Dismiss error"
			onclick={() => (dismissedError = message?.error ?? null)}
			class="hover:bg-expense/15 inline-flex size-6 cursor-pointer items-center justify-center rounded"
		>
			<span class="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
		</button>
	</div>
{/if}

<div class="bg-surface text-on-surface flex min-h-screen flex-col" data-theme={data.theme}>
	<!-- Topbar Navigation (64px Desktop + 3-Row Compact Mobile) -->
	<header class="bg-surface-card border-outline sticky top-0 z-30 border-b">
		<!-- Row 1: Brand, Desktop Primary Nav, Right Actions -->
		<div class="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-2 px-3 sm:px-gutter-md lg:h-16 lg:gap-gutter-md lg:px-gutter-lg">
			<!-- Left: Brand + Desktop Nav -->
			<div class="flex min-w-0 items-center gap-gutter-lg">
				<button
					type="button"
					onclick={() => navigateView('overview')}
					class="focus-visible:ring-primary flex shrink-0 cursor-pointer items-center gap-2 rounded focus-visible:ring-2 focus-visible:outline-none"
					aria-label="Sanku Overview"
				>
					<span
						class="bg-accent-orange text-on-primary flex size-8 items-center justify-center rounded shadow-xs"
						aria-hidden="true"
					>
						<svg
							class="size-4"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
						</svg>
					</span>
					<span class="font-headline text-headline-md text-on-surface tracking-tight">Sanku</span>
				</button>

				<nav aria-label="Primary Navigation" class="hidden items-center gap-1 lg:flex">
					<button
						type="button"
						aria-current={activeView === 'overview' ? 'page' : undefined}
						onclick={() => navigateView('overview')}
						class={cn(
							'font-label text-label-md cursor-pointer rounded px-3 py-1.5 whitespace-nowrap transition-colors duration-state-change',
							activeView === 'overview'
								? 'bg-primary-container text-on-primary-container'
								: 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
						)}
					>
						Overview
					</button>
					<button
						type="button"
						aria-current={activeView === 'transactions' ? 'page' : undefined}
						onclick={() => navigateView('transactions')}
						class={cn(
							'font-label text-label-md cursor-pointer rounded px-3 py-1.5 whitespace-nowrap transition-colors duration-state-change',
							activeView === 'transactions'
								? 'bg-primary-container text-on-primary-container'
								: 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
						)}
					>
						Transactions
					</button>
					<button
						type="button"
						aria-current={activeView === 'budgets' ? 'page' : undefined}
						onclick={() => navigateView('budgets', { scrollTo: '#categories_and_budgets' })}
						class={cn(
							'font-label text-label-md cursor-pointer rounded px-3 py-1.5 whitespace-nowrap transition-colors duration-state-change',
							activeView === 'budgets'
								? 'bg-primary-container text-on-primary-container'
								: 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
						)}
					>
						Budgets
					</button>
					<button
						type="button"
						aria-current={activeView === 'accounts' ? 'page' : undefined}
						onclick={() => navigateView('accounts')}
						class={cn(
							'font-label text-label-md cursor-pointer rounded px-3 py-1.5 whitespace-nowrap transition-colors duration-state-change',
							activeView === 'accounts'
								? 'bg-primary-container text-on-primary-container'
								: 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
						)}
					>
						Accounts
					</button>
					<button
						type="button"
						aria-current={activeView === 'split' ? 'page' : undefined}
						onclick={() => navigateView('split', { splitTab: 'calculator' })}
						class={cn(
							'font-label text-label-md inline-flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 whitespace-nowrap transition-colors duration-state-change',
							activeView === 'split'
								? 'bg-primary-container text-on-primary-container'
								: 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
						)}
					>
						<span>Beli Rame-rame</span>
						{#if splitBillOverview.openCount > 0}
							<span class="bg-warning-container text-on-warning-container font-label text-[11px] rounded-full px-1.5 py-0 tabular-nums">
								{splitBillOverview.openCount}
							</span>
						{:else}
							<span
								class={cn(
									'border-outline font-label text-[11px] rounded-full border px-1.5 py-0',
									activeView === 'split'
										? 'bg-surface-card text-on-primary-container'
										: 'bg-surface-container-low text-on-surface-variant'
								)}
							>
								Split
							</span>
						{/if}
					</button>
				</nav>
			</div>

			<!-- Right: Month Switcher (Desktop/Tablet) + Import + New Entry + Settings + Avatar -->
			<div class="flex shrink-0 items-center gap-1.5 sm:gap-gutter-sm">
				<!-- Desktop Month Switcher -->
				<div class="bg-surface-card border-outline hidden shrink-0 items-center overflow-hidden rounded border sm:inline-flex">
					<a
						href={monthHref(shiftMonth(data.month, -1))}
						aria-label="Previous month"
						class="text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface inline-flex h-8 w-7 items-center justify-center transition-colors"
					>
						<span class="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_left</span>
					</a>
					<form method="GET" action="/app" bind:this={monthForm} class="min-w-[106px]">
						{#if activeView !== 'overview'}
							<input type="hidden" name="view" value={activeView} />
						{/if}
						<CustomSelect
							value={data.month}
							name="month"
							options={data.availableMonths.map((m) => ({ value: m.key, label: m.label }))}
							onchange={() => monthForm?.requestSubmit()}
							size="sm"
							variant="ghost"
						/>
					</form>
					<a
						href={monthHref(shiftMonth(data.month, 1))}
						aria-label="Next month"
						class="text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface inline-flex h-8 w-7 items-center justify-center transition-colors"
					>
						<span class="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_right</span>
					</a>
				</div>

				<!-- Desktop Import Button -->
				<button
					type="button"
					onclick={() => (showStatementImport = true)}
					class="bg-surface-card border-outline font-label text-label-md text-on-surface hover:bg-surface-container-low hidden cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 whitespace-nowrap transition-colors duration-state-change xl:inline-flex"
				>
					<span class="material-symbols-outlined text-on-surface-variant text-[17px]" aria-hidden="true">
						upload_file
					</span>
					<span>Import</span>
				</button>

				<!-- Primary CTA: + New Entry -->
				<button
					type="button"
					onclick={() => openCreate('expense')}
					class="bg-primary text-on-primary font-label text-label-sm sm:text-label-md focus-visible:ring-primary inline-flex shrink-0 cursor-pointer items-center justify-center gap-1 rounded px-2.5 py-1.5 whitespace-nowrap transition-opacity duration-state-change hover:opacity-95 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:px-3.5"
				>
					<span class="material-symbols-outlined text-[16px] sm:text-[17px]" aria-hidden="true">add</span>
					<span>New Entry</span>
				</button>

				<!-- Settings & Drive Sync Trigger -->
				<button
					type="button"
					onclick={() => (showSettings = true)}
					aria-label="Open Settings and Google Drive Sync"
					title="Settings & Google Drive Sync"
					class="border-outline bg-surface-card hover:bg-surface-container-low inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded border px-2 py-1.5 transition-colors duration-state-change sm:px-2.5"
				>
					<span class="bg-income size-2 shrink-0 rounded-full" aria-hidden="true"></span>
					<span class="material-symbols-outlined text-on-surface-variant text-[17px] sm:text-[18px]" aria-hidden="true">
						settings
					</span>
				</button>

				<!-- User Avatar Trigger -->
				<button
					type="button"
					onclick={() => (showSettings = true)}
					aria-label="Account menu"
					title={data.user.name}
					class="border-outline bg-surface-card hover:bg-surface-container-low inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border p-0.5 transition-colors duration-state-change sm:py-1 sm:pr-1.5 sm:pl-1"
				>
					{#if data.user.picture}
						<img
							src={data.user.picture}
							alt=""
							referrerpolicy="no-referrer"
							class="size-7 rounded-full object-cover"
						/>
					{:else}
						<span class="bg-primary-container text-on-primary-container font-label text-label-sm flex size-7 items-center justify-center rounded-full">
							{initials}
						</span>
					{/if}
					<span class="material-symbols-outlined text-on-surface-variant hidden text-[16px] sm:inline-flex" aria-hidden="true">
						expand_more
					</span>
				</button>
			</div>
		</div>

		<!-- Mobile Row 2: Month Switcher + Import (<sm) -->
		<div class="border-outline bg-surface-container-high flex items-center justify-between gap-2 border-t px-3 py-2 sm:hidden">
			<div class="bg-surface-card border-outline inline-flex items-center overflow-hidden rounded border">
				<a
					href={monthHref(shiftMonth(data.month, -1))}
					aria-label="Previous month"
					class="text-on-surface-variant hover:bg-surface-container-low inline-flex size-7 items-center justify-center"
				>
					<span class="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_left</span>
				</a>
				<span class="font-label text-label-sm text-on-surface px-2.5 whitespace-nowrap tabular-nums">
					{data.monthLabel}
				</span>
				<a
					href={monthHref(shiftMonth(data.month, 1))}
					aria-label="Next month"
					class="text-on-surface-variant hover:bg-surface-container-low inline-flex size-7 items-center justify-center"
				>
					<span class="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_right</span>
				</a>
			</div>

			<button
				type="button"
				onclick={() => (showStatementImport = true)}
				class="bg-surface-card border-outline font-label text-label-sm text-on-surface inline-flex cursor-pointer items-center gap-1 rounded border px-2.5 py-1 whitespace-nowrap"
			>
				<span class="material-symbols-outlined text-on-surface-variant text-[15px]" aria-hidden="true">
					upload_file
				</span>
				<span>Import</span>
			</button>
		</div>

		<!-- Mobile Row 3: Horizontal Nav Pills (<lg) -->
		<nav
			aria-label="Mobile Navigation"
			class="border-outline bg-surface-card flex items-center gap-1 overflow-x-auto border-t px-3 py-1.5 lg:hidden"
		>
			{#each [
				{ id: 'overview', label: 'Overview' },
				{ id: 'transactions', label: 'Transactions' },
				{ id: 'budgets', label: 'Budgets' },
				{ id: 'accounts', label: 'Accounts' },
				{ id: 'split', label: 'Beli Rame-rame' }
			] as tab (tab.id)}
				<button
					type="button"
					aria-current={activeView === tab.id ? 'page' : undefined}
					onclick={() =>
						navigateView(tab.id as WorkspaceView, {
							scrollTo: tab.id === 'budgets' ? '#categories_and_budgets' : undefined
						})}
					class={cn(
						'font-label text-label-sm shrink-0 cursor-pointer rounded px-2.5 py-1 whitespace-nowrap transition-colors',
						activeView === tab.id
							? 'bg-primary-container text-on-primary-container'
							: 'text-on-surface-variant hover:text-on-surface'
					)}
				>
					{tab.label}
				</button>
			{/each}
		</nav>
	</header>

	<!-- Main Workspace Content -->
	<main class="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-gutter-lg p-gutter-md lg:p-gutter-lg">
		{#if activeView === 'overview'}
			<!-- OVERVIEW VIEW (Stitch Screen 1) -->
			<div class="flex flex-wrap items-baseline justify-between gap-gutter-sm">
				<div>
					<h1 class="font-headline text-headline-md text-on-surface sm:text-headline-lg">Overview</h1>
					<p class="font-body text-body-sm text-on-surface-variant sm:text-body-md">
						Monthly cashflow, wallet liquidity, and spending pulse for {data.monthLabel}.
					</p>
				</div>
			</div>

			<!-- Contextual Beli Rame-rame Receivable Banner -->
			{#if splitBillOverview.openCount > 0 && splitBillOverview.outstandingTotal > 0}
				<section class="bg-warning-container border-warning/30 flex flex-col justify-between gap-3 rounded-md border px-gutter-md py-3 sm:flex-row sm:items-center">
					<div class="flex items-center gap-3">
						<span class="material-symbols-outlined text-on-warning-container text-[22px]" aria-hidden="true">
							receipt_long
						</span>
						<div>
							<p class="font-title text-title-md text-on-warning-container">
								Unsettled Beli Rame-rame ({splitBillOverview.openCount} {splitBillOverview.openCount === 1 ? 'session' : 'sessions'} · {splitBillOverview.unpaidFriends} {splitBillOverview.unpaidFriends === 1 ? 'friend' : 'friends'})
							</p>
							<p class="font-body text-body-sm text-on-warning-container/90 tabular-nums">
								Pending friend repayments:
								<strong class="font-semibold">
									{formatMoney(splitBillOverview.outstandingTotal, data.currency)}
								</strong>
							</p>
						</div>
					</div>
					<div class="flex items-center gap-2">
						<button
							type="button"
							onclick={() => navigateView('split', { splitTab: 'history' })}
							class="bg-surface-card border-outline font-label text-label-sm text-on-surface hover:bg-surface-container-low cursor-pointer rounded border px-3 py-1.5"
						>
							Check Settlements
						</button>
						<button
							type="button"
							onclick={() => navigateView('split', { splitTab: 'calculator' })}
							class="bg-primary text-on-primary font-label text-label-sm cursor-pointer rounded px-3 py-1.5 hover:opacity-95"
						>
							+ New Split
						</button>
					</div>
				</section>
			{/if}

			<!-- Section 1: KPI Summary Row (2x2 mobile, 4-col desktop) -->
			<section aria-label="Key Performance Indicators" class="grid grid-cols-2 items-stretch gap-2.5 sm:gap-gutter-md xl:grid-cols-4">
				<!-- Card 1: Net Surplus / Deficit -->
				<article class="bg-surface-card border-outline flex h-full flex-col justify-between gap-gutter-sm rounded-md border p-3 sm:p-gutter-md">
					<header class="flex items-center justify-between gap-1.5">
						<h2 class="font-label text-label-sm text-on-surface-variant sm:text-label-md">
							Net Surplus / Deficit
						</h2>
						<span
							role="status"
							class={cn(
								'font-label text-label-sm inline-flex items-center rounded-full px-2 py-0.5',
								data.summary.net >= 0
									? 'bg-income-container text-on-income-container'
									: 'bg-expense-container text-on-expense-container'
							)}
						>
							{data.summary.net >= 0 ? 'Surplus' : 'Deficit'}
						</span>
					</header>
					<div class="flex flex-col gap-gutter-xs">
						<p
							class={cn(
								'font-headline text-headline-md sm:text-headline-lg tabular-nums',
								data.summary.net >= 0 ? 'text-on-income-container' : 'text-on-expense-container'
							)}
						>
							{data.summary.net >= 0 ? '+' : ''}{formatMoney(data.summary.net, data.currency)}
						</p>
						<p class="font-body text-body-sm text-on-surface-variant truncate tabular-nums">
							{#if netChange !== null}
								<span class={netChange >= 0 ? 'text-on-income-container font-semibold' : 'text-on-expense-container font-semibold'}>
									{netChange >= 0 ? '↑' : '↓'} {Math.abs(netChange).toFixed(1)}%
								</span>
								vs last month
							{:else}
								vs last month
							{/if}
						</p>
					</div>
				</article>

				<!-- Card 2: Total Inflow -->
				<article class="bg-surface-card border-outline flex h-full flex-col justify-between gap-gutter-sm rounded-md border p-3 sm:p-gutter-md">
					<header class="flex items-center justify-between gap-1.5">
						<h2 class="font-label text-label-sm text-on-surface-variant sm:text-label-md">
							Total Inflow
						</h2>
						<span class="material-symbols-outlined text-on-income-container text-[18px]" aria-hidden="true">
							south_west
						</span>
					</header>
					<div class="flex flex-col gap-gutter-xs">
						<p class="font-headline text-headline-md text-on-surface sm:text-headline-lg tabular-nums">
							{formatMoney(data.summary.income, data.currency)}
						</p>
						<p class="font-body text-body-sm text-on-surface-variant truncate tabular-nums">
							{#if incomeChange !== null}
								<span class={incomeChange >= 0 ? 'text-on-income-container font-semibold' : 'text-on-expense-container font-semibold'}>
									{incomeChange >= 0 ? '↑' : '↓'} {Math.abs(incomeChange).toFixed(1)}%
								</span>
								vs {formatMoney(data.summary.previousIncome, data.currency)}
							{:else}
								vs last month
							{/if}
						</p>
					</div>
				</article>

				<!-- Card 3: Total Outflow -->
				<article class="bg-surface-card border-outline flex h-full flex-col justify-between gap-gutter-sm rounded-md border p-3 sm:p-gutter-md">
					<header class="flex items-center justify-between gap-1.5">
						<h2 class="font-label text-label-sm text-on-surface-variant sm:text-label-md">
							Total Outflow
						</h2>
						<span class="material-symbols-outlined text-on-expense-container text-[18px]" aria-hidden="true">
							north_east
						</span>
					</header>
					<div class="flex flex-col gap-gutter-xs">
						<p class="font-headline text-headline-md text-on-surface sm:text-headline-lg tabular-nums">
							{formatMoney(data.summary.expense, data.currency)}
						</p>
						<p class="font-body text-body-sm text-on-surface-variant truncate tabular-nums">
							{#if expenseChange !== null}
								<span class={expenseChange <= 0 ? 'text-on-income-container font-semibold' : 'text-on-expense-container font-semibold'}>
									{expenseChange >= 0 ? '↑' : '↓'} {Math.abs(expenseChange).toFixed(1)}%
								</span>
								vs {formatMoney(data.summary.previousExpense, data.currency)}
							{:else}
								vs last month
							{/if}
						</p>
					</div>
				</article>

				<!-- Card 4: Savings Rate -->
				<article class="bg-surface-card border-outline flex h-full flex-col justify-between gap-gutter-sm rounded-md border p-3 sm:p-gutter-md">
					<header class="flex items-center justify-between gap-1.5">
						<h2 class="font-label text-label-sm text-on-surface-variant sm:text-label-md">
							Savings Rate
						</h2>
						<span class="bg-surface-container-low font-mono text-mono-sm text-on-surface-variant rounded-full px-2 py-0.5 tabular-nums">
							{activeDays}d active
						</span>
					</header>
					<div class="flex flex-col gap-gutter-sm">
						<p class="font-headline text-headline-md text-on-surface sm:text-headline-lg tabular-nums">
							{data.summary.savingsRate === null ? '—' : `${Math.round(data.summary.savingsRate)}%`}
						</p>
						<div
							class="bg-surface-container-low h-1.5 w-full overflow-hidden rounded-full"
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
				</article>
			</section>

			<!-- Section 2: Liquidity & Accounts Strip -->
			<section aria-label="Liquidity and Accounts" class="flex flex-col gap-gutter-md">
				<div class="flex flex-wrap items-center justify-between gap-gutter-sm">
					<h2 class="font-title text-title-md text-on-surface sm:text-title-lg">
						Liquidity &amp; Accounts
					</h2>
					<div class="flex items-center gap-gutter-sm">
						<button
							type="button"
							onclick={() => navigateView('accounts')}
							class="bg-surface-card border-outline font-label text-label-sm sm:text-label-md text-on-surface hover:bg-surface-container-low cursor-pointer rounded border px-3 py-1.5 transition-colors duration-state-change"
						>
							View All ({walletBreakdown.length})
						</button>
						<button
							type="button"
							onclick={() => {
								editingWallet = null;
								showWalletModal = true;
							}}
							class="bg-surface-card border-outline font-label text-label-sm sm:text-label-md text-primary hover:bg-primary-container/40 inline-flex cursor-pointer items-center gap-1 rounded border px-3 py-1.5 transition-colors duration-state-change"
						>
							+ Add Account
						</button>
					</div>
				</div>

				<div class="grid grid-cols-1 items-stretch gap-gutter-md sm:grid-cols-2 xl:grid-cols-4">
					<!-- Dark Combined Balance Card -->
					<article class="bg-on-surface text-surface-card border-on-surface flex h-full flex-col justify-between gap-gutter-md rounded-md border p-gutter-md">
						<header class="flex items-center justify-between">
							<span class="font-label text-label-md text-surface-card/80">Combined Balance</span>
							<span class="material-symbols-outlined text-accent-orange text-[20px]" aria-hidden="true">
								account_balance
							</span>
						</header>
						<div class="flex flex-col gap-gutter-xs">
							<p class="font-headline text-headline-lg text-surface-card tabular-nums">
								{formatMoney(combinedBalance, data.currency)}
							</p>
							<p class="font-body text-body-sm text-surface-card/70">
								Across {walletBreakdown.length} {walletBreakdown.length === 1 ? 'account' : 'accounts'}
							</p>
						</div>
					</article>

					<!-- Top 3 Interactive Wallet Cards -->
					{#each previewWallets as wallet (wallet.id)}
						<button
							type="button"
							onclick={() => filterByWalletAndOpenLedger(wallet.name)}
							class="bg-surface-card border-outline hover:border-outline-variant flex h-full cursor-pointer flex-col justify-between gap-gutter-md rounded-md border p-gutter-md text-left transition-colors duration-state-change"
						>
							<header class="flex w-full items-center justify-between gap-gutter-sm">
								<span class="font-title text-title-md text-on-surface truncate">{wallet.name}</span>
								<span
									class="size-2.5 shrink-0 rounded-full"
									style={`background:${wallet.color || '#E9762B'}`}
									aria-hidden="true"
								></span>
							</header>
							<div class="flex flex-col gap-gutter-xs">
								<p
									class={cn(
										'font-headline text-headline-md tabular-nums',
										wallet.balance < 0 ? 'text-on-expense-container' : 'text-on-surface'
									)}
								>
									{formatMoney(wallet.balance, data.currency)}
								</p>
								<p class="font-body text-body-sm text-on-surface-variant tabular-nums">
									{wallet.count} {wallet.count === 1 ? 'tx' : 'txs'} · Filter
								</p>
							</div>
						</button>
					{/each}
				</div>
			</section>

			<!-- Section 3: Analytics Row (60% / 40% -> 7 / 5 cols) -->
			<section aria-label="Cashflow and Expense Analytics" class="grid grid-cols-1 items-stretch gap-gutter-md lg:grid-cols-12">
				<div class="lg:col-span-7">
					<CashflowChart
						transactions={data.transactions}
						month={data.month}
						months={data.monthTotals}
						currency={data.currency}
					/>
				</div>

				<div class="lg:col-span-5">
					<CategoryDonut
						items={data.categorySpending}
						currency={data.currency}
						monthLabel={shortMonthText}
					/>
				</div>
			</section>

			<!-- Section 4: Budgets & Financial Pulse Row (50% / 50%) -->
			<section aria-label="Monthly Budgets and Financial Pulse" class="grid grid-cols-1 items-stretch gap-gutter-md lg:grid-cols-2">
				<BudgetPanel
					budgets={data.budgets}
					currency={data.currency}
					onmanage={() => navigateView('budgets', { scrollTo: '#categories_and_budgets' })}
				/>

				<!-- Financial Pulse (2x2 stat tiles) -->
				<article class="bg-surface-card border-outline flex h-full flex-col justify-between gap-gutter-md rounded-md border p-gutter-md">
					<header class="flex items-center justify-between">
						<h2 class="font-title text-title-lg text-on-surface">Financial Pulse</h2>
						<span class="font-body text-body-sm text-on-surface-variant">
							{shortMonthText} insights
						</span>
					</header>

					<div class="grid flex-1 grid-cols-2 gap-gutter-sm">
						<div class="bg-surface-container-high border-outline flex flex-col justify-between gap-1 rounded border p-3 sm:p-3.5">
							<span class="font-label text-label-sm text-on-surface-variant">Largest Expense</span>
							{#if largestExpense}
								<p class="font-headline text-headline-md text-on-surface tabular-nums">
									{formatMoney(largestExpense.amount, data.currency)}
								</p>
								<span class="font-body text-body-sm text-on-surface-variant truncate">
									{largestExpense.description}
								</span>
							{:else}
								<p class="font-headline text-headline-md text-on-surface">—</p>
								<span class="font-body text-body-sm text-on-surface-variant">No recorded outflow</span>
							{/if}
						</div>

						<div class="bg-surface-container-high border-outline flex flex-col justify-between gap-1 rounded border p-3 sm:p-3.5">
							<span class="font-label text-label-sm text-on-surface-variant">Average Expense</span>
							<p class="font-headline text-headline-md text-on-surface tabular-nums">
								{formatMoney(averageExpense, data.currency)}
							</p>
							<span class="font-body text-body-sm text-on-surface-variant">
								Across {expenses.length} {expenses.length === 1 ? 'transaction' : 'transactions'}
							</span>
						</div>

						<div class="bg-surface-container-high border-outline flex flex-col justify-between gap-1 rounded border p-3 sm:p-3.5">
							<span class="font-label text-label-sm text-on-surface-variant">Top Category</span>
							{#if mostUsedCategory}
								<p class="font-headline text-headline-md text-on-surface truncate">
									{mostUsedCategory.category.emoji} {mostUsedCategory.category.name}
								</p>
								<span class="font-body text-body-sm text-on-surface-variant tabular-nums">
									{mostUsedCategory.count} times ({formatMoney(mostUsedCategory.amount, data.currency)})
								</span>
							{:else}
								<p class="font-headline text-headline-md text-on-surface">—</p>
								<span class="font-body text-body-sm text-on-surface-variant">No category activity</span>
							{/if}
						</div>

						<div class="bg-surface-container-high border-outline flex flex-col justify-between gap-1 rounded border p-3 sm:p-3.5">
							<span class="font-label text-label-sm text-on-surface-variant">Daily Average Burn</span>
							<p class="font-headline text-headline-md text-on-surface tabular-nums">
								{formatMoney(data.summary.dailyAverage, data.currency)}
							</p>
							<span class="font-body text-body-sm text-on-surface-variant">Per day this month</span>
						</div>
					</div>
				</article>
			</section>
		{:else if activeView === 'transactions'}
			<!-- TRANSACTIONS LEDGER VIEW (Stitch Screen 2) -->
			<div class="flex flex-wrap items-center justify-between gap-gutter-md">
				<div class="flex items-center gap-gutter-sm">
					<h1 class="font-headline text-headline-lg text-on-surface">Transactions</h1>
					<span
						role="status"
						class="bg-surface-container-low border-outline font-label text-label-sm text-on-surface-variant inline-flex items-center rounded-full border px-2.5 py-0.5 tabular-nums"
					>
						{filteredTransactions.length} {filteredTransactions.length === 1 ? 'entry' : 'entries'}
					</span>
				</div>

				<div class="flex flex-wrap items-center gap-gutter-sm">
					<button
						type="button"
						onclick={() => (showStatementImport = true)}
						class="bg-surface-card border-outline font-label text-label-md text-on-surface hover:bg-surface-container-low inline-flex cursor-pointer items-center gap-1.5 rounded border px-3 py-2 transition-colors duration-state-change"
					>
						<span class="material-symbols-outlined text-on-surface-variant text-[18px]" aria-hidden="true">
							description
						</span>
						<span>Import e-Statement (PDF/CSV)</span>
					</button>
					<button
						type="button"
						onclick={exportToCSV}
						disabled={filteredTransactions.length === 0}
						class="bg-surface-card border-outline font-label text-label-md text-on-surface hover:bg-surface-container-low inline-flex cursor-pointer items-center gap-1.5 rounded border px-3 py-2 transition-colors duration-state-change disabled:opacity-45"
					>
						<span class="material-symbols-outlined text-on-surface-variant text-[18px]" aria-hidden="true">
							download
						</span>
						<span>Export CSV</span>
					</button>
					<button
						type="button"
						onclick={() => openCreate('transfer')}
						class="bg-surface-card border-outline font-label text-label-md text-on-surface hover:bg-surface-container-low inline-flex cursor-pointer items-center gap-1.5 rounded border px-3 py-2 transition-colors duration-state-change"
					>
						<span class="material-symbols-outlined text-on-surface-variant text-[18px]" aria-hidden="true">
							swap_horiz
						</span>
						<span>Transfer</span>
					</button>
					<button
						type="button"
						onclick={() => openCreate('expense')}
						class="bg-primary text-on-primary font-label text-label-md inline-flex cursor-pointer items-center gap-1.5 rounded px-3.5 py-2 transition-opacity duration-state-change hover:opacity-95"
					>
						<span class="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
						<span>Add Entry</span>
					</button>
				</div>
			</div>

			<!-- Filter Toolbar Card -->
			<section
				aria-label="Transaction Filters"
				class="bg-surface-card border-outline flex flex-wrap items-center justify-between gap-gutter-sm rounded-md border p-3"
			>
				<label class="min-w-[220px] flex-1">
					<span class="sr-only">Search transactions</span>
					<div class="relative flex items-center">
						<span class="text-on-surface-variant pointer-events-none absolute left-3" aria-hidden="true">
							<span class="material-symbols-outlined text-[18px]">search</span>
						</span>
						<input
							bind:this={searchInputEl}
							bind:value={search}
							oninput={() => (page = 1)}
							type="search"
							placeholder="Search description, account, note..."
							class="border-outline bg-surface-container-high font-body text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:bg-surface-card focus:ring-primary w-full rounded border py-1.5 pr-10 pl-9 outline-none focus:ring-1"
						/>
						{#if search}
							<button
								type="button"
								onclick={() => {
									search = '';
									page = 1;
								}}
								aria-label="Clear search"
								class="text-on-surface-variant hover:text-on-surface absolute right-2.5 cursor-pointer"
							>
								<span class="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
							</button>
						{:else}
							<span class="bg-surface-card border-outline font-mono text-mono-sm text-on-surface-variant pointer-events-none absolute right-2.5 hidden rounded border px-1.5 py-0.5 sm:inline-block">
								/
							</span>
						{/if}
					</div>
				</label>

				<div class="flex flex-wrap items-center gap-gutter-sm">
					<div
						class="bg-surface-container-low border-outline inline-flex items-center rounded border p-0.5"
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
									'font-label text-label-sm cursor-pointer rounded-sm px-3 py-1 transition-colors',
									filterType === tab.id
										? 'bg-surface-card text-on-surface shadow-xs'
										: 'text-on-surface-variant hover:text-on-surface'
								)}
							>
								{tab.label}
							</button>
						{/each}
					</div>

					<select
						aria-label="Filter by category"
						bind:value={filterCategory}
						onchange={() => (page = 1)}
						class="border-outline bg-surface-card font-label text-label-md text-on-surface focus:border-primary focus:ring-primary rounded border px-3 py-1.5 outline-none focus:ring-1"
					>
						<option value="all">All Categories</option>
						{#each data.categories as cat (cat.id)}
							<option value={cat.id}>{cat.emoji} {cat.name}</option>
						{/each}
					</select>

					<select
						aria-label="Filter by account"
						bind:value={filterAccount}
						onchange={() => (page = 1)}
						class="border-outline bg-surface-card font-label text-label-md text-on-surface focus:border-primary focus:ring-primary rounded border px-3 py-1.5 outline-none focus:ring-1"
					>
						<option value="all">All Accounts</option>
						{#each walletBreakdown as w (w.id)}
							<option value={w.name}>{w.name}</option>
						{/each}
					</select>

					{#if hasFilters}
						<button
							type="button"
							onclick={clearFilters}
							class="font-label text-label-sm text-primary cursor-pointer px-2 py-1 hover:underline"
						>
							Reset
						</button>
					{/if}
				</div>
			</section>

			<!-- Summary Strip -->
			<div class="bg-surface-card border-outline flex flex-wrap items-center justify-between gap-gutter-sm rounded-md border px-gutter-md py-2.5">
				<p class="font-body text-body-md text-on-surface-variant tabular-nums">
					<strong class="text-on-surface font-semibold">
						{filteredStats.count} {filteredStats.count === 1 ? 'entry' : 'entries'}
					</strong>
					· Inflow:
					<strong class="text-on-income-container font-semibold">
						+{formatMoney(filteredStats.income, data.currency)}
					</strong>
					· Outflow:
					<strong class="text-on-expense-container font-semibold">
						-{formatMoney(filteredStats.expense, data.currency)}
					</strong>
					· Net:
					<strong
						class={cn(
							'font-semibold',
							filteredStats.net < 0 ? 'text-on-expense-container' : 'text-on-surface'
						)}
					>
						{filteredStats.net >= 0 ? '+' : ''}{formatMoney(filteredStats.net, data.currency)}
					</strong>
				</p>
				<span class="font-body text-body-sm text-on-surface-variant">{sortSummaryLabel}</span>
			</div>

			<!-- Ledger Table or Empty State -->
			{#if sortedTransactions.length === 0}
				<div class="bg-surface-card border-outline flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-14 text-center">
					<span class="material-symbols-outlined text-on-surface-variant text-[30px]" aria-hidden="true">
						receipt_long
					</span>
					{#if data.monthTransactions.length === 0}
						<h2 class="font-title text-title-md text-on-surface">
							No transactions recorded for {data.monthLabel}
						</h2>
						<p class="font-body text-body-sm text-on-surface-variant">
							Log your first income or expense entry, or import a bank e-Statement.
						</p>
						<button
							type="button"
							onclick={() => openCreate('expense')}
							class="bg-primary text-on-primary font-label text-label-md mt-2 cursor-pointer rounded px-4 py-2 hover:opacity-95"
						>
							+ Record Transaction
						</button>
					{:else}
						<h2 class="font-title text-title-md text-on-surface">No matching transactions</h2>
						<p class="font-body text-body-sm text-on-surface-variant">
							Try adjusting your search query or clearing active filters.
						</p>
						<button
							type="button"
							onclick={clearFilters}
							class="bg-surface-card border-outline font-label text-label-sm text-on-surface hover:bg-surface-container-low mt-2 cursor-pointer rounded border px-3 py-1.5"
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
			<!-- ACCOUNTS, CATEGORIES & MONTHLY BUDGETS VIEW (Stitch Screen 3) -->
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
			<!-- BELI RAME-RAME WORKSPACE VIEW (Stitch Screen 4) -->
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
		class="bg-income-container border-income/30 text-on-income-container fixed bottom-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-md border px-4 py-3 text-sm shadow-lg"
		role="status"
	>
		<span class="material-symbols-outlined shrink-0 text-[18px]" aria-hidden="true">check_circle</span>
		<p class="font-body text-body-sm flex-1 font-medium">{toastNotice}</p>
		<Button
			variant="ghost"
			size="icon-sm"
			class="text-on-income-container size-6"
			aria-label="Dismiss notice"
			onclick={() => (toastNotice = null)}
		>
			<span class="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
		</Button>
	</div>
{/if}

<!-- Settings & Sync Right Slide-Over Drawer (Stitch Screen 5) -->
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
