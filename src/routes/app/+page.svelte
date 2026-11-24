<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import type { CategorySpend, Transaction, TransactionType, Wallet } from '#lib/types.ts';
	import {
		formatDate,
		formatMoney,
		formatShortDate,
		getTransferDestination,
		percentChange,
		shiftMonth
	} from '#lib/finance.ts';
	import { CURRENCIES } from '#lib/finance.ts';
	import CustomSelect from '#lib/components/CustomSelect.svelte';
	import TransactionModal from '#lib/components/TransactionModal.svelte';
	import CategoryManager from '#lib/components/CategoryManager.svelte';
	import WalletModal from '#lib/components/WalletModal.svelte';
	import SettingsSheet from '#lib/components/SettingsSheet.svelte';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import CashflowChart from '#lib/components/CashflowChart.svelte';
	import CategoryDonut from '#lib/components/CategoryDonut.svelte';
	import BudgetPanel from '#lib/components/BudgetPanel.svelte';

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

	type FormState = { error?: string; action?: string; id?: string | null; success?: boolean };
	let message = $derived(form as FormState | null);

	let showTransactionModal = $state(false);
	let editingTransaction = $state<Transaction | null>(null);
	let showCategories = $state(false);
	let showWalletModal = $state(false);
	let editingWallet = $state<Wallet | null>(null);
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
	<div class="app-toast-alert" role="alert">
		<span class="toast-indicator">!</span>
		<p>{bannerError}</p>
		<button
			type="button"
			class="toast-dismiss"
			aria-label="Dismiss error"
			onclick={() => (dismissedError = message?.error ?? null)}
		>
			×
		</button>
	</div>
{/if}

