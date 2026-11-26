<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import type { CategorySpend, Transaction, TransactionType, Wallet } from '#lib/types.ts';
	import {
		formatMoney,
		getTransferDestination,
		percentChange,
		shiftMonth
	} from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Progress } from '#lib/components/ui/progress/index.ts';
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
	import AccountsListModal from '#lib/components/AccountsListModal.svelte';

	let { data, form }: PageProps = $props();

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

	let previewWallets = $derived(walletBreakdown.slice(0, 3));

	type FormState = { error?: string; action?: string; id?: string | null; success?: boolean; importedCount?: number };
	let message = $derived(form as FormState | null);

	let showTransactionModal = $state(false);
	let editingTransaction = $state<Transaction | null>(null);
	let showCategories = $state(false);
	let showWalletModal = $state(false);
	let editingWallet = $state<Wallet | null>(null);
	let showAccountsList = $state(false);
	let showStatementImport = $state(false);
	let importNotice = $state<string | null>(null);
	let showSettings = $state(false);

	let showUserMenu = $state(false);
	let userMenuEl = $state<HTMLDivElement | null>(null);
	let showLogoutConfirm = $state(false);
	let isLoggingOut = $state(false);
	let logoutForm = $state<HTMLFormElement | null>(null);

	let deletingTransaction = $state<Transaction | null>(null);
	let isDeletingTx = $state(false);
	let deleteTxForm = $state<HTMLFormElement | null>(null);

	let monthForm: HTMLFormElement | null = $state(null);

	let filterType = $state<'all' | 'income' | 'expense' | 'transfer'>('all');
	let filterCategory = $state('all');
	let search = $state('');
	let sortBy = $state<'date' | 'description' | 'category' | 'account' | 'amount'>('date');
	let sortOrder = $state<'asc' | 'desc'>('desc');
	let page = $state(1);
	let pageSize = $state<number>(25);
	let searchInputEl = $state<HTMLInputElement | null>(null);

	let dismissedError = $state<string | null>(null);
	let createInitialType = $state<TransactionType>('expense');

	function handleWindowClick(event: MouseEvent) {
		if (showUserMenu && userMenuEl && !userMenuEl.contains(event.target as Node)) {
			showUserMenu = false;
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (showUserMenu) showUserMenu = false;
			if (document.activeElement === searchInputEl) {
				if (search) search = '';
				else searchInputEl?.blur();
			}
		} else if (
			event.key === '/' &&
			document.activeElement?.tagName !== 'INPUT' &&
			document.activeElement?.tagName !== 'TEXTAREA' &&
			!showTransactionModal &&
			!showCategories &&
			!showWalletModal &&
			!showAccountsList &&
			!showStatementImport &&
			!showSettings &&
			!showLogoutConfirm &&
			!deletingTransaction
		) {
			event.preventDefault();
			searchInputEl?.focus();
		}
	}

	function toggleSort(column: 'date' | 'description' | 'category' | 'account' | 'amount') {
		if (sortBy === column) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = column;
			sortOrder = column === 'description' || column === 'category' || column === 'account' ? 'asc' : 'desc';
		}
		page = 1;
	}

	function duplicateTransaction(transaction: Transaction) {
		editingTransaction = {
			...transaction,
			id: '',
			date: data.today
		};
		createInitialType = transaction.type;
		showTransactionModal = true;
	}

	function exportToCSV() {
		if (filteredTransactions.length === 0) return;
		const headers = ['Date', 'Type', 'Description', 'Category', 'Account', 'Destination Account', 'Amount', 'Currency', 'Notes'];
		const rows = filteredTransactions.map((t) => {
			const cat = t.type === 'transfer' ? 'Transfer' : (categoryMap.get(t.categoryId)?.name ?? 'Uncategorized');
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
		const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent([headers.join(','), ...rows.map((r) => r.join(','))].join('\n'));
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
			if (!needle) return true;

			const category = categoryMap.get(transaction.categoryId);

			return [transaction.description, transaction.account, transaction.notes, category?.name ?? '']
				.join(' ')
				.toLowerCase()
				.includes(needle);
		});
	});

	let incomeChange = $derived(
		percentChange(data.summary.income, data.summary.previousIncome)
	);
	let expenseChange = $derived(
		percentChange(data.summary.expense, data.summary.previousExpense)
	);
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

	let hasFilters = $derived(filterType !== 'all' || filterCategory !== 'all' || search.trim() !== '');

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
				const catA = a.type === 'transfer' ? 'Transfer' : (categoryMap.get(a.categoryId)?.name ?? 'Uncategorized');
				const catB = b.type === 'transfer' ? 'Transfer' : (categoryMap.get(b.categoryId)?.name ?? 'Uncategorized');
				result = catA.localeCompare(catB);
			} else if (sortBy === 'account') {
				result = (a.account || '').localeCompare(b.account || '');
			}
			return sortOrder === 'asc' ? result : -result;
		});
	});

	let totalPages = $derived(pageSize > 0 ? Math.max(1, Math.ceil(sortedTransactions.length / pageSize)) : 1);

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

	function openCreate(initial: TransactionType = 'expense') {
		editingTransaction = null;
		createInitialType = initial;
		showTransactionModal = true;
	}

	function openEdit(transaction: Transaction) {
		editingTransaction = transaction;
		showTransactionModal = true;
	}

	function clearFilters() {
		filterType = 'all';
		filterCategory = 'all';
		search = '';
		page = 1;
	}

	function categoryFor(transaction: Transaction) {
		return categoryMap.get(transaction.categoryId) ?? null;
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeyDown} />

