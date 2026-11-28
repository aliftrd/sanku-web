<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { ThemeName } from '#lib/types.ts';
	import { CURRENCIES } from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';
	import * as Select from '#lib/components/ui/select/index.ts';

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
		theme: ThemeName;
		sheetUrl: string;
		onclose: () => void;
		onmanagecategories?: () => void;
		onmanageaccounts?: () => void;
		onlogout?: () => void;
	} = $props();

	let currencyForm: HTMLFormElement | null = $state(null);
	let themeForm: HTMLFormElement | null = $state(null);

	let selectedTheme = $state<ThemeName>(untrack(() => theme));
	let selectedCurrency = $state(untrack(() => currency));

	$effect(() => {
		selectedTheme = theme;
	});

	$effect(() => {
		selectedCurrency = currency;
	});

	function handleThemeChange(newTheme: ThemeName) {
		selectedTheme = newTheme;
		document.documentElement.setAttribute('data-theme', newTheme);
		requestAnimationFrame(() => {
			themeForm?.requestSubmit();
		});
	}

	function handleCurrencyChange(next: string) {
		selectedCurrency = next;
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
	const THEME_OPTIONS: Array<{ id: ThemeName; label: string; dotClass: string }> = [
		{ id: 'coral', label: 'Coral', dotClass: 'bg-coral' },
		{ id: 'marigold', label: 'Marigold', dotClass: 'bg-marigold' },
		{ id: 'periwinkle', label: 'Periwinkle', dotClass: 'bg-periwinkle' },
		{ id: 'sky-mint', label: 'Sky Mint', dotClass: 'bg-sky-mint' }
	];
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if open}
	<!-- Neutral Dimmed Backdrop -->
	<div
		class="bg-ink/80 fixed inset-0 z-50 backdrop-blur-[2px] transition-opacity"
		onclick={onclose}
		aria-hidden="true"
	></div>

	<!-- Slide-Over Right Drawer (440px, Stitch Editorial Pop) -->
	<div
		class="bg-surface-container-low border-outline-variant gap-gutter-lg fixed inset-y-0 right-0 z-50 flex w-full max-w-full flex-col justify-between overflow-y-auto border-l p-4 shadow-2xl sm:max-w-[440px] sm:p-6"
		role="dialog"
		aria-modal="true"
		aria-labelledby="settings-drawer-title"
	>
		<div class="gap-gutter-lg flex flex-col">
			<!-- Drawer Header -->
			<header class="flex items-center justify-between gap-3">
				<div class="gap-gutter-sm flex items-center">
					<button
						type="button"
						onclick={onclose}
						aria-label="Kembali"
						class="bg-pill-white text-on-pill-white flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-opacity hover:opacity-90"
					>
						<span class="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span>
					</button>
					<h2 id="settings-drawer-title" class="font-headline text-headline-lg text-on-surface uppercase">
						SETTINGS &amp; SYNC
					</h2>
				</div>
				<span class="bg-income text-on-income font-label text-label-sm rounded-full px-3 py-1 uppercase">
					CONNECTED
				</span>
			</header>

			<!-- Section 1: Appearance & Localization (Charcoal Bento Card) -->
			<section class="bg-surface-card border-outline-variant gap-gutter-md flex flex-col rounded-xl border p-5">
				<div class="font-label text-label-sm text-on-surface-variant uppercase">
					APPEARANCE &amp; LOCALIZATION
				</div>

				<form
					method="POST"
					action="?/setCurrency"
					bind:this={currencyForm}
					use:enhance={() => async ({ update }) => {
						await update();
					}}
					class="flex items-center justify-between gap-3"
				>
					<label for="drawer-currency" class="font-title text-title-md text-on-surface">
						Currency
					</label>
					<Select.Root
						type="single"
						name="currency"
						value={selectedCurrency}
						onValueChange={handleCurrencyChange}
					>
						<Select.Trigger id="drawer-currency" size="sm" class="font-label text-label-md w-auto min-w-[168px] px-4 py-1.5">
							{selectedCurrency} · {CURRENCIES.find((c) => c.code === selectedCurrency)?.label ?? ''}
						</Select.Trigger>
						<Select.Content align="end">
							{#each CURRENCIES as c (c.code)}
								<Select.Item value={c.code} label={`${c.code} · ${c.label}`}>
									{c.code} · {c.label}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</form>

				<form
					method="POST"
					action="?/setTheme"
					bind:this={themeForm}
					use:enhance={() => async ({ update }) => {
						await update();
					}}
					class="flex items-center justify-between gap-3"
				>
					<input type="hidden" name="theme" value={selectedTheme} />
					<span class="font-title text-title-md text-on-surface">Accent Theme</span>
					<div class="gap-gutter-xs flex items-center" role="group" aria-label="Accent Theme">
						{#each THEME_OPTIONS as item (item.id)}
							{@const active = selectedTheme === item.id}
							<button
								type="button"
								onclick={() => handleThemeChange(item.id)}
								title={item.label}
								aria-label={`Use ${item.label} accent theme`}
								aria-pressed={active}
								class={cn(
									'size-7 cursor-pointer rounded-full transition-transform hover:scale-110',
									item.dotClass,
									active ? 'border-pill-white scale-110 border-2' : 'border border-ink/40'
								)}
							></button>
						{/each}
					</div>
				</form>
			</section>

			<!-- Section 2: Google Sheet Database (Marigold Card) -->
			<section class="bg-marigold text-on-marigold gap-gutter-md flex flex-col rounded-xl p-5">
				<div class="gap-gutter-sm flex items-start justify-between">
					<div>
						<span class="bg-ink text-on-surface font-label text-label-sm rounded-full px-2.5 py-0.5 uppercase">
							GOOGLE DRIVE
						</span>
						<h3 class="font-headline text-headline-md mt-2 uppercase">
							SANKU FINANCE.GSHEET
						</h3>
						<p class="font-body text-body-sm text-ink/80">
							Connected &amp; real-time two-way synced
						</p>
					</div>
					<a
						href={sheetUrl}
						target="_blank"
						rel="noreferrer"
						aria-label="Buka Google Sheet"
						title="Open Google Sheet"
						class="bg-ink text-on-surface flex size-10 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105"
					>
						<span class="material-symbols-outlined text-[18px]" aria-hidden="true">north_east</span>
					</a>
				</div>

				<div class="flex flex-wrap gap-1.5" aria-label="Synced worksheet tabs">
					{#each SYNCED_TABS as tab (tab)}
						<span class="bg-pill-white text-on-pill-white font-label text-label-sm rounded-full px-2.5 py-1">
							{tab}
						</span>
					{/each}
				</div>
			</section>

			{#if onmanagecategories || onmanageaccounts}
				<section class="bg-surface-card border-outline-variant gap-gutter-sm flex flex-col rounded-xl border p-5">
					<div class="font-label text-label-sm text-on-surface-variant uppercase">QUICK JUMP</div>
					<div class="grid grid-cols-2 gap-2">
						{#if onmanageaccounts}
							<button
								type="button"
								onclick={onmanageaccounts}
								class="bg-surface-container text-on-surface hover:bg-pill-white hover:text-on-pill-white font-label text-label-sm flex cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 py-2 transition-colors"
							>
								<span class="material-symbols-outlined text-[16px]" aria-hidden="true">account_balance</span>
								<span>Accounts</span>
							</button>
						{/if}
						{#if onmanagecategories}
							<button
								type="button"
								onclick={onmanagecategories}
								class="bg-surface-container text-on-surface hover:bg-pill-white hover:text-on-pill-white font-label text-label-sm flex cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 py-2 transition-colors"
							>
								<span class="material-symbols-outlined text-[16px]" aria-hidden="true">category</span>
								<span>Budgets</span>
							</button>
						{/if}
					</div>
				</section>
			{/if}

			<!-- Section 3: Privacy & Security (Sky Mint Card) -->
			<section class="bg-sky-mint text-on-sky-mint gap-gutter-sm flex flex-col rounded-xl p-5">
				<div class="gap-gutter-xs font-headline text-headline-md flex items-center uppercase">
					<span class="material-symbols-outlined text-[18px]" aria-hidden="true">shield_lock</span>
					<span>PRIVACY &amp; SECURITY</span>
				</div>
				<p class="font-body text-body-sm text-ink/85">
					Zero Private Database · Authenticated via Google OAuth 2.0 + PKCE (
					<code class="bg-ink text-on-surface rounded px-1 py-0.5 font-mono text-[11px]">drive.file</code>
					scope only) &amp; encrypted JWE A256GCM session.
				</p>
			</section>
		</div>

		<!-- Footer & Sign Out Button -->
		<div class="gap-gutter-sm flex flex-col pt-2">
			<div class="flex items-center justify-between px-1">
				<span class="font-mono text-mono-sm text-on-surface-variant min-w-0 truncate">
					{user.email}
				</span>
				<span class="font-mono text-mono-sm text-on-surface-variant shrink-0">Sanku v2.4</span>
			</div>

			<button
				type="button"
				onclick={() => onlogout?.()}
				class="bg-coral text-on-coral font-label text-label-lg gap-gutter-xs flex w-full cursor-pointer items-center justify-center rounded-full py-3 tracking-wider uppercase transition-opacity hover:opacity-90"
			>
				<span class="material-symbols-outlined text-[18px]" aria-hidden="true">logout</span>
				<span>Sign Out</span>
			</button>
		</div>
	</div>
{/if}
