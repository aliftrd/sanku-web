<script lang="ts">
	import type { Wallet, WalletKind } from '#lib/types.ts';
	import { formatMoney } from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';

	type WalletWithStats = Wallet & { count: number };

	let {
		wallets,
		currency,
		onclose,
		onadd,
		onedit,
		onfilter
	}: {
		wallets: WalletWithStats[];
		currency: string;
		onclose: () => void;
		onadd: () => void;
		onedit: (wallet: Wallet) => void;
		onfilter: (accountName: string) => void;
	} = $props();

	let search = $state('');
	let filterKind = $state<'all' | WalletKind>('all');

	const KIND_LABELS: Record<WalletKind, string> = {
		bank: 'Bank',
		cash: 'Cash',
		card: 'Card',
		savings: 'Savings',
		investment: 'Investment'
	};

	const totalBalance = $derived(wallets.reduce((sum, w) => sum + w.balance, 0));

	const filteredWallets = $derived.by(() => {
		const needle = search.trim().toLowerCase();
		return wallets.filter((w) => {
			if (filterKind !== 'all' && w.kind !== filterKind) return false;
			if (!needle) return true;
			return (
				w.name.toLowerCase().includes(needle) ||
				(KIND_LABELS[w.kind] ?? w.kind).toLowerCase().includes(needle)
			);
		});
	});

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onclose();
	}

	$effect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-xs sm:p-4"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget) onclose();
	}}
>
	<div
		class="bg-card text-card-foreground border-border flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="accounts-list-title"
	>
		<!-- Header -->
		<header class="border-border flex items-start justify-between gap-3 border-b px-5 py-4 sm:px-6">
			<div class="space-y-0.5">
				<span class="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
					All Accounts & Wallets
				</span>
				<h2 id="accounts-list-title" class="text-lg font-bold tracking-tight">
					{wallets.length} {wallets.length === 1 ? 'account' : 'accounts'} · {formatMoney(totalBalance, currency)}
				</h2>
			</div>
			<div class="flex items-center gap-2">
				<Button size="sm" onclick={onadd}>+ Add Account</Button>
				<Button variant="ghost" size="icon-sm" aria-label="Close" onclick={onclose}>
					✕
				</Button>
			</div>
		</header>

		<!-- Filters -->
		<div class="border-border bg-muted/25 flex flex-col gap-2.5 border-b px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
			<div class="relative flex-1 sm:max-w-xs">
				<Input
					bind:value={search}
					placeholder="Search accounts..."
					aria-label="Search accounts"
					class="h-8 text-xs"
				/>
			</div>

			<div class="flex flex-wrap items-center gap-1">
				{#each [
					{ id: 'all', label: 'All' },
					{ id: 'bank', label: 'Bank' },
					{ id: 'cash', label: 'Cash' },
					{ id: 'card', label: 'Card' },
					{ id: 'savings', label: 'Savings' },
					{ id: 'investment', label: 'Investment' }
				] as tab (tab.id)}
					<button
						type="button"
						class={cn(
							'cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
							filterKind === tab.id
								? 'bg-primary text-primary-foreground'
								: 'bg-muted text-muted-foreground hover:text-foreground'
						)}
						onclick={() => (filterKind = tab.id as typeof filterKind)}
					>
						{tab.label}
					</button>
				{/each}
			</div>
		</div>

		<!-- Accounts List -->
		<div class="flex-1 overflow-y-auto p-5 sm:p-6">
			{#if filteredWallets.length === 0}
				<div class="border-border flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-center">
					<p class="text-sm font-semibold">No matching accounts</p>
					<p class="text-muted-foreground text-xs">
						{wallets.length === 0 ? 'Create your first account to track balances.' : 'Try adjusting your search or filter.'}
					</p>
					{#if wallets.length === 0}
						<Button size="sm" class="mt-1" onclick={onadd}>+ Create Account</Button>
					{/if}
				</div>
			{:else}
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{#each filteredWallets as wallet (wallet.id)}
						<div
							class="border-border bg-card flex flex-col justify-between gap-3 rounded-xl border border-l-4 p-4 transition-colors"
							style={`border-left-color: ${wallet.color || 'var(--border)'}`}
						>
							<div class="flex items-start justify-between gap-2">
								<div class="flex min-w-0 items-center gap-2.5">
									<span
										class="flex size-9 shrink-0 items-center justify-center rounded-lg text-base"
										style={`background: ${wallet.color}20`}
									>
										{wallet.icon || '🏦'}
									</span>
									<div class="min-w-0">
										<strong class="block truncate text-sm font-semibold">{wallet.name}</strong>
										<div class="mt-0.5 flex items-center gap-1.5">
											<Badge variant="secondary" class="px-1.5 py-0 text-[10px]">
												{KIND_LABELS[wallet.kind] ?? wallet.kind}
											</Badge>
											<span class="text-muted-foreground text-[11px]">
												{wallet.count} {wallet.count === 1 ? 'tx' : 'txs'}
											</span>
										</div>
									</div>
								</div>

								<Button
									variant="outline"
									size="icon-sm"
									class="size-7 text-xs"
									title="Edit account"
									aria-label={`Edit ${wallet.name}`}
									onclick={() => onedit(wallet)}
								>
									✎
								</Button>
							</div>

							<div class="flex items-end justify-between gap-2 pt-1">
								<div>
									<div class="text-base font-bold tracking-tight tabular-nums">
										{formatMoney(wallet.balance, currency)}
									</div>
									{#if (wallet.initialBalance ?? 0) !== 0}
										<span class="text-muted-foreground text-[11px] tabular-nums">
											Initial: {formatMoney(wallet.initialBalance ?? 0, currency)}
										</span>
									{/if}
								</div>

								<Button
									variant="ghost"
									size="sm"
									class="h-7 px-2 text-xs"
									onclick={() => onfilter(wallet.name)}
								>
									Filter Ledger →
								</Button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<footer class="border-border flex items-center justify-between border-t px-5 py-3 sm:px-6">
			<span class="text-muted-foreground text-xs">
				Showing {filteredWallets.length} of {wallets.length} accounts
			</span>
			<Button variant="outline" size="sm" onclick={onclose}>Done</Button>
		</footer>
	</div>
</div>