<svelte:head>
	<title>{data.monthLabel} — Sanku Finance</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if bannerError}
	<div
		class="fixed bottom-20 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-lg sm:bottom-6"
		role="alert"
	>
		<span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">!</span>
		<p class="flex-1 font-medium">{bannerError}</p>
		<Button
			variant="ghost"
			size="icon-sm"
			class="size-7 text-rose-700 hover:bg-rose-100"
			aria-label="Dismiss error"
			onclick={() => (dismissedError = message?.error ?? null)}
		>
			×
		</Button>
	</div>
{/if}

<div class="bg-background text-foreground min-h-screen" data-theme={data.theme}>
	<!-- Top Sticky App Bar -->
	<header class="border-border bg-card/85 sticky top-0 z-40 border-b backdrop-blur-md">
		<div class="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
			<div class="flex min-w-0 items-center gap-3 sm:gap-4">
				<a class="flex shrink-0 items-center gap-2.5" href="/app" aria-label="Sanku Home">
					<svg class="size-8 shrink-0" viewBox="0 0 32 32" aria-hidden="true">
						<rect width="32" height="32" rx="9" fill="var(--primary, #0f172a)" />
						<path
							d="M8.5 22.5V14M14 22.5V8.5M19.5 22.5V16.5M25 22.5V11"
							stroke="#ffffff"
							stroke-width="2.2"
							stroke-linecap="round"
						/>
						<circle cx="25" cy="22.5" r="2.2" fill="#10b981" />
					</svg>
					<span class="hidden text-base font-bold tracking-tight sm:inline">Sanku</span>
				</a>

				<!-- Month Selector Pill -->
				<div class="border-border bg-muted/50 flex items-center gap-0.5 rounded-lg border p-0.5">
					<Button
						variant="ghost"
						size="icon-sm"
						class="size-7"
						href={`/app?month=${shiftMonth(data.month, -1)}`}
						aria-label="Previous month"
						title="Previous month"
					>
						<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M10 12L6 8l4-4" />
						</svg>
					</Button>
					<form method="GET" action="/app" bind:this={monthForm} class="min-w-[116px] sm:min-w-[136px]">
						<CustomSelect
							value={data.month}
							name="month"
							options={data.availableMonths.map((m) => ({ value: m.key, label: m.label }))}
							onchange={() => monthForm?.requestSubmit()}
							size="sm"
							variant="ghost"
						/>
					</form>
					<Button
						variant="ghost"
						size="icon-sm"
						class="size-7"
						href={`/app?month=${shiftMonth(data.month, 1)}`}
						aria-label="Next month"
						title="Next month"
					>
						<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M6 4l4 4-4 4" />
						</svg>
					</Button>
				</div>

				<!-- Desktop Quick Navigation -->
				<nav class="hidden items-center gap-1 lg:flex" aria-label="Quick Navigation">
					<Button variant="secondary" size="sm" href="/app">Overview</Button>
					<Button variant="ghost" size="sm" href="#transactions-section">Transactions</Button>
					<Button variant="ghost" size="sm" onclick={() => (showCategories = true)}>Budgets</Button>
					<Button variant="ghost" size="sm" href="#analytics-section">Analytics</Button>
					<Button
						variant="ghost"
						size="sm"
						onclick={() => (showAccountsList = true)}
					>
						Accounts
					</Button>
				</nav>
			</div>

			<div class="flex shrink-0 items-center gap-2">
				<a
					class="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors md:inline-flex"
					href={data.sheetUrl}
					target="_blank"
					rel="noreferrer"
					title="Open spreadsheet in Google Drive"
				>
					<span class="size-1.5 animate-pulse rounded-full bg-emerald-600"></span>
					<span>Google Sheet</span>
					<svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true">
						<path d="M4.5 2.5h7v7M11.5 2.5 3 11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</a>

				<Button
					variant="outline"
					size="sm"
					onclick={() => (showSettings = true)}
					title="Open settings & preferences"
					aria-label="Open settings"
				>
					<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<circle cx="10" cy="10" r="3" />
						<path d="M16.2 8.4a1.3 1.3 0 0 0 .3 1.5 8.3 8.3 0 0 1 0 1.2 1.3 1.3 0 0 0-.3 1.5l.1.1a1.4 1.4 0 0 1-1.1 2.3h-.2a1.3 1.3 0 0 0-1.3.9 8.2 8.2 0 0 1-.9.9 1.3 1.3 0 0 0-.4 1.5l.1.2a1.4 1.4 0 0 1-2 1.2l-.2-.1a1.3 1.3 0 0 0-1.5.3 8.3 8.3 0 0 1-1.2 0 1.3 1.3 0 0 0-1.5-.3l-.1.1a1.4 1.4 0 0 1-2.3-1.1v-.2a1.3 1.3 0 0 0-.9-1.3 8.2 8.2 0 0 1-.9-.9 1.3 1.3 0 0 0-1.5-.4l-.2.1a1.4 1.4 0 0 1-1.2-2l.1-.2a1.3 1.3 0 0 0-.3-1.5 8.3 8.3 0 0 1 0-1.2 1.3 1.3 0 0 0 .3-1.5l-.1-.1a1.4 1.4 0 0 1 1.1-2.3h.2a1.3 1.3 0 0 0 1.3-.9 8.2 8.2 0 0 1 .9-.9 1.3 1.3 0 0 0 .4-1.5l-.1-.2a1.4 1.4 0 0 1 2-1.2l.2.1a1.3 1.3 0 0 0 1.5-.3 8.3 8.3 0 0 1 1.2 0 1.3 1.3 0 0 0 1.5.3l.1-.1a1.4 1.4 0 0 1 2.3 1.1v.2a1.3 1.3 0 0 0 .9 1.3 8.2 8.2 0 0 1 .9.9 1.3 1.3 0 0 0 1.5.4l.2-.1a1.4 1.4 0 0 1 1.2 2l-.1.2z" />
					</svg>
					<span class="hidden sm:inline">Settings</span>
				</Button>

				<div class="relative" bind:this={userMenuEl}>
					<Button
						variant="outline"
						size="sm"
						class="gap-2 px-2"
						onclick={() => (showUserMenu = !showUserMenu)}
						title="Account options"
						aria-haspopup="menu"
						aria-expanded={showUserMenu}
					>
						{#if data.user.picture}
							<img src={data.user.picture} alt="" referrerpolicy="no-referrer" class="size-5 rounded-full object-cover" />
						{:else}
							<span class="bg-muted flex size-5 items-center justify-center rounded-full text-[10px] font-bold">
								{initials}
							</span>
						{/if}
						<span class="hidden max-w-[110px] truncate text-xs font-medium sm:inline">{data.user.name}</span>
						<svg class="text-muted-foreground size-3" viewBox="0 0 16 16" aria-hidden="true">
							<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
					</Button>

					{#if showUserMenu}
						<div
							class="bg-popover text-popover-foreground border-border absolute top-[calc(100%+6px)] right-0 z-50 flex w-56 flex-col rounded-xl border p-1.5 shadow-xl"
							role="menu"
						>
							<div class="px-2.5 py-2">
								<strong class="block truncate text-xs font-semibold">{data.user.name}</strong>
								<span class="text-muted-foreground block truncate text-[11px]">{data.user.email}</span>
							</div>
							<div class="bg-border my-1 h-px"></div>
							<button
								type="button"
								class="hover:bg-accent flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors"
								onclick={() => {
									showUserMenu = false;
									showSettings = true;
								}}
							>
								<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
									<circle cx="10" cy="10" r="3" />
									<path d="M16.2 8.4a1.3 1.3 0 0 0 .3 1.5 8.3 8.3 0 0 1 0 1.2 1.3 1.3 0 0 0-.3 1.5l.1.1a1.4 1.4 0 0 1-1.1 2.3h-.2a1.3 1.3 0 0 0-1.3.9 8.2 8.2 0 0 1-.9.9 1.3 1.3 0 0 0-.4 1.5l.1.2a1.4 1.4 0 0 1-2 1.2l-.2-.1a1.3 1.3 0 0 0-1.5.3 8.3 8.3 0 0 1-1.2 0 1.3 1.3 0 0 0-1.5-.3l-.1.1a1.4 1.4 0 0 1-2.3-1.1v-.2a1.3 1.3 0 0 0-.9-1.3 8.2 8.2 0 0 1-.9-.9 1.3 1.3 0 0 0-1.5-.4l-.2.1a1.4 1.4 0 0 1-1.2-2l.1-.2a1.3 1.3 0 0 0-.3-1.5 8.3 8.3 0 0 1 0-1.2 1.3 1.3 0 0 0 .3-1.5l-.1-.1a1.4 1.4 0 0 1 1.1-2.3h.2a1.3 1.3 0 0 0 1.3-.9 8.2 8.2 0 0 1 .9-.9 1.3 1.3 0 0 0 .4-1.5l-.1-.2a1.4 1.4 0 0 1 2-1.2l.2.1a1.3 1.3 0 0 0 1.5-.3 8.3 8.3 0 0 1 1.2 0 1.3 1.3 0 0 0 1.5.3l.1-.1a1.4 1.4 0 0 1 2.3 1.1v.2a1.3 1.3 0 0 0 .9 1.3 8.2 8.2 0 0 1 .9.9 1.3 1.3 0 0 0 1.5.4l.2-.1a1.4 1.4 0 0 1 1.2 2l-.1.2z" />
								</svg>
								<span>Settings</span>
							</button>
							<button
								type="button"
								class="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50"
								onclick={() => {
									showUserMenu = false;
									showLogoutConfirm = true;
								}}
							>
								<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
									<path d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5v9A1.5 1.5 0 0 0 4.5 15H7M11.5 12.5 15 9l-3.5-3.5M7.5 9H15" />
								</svg>
								<span>Sign out</span>
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</header>

	<!-- Main Cockpit Workspace -->
	<main class="mx-auto flex max-w-7xl flex-col gap-4 px-4 pt-4 pb-20 sm:px-6 sm:pb-10">
		<!-- Month Title & Quick Summary -->
		<section class="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
			<div class="space-y-0.5">
				<h1 class="text-xl font-bold tracking-tight sm:text-2xl">{data.monthLabel}</h1>
				<p class="text-muted-foreground text-xs">
					Real-time ledger synced with Google Drive · {filteredTransactions.length} recorded this month
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<Button variant="outline" size="sm" onclick={() => (showStatementImport = true)}>
					Import e-Statement
				</Button>
				<Button variant="outline" size="sm" onclick={() => (showCategories = true)}>
					Manage Budgets
				</Button>
				<Button variant="outline" size="sm" onclick={() => openCreate('transfer')}>
					⇄ Transfer
				</Button>
				<Button size="sm" onclick={() => openCreate('expense')}>
					+ New Entry
				</Button>
			</div>
		</section>

		<!-- Hero Financial Command Grid (Bento) -->
		<section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
			<!-- Net Surplus -->
			<Card.Root class={cn('flex flex-col justify-between gap-1.5 p-3.5', data.summary.net < 0 && 'border-rose-200 bg-rose-50/30')}>
				<div class="flex items-center justify-between gap-1.5">
					<span class="text-muted-foreground text-xs font-medium">Net Surplus</span>
					<Badge variant={data.summary.net >= 0 ? 'success' : 'destructive'} class="px-2 py-0 text-[10px]">
						{data.summary.net >= 0 ? '✓ Surplus' : '⚠ Deficit'}
					</Badge>
				</div>
				<div
					class={cn(
						'text-lg font-bold leading-tight tracking-tight tabular-nums sm:text-xl',
						data.summary.net >= 0 ? 'text-emerald-700' : 'text-rose-600'
					)}
				>
					{data.summary.net >= 0 ? '+' : ''}{formatMoney(data.summary.net, data.currency)}
				</div>
				<div class="flex flex-wrap items-center gap-1 text-[11px]">
					{#if netChange !== null}
						<span class={cn('font-semibold tabular-nums', netChange >= 0 ? 'text-emerald-700' : 'text-rose-600')}>
							{netChange >= 0 ? '↑' : '↓'} {Math.abs(netChange).toFixed(1)}%
						</span>
						<span class="text-muted-foreground truncate">vs {formatMoney(data.summary.previousNet, data.currency)}</span>
					{:else}
						<span class="text-muted-foreground">Initial month</span>
					{/if}
				</div>
			</Card.Root>

			<!-- Total Inflow -->
			<Card.Root class="flex flex-col justify-between gap-1.5 p-3.5">
				<div class="flex items-center justify-between gap-1.5">
					<span class="text-muted-foreground text-xs font-medium">Total Inflow</span>
					{#if incomeChange !== null}
						<Badge variant={incomeChange >= 0 ? 'success' : 'destructive'} class="px-2 py-0 text-[10px] tabular-nums">
							{incomeChange >= 0 ? '↑' : '↓'} {Math.abs(incomeChange).toFixed(1)}%
						</Badge>
					{/if}
				</div>
				<div class="text-lg font-bold leading-tight tracking-tight tabular-nums sm:text-xl">
					{formatMoney(data.summary.income, data.currency)}
				</div>
				<p class="text-muted-foreground truncate text-[11px]">
					{#if incomeChange !== null}
						vs {formatMoney(data.summary.previousIncome, data.currency)} prev
					{:else}
						No previous record
					{/if}
				</p>
			</Card.Root>

			<!-- Total Outflow -->
			<Card.Root class="flex flex-col justify-between gap-1.5 p-3.5">
				<div class="flex items-center justify-between gap-1.5">
					<span class="text-muted-foreground text-xs font-medium">Total Outflow</span>
					{#if expenseChange !== null}
						<Badge variant={expenseChange <= 0 ? 'success' : 'destructive'} class="px-2 py-0 text-[10px] tabular-nums">
							{expenseChange >= 0 ? '↑' : '↓'} {Math.abs(expenseChange).toFixed(1)}%
						</Badge>
					{/if}
				</div>
				<div class="text-lg font-bold leading-tight tracking-tight tabular-nums sm:text-xl">
					{formatMoney(data.summary.expense, data.currency)}
				</div>
				<p class="text-muted-foreground truncate text-[11px]">
					{#if expenseChange !== null}
						vs {formatMoney(data.summary.previousExpense, data.currency)} prev
					{:else}
						No previous record
					{/if}
				</p>
			</Card.Root>

			<!-- Savings Rate -->
			<Card.Root class="flex flex-col justify-between gap-1.5 p-3.5">
				<div class="flex items-center justify-between gap-1.5">
					<span class="text-muted-foreground text-xs font-medium">Savings Rate</span>
					<span class="text-muted-foreground text-[11px]">{activeDays}d active</span>
				</div>
				<div class="text-lg font-bold leading-tight tracking-tight tabular-nums sm:text-xl">
					{data.summary.savingsRate === null ? '—' : `${Math.round(data.summary.savingsRate)}%`}
				</div>
				<Progress value={Math.min(100, Math.max(0, data.summary.savingsRate ?? 0))} max={100} class="h-1.5" />
			</Card.Root>
		</section>

		<!-- Accounts & Wallets Hub -->
		<section id="accounts-section">
			<Card.Root>
				<Card.Header class="flex flex-col justify-between gap-2 pb-2.5 sm:flex-row sm:items-center">
					<div>
						<span class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
							Liquidity & Accounts
						</span>
						<Card.Title class="text-base">Accounts & Wallets</Card.Title>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<Button variant="outline" size="sm" onclick={() => (showAccountsList = true)}>
							View All ({walletBreakdown.length})
						</Button>
						<Button variant="outline" size="sm" onclick={() => openCreate('transfer')}>
							⇄ Transfer Funds
						</Button>
						<Button
							variant="secondary"
							size="sm"
							onclick={() => {
								editingWallet = null;
								showWalletModal = true;
							}}
						>
							+ Add Account
						</Button>
					</div>
				</Card.Header>

				<Card.Content>
					<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
						<!-- Total Across Wallets -->
						<div class="bg-primary text-primary-foreground flex flex-col justify-between rounded-xl p-3 shadow-xs">
							<div class="flex items-center justify-between gap-2 text-[11px] opacity-85">
								<span class="font-medium">Combined Balance</span>
								<span>{walletBreakdown.length} accounts</span>
							</div>
							<div class="mt-2 text-lg font-bold tracking-tight tabular-nums">
								{formatMoney(
									walletBreakdown.reduce((total, wallet) => total + wallet.balance, 0),
									data.currency
								)}
							</div>
							<div class="mt-0.5 flex items-center justify-between gap-2 text-[11px] opacity-80">
								<span>Across all accounts</span>
								{#if walletBreakdown.length > 3}
									<button
										type="button"
										class="cursor-pointer underline underline-offset-2 hover:opacity-100"
										onclick={() => (showAccountsList = true)}
									>
										+{walletBreakdown.length - 3} more
									</button>
								{/if}
							</div>
						</div>

						<!-- Top 3 Accounts on Dashboard -->
						{#each previewWallets as wallet (wallet.id)}
							<div
								class="border-border bg-card hover:bg-accent/40 flex flex-col justify-between rounded-xl border border-l-4 p-3 transition-colors"
								style={`border-left-color: ${wallet.color || 'var(--border)'}`}
							>
								<div class="flex items-center justify-between gap-2">
									<span
										class="flex size-7 items-center justify-center rounded-md text-sm"
										style={`background: ${wallet.color}20`}
									>
										{wallet.icon || '🏦'}
									</span>
									<Button
										variant="outline"
										size="icon-sm"
										class="size-6 text-[11px]"
										title="Edit account"
										aria-label={`Edit ${wallet.name}`}
										onclick={() => {
											editingWallet = wallet;
											showWalletModal = true;
										}}
									>
										✎
									</Button>
								</div>

								<button
									type="button"
									class="mt-2 flex w-full cursor-pointer flex-col text-left"
									onclick={() => {
										filterCategory = 'all';
										search = wallet.name;
										document.querySelector('#transactions-section')?.scrollIntoView({ behavior: 'smooth' });
									}}
								>
									<span class="text-muted-foreground truncate text-xs font-medium">{wallet.name}</span>
									<div class="mt-0.5 text-base font-bold tracking-tight tabular-nums">
										{formatMoney(wallet.balance, data.currency)}
									</div>
									<div class="text-muted-foreground mt-0.5 text-[11px]">
										{wallet.count} {wallet.count === 1 ? 'tx' : 'txs'} · Filter
									</div>
								</button>
							</div>
						{/each}

						{#if walletBreakdown.length === 0}
							<button
								type="button"
								class="border-border hover:bg-accent/50 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-4 text-center transition-colors"
								onclick={() => {
									editingWallet = null;
									showWalletModal = true;
								}}
							>
								<span class="text-muted-foreground text-lg">＋</span>
								<strong class="text-xs font-semibold">Create First Account</strong>
								<small class="text-muted-foreground text-[11px]">Set up Bank, Cash, or Card</small>
							</button>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>
		</section>

		<!-- Analytics Section: Cashflow & Donut -->
		<section class="grid grid-cols-1 items-start gap-4 lg:grid-cols-2" id="analytics-section">
			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="text-sm sm:text-base">Cashflow Dynamics</Card.Title>
					<Card.Description class="text-xs">Income vs. expenses cashflow trajectory</Card.Description>
				</Card.Header>
				<Card.Content>
					<CashflowChart
						transactions={data.transactions}
						month={data.month}
						months={data.monthTotals}
						currency={data.currency}
					/>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="text-sm sm:text-base">Expense Distribution</Card.Title>
					<Card.Description class="text-xs">Category breakdown for {data.monthLabel}</Card.Description>
				</Card.Header>
				<Card.Content>
					<CategoryDonut items={data.categorySpending} currency={data.currency} />
				</Card.Content>
			</Card.Root>
		</section>

		<!-- Budgets & Financial Pulse Section -->
		<section class="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
			<Card.Root>
				<Card.Header class="flex flex-row items-center justify-between gap-2 pb-2">
					<div>
						<Card.Title class="text-sm sm:text-base">Monthly Budgets</Card.Title>
						<Card.Description class="text-xs">Spending limits per category</Card.Description>
					</div>
					<Button variant="link" size="sm" class="h-auto p-0 text-xs" onclick={() => (showCategories = true)}>
						Edit Limits
					</Button>
				</Card.Header>
				<Card.Content>
					<BudgetPanel
						budgets={data.budgets}
						currency={data.currency}
						onmanage={() => (showCategories = true)}
					/>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="text-sm sm:text-base">Financial Pulse</Card.Title>
					<Card.Description class="text-xs">Key monthly health indicators</Card.Description>
				</Card.Header>
				<Card.Content>
					<div class="divide-border grid grid-cols-1 divide-y sm:grid-cols-2 sm:gap-2.5 sm:divide-y-0">
						<div class="border-border py-2.5 sm:rounded-lg sm:border sm:p-2.5">
							<span class="text-muted-foreground block text-[11px] font-medium">Largest Expense</span>
							{#if largestExpense}
								<strong class="mt-0.5 block text-sm font-bold tabular-nums">
									{formatMoney(largestExpense.amount, data.currency)}
								</strong>
								<span class="text-muted-foreground block truncate text-[11px]">{largestExpense.description}</span>
							{:else}
								<strong class="mt-0.5 block text-sm font-bold">—</strong>
								<span class="text-muted-foreground block text-[11px]">No recorded outflow</span>
							{/if}
						</div>

						<div class="border-border py-2.5 sm:rounded-lg sm:border sm:p-2.5">
							<span class="text-muted-foreground block text-[11px] font-medium">Average Expense</span>
							<strong class="mt-0.5 block text-sm font-bold tabular-nums">
								{formatMoney(averageExpense, data.currency)}
							</strong>
							<span class="text-muted-foreground block text-[11px]">Across {expenses.length} transactions</span>
						</div>

						<div class="border-border py-2.5 sm:rounded-lg sm:border sm:p-2.5">
							<span class="text-muted-foreground block text-[11px] font-medium">Top Spending Category</span>
							{#if mostUsedCategory}
								<strong class="mt-0.5 block truncate text-sm font-bold">
									{mostUsedCategory.category.emoji} {mostUsedCategory.category.name}
								</strong>
								<span class="text-muted-foreground block text-[11px] tabular-nums">
									{mostUsedCategory.count} times ({formatMoney(mostUsedCategory.amount, data.currency)})
								</span>
							{:else}
								<strong class="mt-0.5 block text-sm font-bold">—</strong>
								<span class="text-muted-foreground block text-[11px]">No category activity</span>
							{/if}
						</div>

						<div class="border-border py-2.5 sm:rounded-lg sm:border sm:p-2.5">
							<span class="text-muted-foreground block text-[11px] font-medium">Daily Average Burn</span>
							<strong class="mt-0.5 block text-sm font-bold tabular-nums">
								{formatMoney(data.summary.dailyAverage, data.currency)}
							</strong>
							<span class="text-muted-foreground block text-[11px]">Per day across active days</span>
						</div>
					</div>
				</Card.Content>
			</Card.Root>
		</section>

		<!-- Transactions Section -->
		<section id="transactions-section">
			<Card.Root>
				<Card.Header class="gap-4 pb-4">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div class="flex items-center gap-2.5">
							<Card.Title class="text-lg">Transactions</Card.Title>
							<Badge variant="secondary" class="tabular-nums">
								{filteredTransactions.length} of {data.monthTransactions.length}
							</Badge>
						</div>

						<div class="flex flex-wrap items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onclick={() => (showStatementImport = true)}
								title="Import transactions from PDF or CSV e-Statement"
							>
								Import e-Statement
							</Button>
							<Button
								variant="outline"
								size="sm"
								onclick={exportToCSV}
								title="Export current transactions to CSV"
							>
								<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M14 10v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3" />
									<path d="M8 2v9M4.5 7.5L8 11l3.5-3.5" />
								</svg>
								<span>Export CSV</span>
							</Button>
							<Button variant="outline" size="sm" onclick={() => openCreate('transfer')}>
								⇄ Transfer
							</Button>
							<Button size="sm" onclick={() => openCreate('expense')}>
								+ Add Entry
							</Button>
						</div>
					</div>

					<!-- Toolbar Filters -->
					<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div class="relative flex-1 lg:max-w-sm">
							<svg
								class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
								viewBox="0 0 16 16"
								width="14"
								height="14"
								aria-hidden="true"
							>
								<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
								<path d="m10.5 10.5 3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
							</svg>
							<Input
								bind:ref={searchInputEl}
								bind:value={search}
								placeholder="Search description, account, note..."
								aria-label="Search transactions (Press / to focus)"
								class="h-8 pr-8 pl-8 text-xs sm:text-sm"
							/>
							{#if search}
								<button
									type="button"
									class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer px-1 text-sm"
									onclick={() => (search = '')}
									aria-label="Clear search"
								>
									×
								</button>
							{:else}
								<kbd
									class="border-border bg-muted text-muted-foreground pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline-block"
									title="Press / to focus search"
								>
									/
								</kbd>
							{/if}
						</div>

						<div class="flex flex-wrap items-center gap-2">
							<div class="bg-muted inline-flex items-center gap-0.5 rounded-lg p-1" role="group" aria-label="Filter by type">
								{#each [
									{ id: 'all', label: 'All' },
									{ id: 'expense', label: 'Expenses' },
									{ id: 'income', label: 'Income' },
									{ id: 'transfer', label: 'Transfers' }
								] as tab (tab.id)}
									<button
										type="button"
										class={cn(
											'cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-all',
											filterType === tab.id
												? 'bg-card text-foreground shadow-2xs'
												: 'text-muted-foreground hover:text-foreground'
										)}
										onclick={() => {
											filterType = tab.id as typeof filterType;
											page = 1;
										}}
									>
										{tab.label}
									</button>
								{/each}
							</div>

							<div class="w-44">
								<CustomSelect
									bind:value={filterCategory}
									options={[
										{ value: 'all', label: 'All Categories', icon: '❖' },
										...data.categories.map((category) => ({
											value: category.id,
											label: category.name,
											icon: category.emoji,
											color: category.color
										}))
									]}
									size="sm"
									onchange={() => (page = 1)}
								/>
							</div>

							{#if hasFilters}
								<Button variant="ghost" size="sm" onclick={clearFilters}>Reset</Button>
							{/if}
						</div>
					</div>

					<!-- Active Filter Chips & Summary Strip -->
					<div class="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs">
						<div class="flex flex-wrap items-center gap-1.5">
							{#if search}
								<Badge variant="secondary" class="gap-1.5 pr-1.5">
									<span>Search: "<strong>{search}</strong>"</span>
									<button type="button" class="hover:text-foreground cursor-pointer" onclick={() => (search = '')} aria-label="Clear search filter">×</button>
								</Badge>
							{/if}
							{#if filterType !== 'all'}
								<Badge variant="secondary" class="gap-1.5 pr-1.5 capitalize">
									<span>Type: <strong>{filterType}</strong></span>
									<button type="button" class="hover:text-foreground cursor-pointer" onclick={() => (filterType = 'all')} aria-label="Clear type filter">×</button>
								</Badge>
							{/if}
							{#if filterCategory !== 'all'}
								{@const activeCat = categoryMap.get(filterCategory)}
								<Badge variant="secondary" class="gap-1.5 pr-1.5">
									<span>Category: <strong>{activeCat ? `${activeCat.emoji} ${activeCat.name}` : filterCategory}</strong></span>
									<button type="button" class="hover:text-foreground cursor-pointer" onclick={() => (filterCategory = 'all')} aria-label="Clear category filter">×</button>
								</Badge>
							{/if}
							{#if hasFilters}
								<Button variant="link" size="sm" class="h-auto p-0 text-xs" onclick={clearFilters}>
									Clear all
								</Button>
							{/if}
						</div>

						<div class="text-muted-foreground flex flex-wrap items-center gap-2 tabular-nums">
							<span><strong class="text-foreground">{filteredTransactions.length}</strong> {filteredTransactions.length === 1 ? 'entry' : 'entries'}</span>
							{#if filteredStats.income > 0}
								<span>·</span>
								<span class="font-medium text-emerald-700">
									Inflow: +{formatMoney(filteredStats.income, data.currency)}
								</span>
							{/if}
							{#if filteredStats.expense > 0}
								<span>·</span>
								<span class="text-foreground font-medium">
									Outflow: −{formatMoney(filteredStats.expense, data.currency)}
								</span>
							{/if}
							<span>·</span>
							<span class={cn('font-semibold', filteredStats.net >= 0 ? 'text-emerald-700' : 'text-rose-600')}>
								Net: {filteredStats.net >= 0 ? '+' : ''}{formatMoney(filteredStats.net, data.currency)}
							</span>
						</div>
					</div>
				</Card.Header>

				<Card.Content>
					{#if sortedTransactions.length === 0}
						<div class="border-border flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-12 text-center">
							<div class="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full text-lg">
								⇄
							</div>
							{#if data.monthTransactions.length === 0}
								<h4 class="text-sm font-semibold">No transactions recorded for {data.monthLabel}</h4>
								<p class="text-muted-foreground text-xs">Begin by logging your first income or expense for this month.</p>
								<Button size="sm" class="mt-2" onclick={() => openCreate('expense')}>
									+ Record Transaction
								</Button>
							{:else}
								<h4 class="text-sm font-semibold">No matching transactions found</h4>
								<p class="text-muted-foreground text-xs">Try modifying your search term or clearing applied filters.</p>
								<Button variant="outline" size="sm" class="mt-2" onclick={clearFilters}>
									Clear Filters
								</Button>
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
							onFilterCategory={(categoryId) => {
								filterCategory = categoryId;
								page = 1;
							}}
							onFilterAccount={(account) => {
								search = account;
								page = 1;
							}}
						/>

						{#if sortedTransactions.length > 15 || totalPages > 1}
							<div class="mt-4 flex flex-col items-center justify-between gap-3 text-xs sm:flex-row">
								<div class="text-muted-foreground tabular-nums">
									Showing <strong class="text-foreground">{(page - 1) * (pageSize || sortedTransactions.length) + 1}–{pageSize > 0 ? Math.min(page * pageSize, sortedTransactions.length) : sortedTransactions.length}</strong> of <strong class="text-foreground">{sortedTransactions.length}</strong>
								</div>

								{#if totalPages > 1}
									<div class="flex items-center gap-2">
										<Button
											variant="outline"
											size="sm"
											disabled={page <= 1}
											onclick={() => page--}
											aria-label="Previous page"
										>
											‹ Prev
										</Button>
										<span class="text-muted-foreground px-1 tabular-nums">
											Page <strong class="text-foreground">{page}</strong> of {totalPages}
										</span>
										<Button
											variant="outline"
											size="sm"
											disabled={page >= totalPages}
											onclick={() => page++}
											aria-label="Next page"
										>
											Next ›
										</Button>
									</div>
								{/if}

								<div class="flex items-center gap-2">
									<label for="page-size-select" class="text-muted-foreground">Per page:</label>
									<select
										id="page-size-select"
										bind:value={pageSize}
										onchange={() => (page = 1)}
										class="border-input bg-card h-8 rounded-md border px-2 text-xs font-medium outline-none"
									>
										<option value={15}>15</option>
										<option value={25}>25</option>
										<option value={50}>50</option>
										<option value={100}>100</option>
										<option value={0}>All</option>
									</select>
								</div>
							</div>
						{/if}
					{/if}
				</Card.Content>
			</Card.Root>
		</section>
	</main>

	<!-- Mobile Floating Action Button -->
	<Button
		size="icon"
		class="fixed right-5 bottom-5 z-30 size-12 rounded-full shadow-lg sm:hidden"
		onclick={() => openCreate('expense')}
		aria-label="Add transaction"
	>
		<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
			<path d="M8 2.5v11M2.5 8h11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
		</svg>
	</Button>
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
		onclose={() => (showCategories = false)}
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

<!-- All Accounts List Modal -->
{#if showAccountsList}
	<AccountsListModal
		wallets={walletBreakdown}
		currency={data.currency}
		onclose={() => (showAccountsList = false)}
		onadd={() => {
			showAccountsList = false;
			editingWallet = null;
			showWalletModal = true;
		}}
		onedit={(wallet) => {
			showAccountsList = false;
			editingWallet = wallet;
			showWalletModal = true;
		}}
		onfilter={(accountName) => {
			showAccountsList = false;
			filterCategory = 'all';
			search = accountName;
			page = 1;
			document.querySelector('#transactions-section')?.scrollIntoView({ behavior: 'smooth' });
		}}
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
			importNotice = `Imported ${count} ${count === 1 ? 'transaction' : 'transactions'} directly to your Google Sheet.`;
			setTimeout(() => {
				importNotice = null;
			}, 5000);
		}}
	/>
{/if}

{#if importNotice}
	<div
		class="fixed bottom-20 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-lg sm:bottom-6"
		role="status"
	>
		<span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">✓</span>
		<p class="flex-1 font-medium">{importNotice}</p>
		<Button
			variant="ghost"
			size="icon-sm"
			class="size-7 text-emerald-700 hover:bg-emerald-100"
			aria-label="Dismiss notice"
			onclick={() => (importNotice = null)}
		>
			×
		</Button>
	</div>
{/if}

<!-- Settings Right Sheet -->
<SettingsSheet
	open={showSettings}
	user={data.user}
	currency={data.currency}
	theme={data.theme}
	sheetUrl={data.sheetUrl}
	onclose={() => (showSettings = false)}
	onmanagecategories={() => {
		showSettings = false;
		showCategories = true;
	}}
	onmanageaccounts={() => {
		showSettings = false;
		editingWallet = null;
		showWalletModal = true;
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
