<script lang="ts">
	import type { PageProps } from './$types';
	import { cn } from '#lib/utils.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import * as Table from '#lib/components/ui/table/index.ts';
	import { Progress } from '#lib/components/ui/progress/index.ts';

	let { data }: PageProps = $props();

	let activePreviewTab = $state<'overview' | 'sheet' | 'budgets'>('overview');
</script>

{#snippet brandMark()}
	<svg class="size-7 shrink-0" viewBox="0 0 32 32" aria-hidden="true">
		<rect width="32" height="32" rx="8" fill="#0f172a" />
		<path
			d="M8.5 22.5V14M14 22.5V8.5M19.5 22.5V16.5M25 22.5V11"
			stroke="#ffffff"
			stroke-width="2.2"
			stroke-linecap="round"
		/>
		<circle cx="25" cy="22.5" r="2.2" fill="#f97316" />
	</svg>
{/snippet}

{#snippet googleIcon(size = 18)}
	<svg
		viewBox="0 0 18 18"
		width={size}
		height={size}
		class="shrink-0"
		aria-hidden="true"
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
</svelte:head>

<div class="bg-background text-foreground min-h-screen">
	<!-- Floating Pill Navigation Bar -->
	<header class="sticky top-4 z-40 mx-auto max-w-5xl px-4">
		<div class="border-border bg-card/90 flex h-13 items-center justify-between gap-4 rounded-full border px-4 shadow-sm backdrop-blur-md">
			<a class="flex items-center gap-2.5" href="/" aria-label="Sanku home">
				{@render brandMark()}
				<strong class="text-base font-semibold tracking-tight">Sanku</strong>
			</a>

			<nav class="text-muted-foreground hidden items-center gap-6 text-xs font-medium md:flex" aria-label="Main navigation">
				<a href="#preview" class="hover:text-foreground transition-colors">Interface</a>
				<a href="#ownership" class="hover:text-foreground transition-colors">Data ownership</a>
				<a href="#how" class="hover:text-foreground transition-colors">How it works</a>
				<a href="#security" class="hover:text-foreground transition-colors">Security</a>
			</nav>

			<div>
				{#if data.configured}
					<Button size="sm" href="/auth/login" class="rounded-full">
						{@render googleIcon(15)}
						<span>Sign in</span>
					</Button>
				{/if}
			</div>
		</div>
	</header>

	<!-- Global Notices -->
	<div class="mx-auto max-w-3xl px-4">
		{#if data.error}
			<div class="mt-6 flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700" role="alert">
				<p>{data.error}</p>
				<a href="/" class="underline underline-offset-2">Dismiss</a>
			</div>
		{/if}

		{#if data.detail}
			<details class="border-border bg-card mt-4 rounded-xl border p-3 text-xs">
				<summary class="cursor-pointer font-medium">Technical Diagnostics</summary>
				<code class="text-muted-foreground mt-2 block font-mono break-all">{data.detail}</code>
			</details>
		{/if}

		{#if data.showSetupHint}
			<div class="border-border bg-card mt-6 rounded-xl border p-4 text-sm shadow-2xs" role="status">
				<strong class="block font-semibold">Configuration Required</strong>
				<p class="text-muted-foreground mt-1 text-xs">
					Set <code class="bg-muted rounded px-1 py-0.5 font-mono">GOOGLE_CLIENT_ID</code>,
					<code class="bg-muted rounded px-1 py-0.5 font-mono">GOOGLE_CLIENT_SECRET</code>, and
					<code class="bg-muted rounded px-1 py-0.5 font-mono">SESSION_SECRET</code> in
					<code class="bg-muted rounded px-1 py-0.5 font-mono">.env</code>.
				</p>
			</div>
		{/if}
	</div>

	<main class="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
		<!-- Hero Section -->
		<section class="mx-auto max-w-3xl pt-14 pb-12 text-center sm:pt-20 sm:pb-16">
			<Badge variant="secondary" class="mb-5">Zero private database · Google Drive sync</Badge>

			<h1 class="text-4xl font-bold tracking-tight text-balance sm:text-6xl">
				Financial clarity in a sheet you own.
			</h1>

			<p class="text-muted-foreground mx-auto mt-5 max-w-xl text-base leading-relaxed text-pretty sm:text-lg">
				Sanku writes every transaction directly to your private Google Sheet.
			</p>

			<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
				{#if data.configured}
					<Button size="lg" href="/auth/login">
						{@render googleIcon(18)}
						<span>Continue with Google</span>
					</Button>
				{:else}
					<Button size="lg" disabled>
						{@render googleIcon(18)}
						<span>Continue with Google</span>
					</Button>
				{/if}

				<Button variant="outline" size="lg" href="#preview">
					View live interface
				</Button>
			</div>

			<div class="text-muted-foreground mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs">
				<span>100% free and open-data</span>
				<span class="opacity-40">/</span>
				<span>Zero private database</span>
				<span class="opacity-40">/</span>
				<span>Restricted <code class="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">drive.file</code> scope</span>
			</div>
		</section>

		<!-- Interactive Product Preview -->
		<section class="mb-20" id="preview">
			<Card.Root class="overflow-hidden shadow-md">
				<Card.Header class="border-border flex flex-col justify-between gap-3 border-b py-4 sm:flex-row sm:items-center">
					<div class="bg-muted inline-flex w-fit items-center gap-1 rounded-lg p-1" role="tablist" aria-label="Interface previews">
						{#each [
							{ id: 'overview', label: 'Ledger' },
							{ id: 'sheet', label: 'Google Sheet' },
							{ id: 'budgets', label: 'Budget limits' }
						] as tab (tab.id)}
							<button
								type="button"
								role="tab"
								aria-selected={activePreviewTab === tab.id}
								onclick={() => (activePreviewTab = tab.id as typeof activePreviewTab)}
								class={cn(
									'cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-all',
									activePreviewTab === tab.id
										? 'bg-card text-foreground shadow-2xs'
										: 'text-muted-foreground hover:text-foreground'
								)}
							>
								{tab.label}
							</button>
						{/each}
					</div>

					<Badge variant="success" class="gap-1.5">
						<span class="size-1.5 rounded-full bg-emerald-600"></span>
						Drive synced
					</Badge>
				</Card.Header>

				<Card.Content class="pt-6">
					{#if activePreviewTab === 'overview'}
						<div class="space-y-6">
							<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
								<div class="border-border bg-muted/30 rounded-lg border p-3">
									<span class="text-muted-foreground block text-xs">Monthly surplus</span>
									<span class="mt-1 block font-mono text-base font-bold text-emerald-700 tabular-nums sm:text-lg">+$4,045.20</span>
								</div>
								<div class="border-border bg-muted/30 rounded-lg border p-3">
									<span class="text-muted-foreground block text-xs">Income</span>
									<span class="mt-1 block font-mono text-base font-bold tabular-nums sm:text-lg">$5,200.00</span>
								</div>
								<div class="border-border bg-muted/30 rounded-lg border p-3">
									<span class="text-muted-foreground block text-xs">Expenses</span>
									<span class="mt-1 block font-mono text-base font-bold tabular-nums sm:text-lg">$1,154.80</span>
								</div>
								<div class="border-border bg-muted/30 rounded-lg border p-3">
									<span class="text-muted-foreground block text-xs">Savings rate</span>
									<span class="mt-1 block font-mono text-base font-bold tabular-nums sm:text-lg">77.8%</span>
								</div>
							</div>

							<div class="border-border overflow-hidden rounded-lg border">
								<Table.Root>
									<Table.Header>
										<Table.Row class="bg-muted/40 hover:bg-muted/40">
											<Table.Head class="w-[84px]">Date</Table.Head>
											<Table.Head>Description</Table.Head>
											<Table.Head class="hidden sm:table-cell">Category</Table.Head>
											<Table.Head class="hidden md:table-cell">Account</Table.Head>
											<Table.Head class="text-right">Amount</Table.Head>
										</Table.Row>
									</Table.Header>
									<Table.Body>
										<Table.Row>
											<Table.Cell class="text-muted-foreground font-mono text-xs">Nov 22</Table.Cell>
											<Table.Cell class="whitespace-normal">
												<span class="font-medium">Weekly Whole Foods</span>
												<span class="text-muted-foreground block text-xs sm:hidden">Groceries · Main Debit</span>
											</Table.Cell>
											<Table.Cell class="hidden sm:table-cell"><Badge variant="secondary">Groceries</Badge></Table.Cell>
											<Table.Cell class="text-muted-foreground hidden text-xs md:table-cell">Main Debit</Table.Cell>
											<Table.Cell class="text-right font-mono font-semibold tabular-nums">−$64.20</Table.Cell>
										</Table.Row>
										<Table.Row>
											<Table.Cell class="text-muted-foreground font-mono text-xs">Nov 21</Table.Cell>
											<Table.Cell class="whitespace-normal">
												<span class="font-medium">Engineering Salary</span>
												<span class="text-muted-foreground block text-xs sm:hidden">Income · Checking</span>
											</Table.Cell>
											<Table.Cell class="hidden sm:table-cell"><Badge variant="success">Income</Badge></Table.Cell>
											<Table.Cell class="text-muted-foreground hidden text-xs md:table-cell">Checking</Table.Cell>
											<Table.Cell class="text-right font-mono font-semibold text-emerald-700 tabular-nums">+$4,200.00</Table.Cell>
										</Table.Row>
										<Table.Row>
											<Table.Cell class="text-muted-foreground font-mono text-xs">Nov 20</Table.Cell>
											<Table.Cell class="whitespace-normal">
												<span class="font-medium">Ramen Bar with Friends</span>
												<span class="text-muted-foreground block text-xs sm:hidden">Dining · Main Debit</span>
											</Table.Cell>
											<Table.Cell class="hidden sm:table-cell"><Badge variant="secondary">Dining</Badge></Table.Cell>
											<Table.Cell class="text-muted-foreground hidden text-xs md:table-cell">Main Debit</Table.Cell>
											<Table.Cell class="text-right font-mono font-semibold tabular-nums">−$38.50</Table.Cell>
										</Table.Row>
										<Table.Row>
											<Table.Cell class="text-muted-foreground font-mono text-xs">Nov 18</Table.Cell>
											<Table.Cell class="whitespace-normal">
												<span class="font-medium">Electric Charging Station</span>
												<span class="text-muted-foreground block text-xs sm:hidden">Transport · Main Debit</span>
											</Table.Cell>
											<Table.Cell class="hidden sm:table-cell"><Badge variant="secondary">Transport</Badge></Table.Cell>
											<Table.Cell class="text-muted-foreground hidden text-xs md:table-cell">Main Debit</Table.Cell>
											<Table.Cell class="text-right font-mono font-semibold tabular-nums">−$52.10</Table.Cell>
										</Table.Row>
									</Table.Body>
								</Table.Root>
							</div>
						</div>
					{:else if activePreviewTab === 'sheet'}
						<div class="space-y-3 text-xs">
							<div class="text-muted-foreground flex flex-wrap items-center justify-between gap-2">
								<span class="font-medium">Sanku Finance.xlsx (Google Drive)</span>
								<Badge variant="outline">Restricted drive.file</Badge>
							</div>

							<div class="border-border overflow-hidden rounded-lg border">
								<Table.Root>
									<Table.Header>
										<Table.Row class="bg-muted/60 hover:bg-muted/60">
											<Table.Head class="w-10 text-center">#</Table.Head>
											<Table.Head>Date</Table.Head>
											<Table.Head>Type</Table.Head>
											<Table.Head>Description</Table.Head>
											<Table.Head class="text-right">Amount</Table.Head>
											<Table.Head>Account</Table.Head>
										</Table.Row>
									</Table.Header>
									<Table.Body class="font-mono text-xs">
										<Table.Row>
											<Table.Cell class="text-muted-foreground text-center">2</Table.Cell>
											<Table.Cell>2026-11-22</Table.Cell>
											<Table.Cell>expense</Table.Cell>
											<Table.Cell class="font-sans">Weekly Whole Foods</Table.Cell>
											<Table.Cell class="text-right">64.20</Table.Cell>
											<Table.Cell class="font-sans">Main Debit</Table.Cell>
										</Table.Row>
										<Table.Row class="bg-amber-50/60 hover:bg-amber-50/80">
											<Table.Cell class="text-muted-foreground text-center">3</Table.Cell>
											<Table.Cell>2026-11-21</Table.Cell>
											<Table.Cell>income</Table.Cell>
											<Table.Cell class="font-sans">Engineering Salary</Table.Cell>
											<Table.Cell class="text-right">4200.00</Table.Cell>
											<Table.Cell class="font-sans">Checking</Table.Cell>
										</Table.Row>
										<Table.Row>
											<Table.Cell class="text-muted-foreground text-center">4</Table.Cell>
											<Table.Cell>2026-11-20</Table.Cell>
											<Table.Cell>expense</Table.Cell>
											<Table.Cell class="font-sans">Ramen Bar with Friends</Table.Cell>
											<Table.Cell class="text-right">38.50</Table.Cell>
											<Table.Cell class="font-sans">Main Debit</Table.Cell>
										</Table.Row>
										<Table.Row>
											<Table.Cell class="text-muted-foreground text-center">5</Table.Cell>
											<Table.Cell>2026-11-18</Table.Cell>
											<Table.Cell>expense</Table.Cell>
											<Table.Cell class="font-sans">Electric Charging Station</Table.Cell>
											<Table.Cell class="text-right">52.10</Table.Cell>
											<Table.Cell class="font-sans">Main Debit</Table.Cell>
										</Table.Row>
									</Table.Body>
								</Table.Root>
							</div>

							<div class="flex flex-wrap gap-1.5 pt-1">
								<Badge variant="default">Transactions</Badge>
								<Badge variant="secondary">Categories</Badge>
								<Badge variant="secondary">Budgets</Badge>
								<Badge variant="secondary">Settings</Badge>
							</div>
						</div>
					{:else}
						<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
							<div class="border-border bg-muted/30 space-y-2.5 rounded-xl border p-4">
								<div class="flex items-center justify-between text-xs">
									<span class="font-semibold">Groceries</span>
									<span class="text-muted-foreground font-mono">$320.40 / $500.00</span>
								</div>
								<Progress value={64} max={100} class="h-2" />
								<span class="text-muted-foreground block font-mono text-[11px]">$179.60 remaining</span>
							</div>
							<div class="border-border bg-muted/30 space-y-2.5 rounded-xl border p-4">
								<div class="flex items-center justify-between text-xs">
									<span class="font-semibold">Dining out</span>
									<span class="text-muted-foreground font-mono">$245.00 / $300.00</span>
								</div>
								<Progress value={81} max={100} class="h-2" indicatorClass="bg-amber-500" />
								<span class="text-muted-foreground block font-mono text-[11px]">$55.00 remaining</span>
							</div>
							<div class="border-border bg-muted/30 space-y-2.5 rounded-xl border p-4">
								<div class="flex items-center justify-between text-xs">
									<span class="font-semibold">Transport</span>
									<span class="text-muted-foreground font-mono">$110.00 / $200.00</span>
								</div>
								<Progress value={55} max={100} class="h-2" />
								<span class="text-muted-foreground block font-mono text-[11px]">$90.00 remaining</span>
							</div>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		</section>

		<!-- Core Architectural Foundations -->
		<section class="mb-20" id="ownership">
			<div class="mb-8 space-y-2">
				<h2 class="text-2xl font-bold tracking-tight sm:text-3xl">Built for financial autonomy.</h2>
				<p class="text-muted-foreground text-sm sm:text-base">
					Putting a spreadsheet at the core of your finances ensures permanent data access.
				</p>
			</div>

			<div class="space-y-4">
				<Card.Root>
					<Card.Content class="flex flex-col justify-between gap-4 pt-6 sm:flex-row sm:items-start">
						<div class="max-w-2xl space-y-2">
							<h3 class="text-base font-semibold sm:text-lg">Zero lock-in with permanent data ownership</h3>
							<p class="text-muted-foreground text-sm leading-relaxed">
								Traditional finance apps store your transaction history in closed proprietary databases.
								If they raise prices, change terms, or shut down, your history is trapped.
								With Sanku, every single row exists on your Google Drive as standard data you can open, export, or pipe into any tool forever.
							</p>
						</div>
						<Badge variant="secondary" class="font-mono">Standard Google Drive file</Badge>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Content class="flex flex-col justify-between gap-4 pt-6 sm:flex-row sm:items-start">
						<div class="max-w-2xl space-y-2">
							<h3 class="text-base font-semibold sm:text-lg">Restricted OAuth scope security</h3>
							<p class="text-muted-foreground text-sm leading-relaxed">
								Sanku only requests Google’s restricted <code class="bg-muted rounded px-1 py-0.5 font-mono text-xs">drive.file</code> scope.
								The app can only view the single spreadsheet created by Sanku.
								It cannot touch, read, or search any other files in your Google Drive.
							</p>
						</div>
						<Badge variant="secondary" class="font-mono">Restricted scope</Badge>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Content class="flex flex-col justify-between gap-4 pt-6 sm:flex-row sm:items-start">
						<div class="max-w-2xl space-y-2">
							<h3 class="text-base font-semibold sm:text-lg">Full Google ecosystem integration</h3>
							<p class="text-muted-foreground text-sm leading-relaxed">
								Because your data is a genuine spreadsheet, you can run Google Sheets formulas, write custom Apps Script triggers, hook up Looker Studio visualizers, or share specific tabs with your accountant.
							</p>
						</div>
						<Badge variant="secondary" class="font-mono">Formula compatibility</Badge>
					</Card.Content>
				</Card.Root>
			</div>
		</section>

		<!-- 3-Step Walkthrough -->
		<section class="mb-20" id="how">
			<h2 class="mb-8 text-2xl font-bold tracking-tight sm:text-3xl">Three steps to clear records.</h2>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
				<Card.Root>
					<Card.Content class="space-y-2 pt-6">
						<span class="text-muted-foreground font-mono text-xs font-bold">01</span>
						<h3 class="text-base font-semibold">Sign in with Google</h3>
						<p class="text-muted-foreground text-sm leading-relaxed">
							No passwords to create or remember. Sign in with your existing Google account.
						</p>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Content class="space-y-2 pt-6">
						<span class="text-muted-foreground font-mono text-xs font-bold">02</span>
						<h3 class="text-base font-semibold">Auto-provision sheet</h3>
						<p class="text-muted-foreground text-sm leading-relaxed">
							Sanku creates a formatted spreadsheet directly inside your Google Drive.
						</p>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Content class="space-y-2 pt-6">
						<span class="text-muted-foreground font-mono text-xs font-bold">03</span>
						<h3 class="text-base font-semibold">Track and optimize</h3>
						<p class="text-muted-foreground text-sm leading-relaxed">
							Record daily spending, configure monthly budgets, and see cashflow trends.
						</p>
					</Card.Content>
				</Card.Root>
			</div>
		</section>

		<!-- Security & Philosophy Quote -->
		<section class="mb-20" id="security">
			<Card.Root class="bg-muted/40">
				<Card.Content class="space-y-4 p-6 sm:p-10">
					<blockquote class="text-lg font-medium leading-relaxed sm:text-xl">
						“The most honest software is the kind that doesn’t hold your data hostage.
						When you can open your financial database in a spreadsheet on your phone, you are in control.”
					</blockquote>
					<div class="text-xs">
						<strong class="block font-semibold">Sanku Architecture Manifesto</strong>
						<span class="text-muted-foreground">Designed with SvelteKit and Google Sheets</span>
					</div>
				</Card.Content>
			</Card.Root>
		</section>

		<!-- Final CTA -->
		<section class="mb-10">
			<Card.Root class="text-center">
				<Card.Content class="flex flex-col items-center gap-4 px-6 py-12">
					<h2 class="text-2xl font-bold tracking-tight sm:text-3xl">
						Take complete ownership of your finances today.
					</h2>
					<p class="text-muted-foreground max-w-md text-sm sm:text-base">
						Your first month of clean financial insight starts with one click.
					</p>
					{#if data.configured}
						<Button size="lg" href="/auth/login" class="mt-2">
							{@render googleIcon(18)}
							<span>Continue with Google</span>
						</Button>
					{/if}
				</Card.Content>
			</Card.Root>
		</section>
	</main>

	<!-- Footer -->
	<footer class="border-border border-t py-8">
		<div class="text-muted-foreground mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 text-xs sm:flex-row sm:px-6">
			<div class="flex items-center gap-2.5">
				{@render brandMark()}
				<span><strong class="text-foreground">Sanku</strong> · Financial clarity in your Google Sheet</span>
			</div>
			<div class="flex items-center gap-2">
				<span>Powered by SvelteKit 3</span>
				<span class="opacity-40">/</span>
				<span>Saved to Google Drive</span>
			</div>
		</div>
	</footer>
</div>
