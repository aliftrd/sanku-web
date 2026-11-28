<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { CURRENCIES } from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';

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

	$effect(() => {
		selectedTheme = theme;
	});

	$effect(() => {
		selectedCurrency = currency;
	});

	function handleThemeChange(newTheme: 'orange' | 'sky' | 'forest') {
		selectedTheme = newTheme;
		document.documentElement.setAttribute('data-theme', newTheme);
		requestAnimationFrame(() => {
			themeForm?.requestSubmit();
		});
	}

	function handleCurrencyChange(event: Event) {
		selectedCurrency = (event.target as HTMLSelectElement).value;
		requestAnimationFrame(() => {
			currencyForm?.requestSubmit();
		});
	}

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

	const SYNCED_TABS = ['Transactions', 'Categories', 'Wallets', 'SplitBills', 'Settings'] as const;
	const THEME_OPTIONS = [
		{ id: 'orange', label: 'Orange', dotClass: 'bg-swatch-orange' },
		{ id: 'sky', label: 'Sky', dotClass: 'bg-theme-sky' },
		{ id: 'forest', label: 'Forest', dotClass: 'bg-theme-forest' }
	] as const;
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if open}
	<!-- Neutral Dimmed Backdrop -->
	<div
		class="bg-on-surface/40 fixed inset-0 z-50 transition-opacity"
		onclick={onclose}
		aria-hidden="true"
	></div>

	<!-- Slide-Over Right Drawer (420px) -->
	<div
		class="bg-surface-card border-outline fixed inset-y-0 right-0 z-50 flex w-full flex-col justify-between border-l shadow-2xl md:w-[420px]"
		role="dialog"
		aria-modal="true"
		aria-labelledby="settings-drawer-title"
	>
		<!-- Drawer Header -->
		<header class="border-outline flex shrink-0 items-center justify-between gap-gutter-sm border-b px-gutter-lg py-gutter-md">
			<div>
				<h2 id="settings-drawer-title" class="font-headline text-headline-md text-on-surface">
					Settings &amp; Sync
				</h2>
				<p class="font-body text-body-sm text-on-surface-variant">
					Preferences, Google Drive database, and security
				</p>
			</div>
			<button
				type="button"
				onclick={onclose}
				aria-label="Close settings drawer"
				class="border-outline text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors duration-state-change"
			>
				<span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
			</button>
		</header>

		<!-- Drawer Body -->
		<div class="flex flex-1 flex-col gap-gutter-lg overflow-y-auto p-gutter-lg">
			<!-- Section 1: Appearance & Localization -->
			<section class="flex flex-col gap-gutter-md">
				<h3 class="font-title text-title-md text-on-surface">Appearance &amp; Localization</h3>

				<form
					method="POST"
					action="?/setCurrency"
					bind:this={currencyForm}
					use:enhance={() => async ({ update }) => {
						await update();
					}}
				>
					<label class="flex flex-col gap-1.5">
						<span class="font-label text-label-md text-on-surface-variant">Currency</span>
						<select
							name="currency"
							value={selectedCurrency}
							onchange={handleCurrencyChange}
							class="border-outline bg-surface-container-high font-body text-body-md text-on-surface focus:border-primary focus:bg-surface-card focus:ring-primary w-full rounded border px-3 py-2 outline-none focus:ring-1"
						>
							{#each CURRENCIES as c (c.code)}
								<option value={c.code}>{c.code} · {c.label}</option>
							{/each}
						</select>
					</label>
				</form>

				<form
					method="POST"
					action="?/setTheme"
					bind:this={themeForm}
					use:enhance={() => async ({ update }) => {
						await update();
					}}
					class="flex flex-col gap-2"
				>
					<input type="hidden" name="theme" value={selectedTheme} />
					<span class="font-label text-label-md text-on-surface-variant">Accent Theme</span>
					<div class="grid grid-cols-3 gap-2">
						{#each THEME_OPTIONS as item (item.id)}
							{@const active = selectedTheme === item.id}
							<button
								type="button"
								onclick={() => handleThemeChange(item.id)}
								class={cn(
									'font-label text-label-sm text-on-surface flex cursor-pointer items-center gap-2 rounded p-2.5 transition-colors duration-state-change',
									active
										? 'border-accent-orange bg-primary-container/40 border-2'
										: 'border-outline bg-surface-card hover:bg-surface-container-low border'
								)}
							>
								<span class={cn('size-3.5 shrink-0 rounded-full', item.dotClass)} aria-hidden="true"></span>
								<span>{item.label}</span>
							</button>
						{/each}
					</div>
				</form>
			</section>

			<hr class="border-outline" />

			<!-- Section 2: Google Sheet Database -->
			<section class="flex flex-col gap-gutter-sm">
				<h3 class="font-title text-title-md text-on-surface">Google Sheet Database</h3>

				<div class="border-outline bg-surface-container-high flex flex-col gap-gutter-md rounded-md border p-gutter-md">
					<div class="flex items-center gap-2.5">
						<span class="bg-income size-2.5 shrink-0 rounded-full" aria-hidden="true"></span>
						<div class="min-w-0">
							<p class="font-title text-title-md text-on-surface text-balance">
								Connected to 'Sanku Finance' in Google Drive
							</p>
							<p class="font-body text-body-sm text-on-surface-variant">
								Real-time two-way ledger sync active
							</p>
						</div>
					</div>

					<div class="flex flex-wrap gap-1.5" aria-label="Synced worksheet tabs">
						{#each SYNCED_TABS as tab (tab)}
							<span class="bg-surface-card border-outline font-mono text-mono-sm text-on-surface rounded-full border px-2 py-0.5">
								{tab}
							</span>
						{/each}
					</div>

					<a
						href={sheetUrl}
						target="_blank"
						rel="noreferrer"
						class="bg-surface-card border-outline font-label text-label-md text-on-surface hover:bg-surface-container-low hover:border-outline-variant block w-full rounded border px-3 py-2 text-center transition-colors duration-state-change"
					>
						Open Google Sheet ↗
					</a>
				</div>
			</section>

			{#if onmanagecategories || onmanageaccounts}
				<hr class="border-outline" />
				<section class="flex flex-col gap-gutter-sm">
					<h3 class="font-title text-title-md text-on-surface">Quick Jump</h3>
					<div class="grid grid-cols-2 gap-2">
						{#if onmanageaccounts}
							<button
								type="button"
								onclick={onmanageaccounts}
								class="border-outline bg-surface-card hover:bg-surface-container-low font-label text-label-sm text-on-surface flex cursor-pointer items-center justify-center gap-1.5 rounded border px-3 py-2 transition-colors"
							>
								<span class="material-symbols-outlined text-[16px]" aria-hidden="true">account_balance</span>
								<span>Accounts</span>
							</button>
						{/if}
						{#if onmanagecategories}
							<button
								type="button"
								onclick={onmanagecategories}
								class="border-outline bg-surface-card hover:bg-surface-container-low font-label text-label-sm text-on-surface flex cursor-pointer items-center justify-center gap-1.5 rounded border px-3 py-2 transition-colors"
							>
								<span class="material-symbols-outlined text-[16px]" aria-hidden="true">category</span>
								<span>Budgets</span>
							</button>
						{/if}
					</div>
				</section>
			{/if}

			<hr class="border-outline" />

			<!-- Section 3: Privacy & Security -->
			<section class="flex flex-col gap-gutter-sm">
				<h3 class="font-title text-title-md text-on-surface">Privacy &amp; Security</h3>

				<div class="border-outline bg-income-container/50 flex items-start gap-2.5 rounded-md border p-3.5">
					<span class="material-symbols-outlined text-on-income-container mt-0.5 shrink-0 text-[18px]" aria-hidden="true">
						verified_user
					</span>
					<p class="font-body text-body-sm text-on-surface">
						Zero Private Database · Authenticated via Google OAuth 2.0 + PKCE (
						<code class="font-mono text-mono-sm">drive.file</code> scope only) &amp; encrypted JWE A256GCM session.
					</p>
				</div>

				<button
					type="button"
					onclick={() => onlogout?.()}
					class="bg-surface-card border-outline font-label text-label-md text-on-expense-container hover:bg-expense-container mt-1 w-full cursor-pointer rounded border px-3 py-2 transition-colors duration-state-change"
				>
					Sign Out
				</button>
			</section>
		</div>

		<!-- Drawer Footer -->
		<footer class="border-outline bg-surface-container-high flex shrink-0 items-center justify-between gap-2 border-t px-gutter-lg py-3">
			<span class="font-mono text-mono-sm text-on-surface-variant min-w-0 truncate">
				{user.email}
			</span>
			<span class="font-body text-body-sm text-on-surface-variant shrink-0">Sanku v2.4</span>
		</footer>
	</div>
{/if}
