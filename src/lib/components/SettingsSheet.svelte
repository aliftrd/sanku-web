<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import CustomSelect from './CustomSelect.svelte';
	import { CURRENCIES } from '#lib/finance.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';

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
	<div
		class="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-xs"
		onclick={onclose}
		aria-hidden="true"
	></div>

	<!-- Slide-Over Right Sheet -->
	<div
		class="bg-card text-card-foreground border-border fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-label="Settings"
	>
		<!-- Header -->
		<div class="border-border flex shrink-0 items-center justify-between border-b px-6 py-4">
			<div class="flex items-center gap-3">
				<div class="bg-muted border-border flex size-9 items-center justify-center rounded-lg border">
					<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<circle cx="12" cy="12" r="3" />
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
					</svg>
				</div>
				<div>
					<h2 class="text-base font-bold tracking-tight">Settings</h2>
					<p class="text-muted-foreground text-xs">Preferences & account settings</p>
				</div>
			</div>

			<Button variant="outline" size="icon-sm" onclick={onclose} aria-label="Close settings">
				✕
			</Button>
		</div>

		<!-- Body Scroller -->
		<div class="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
			<!-- User Account Card -->
			<section class="space-y-2.5">
				<span class="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">Account</span>
				<div class="border-border bg-muted/50 flex items-center justify-between gap-3 rounded-xl border p-3.5">
					<div class="flex min-w-0 items-center gap-3">
						{#if user.picture}
							<img src={user.picture} alt="" referrerpolicy="no-referrer" class="border-border size-10 shrink-0 rounded-full border object-cover" />
						{:else}
							<div class="border-border bg-card flex size-10 shrink-0 items-center justify-center rounded-full border text-xs font-bold">
								{initials}
							</div>
						{/if}
						<div class="flex min-w-0 flex-col">
							<strong class="truncate text-sm font-semibold">{user.name}</strong>
							<span class="text-muted-foreground truncate text-xs">{user.email}</span>
						</div>
					</div>

					<Button
						variant="outline"
						size="sm"
						class="hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 shrink-0"
						onclick={() => onlogout?.()}
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
					</Button>
				</div>
			</section>

			<!-- Preferences (Currency & Theme) -->
			<section class="space-y-3">
				<span class="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">Display & Formatting</span>

				<div class="border-border bg-card flex flex-col gap-2.5 rounded-xl border p-3.5">
					<div class="space-y-0.5">
						<strong class="block text-sm font-semibold">Currency</strong>
						<span class="text-muted-foreground block text-xs">Display currency for balances and calculations</span>
					</div>
					<form
						method="POST"
						action="?/setCurrency"
						bind:this={currencyForm}
						class="w-full"
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

				<div class="border-border bg-card flex flex-col gap-2.5 rounded-xl border p-3.5">
					<div class="space-y-0.5">
						<strong class="block text-sm font-semibold">Theme Accent</strong>
						<span class="text-muted-foreground block text-xs">Color tone for buttons, graphs, and badges</span>
					</div>
					<form
						method="POST"
						action="?/setTheme"
						bind:this={themeForm}
						class="w-full"
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
			<section class="space-y-2.5">
				<span class="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">Cloud Database</span>
				<div class="flex flex-col gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
					<div class="flex items-center justify-between gap-2">
						<Badge variant="success" class="gap-1.5">
							<span class="size-1.5 animate-pulse rounded-full bg-emerald-600"></span>
							<span>Google Drive Connected</span>
						</Badge>
						<Button
							variant="outline"
							size="sm"
							href={sheetUrl}
							target="_blank"
							rel="noreferrer"
							class="h-7 border-emerald-200 bg-white px-2.5 text-xs text-emerald-700 hover:bg-emerald-50"
							title="Open Google Spreadsheet"
						>
							<span>Open Sheet</span>
							<svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
								<path d="M4.5 2.5h7v7M11.5 2.5 3 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</Button>
					</div>
					<p class="text-muted-foreground text-xs leading-relaxed">
						All transactions, categories, and account balances are safely stored in your own Google Drive spreadsheet.
					</p>
				</div>
			</section>

			<!-- Quick Management -->
			<section class="space-y-2.5">
				<span class="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">Organization</span>
				<div class="flex flex-col gap-2">
					{#if onmanagecategories}
						<button
							type="button"
							class="border-border bg-card hover:bg-accent/60 flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-left transition-colors"
							onclick={onmanagecategories}
						>
							<div class="text-lg">🏷</div>
							<div class="min-w-0 flex-1">
								<strong class="block text-sm font-semibold">Categories & Budgets</strong>
								<small class="text-muted-foreground block text-xs">Configure spending limits & tags</small>
							</div>
							<span class="text-muted-foreground text-base">›</span>
						</button>
					{/if}

					{#if onmanageaccounts}
						<button
							type="button"
							class="border-border bg-card hover:bg-accent/60 flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-left transition-colors"
							onclick={onmanageaccounts}
						>
							<div class="text-lg">💳</div>
							<div class="min-w-0 flex-1">
								<strong class="block text-sm font-semibold">Accounts & Wallets</strong>
								<small class="text-muted-foreground block text-xs">Bank accounts, cards, and cash</small>
							</div>
							<span class="text-muted-foreground text-base">›</span>
						</button>
					{/if}
				</div>
			</section>
		</div>

		<!-- Footer -->
		<div class="border-border flex shrink-0 items-center justify-between border-t px-6 py-4">
			<span class="text-muted-foreground text-xs">Sanku Finance · Google Sheets Ledger</span>
			<Button size="sm" onclick={onclose}>Done</Button>
		</div>
	</div>
{/if}
