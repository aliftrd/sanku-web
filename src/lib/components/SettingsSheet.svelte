<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import CustomSelect from './CustomSelect.svelte';
	import { CURRENCIES } from '#lib/finance.ts';

	let {
		open = false,
		user,
		currency,
		theme,
		sheetUrl,
		onclose,
		onmanagecategories,
		onmanageaccounts,
		onlogout
	}: {
		open: boolean;
		user: { name: string; email: string; picture?: string | null };
		currency: string;
		theme: string;
		sheetUrl: string;
		onclose: () => void;
		onmanagecategories?: () => void;
		onmanageaccounts?: () => void;
		onlogout?: () => void;
	} = $props();

	let currencyForm: HTMLFormElement | null = $state(null);
	let themeForm: HTMLFormElement | null = $state(null);

	let selectedTheme = $state(untrack(() => theme));
	let selectedCurrency = $state(untrack(() => currency));
	let confirmSignOut = $state(false);

	$effect(() => {
		selectedTheme = theme;
	});

	$effect(() => {
		selectedCurrency = currency;
	});

	function handleThemeChange(newTheme: string) {
		selectedTheme = newTheme;
		document.documentElement.setAttribute('data-theme', newTheme);
		if (themeForm) {
			themeForm.requestSubmit();
		}
	}

	function handleCurrencyChange(newCurrency: string) {
		selectedCurrency = newCurrency;
		if (currencyForm) {
			currencyForm.requestSubmit();
		}
	}

	let initials = $derived(
		user.name
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('') || 'U'
	);

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			onclose();
		}
	}

	$effect(() => {
		if (open) {
			const originalOverflow = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = originalOverflow;
			};
		}
	});
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if open}
	<!-- Backdrop Overlay -->
	<div class="sheet-backdrop" onclick={onclose} aria-hidden="true"></div>

	<!-- Slide-Over Right Sheet -->
	<div class="sheet-drawer" role="dialog" aria-modal="true" aria-label="Settings">
		<!-- Header -->
		<div class="sheet-header">
			<div class="sheet-title-group">
				<div class="sheet-header-icon">
					<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<circle cx="12" cy="12" r="3" />
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
					</svg>
				</div>
				<div>
					<h2>Settings</h2>
					<p class="sheet-subtitle">Preferences & account settings</p>
				</div>
			</div>

			<button type="button" class="btn-close-sheet" onclick={onclose} aria-label="Close settings">
				✕
			</button>
		</div>

		<!-- Body Scroller -->
		<div class="sheet-body">
			<!-- User Account Card -->
			<section class="sheet-section">
				<span class="section-tag">Account</span>
				<div class="profile-card">
					<div class="profile-info">
						{#if user.picture}
							<img src={user.picture} alt="" referrerpolicy="no-referrer" class="profile-avatar" />
						{:else}
							<div class="profile-avatar placeholder">{initials}</div>
						{/if}
						<div class="profile-text">
							<strong>{user.name}</strong>
							<span>{user.email}</span>
						</div>
					</div>

					<button
						type="button"
						class="btn-logout-sheet"
						onclick={() => {
							if (onlogout) {
								onlogout();
							} else {
								confirmSignOut = true;
							}
						}}
					>
						<svg viewBox="0 0 18 18" width="13" height="13" aria-hidden="true">
							<path
								d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5v9A1.5 1.5 0 0 0 4.5 15H7M11.5 12.5 15 9l-3.5-3.5M7.5 9H15"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						<span>Sign out</span>
					</button>
				</div>
			</section>

			<!-- Preferences (Currency & Theme) -->
			<section class="sheet-section">
				<span class="section-tag">Display & Formatting</span>

				<!-- Currency -->
				<div class="setting-item">
					<div class="setting-item-label">
						<strong>Currency</strong>
						<span>Display currency for balances and calculations</span>
					</div>
					<form
						method="POST"
						action="?/setCurrency"
						bind:this={currencyForm}
						class="setting-form-control"
						use:enhance={() => async ({ update }) => {
							await update();
						}}
					>
						<CustomSelect
							value={selectedCurrency}
							name="currency"
							options={CURRENCIES.map((c) => ({
								value: c.code,
								label: `${c.code} · ${c.label}`,
								badge: c.code
							}))}
							onchange={handleCurrencyChange}
							align="right"
						/>
					</form>
				</div>

				<!-- Theme Style -->
				<div class="setting-item">
					<div class="setting-item-label">
						<strong>Theme Accent</strong>
						<span>Color tone for buttons, graphs, and badges</span>
					</div>
					<form
						method="POST"
						action="?/setTheme"
						bind:this={themeForm}
						class="setting-form-control"
						use:enhance={() => async ({ update }) => {
							await update();
						}}
					>
						<CustomSelect
							value={selectedTheme}
							name="theme"
							options={[
								{ value: 'orange', label: 'Sunset Slate', icon: '🌅', color: '#ea580c' },
								{ value: 'sky', label: 'Cobalt Sky', icon: '🌌', color: '#2563eb' },
								{ value: 'forest', label: 'Emerald Sage', icon: '🌿', color: '#059669' }
							]}
							onchange={handleThemeChange}
							align="right"
						/>
					</form>
				</div>
			</section>

			<!-- Google Spreadsheet Sync -->
			<section class="sheet-section">
				<span class="section-tag">Cloud Database</span>
				<div class="sheet-sync-card">
					<div class="sync-status-row">
						<div class="sync-pill">
							<span class="sync-pulse"></span>
							<span>Google Drive Connected</span>
						</div>
						<a
							href={sheetUrl}
							target="_blank"
							rel="noreferrer"
							class="btn-open-drive"
							title="Open Google Spreadsheet"
						>
							<span>Open Sheet</span>
							<svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
								<path d="M4.5 2.5h7v7M11.5 2.5 3 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</a>
					</div>
					<p class="sync-note">
						All transactions, categories, and account balances are safely stored in your own Google Drive spreadsheet.
					</p>
				</div>
			</section>

			<!-- Quick Management -->
			<section class="sheet-section">
				<span class="section-tag">Organization</span>
				<div class="management-grid">
					{#if onmanagecategories}
						<button type="button" class="btn-manage-shortcut" onclick={onmanagecategories}>
							<div class="shortcut-icon">🏷</div>
							<div class="shortcut-text">
								<strong>Categories & Budgets</strong>
								<small>Configure spending limits & tags</small>
							</div>
							<span class="shortcut-arrow">›</span>
						</button>
					{/if}

					{#if onmanageaccounts}
						<button type="button" class="btn-manage-shortcut" onclick={onmanageaccounts}>
							<div class="shortcut-icon">💳</div>
							<div class="shortcut-text">
								<strong>Accounts & Wallets</strong>
								<small>Bank accounts, cards, and cash</small>
							</div>
							<span class="shortcut-arrow">›</span>
						</button>
					{/if}
				</div>
			</section>
		</div>

		<!-- Footer -->
		<div class="sheet-footer">
			<span class="sheet-version">Sanku Finance · Google Sheets Ledger</span>
			<button type="button" class="btn-done" onclick={onclose}>
				Done
			</button>
		</div>
	</div>
{/if}

<style>
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.45);
		backdrop-filter: blur(4px);
		z-index: 1000;
		animation: sheetFadeIn 160ms ease forwards;
	}

	@keyframes sheetFadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.sheet-drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 100%;
		max-width: 440px;
		background: var(--surface);
		border-left: 1px solid var(--border);
		box-shadow: -8px 0 32px rgba(0, 0, 0, 0.14);
		z-index: 1001;
		display: flex;
		flex-direction: column;
		animation: sheetSlideIn 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	@keyframes sheetSlideIn {
		from { transform: translateX(100%); }
		to { transform: translateX(0); }
	}

	.sheet-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 24px;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
		flex-shrink: 0;
	}

	.sheet-title-group {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.sheet-header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-md);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		color: var(--ink);
	}

	.sheet-header h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--ink);
	}

	.sheet-subtitle {
		margin: 2px 0 0;
		font-size: 12px;
		color: var(--muted);
	}

	.btn-close-sheet {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--muted);
		font-size: 14px;
		cursor: pointer;
		transition: all 120ms ease;
	}

	.btn-close-sheet:hover {
		color: var(--ink);
		background: var(--surface-hover);
		border-color: var(--border-strong);
	}

	.sheet-body {
		flex: 1;
		overflow-y: auto;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.sheet-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.section-tag {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted-light);
	}

	/* Profile Card */
	.profile-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-subtle);
		gap: 12px;
	}

	.profile-info {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}

	.profile-avatar {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		border: 1px solid var(--border);
		object-fit: cover;
		flex-shrink: 0;
	}

	.profile-avatar.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--surface);
		font-size: 13px;
		font-weight: 700;
		color: var(--ink);
	}

	.profile-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.profile-text strong {
		font-size: 13.5px;
		font-weight: 650;
		color: var(--ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.profile-text span {
		font-size: 11.5px;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.btn-logout-sheet {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 30px;
		padding: 0 10px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--muted);
		font-size: 11.5px;
		font-weight: 600;
		cursor: pointer;
		transition: all 120ms ease;
		flex-shrink: 0;
	}

	.btn-logout-sheet:hover {
		color: #ef4444;
		border-color: #fca5a5;
		background: #fef2f2;
	}

	/* Setting Item */
	.setting-item {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
	}

	.setting-item-label {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.setting-item-label strong {
		font-size: 13px;
		font-weight: 650;
		color: var(--ink);
	}

	.setting-item-label span {
		font-size: 11.5px;
		color: var(--muted);
	}

	.setting-form-control {
		width: 100%;
		margin-top: 4px;
	}

	.setting-form-control :global(.custom-select-root) {
		width: 100%;
	}

	/* Sheet Sync Card */
	.sheet-sync-card {
		padding: 14px 16px;
		border: 1px solid var(--green-border);
		border-radius: var(--radius-md);
		background: var(--green-soft);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.sync-status-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.sync-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 650;
		color: var(--green-deep);
	}

	.sync-pulse {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--green);
		animation: pulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	@keyframes pulseRing {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.5; transform: scale(1.2); }
	}

	.btn-open-drive {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 28px;
		padding: 0 10px;
		border-radius: var(--radius-sm);
		background: var(--surface);
		border: 1px solid var(--green-border);
		color: var(--green-deep);
		font-size: 11.5px;
		font-weight: 600;
		text-decoration: none;
		transition: background 120ms ease;
	}

	.btn-open-drive:hover {
		background: #ffffff;
	}

	.sync-note {
		margin: 0;
		font-size: 11.5px;
		color: var(--muted);
		line-height: 1.45;
	}

	/* Management shortcuts */
	.management-grid {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.btn-manage-shortcut {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		cursor: pointer;
		text-align: left;
		transition: all 120ms ease;
	}

	.btn-manage-shortcut:hover {
		border-color: var(--border-strong);
		background: var(--surface-hover);
		transform: translateX(2px);
	}

	.shortcut-icon {
		font-size: 18px;
		flex-shrink: 0;
	}

	.shortcut-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.shortcut-text strong {
		font-size: 13px;
		font-weight: 650;
		color: var(--ink);
	}

	.shortcut-text small {
		font-size: 11.5px;
		color: var(--muted);
	}

	.shortcut-arrow {
		font-size: 16px;
		color: var(--muted-light);
	}

	/* Footer */
	.sheet-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 24px;
		border-top: 1px solid var(--border);
		background: var(--surface);
		flex-shrink: 0;
	}

	.sheet-version {
		font-size: 11px;
		color: var(--muted-light);
	}

	.btn-done {
		height: 32px;
		padding: 0 16px;
		border-radius: var(--radius-sm);
		background: var(--theme-primary);
		color: #ffffff;
		border: none;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
		transition: background 120ms ease;
	}

	.btn-done:hover {
		background: var(--theme-primary-hover);
	}

	@media (max-width: 480px) {
		.sheet-drawer {
			max-width: 100%;
		}

		.sheet-header {
			padding: 16px 18px;
		}

		.sheet-header-icon {
			width: 32px;
			height: 32px;
		}

		.sheet-header h2 {
			font-size: 16px;
		}

		.sheet-body {
			padding: 18px 16px;
			gap: 20px;
		}

		.profile-card {
			padding: 12px 14px;
		}

		.sheet-footer {
			padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
