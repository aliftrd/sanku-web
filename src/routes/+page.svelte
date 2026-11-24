<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let activePreviewTab = $state<'overview' | 'sheet' | 'budgets'>('overview');
</script>

<style>
	:focus-visible {
		outline: 2px solid var(--color-focus);
		outline-offset: 2px;
	}
	button:active, a:active {
		transform: translateY(1px);
	}
	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.btn-nav-signin,
	.btn-card-primary,
	.btn-card-secondary {
		white-space: nowrap;
	}
</style>

{#snippet brandMark()}
	<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true" width="28" height="28">
		<rect width="32" height="32" rx="8" fill="var(--color-board, #17181c)" />
		<path
			d="M8.5 22.5V14M14 22.5V8.5M19.5 22.5V16.5M25 22.5V11"
			stroke="var(--color-cotton, #fbfbfa)"
			stroke-width="2.2"
			stroke-linecap="round"
		/>
		<circle cx="25" cy="22.5" r="2.2" fill="var(--color-accent, #c96845)" />
	</svg>
{/snippet}

{#snippet googleIcon(size = 18)}
	<svg
		viewBox="0 0 18 18"
		width={size}
		height={size}
		class="google-icon-svg"
		aria-hidden="true"
		style="width: {size}px; height: {size}px; flex-shrink: 0;"
	>
		<path
			fill="#4285F4"
			d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
		/>
		<path
			fill="#34A853"
			d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
		/>
		<path
			fill="#FBBC05"
			d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
		/>
		<path
			fill="#EA4335"
			d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
		/>
	</svg>
{/snippet}

<svelte:head>
	<title>Sanku: Personal Finance in Your Google Sheet</title>
	<meta
		name="description"
		content="A calm, quiet finance dashboard with zero database lock-in. Transactions and budgets write directly to a private Google Sheet in your personal Google Drive."
	/>
	<link rel="preconnect" href="https://api.fontshare.com" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
	<link href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap" rel="stylesheet" />
	<link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
</svelte:head>

<div class="landing-page desk">
	<!-- Top Navigation Bar -->
	<header class="landing-header">
		<div class="header-inner">
			<a class="brand" href="/" aria-label="Sanku home">
				{@render brandMark()}
				<span class="brand-text">
					<strong>Sanku</strong>
				</span>
			</a>

			<nav class="nav-links" aria-label="Main navigation">
				<a href="#preview">Interface</a>
				<a href="#ownership">Data ownership</a>
				<a href="#how">How it works</a>
				<a href="#security">Security</a>
			</nav>

			<div class="nav-action">
				{#if data.configured}
					<a class="btn-nav-signin" href="/auth/login" style="white-space: nowrap;">
						{@render googleIcon(16)}
						<span style="white-space: nowrap;">Sign in</span>
					</a>
				{/if}
			</div>
		</div>
	</header>

	<!-- Global Notices -->
	{#if data.error}
		<div class="banner-notice" role="alert">
			<p>{data.error}</p>
			<a href="/" class="dismiss-btn">Dismiss</a>
		</div>
	{/if}

	{#if data.detail}
		<details class="banner-detail">
			<summary>Technical Diagnostics</summary>
			<code>{data.detail}</code>
		</details>
	{/if}

	{#if data.showSetupHint}
		<div class="setup-banner" role="status">
			<div>
				<strong>Configuration Required</strong>
				<p>Set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, and <code>SESSION_SECRET</code> in <code>.env</code>.</p>
			</div>
		</div>
	{/if}

	<!-- Hero Section -->
	<main class="landing-body">
		<section class="hero-section">
			<h1 class="hero-title">
				Financial clarity in a sheet you own.
			</h1>

			<p class="hero-description">
				Sanku writes every transaction directly to your private Google Sheet.
			</p>

			<div class="hero-cta-group">
				{#if data.configured}
					<a class="btn-card-primary" href="/auth/login" style="white-space: nowrap;">
						{@render googleIcon()}
						<span style="white-space: nowrap;">Continue with Google</span>
					</a>
				{:else}
					<button class="btn-card-primary" type="button" disabled style="white-space: nowrap;">
						{@render googleIcon()}
						<span style="white-space: nowrap;">Continue with Google</span>
					</button>
				{/if}

				<a class="btn-card-secondary" href="#preview" style="white-space: nowrap;">
					<span style="white-space: nowrap;">View live interface</span>
				</a>
			</div>

			<div class="hero-trust-bar">
				<span>100% free and open-data</span>
				<span class="trust-sep">/</span>
				<span>Zero private database</span>
				<span class="trust-sep">/</span>
				<span>Restricted <code>drive.file</code> scope</span>
			</div>
		</section>

		<!-- Interactive Product Preview (Stationery Sheet on Felt) -->
		<section class="preview-section" id="preview">
			<div class="stationery-sheet stock">
				<!-- Sheet Title & Tab Bar -->
				<div class="sheet-toolbar">
					<div class="sheet-tabs-groove" role="tablist" aria-label="Interface previews">
						<button
							type="button"
							role="tab"
							class="groove-tab"
							class:active={activePreviewTab === 'overview'}
							aria-selected={activePreviewTab === 'overview'}
							onclick={() => (activePreviewTab = 'overview')}
						>
							Ledger
						</button>
						<button
							type="button"
							role="tab"
							class="groove-tab"
							class:active={activePreviewTab === 'sheet'}
							aria-selected={activePreviewTab === 'sheet'}
							onclick={() => (activePreviewTab = 'sheet')}
						>
							Google Sheet
						</button>
						<button
							type="button"
							role="tab"
							class="groove-tab"
							class:active={activePreviewTab === 'budgets'}
							aria-selected={activePreviewTab === 'budgets'}
							onclick={() => (activePreviewTab = 'budgets')}
						>
							Budget limits
						</button>
					</div>

					<div class="sheet-status-tag">
						<span class="status-stamp">Drive synced</span>
					</div>
				</div>

				<!-- Sheet View Content -->
				<div class="sheet-viewport">
					{#if activePreviewTab === 'overview'}
						<div class="preview-ledger-view">
							<div class="ledger-summary-strip">
								<div class="summary-col">
									<span class="summary-label">Monthly surplus</span>
									<span class="summary-num pos font-outlier">+$4,045.20</span>
								</div>
								<div class="summary-col">
									<span class="summary-label">Income</span>
									<span class="summary-num font-outlier">$5,200.00</span>
								</div>
								<div class="summary-col">
									<span class="summary-label">Expenses</span>
									<span class="summary-num font-outlier">$1,154.80</span>
								</div>
								<div class="summary-col">
									<span class="summary-label">Savings rate</span>
									<span class="summary-num font-outlier">77.8%</span>
								</div>
							</div>

							<div class="ledger-entries-table">
								<div class="table-row table-head">
									<span class="col-date">Date</span>
									<span class="col-desc">Description</span>
									<span class="col-cat">Category</span>
									<span class="col-acc">Account</span>
									<span class="col-amt">Amount</span>
								</div>
								<div class="table-row">
									<span class="col-date font-outlier">Nov 22</span>
									<span class="col-desc">Weekly Whole Foods</span>
									<span class="col-cat"><span class="cat-pill">Groceries</span></span>
									<span class="col-acc">Main Debit</span>
									<span class="col-amt neg font-outlier">−$64.20</span>
								</div>
								<div class="table-row">
									<span class="col-date font-outlier">Nov 21</span>
									<span class="col-desc">Engineering Salary</span>
									<span class="col-cat"><span class="cat-pill">Income</span></span>
									<span class="col-acc">Checking</span>
									<span class="col-amt pos font-outlier">+$4,200.00</span>
								</div>
								<div class="table-row">
									<span class="col-date font-outlier">Nov 20</span>
									<span class="col-desc">Ramen Bar with Friends</span>
									<span class="col-cat"><span class="cat-pill">Dining</span></span>
									<span class="col-acc">Main Debit</span>
									<span class="col-amt neg font-outlier">−$38.50</span>
								</div>
								<div class="table-row">
									<span class="col-date font-outlier">Nov 18</span>
									<span class="col-desc">Electric Charging Station</span>
									<span class="col-cat"><span class="cat-pill">Transport</span></span>
									<span class="col-acc">Main Debit</span>
									<span class="col-amt neg font-outlier">−$52.10</span>
								</div>
							</div>
						</div>
					{:else if activePreviewTab === 'sheet'}
						<div class="preview-raw-sheet">
							<div class="sheet-header-meta">
								<span class="meta-doc">Sanku Finance.xlsx (Google Drive)</span>
								<span class="meta-tag">Restricted drive.file</span>
							</div>

							<div class="spreadsheet-grid">
								<div class="s-row s-head">
									<span class="s-cell cell-index">#</span>
									<span class="s-cell cell-date">Date</span>
									<span class="s-cell cell-type">Type</span>
									<span class="s-cell cell-desc">Description</span>
									<span class="s-cell cell-amt">Amount</span>
									<span class="s-cell cell-acc">Account</span>
								</div>
								<div class="s-row">
									<span class="s-cell cell-index font-outlier">2</span>
									<span class="s-cell cell-date font-outlier">2026-11-22</span>
									<span class="s-cell cell-type">expense</span>
									<span class="s-cell cell-desc">Weekly Whole Foods</span>
									<span class="s-cell cell-amt font-outlier">64.20</span>
									<span class="s-cell cell-acc">Main Debit</span>
								</div>
								<div class="s-row highlight">
									<span class="s-cell cell-index font-outlier">3</span>
									<span class="s-cell cell-date font-outlier">2026-11-21</span>
									<span class="s-cell cell-type">income</span>
									<span class="s-cell cell-desc">Engineering Salary</span>
									<span class="s-cell cell-amt font-outlier">4200.00</span>
									<span class="s-cell cell-acc">Checking</span>
								</div>
								<div class="s-row">
									<span class="s-cell cell-index font-outlier">4</span>
									<span class="s-cell cell-date font-outlier">2026-11-20</span>
									<span class="s-cell cell-type">expense</span>
									<span class="s-cell cell-desc">Ramen Bar with Friends</span>
									<span class="s-cell cell-amt font-outlier">38.50</span>
									<span class="s-cell cell-acc">Main Debit</span>
								</div>
								<div class="s-row">
									<span class="s-cell cell-index font-outlier">5</span>
									<span class="s-cell cell-date font-outlier">2026-11-18</span>
									<span class="s-cell cell-type">expense</span>
									<span class="s-cell cell-desc">Electric Charging Station</span>
									<span class="s-cell cell-amt font-outlier">52.10</span>
									<span class="s-cell cell-acc">Main Debit</span>
								</div>
							</div>

							<div class="sheet-tabs-row">
								<span class="tab-item active">Transactions</span>
								<span class="tab-item">Categories</span>
								<span class="tab-item">Budgets</span>
								<span class="tab-item">Settings</span>
							</div>
						</div>
					{:else}
						<div class="preview-budgets-view">
							<div class="budgets-card-row">
								<div class="budget-card-item">
									<div class="b-row">
										<span class="b-name">Groceries</span>
										<span class="b-nums font-outlier">$320.40 / $500.00</span>
									</div>
									<div class="b-track"><div class="b-fill" style="width: 64%"></div></div>
									<span class="b-remain font-outlier">$179.60 remaining</span>
								</div>
								<div class="budget-card-item">
									<div class="b-row">
										<span class="b-name">Dining out</span>
										<span class="b-nums font-outlier">$245.00 / $300.00</span>
									</div>
									<div class="b-track"><div class="b-fill warning" style="width: 81%"></div></div>
									<span class="b-remain font-outlier">$55.00 remaining</span>
								</div>
								<div class="budget-card-item">
									<div class="b-row">
										<span class="b-name">Transport</span>
										<span class="b-nums font-outlier">$110.00 / $200.00</span>
									</div>
									<div class="b-track"><div class="b-fill" style="width: 55%"></div></div>
									<span class="b-remain font-outlier">$90.00 remaining</span>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</section>

		<!-- Core Architectural Foundations (Feature Stack) -->
		<section class="features-section" id="ownership">
			<h2 class="section-title">Built for financial autonomy.</h2>
			<p class="section-sub">Putting a spreadsheet at the core of your finances ensures permanent data access.</p>

			<div class="features-stack">
				<div class="feature-card stock">
					<div class="feature-card-content">
						<h3>Zero lock-in with permanent data ownership</h3>
						<p>
							Traditional finance apps store your transaction history in closed proprietary databases.
							If they raise prices, change terms, or shut down, your history is trapped.
							With Sanku, every single row exists on your Google Drive as standard data you can open, export, or pipe into any tool forever.
						</p>
					</div>
					<div class="feature-badge">Standard Google Drive file</div>
				</div>

				<div class="feature-card stock">
					<div class="feature-card-content">
						<h3>Restricted OAuth scope security</h3>
						<p>
							Sanku only requests Google’s restricted <code>drive.file</code> scope.
							The app can only view the single spreadsheet created by Sanku.
							It cannot touch, read, or search any other files in your Google Drive.
						</p>
					</div>
					<div class="feature-badge">Restricted scope</div>
				</div>

				<div class="feature-card stock">
					<div class="feature-card-content">
						<h3>Full Google ecosystem integration</h3>
						<p>
							Because your data is a genuine spreadsheet, you can run Google Sheets formulas, write custom Apps Script triggers, hook up Looker Studio visualizers, or share specific tabs with your accountant.
						</p>
					</div>
					<div class="feature-badge">Formula compatibility</div>
				</div>
			</div>
		</section>

		<!-- 3-Step Walkthrough -->
		<section class="how-section" id="how">
			<h2 class="section-title">Three steps to clear records.</h2>

			<div class="steps-row">
				<div class="step-card stock">
					<div class="step-num font-outlier">01</div>
					<h3>Sign in with Google</h3>
					<p>No passwords to create or remember. Sign in with your existing Google account.</p>
				</div>
				<div class="step-card stock">
					<div class="step-num font-outlier">02</div>
					<h3>Auto-provision sheet</h3>
					<p>Sanku creates a formatted spreadsheet directly inside your Google Drive.</p>
				</div>
				<div class="step-card stock">
					<div class="step-num font-outlier">03</div>
					<h3>Track and optimize</h3>
					<p>Record daily spending, configure monthly budgets, and see cashflow trends.</p>
				</div>
			</div>
		</section>

		<!-- Security & Philosophy Quote -->
		<section class="security-section" id="security">
			<div class="quote-card stock">
				<blockquote class="quote-text">
					“The most honest software is the kind that doesn’t hold your data hostage.
					When you can open your financial database in a spreadsheet on your phone, you are in control.”
				</blockquote>
				<div class="quote-author">
					<strong>Sanku Architecture Manifesto</strong>
					<span>Designed with SvelteKit and Google Sheets</span>
				</div>
			</div>
		</section>

		<!-- Final CTA -->
		<section class="cta-section">
			<div class="cta-box stock">
				<h2>Take complete ownership of your finances today.</h2>
				<p>Your first month of clean financial insight starts with one click.</p>
				{#if data.configured}
					<a class="btn-card-primary" href="/auth/login" style="white-space: nowrap;">
						{@render googleIcon()}
						<span style="white-space: nowrap;">Continue with Google</span>
					</a>
				{/if}
			</div>
		</section>
	</main>

	<!-- Footer -->
	<footer class="landing-footer">
		<div class="footer-inner">
			<div class="footer-left">
				{@render brandMark()}
				<span><strong>Sanku</strong> · Financial clarity in your Google Sheet</span>
			</div>
			<div class="footer-right">
				<span>Powered by SvelteKit 3</span>
				<span class="footer-sep">/</span>
				<span>Saved to Google Drive</span>
			</div>
		</div>
	</footer>
</div>