<div class="dash-cockpit" data-theme={data.theme}>
	<!-- Top Sticky App Bar -->
	<header class="cockpit-header">
		<div class="header-left">
			<a class="cockpit-brand" href="/app" aria-label="Sanku Home">
				<svg class="brand-monogram" viewBox="0 0 32 32" aria-hidden="true">
					<rect width="32" height="32" rx="9" fill="var(--theme-primary, #09090b)" />
					<path
						d="M8.5 22.5V14M14 22.5V8.5M19.5 22.5V16.5M25 22.5V11"
						stroke="#ffffff"
						stroke-width="2.2"
						stroke-linecap="round"
					/>
					<circle cx="25" cy="22.5" r="2.2" fill="#10b981" />
				</svg>
				<span class="brand-title">Sanku</span>
			</a>

			<div class="month-selector-pill">
				<a
					class="month-btn-arrow"
					href={`/app?month=${shiftMonth(data.month, -1)}`}
					aria-label="Previous month"
					title="Previous month"
				>
					<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M10 12L6 8l4-4" />
					</svg>
				</a>
				<form method="GET" action="/app" bind:this={monthForm} class="month-form-dropdown">
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
					class="month-btn-arrow"
					href={`/app?month=${shiftMonth(data.month, 1)}`}
					aria-label="Next month"
					title="Next month"
				>
					<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M6 4l4 4-4 4" />
					</svg>
				</a>
			</div>

			<nav class="cockpit-nav" aria-label="Quick Navigation">
				<a class="nav-tab active" href="/app">Overview</a>
				<a class="nav-tab" href="#transactions-section">Transactions</a>
				<button type="button" class="nav-tab nav-btn" onclick={() => (showCategories = true)}>Budgets</button>
				<a class="nav-tab" href="#analytics-section">Analytics</a>
				<button type="button" class="nav-tab nav-btn" onclick={() => document.querySelector('.accounts-hub')?.scrollIntoView({ behavior: 'smooth' })}>Accounts</button>
			</nav>
		</div>

		<div class="header-right">
			<a class="sheet-link-badge" href={data.sheetUrl} target="_blank" rel="noreferrer" title="Open spreadsheet in Google Drive">
				<span class="pulse-dot"></span>
				<span>Google Sheet</span>
				<svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
					<path d="M4.5 2.5h7v7M11.5 2.5 3 11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</a>

			<button
				type="button"
				class="btn-settings"
				onclick={() => (showSettings = true)}
				title="Open settings & preferences"
				aria-label="Open settings"
			>
				<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<circle cx="10" cy="10" r="3" />
					<path d="M16.2 8.4a1.3 1.3 0 0 0 .3 1.5 8.3 8.3 0 0 1 0 1.2 1.3 1.3 0 0 0-.3 1.5l.1.1a1.4 1.4 0 0 1-1.1 2.3h-.2a1.3 1.3 0 0 0-1.3.9 8.2 8.2 0 0 1-.9.9 1.3 1.3 0 0 0-.4 1.5l.1.2a1.4 1.4 0 0 1-2 1.2l-.2-.1a1.3 1.3 0 0 0-1.5.3 8.3 8.3 0 0 1-1.2 0 1.3 1.3 0 0 0-1.5-.3l-.1.1a1.4 1.4 0 0 1-2.3-1.1v-.2a1.3 1.3 0 0 0-.9-1.3 8.2 8.2 0 0 1-.9-.9 1.3 1.3 0 0 0-1.5-.4l-.2.1a1.4 1.4 0 0 1-1.2-2l.1-.2a1.3 1.3 0 0 0-.3-1.5 8.3 8.3 0 0 1 0-1.2 1.3 1.3 0 0 0 .3-1.5l-.1-.1a1.4 1.4 0 0 1 1.1-2.3h.2a1.3 1.3 0 0 0 1.3-.9 8.2 8.2 0 0 1 .9-.9 1.3 1.3 0 0 0 .4-1.5l-.1-.2a1.4 1.4 0 0 1 2-1.2l.2.1a1.3 1.3 0 0 0 1.5-.3 8.3 8.3 0 0 1 1.2 0 1.3 1.3 0 0 0 1.5.3l.1-.1a1.4 1.4 0 0 1 2.3 1.1v.2a1.3 1.3 0 0 0 .9 1.3 8.2 8.2 0 0 1 .9.9 1.3 1.3 0 0 0 1.5.4l.2-.1a1.4 1.4 0 0 1 1.2 2l-.1.2z" />
				</svg>
				<span class="btn-settings-label">Settings</span>
			</button>

			<div class="user-menu-root" bind:this={userMenuEl}>
				<button
					type="button"
					class="user-profile-btn"
					class:menu-open={showUserMenu}
					onclick={() => (showUserMenu = !showUserMenu)}
					title="Account options"
					aria-haspopup="menu"
					aria-expanded={showUserMenu}
				>
					{#if data.user.picture}
						<img src={data.user.picture} alt="" referrerpolicy="no-referrer" class="user-avatar" />
					{:else}
						<span class="avatar-placeholder">{initials}</span>
					{/if}
					<span class="user-name-short">{data.user.name}</span>
					<svg class="profile-chevron" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
						<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>

				{#if showUserMenu}
					<div class="user-menu-dropdown" role="menu">
						<div class="user-menu-header">
							<strong>{data.user.name}</strong>
							<span>{data.user.email}</span>
						</div>
						<div class="user-menu-divider"></div>
						<button
							type="button"
							class="user-menu-item"
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
							class="user-menu-item logout-item"
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
	</header>

	<!-- Main Cockpit Workspace -->
	<main class="cockpit-main">
		<!-- Month Title & Quick Summary -->
		<section class="overview-title-bar">
			<div>
				<h1>{data.monthLabel}</h1>
				<p class="subtitle">Real-time ledger synced with Google Drive · {filteredTransactions.length} recorded this month</p>
			</div>
			<div class="overview-actions">
				<button type="button" class="btn-ghost-sm" onclick={() => (showCategories = true)}>
					Manage Budgets
				</button>
				<button type="button" class="btn-ghost-sm" onclick={() => openCreate('transfer')}>
					⇄ Transfer
				</button>
				<button type="button" class="btn-primary-sm" onclick={() => openCreate('expense')}>
					+ New Entry
				</button>
			</div>
		</section>

		<!-- Hero Financial Command Grid (Bento) -->
		<section class="command-grid">
			<!-- Main Card: Net Surplus -->
			<article class="command-card hero-net" class:negative={data.summary.net < 0}>
				<div class="c-header">
					<span class="c-label">Net Surplus</span>
					<span class="status-chip" class:pos={data.summary.net >= 0} class:neg={data.summary.net < 0}>
						{data.summary.net >= 0 ? '✓ Positive Surplus' : '⚠ Cashflow Deficit'}
					</span>
				</div>
				<div class="c-value-hero">
					{data.summary.net >= 0 ? '+' : ''}{formatMoney(data.summary.net, data.currency)}
				</div>
				<div class="c-footer">
					{#if netChange !== null}
						<span class="c-delta" class:up={netChange >= 0} class:down={netChange < 0}>
							{netChange >= 0 ? '↑' : '↓'} {Math.abs(netChange).toFixed(1)}%
						</span>
						<span class="c-meta">vs {formatMoney(data.summary.previousNet, data.currency)} last month</span>
					{:else}
						<span class="c-meta">Initial month of tracking</span>
					{/if}
				</div>
			</article>

			<!-- Income Card -->
			<article class="command-card">
				<div class="c-header">
					<span class="c-label">Total Inflow</span>
					{#if incomeChange !== null}
						<span class="c-delta" class:up={incomeChange >= 0} class:down={incomeChange < 0}>
							{incomeChange >= 0 ? '↑' : '↓'} {Math.abs(incomeChange).toFixed(1)}%
						</span>
					{/if}
				</div>
				<div class="c-value">{formatMoney(data.summary.income, data.currency)}</div>
				<div class="c-footer">
					<span class="c-meta">
						{#if incomeChange !== null}
							vs {formatMoney(data.summary.previousIncome, data.currency)} prev
						{:else}
							No previous record
						{/if}
					</span>
				</div>
			</article>

			<!-- Expense Card -->
			<article class="command-card">
				<div class="c-header">
					<span class="c-label">Total Outflow</span>
					{#if expenseChange !== null}
						<span class="c-delta" class:good={expenseChange <= 0} class:bad={expenseChange > 0}>
							{expenseChange >= 0 ? '↑' : '↓'} {Math.abs(expenseChange).toFixed(1)}%
						</span>
					{/if}
				</div>
				<div class="c-value">{formatMoney(data.summary.expense, data.currency)}</div>
				<div class="c-footer">
					<span class="c-meta">
						{#if expenseChange !== null}
							vs {formatMoney(data.summary.previousExpense, data.currency)} prev
						{:else}
							No previous record
						{/if}
					</span>
				</div>
			</article>

			<!-- Savings Rate Card -->
			<article class="command-card">
				<div class="c-header">
					<span class="c-label">Savings Rate</span>
					<span class="c-meta-tag">{activeDays} active {activeDays === 1 ? 'day' : 'days'}</span>
				</div>
				<div class="c-value">
					{data.summary.savingsRate === null ? '—' : `${Math.round(data.summary.savingsRate)}%`}
				</div>
				<div class="c-footer">
					<div class="progress-track" aria-hidden="true">
						<div
							class="progress-fill"
							style={`width: ${Math.min(100, Math.max(0, data.summary.savingsRate ?? 0))}%`}
						></div>
					</div>
				</div>
			</article>
		</section>

		<!-- Accounts & Wallets Hub -->
		<section class="accounts-hub">
			<div class="hub-header">
				<div>
					<span class="sub-label">Liquidity & Accounts</span>
					<h2>Accounts & Wallets</h2>
				</div>
				<div class="hub-header-actions">
					<button
						type="button"
						class="btn-text-action transfer-btn"
						onclick={() => openCreate('transfer')}
					>
						⇄ Transfer Funds
					</button>
					<button
						type="button"
						class="btn-text-action"
						onclick={() => {
							editingWallet = null;
							showWalletModal = true;
						}}
					>
						+ Create Account / Wallet
					</button>
				</div>
			</div>

			<div class="accounts-row">
				<!-- Total Across Wallets -->
				<div class="account-card total-card">
					<div class="acc-top">
						<span class="acc-badge">Combined Balance</span>
						<span class="acc-count">{walletBreakdown.length} accounts</span>
					</div>
					<div class="acc-balance">
						{formatMoney(
							walletBreakdown.reduce((total, wallet) => total + wallet.balance, 0),
							data.currency
						)}
					</div>
					<div class="acc-sub">Calculated across all accounts</div>
				</div>

				<!-- Individual Accounts -->
				{#each walletBreakdown as wallet (wallet.id)}
					<div class="account-card" style={`border-left: 4px solid ${wallet.color || 'var(--border)'}`}>
						<div class="acc-top">
							<span class="acc-icon" style={`background: ${wallet.color}20`}>
								{wallet.icon || '🏦'}
							</span>
							<button
								type="button"
								class="btn-edit-wallet"
								title="Edit account"
								onclick={() => {
									editingWallet = wallet;
									showWalletModal = true;
								}}
							>
								✎
							</button>
						</div>
						<button
							type="button"
							class="acc-click-area"
							onclick={() => {
								filterCategory = 'all';
								search = wallet.name;
								document.querySelector('#transactions-section')?.scrollIntoView({ behavior: 'smooth' });
							}}
						>
							<span class="acc-name">{wallet.name}</span>
							<div class="acc-balance">{formatMoney(wallet.balance, data.currency)}</div>
							<div class="acc-sub">{wallet.count} {wallet.count === 1 ? 'transaction' : 'transactions'} · Filter</div>
						</button>
					</div>
				{/each}

				{#if walletBreakdown.length === 0}
					<button
						type="button"
						class="account-card empty-acc"
						onclick={() => {
							editingWallet = null;
							showWalletModal = true;
						}}
					>
						<span class="empty-icon">＋</span>
						<strong>Create First Account</strong>
						<small>Set up Bank, Cash, or Card</small>
					</button>
				{/if}
			</div>
		</section>

		<!-- Analytics Section: Cashflow & Donut -->
		<section class="analytics-grid" id="analytics-section">
			<!-- Cashflow Chart -->
			<div class="panel-box cashflow-box">
				<div class="panel-header">
					<div>
						<h3>Cashflow Dynamics</h3>
						<p>Income vs. expenses cashflow trajectory</p>
					</div>
				</div>
				<CashflowChart
					transactions={data.transactions}
					month={data.month}
					months={data.monthTotals}
					currency={data.currency}
				/>
			</div>

			<!-- Category Spend Donut -->
			<div class="panel-box donut-box">
				<div class="panel-header">
					<div>
						<h3>Expense Distribution</h3>
						<p>Category breakdown for {data.monthLabel}</p>
					</div>
				</div>
				<CategoryDonut items={data.categorySpending} currency={data.currency} />
			</div>
		</section>

		<!-- Budgets & At a Glance Section -->
		<section class="insights-grid">
			<!-- Budgets Panel -->
			<div class="panel-box budgets-box">
				<div class="panel-header">
					<div>
						<h3>Monthly Budgets</h3>
						<p>Spending limits per category</p>
					</div>
					<button type="button" class="btn-subtle-link" onclick={() => (showCategories = true)}>
						Edit Limits
					</button>
				</div>
				<BudgetPanel
					budgets={data.budgets}
					currency={data.currency}
					onmanage={() => (showCategories = true)}
				/>
			</div>

			<!-- At a Glance Insights -->
			<div class="panel-box pulse-box">
				<div class="panel-header">
					<div>
						<h3>Financial Pulse</h3>
						<p>Key monthly health indicators</p>
					</div>
				</div>

				<div class="pulse-metrics-list">
					<div class="pulse-item">
						<span class="p-label">Largest Expense</span>
						<div class="p-data">
							{#if largestExpense}
								<strong>{formatMoney(largestExpense.amount, data.currency)}</strong>
								<span class="p-sub">{largestExpense.description}</span>
							{:else}
								<strong>—</strong>
								<span class="p-sub">No recorded outflow</span>
							{/if}
						</div>
					</div>

					<div class="pulse-item">
						<span class="p-label">Average Expense</span>
						<div class="p-data">
							<strong>{formatMoney(averageExpense, data.currency)}</strong>
							<span class="p-sub">Across {expenses.length} transactions</span>
						</div>
					</div>

					<div class="pulse-item">
						<span class="p-label">Top Spending Category</span>
						<div class="p-data">
							{#if mostUsedCategory}
								<strong>{mostUsedCategory.category.emoji} {mostUsedCategory.category.name}</strong>
								<span class="p-sub">{mostUsedCategory.count} times ({formatMoney(mostUsedCategory.amount, data.currency)})</span>
							{:else}
								<strong>—</strong>
								<span class="p-sub">No category activity</span>
							{/if}
						</div>
					</div>

					<div class="pulse-item">
						<span class="p-label">Daily Average Burn</span>
						<div class="p-data">
							<strong>{formatMoney(data.summary.dailyAverage, data.currency)}</strong>
							<span class="p-sub">Per day across active days</span>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Transactions Section -->
		<section class="transactions-hub" id="transactions-section">
			<div class="transactions-toolbar">
				<div class="tb-left">
					<h2>Transactions</h2>
					<span class="tb-badge">{filteredTransactions.length} of {data.monthTransactions.length}</span>
				</div>

				<div class="tb-controls">
					<!-- Search Input -->
					<div class="tb-search-input">
						<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
							<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
							<path d="m10.5 10.5 3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
						</svg>
						<input
							bind:this={searchInputEl}
							bind:value={search}
							placeholder="Search description, account, note..."
							aria-label="Search transactions (Press / to focus)"
						/>
						{#if search}
							<button type="button" class="btn-clear-search" onclick={() => (search = '')} aria-label="Clear search">×</button>
						{:else}
							<kbd class="search-kbd-hint" title="Press / to focus search">/</kbd>
						{/if}
					</div>

					<!-- Type Filter Segmented Control -->
					<div class="segmented-pills" role="group" aria-label="Filter by type">
						<button type="button" class:active={filterType === 'all'} onclick={() => (filterType = 'all')}>All</button>
						<button type="button" class:active={filterType === 'expense'} onclick={() => (filterType = 'expense')}>Expenses</button>
						<button type="button" class:active={filterType === 'income'} onclick={() => (filterType = 'income')}>Income</button>
						<button type="button" class:active={filterType === 'transfer'} onclick={() => (filterType = 'transfer')}>Transfers</button>
					</div>

					<!-- Category Custom Select -->
					<div class="tb-category-select">
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
						/>
					</div>

					{#if hasFilters}
						<button type="button" class="btn-reset-filters" onclick={clearFilters}>Reset</button>
					{/if}

					<button type="button" class="btn-ghost-sm export-btn" onclick={exportToCSV} title="Export current transactions to CSV">
						<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M14 10v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3" />
							<path d="M8 2v9M4.5 7.5L8 11l3.5-3.5" />
						</svg>
						<span>Export CSV</span>
					</button>

					<button type="button" class="btn-ghost-sm" onclick={() => openCreate('transfer')}>
						⇄ Transfer
					</button>
					<button type="button" class="btn-add-tx" onclick={() => openCreate('expense')}>
						+ Add Entry
					</button>
				</div>
			</div>

			<!-- Active Filter Chips & Summary Bar -->
			<div class="tb-filter-bar">
				<div class="filter-chips-list">
					{#if search}
						<span class="active-filter-chip">
							<span>Search: "<strong>{search}</strong>"</span>
							<button type="button" onclick={() => (search = '')} aria-label="Clear search filter">×</button>
						</span>
					{/if}
					{#if filterType !== 'all'}
						<span class="active-filter-chip">
							<span>Type: <strong style="text-transform: capitalize;">{filterType}</strong></span>
							<button type="button" onclick={() => (filterType = 'all')} aria-label="Clear type filter">×</button>
						</span>
					{/if}
					{#if filterCategory !== 'all'}
						{@const activeCat = categoryMap.get(filterCategory)}
						<span class="active-filter-chip">
							<span>Category: <strong>{activeCat ? `${activeCat.emoji} ${activeCat.name}` : filterCategory}</strong></span>
							<button type="button" onclick={() => (filterCategory = 'all')} aria-label="Clear category filter">×</button>
						</span>
					{/if}
					{#if hasFilters}
						<button type="button" class="btn-clear-all-chips" onclick={clearFilters}>
							Clear all filters
						</button>
					{/if}
				</div>

				<div class="tb-summary-metrics">
					<span class="metric-item">
						<strong>{filteredTransactions.length}</strong> {filteredTransactions.length === 1 ? 'entry' : 'entries'}
					</span>
					{#if filteredStats.income > 0}
						<span class="metric-sep">·</span>
						<span class="metric-item income">
							Inflow: +{formatMoney(filteredStats.income, data.currency)}
						</span>
					{/if}
					{#if filteredStats.expense > 0}
						<span class="metric-sep">·</span>
						<span class="metric-item expense">
							Outflow: −{formatMoney(filteredStats.expense, data.currency)}
						</span>
					{/if}
					<span class="metric-sep">·</span>
					<span class="metric-item net" class:pos={filteredStats.net >= 0} class:neg={filteredStats.net < 0}>
						Net: {filteredStats.net >= 0 ? '+' : ''}{formatMoney(filteredStats.net, data.currency)}
					</span>
				</div>
			</div>

			<!-- Transaction Data Table -->
			{#if sortedTransactions.length === 0}
				<div class="empty-ledger-state">
					<div class="empty-icon-wrap">⇄</div>
					{#if data.monthTransactions.length === 0}
						<h4>No transactions recorded for {data.monthLabel}</h4>
						<p>Begin by logging your first income or expense for this month.</p>
						<button type="button" class="btn-primary-action" onclick={() => openCreate('expense')}>+ Record Transaction</button>
					{:else}
						<h4>No matching transactions found</h4>
						<p>Try modifying your search term or clearing applied filters.</p>
						<button type="button" class="btn-subtle-pill" onclick={clearFilters}>Clear Filters</button>
					{/if}
				</div>
			{:else}
				<div class="ledger-table-wrap">
					<table class="ledger-table">
						<thead>
							<tr>
								<th
									scope="col"
									class="th-date"
									aria-sort={sortBy === 'date' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
								>
									<button
										type="button"
										class="th-sort-btn"
										onclick={() => toggleSort('date')}
										title="Click to sort by date"
									>
										<span>Date</span>
										{#if sortBy === 'date'}
											<span class="sort-indicator">{sortOrder === 'asc' ? '↑' : '↓'}</span>
										{:else}
											<span class="sort-indicator-idle">↕</span>
										{/if}
									</button>
								</th>
								<th
									scope="col"
									class="th-desc"
									aria-sort={sortBy === 'description' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
								>
									<button
										type="button"
										class="th-sort-btn"
										onclick={() => toggleSort('description')}
										title="Click to sort by description"
									>
										<span>Description</span>
										{#if sortBy === 'description'}
											<span class="sort-indicator">{sortOrder === 'asc' ? '↑' : '↓'}</span>
										{:else}
											<span class="sort-indicator-idle">↕</span>
										{/if}
									</button>
								</th>
								<th
									scope="col"
									class="th-cat"
									aria-sort={sortBy === 'category' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
								>
									<button
										type="button"
										class="th-sort-btn"
										onclick={() => toggleSort('category')}
										title="Click to sort by category"
									>
										<span>Category</span>
										{#if sortBy === 'category'}
											<span class="sort-indicator">{sortOrder === 'asc' ? '↑' : '↓'}</span>
										{:else}
											<span class="sort-indicator-idle">↕</span>
										{/if}
									</button>
								</th>
								<th
									scope="col"
									class="th-acc"
									aria-sort={sortBy === 'account' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
								>
									<button
										type="button"
										class="th-sort-btn"
										onclick={() => toggleSort('account')}
										title="Click to sort by account"
									>
										<span>Account</span>
										{#if sortBy === 'account'}
											<span class="sort-indicator">{sortOrder === 'asc' ? '↑' : '↓'}</span>
										{:else}
											<span class="sort-indicator-idle">↕</span>
										{/if}
									</button>
								</th>
								<th
									scope="col"
									class="th-amt"
									aria-sort={sortBy === 'amount' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
								>
									<button
										type="button"
										class="th-sort-btn justify-end"
										onclick={() => toggleSort('amount')}
										title="Click to sort by amount"
									>
										<span>Amount</span>
										{#if sortBy === 'amount'}
											<span class="sort-indicator">{sortOrder === 'asc' ? '↑' : '↓'}</span>
										{:else}
											<span class="sort-indicator-idle">↕</span>
										{/if}
									</button>
								</th>
								<th scope="col" class="th-actions"><span class="sr-only">Actions</span></th>
							</tr>
						</thead>
						<tbody>
							{#each paginatedTransactions as transaction (transaction.id)}
								{@const category = categoryFor(transaction)}
								{@const dest = getTransferDestination(transaction)}
								<tr
									class="ledger-tr"
									role="button"
									tabindex="0"
									aria-label={`Transaction: ${transaction.description}, ${formatMoney(transaction.amount, data.currency)}. Click to edit.`}
									onclick={() => openEdit(transaction)}
									onkeydown={(e) => {
										if (e.key === 'Enter' && e.target === e.currentTarget) {
											openEdit(transaction);
										}
									}}
								>
									<td class="td-date" title={formatDate(transaction.date)}>
										<span class="date-chip">{formatShortDate(transaction.date)}</span>
									</td>

									<td class="td-desc">
										<div class="desc-content">
											<strong class="desc-title">{transaction.description}</strong>
											{#if transaction.notes}
												<span class="desc-note">{transaction.notes}</span>
											{/if}
										</div>
									</td>

									<td class="td-cat">
										{#if transaction.type === 'transfer'}
											<span class="cat-pill transfer">
												<i class="cat-dot transfer"></i>
												<span>⇄ Transfer</span>
											</span>
										{:else if category}
											<button
												type="button"
												class="cat-pill-btn"
												title={`Filter transactions by ${category.name}`}
												onclick={(e) => {
													e.stopPropagation();
													filterCategory = category.id;
												}}
											>
												<span class="cat-pill">
													<i class="cat-dot" style={`background: ${category.color}`}></i>
													<span>{category.emoji} {category.name}</span>
												</span>
											</button>
										{:else}
											<span class="cat-pill uncategorized">
												<i class="cat-dot"></i>
												<span>Uncategorized</span>
											</span>
										{/if}
									</td>

									<td class="td-acc">
										{#if dest}
											<span class="acc-tag transfer" title={`Transfer from ${transaction.account} to ${dest}`}>
												{transaction.account} <span class="transfer-arrow">→</span> {dest}
											</span>
										{:else}
											<button
												type="button"
												class="acc-tag-btn"
												title={`Filter transactions by account: ${transaction.account || 'Unassigned'}`}
												onclick={(e) => {
													e.stopPropagation();
													if (transaction.account) search = transaction.account;
												}}
											>
												<span class="acc-tag">{transaction.account || '—'}</span>
											</button>
										{/if}
									</td>

									<td class="td-amt">
										<span
											class="amt-num"
											class:income={transaction.type === 'income'}
											class:expense={transaction.type === 'expense'}
											class:transfer={transaction.type === 'transfer'}
										>
											{transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '−' : '⇄ '}
											{formatMoney(transaction.amount, data.currency)}
										</span>
									</td>

									<td class="td-actions">
										<div class="row-actions-group">
											<button
												type="button"
												class="btn-row-icon-action"
												data-tooltip="Edit"
												title="Edit transaction"
												aria-label={`Edit ${transaction.description}`}
												onclick={(e) => {
													e.stopPropagation();
													openEdit(transaction);
												}}
											>
												<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
													<path d="M11.5 2.5a1.77 1.77 0 0 1 2.5 2.5L5 14H2v-3l9.5-8.5z" />
												</svg>
											</button>

											<button
												type="button"
												class="btn-row-icon-action"
												data-tooltip="Duplicate"
												title="Duplicate transaction"
												aria-label={`Duplicate ${transaction.description}`}
												onclick={(e) => {
													e.stopPropagation();
													duplicateTransaction(transaction);
												}}
											>
												<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
													<rect x="5" y="5" width="8" height="8" rx="1.5" />
													<path d="M3 11V3a1.5 1.5 0 0 1 1.5-1.5H11" />
												</svg>
											</button>

											<button
												type="button"
												class="btn-row-icon-action del"
												data-tooltip="Delete"
												title="Delete transaction"
												aria-label={`Delete ${transaction.description}`}
												onclick={(e) => {
													e.stopPropagation();
													deletingTransaction = transaction;
												}}
											>
												<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
													<path d="M2.5 4.5h11M5.5 4.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5M13 4.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-9" />
													<path d="M6.5 7.5v4M9.5 7.5v4" />
												</svg>
											</button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>

					<!-- Pagination Bar -->
					{#if sortedTransactions.length > 15 || totalPages > 1}
						<div class="ledger-pagination-bar">
							<div class="pagination-info">
								Showing <strong>{(page - 1) * (pageSize || sortedTransactions.length) + 1}–{pageSize > 0 ? Math.min(page * pageSize, sortedTransactions.length) : sortedTransactions.length}</strong> of <strong>{sortedTransactions.length}</strong>
							</div>

							{#if totalPages > 1}
								<div class="pagination-controls">
									<button
										type="button"
										class="btn-page-nav"
										disabled={page <= 1}
										onclick={() => page--}
										aria-label="Previous page"
									>
										‹ Prev
									</button>
									<span class="page-current">Page {page} of {totalPages}</span>
									<button
										type="button"
										class="btn-page-nav"
										disabled={page >= totalPages}
										onclick={() => page++}
										aria-label="Next page"
									>
										Next ›
									</button>
								</div>
							{/if}

							<div class="pagination-page-size">
								<label for="page-size-select">Per page:</label>
								<select
									id="page-size-select"
									bind:value={pageSize}
									onchange={() => (page = 1)}
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
				</div>
			{/if}
		</section>
	</main>

	<!-- Mobile Floating Action Button -->
	<button type="button" class="cockpit-fab" onclick={() => openCreate('expense')} aria-label="Add transaction">
		<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
			<path d="M8 2.5v11M2.5 8h11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
		</svg>
	</button>
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

<style>
	.btn-edit-wallet {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: var(--radius-sm);
		font-size: 11px;
		color: var(--muted);
		border: 1px solid var(--border);
		background: var(--surface);
		cursor: pointer;
		transition: all 120ms ease;
	}

	.btn-edit-wallet:hover {
		color: var(--ink);
		background: var(--surface-hover);
	}

	.acc-click-area {
		display: flex;
		flex-direction: column;
		width: 100%;
		text-align: left;
		cursor: pointer;
		background: transparent;
		border: none;
		padding: 0;
	}
</style>
