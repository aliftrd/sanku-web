<script lang="ts">
	import type { PageProps } from './$types';
	import { cn } from '#lib/utils.ts';

	let { data }: PageProps = $props();

	let activePreviewTab = $state<'overview' | 'sheet' | 'budgets'>('overview');
	let headerHidden = $state(false);
	let lastScrollY = 0;

	function handleWindowScroll() {
		if (typeof window === 'undefined') return;
		const currentY = Math.max(0, window.scrollY);
		if (currentY <= 32) {
			headerHidden = false;
		} else if (currentY - lastScrollY > 6) {
			headerHidden = true;
		} else if (lastScrollY - currentY > 6) {
			headerHidden = false;
		}
		lastScrollY = currentY;
	}
</script>

<svelte:window onscroll={handleWindowScroll} />

{#snippet brandMark(size: 'md' | 'sm' = 'md')}
	<span
		class={cn(
			'bg-coral text-on-coral font-headline flex shrink-0 items-center justify-center rounded-full uppercase',
			size === 'md' ? 'text-headline-md size-10' : 'text-title-lg size-8'
		)}
		aria-hidden="true"
	>
		S
	</span>
{/snippet}

{#snippet googleIcon(size = 16)}
	<svg viewBox="0 0 18 18" width={size} height={size} class="shrink-0" aria-hidden="true">
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
	<title>Sanku — Editorial Personal Finance in Your Google Sheet</title>
	<meta
		name="description"
		content="Dashboard cashflow modern, impor mutasi bank PDF/CSV otomatis, dan kalkulator patungan super adil—semua tersinkronisasi real-time ke Google Sheet pribadimu."
	/>
</svelte:head>

<div class="bg-surface text-on-surface flex min-h-screen flex-col">
	<!-- Topbar Navigation -->
	<header
		class={cn(
			'border-outline-variant bg-surface/95 sticky top-0 z-30 border-b backdrop-blur-sm transition-transform duration-200 ease-out',
			headerHidden && '-translate-y-full pointer-events-none md:translate-y-0 md:pointer-events-auto'
		)}
	>
		<div class="px-gutter-md sm:px-gutter-lg gap-gutter-sm mx-auto flex h-16 max-w-[1280px] items-center justify-between lg:h-20">
			<a href="/" class="gap-gutter-sm flex shrink-0 items-center" aria-label="Sanku home">
				{@render brandMark('sm')}
				<span class="font-headline text-headline-lg text-on-surface tracking-tight uppercase">SANKU</span>
			</a>

			<nav
				aria-label="Main navigation"
				class="bg-surface-card border-outline-variant gap-gutter-xs hidden items-center rounded-full border p-1.5 lg:flex"
			>
				<a
					href="#fitur"
					class="px-gutter-md font-label text-label-lg text-on-surface hover:bg-surface-container rounded-full py-1.5 transition-colors"
				>
					Fitur
				</a>
				<a
					href="#patungan"
					class="px-gutter-md font-label text-label-lg text-on-surface-variant hover:text-on-surface rounded-full py-1.5 transition-colors"
				>
					Beli Rame-rame
				</a>
				<a
					href="#privasi"
					class="px-gutter-md font-label text-label-lg text-on-surface-variant hover:text-on-surface rounded-full py-1.5 transition-colors"
				>
					Privasi
				</a>
				<a
					href="#cara-kerja"
					class="px-gutter-md font-label text-label-lg text-on-surface-variant hover:text-on-surface rounded-full py-1.5 transition-colors"
				>
					Cara Kerja
				</a>
			</nav>

			<div class="gap-gutter-sm flex shrink-0 items-center">
				{#if data.configured}
					<a
						href="/auth/login"
						class="px-gutter-md bg-surface-card border-outline-variant text-on-surface font-label text-label-lg hover:bg-surface-container hidden rounded-full border py-1.5 transition-colors sm:inline-flex"
					>
						Masuk
					</a>
					<a
						href="/auth/login"
						class="gap-gutter-xs sm:gap-gutter-sm px-3.5 sm:px-gutter-md bg-pill-white text-on-pill-white font-label text-label-sm sm:text-label-lg inline-flex items-center rounded-full py-1.5 sm:py-2 transition-opacity hover:opacity-90"
					>
						{@render googleIcon(15)}
						<span class="sm:hidden">Masuk</span>
						<span class="hidden sm:inline">Mulai dengan Google</span>
						<span class="bg-ink text-on-surface flex size-5 sm:size-6 items-center justify-center rounded-full">
							<span class="material-symbols-outlined text-[13px] sm:text-[15px]" aria-hidden="true">north_east</span>
						</span>
					</a>
				{:else}
					<span class="px-gutter-md bg-surface-card border-outline-variant text-on-surface-variant font-label text-label-lg inline-flex cursor-not-allowed items-center gap-2 rounded-full border py-2 opacity-60">
						{@render googleIcon(16)}
						<span>Setup Diperlukan</span>
					</span>
				{/if}
			</div>
		</div>
	</header>

	<!-- Global Notices -->
	{#if data.error || data.detail || data.showSetupHint}
		<div class="px-gutter-md sm:px-gutter-lg mx-auto mt-6 w-full max-w-[1280px] space-y-3">
			{#if data.error}
				<div
					class="bg-coral text-on-coral flex items-center justify-between gap-4 rounded-xl px-5 py-3.5 text-sm font-semibold"
					role="alert"
				>
					<p>{data.error}</p>
					<a href="/" class="bg-ink text-on-surface rounded-full px-3 py-1 text-xs font-bold">Tutup</a>
				</div>
			{/if}

			{#if data.detail}
				<details class="bg-surface-card border-outline-variant rounded-xl border p-4 text-xs">
					<summary class="text-on-surface cursor-pointer font-semibold">Technical Diagnostics</summary>
					<code class="text-on-surface-variant mt-2 block font-mono break-all">{data.detail}</code>
				</details>
			{/if}

			{#if data.showSetupHint}
				<div class="bg-marigold text-on-marigold rounded-xl p-5 text-sm" role="status">
					<strong class="font-headline text-headline-md block uppercase">Configuration Required</strong>
					<p class="mt-1 text-xs font-medium text-ink/85">
						Set <code class="bg-ink text-on-surface rounded px-1.5 py-0.5 font-mono">GOOGLE_CLIENT_ID</code>,
						<code class="bg-ink text-on-surface rounded px-1.5 py-0.5 font-mono">GOOGLE_CLIENT_SECRET</code>, dan
						<code class="bg-ink text-on-surface rounded px-1.5 py-0.5 font-mono">SESSION_SECRET</code> di
						<code class="bg-ink text-on-surface rounded px-1.5 py-0.5 font-mono">.env</code>.
					</p>
				</div>
			{/if}
		</div>
	{/if}

	<main class="flex-1">
		<!-- 1. Hero Bento Block -->
		<section class="px-gutter-md sm:px-gutter-lg mx-auto max-w-[1280px] pt-8 pb-10 sm:pt-10 sm:pb-12">
			<div class="gap-gutter-lg grid grid-cols-12 items-stretch">
				<!-- Left Hero Copy Card (Sage Cream Editorial Block) -->
				<div class="bg-sage-cream text-on-sage-cream gap-gutter-lg col-span-12 flex flex-col justify-between rounded-xl p-6 sm:p-8 lg:col-span-7">
					<div class="gap-gutter-md flex flex-wrap items-center justify-between">
						<span class="gap-gutter-xs bg-ink text-on-surface font-label text-label-sm inline-flex items-center rounded-full px-3 py-1 tracking-wider uppercase">
							<span class="material-symbols-outlined text-[14px]" aria-hidden="true">verified_user</span>
							Zero Private Database · Google Drive Sync
						</span>
						<span class="bg-marigold text-on-marigold font-mono text-mono-md rounded-full px-3 py-1 tabular-nums">
							v2.4 LIVE
						</span>
					</div>

					<div class="gap-gutter-md flex flex-col">
						<h1 class="font-display text-display-lg-mobile sm:text-display-lg text-on-sage-cream text-balance uppercase">
							ATUR KEUANGAN TANPA RIBET, DATA TETAP MILIKMU SEPENUHNYA.
						</h1>
						<p class="font-body text-body-lg text-ink/80 max-w-prose text-pretty">
							Dashboard cashflow modern, impor mutasi bank PDF/CSV otomatis, dan kalkulator patungan super adil—semua tersinkronisasi real-time ke Google Sheet pribadimu.
						</p>
					</div>

					<div class="gap-gutter-sm flex flex-wrap items-center">
						{#if data.configured}
							<a
								href="/auth/login"
								class="gap-gutter-sm px-gutter-lg bg-coral text-on-coral font-label text-label-lg flex w-full items-center justify-between rounded-full py-3 transition-opacity hover:opacity-90 sm:inline-flex sm:w-auto sm:justify-start"
							>
								<span class="gap-gutter-sm inline-flex items-center">
									{@render googleIcon(17)}
									<span>Mulai Gratis dengan Google</span>
								</span>
								<span class="bg-ink text-on-surface flex size-7 shrink-0 items-center justify-center rounded-full">
									<span class="material-symbols-outlined text-[16px]" aria-hidden="true">north_east</span>
								</span>
							</a>
						{:else}
							<span class="gap-gutter-sm px-gutter-lg bg-coral/60 text-on-coral font-label text-label-lg inline-flex w-full cursor-not-allowed items-center justify-center rounded-full py-3 sm:w-auto">
								{@render googleIcon(17)}
								<span>Mulai Gratis dengan Google</span>
							</span>
						{/if}

						<a
							href="#preview"
							class="gap-gutter-sm px-gutter-lg bg-ink text-on-surface font-label text-label-lg inline-flex w-full items-center justify-center rounded-full py-3 transition-opacity hover:opacity-90 sm:w-auto"
						>
							<span class="material-symbols-outlined text-[18px]" aria-hidden="true">play_circle</span>
							<span>Lihat Demo Interaktif</span>
						</a>
					</div>
				</div>

				<!-- Right Hero Visual Stack (Coral + Stitch Illustration + Live Sync Status) -->
				<div class="gap-gutter-md col-span-12 flex flex-col lg:col-span-5">
					<div class="bg-coral text-on-coral gap-gutter-md flex flex-1 flex-col justify-between rounded-xl p-5 sm:p-6">
						<div class="flex items-center justify-between gap-2">
							<span class="font-headline text-headline-md uppercase">NET SURPLUS · NOV 2026</span>
							<span class="bg-ink text-on-surface font-mono text-mono-md rounded-full px-3 py-1 tabular-nums">
								+14,2%
							</span>
						</div>
						<div class="font-display text-display-md-mobile sm:text-display-md tabular-nums">
							+Rp 3.850.000
						</div>
						<div class="border-ink bg-sage-cream overflow-hidden rounded-lg border-2">
							<img
								src="/images/pop_hero_finance.jpg"
								alt="Ilustrasi editorial Sanku mengelola keuangan dan Google Sheet"
								class="h-44 w-full object-cover sm:h-52"
							/>
						</div>
					</div>

					<div class="bg-surface-card border-outline-variant gap-gutter-md flex items-center justify-between rounded-xl border p-5">
						<div class="gap-gutter-sm flex min-w-0 flex-1 items-center">
							<span class="bg-sky-mint text-on-sky-mint flex size-10 shrink-0 items-center justify-center rounded-full">
								<span class="material-symbols-outlined text-[20px]" aria-hidden="true">cloud_done</span>
							</span>
							<div class="min-w-0 flex-1">
								<div class="font-title text-title-md text-on-surface truncate">Sanku Finance.gsheet</div>
								<div class="font-body text-body-sm text-on-surface-variant truncate">
									Tersinkronisasi otomatis ke Drive (drive.file)
								</div>
							</div>
						</div>
						<span class="bg-income text-on-income font-label text-label-sm shrink-0 rounded-full px-3 py-1 uppercase">
							Live
						</span>
					</div>
				</div>
			</div>
		</section>

		<!-- 2. Bento Features Grid (Color-Blocked Cards) -->
		<section id="fitur" class="px-gutter-md sm:px-gutter-lg mx-auto max-w-[1280px] py-10">
			<div class="gap-gutter-md mb-6 flex flex-wrap items-end justify-between">
				<div>
					<h2 class="font-headline text-headline-lg text-on-surface uppercase">
						SEMUA YANG KAMU BUTUHKAN, TANPA BIKIN PUSING
					</h2>
					<p class="font-body text-body-md text-on-surface-variant">
						Dirancang agar mencatat pengeluaran terasa ringan, cepat, dan menyenangkan.
					</p>
				</div>
				<span class="bg-pill-white text-on-pill-white font-label text-label-lg rounded-full px-4 py-1.5">
					5 Modul Inti
				</span>
			</div>

			<div class="gap-gutter-md grid grid-cols-12 items-stretch">
				<!-- Periwinkle Analytics Card -->
				<div class="bg-periwinkle text-on-periwinkle gap-gutter-md col-span-12 flex flex-col justify-between rounded-xl p-6 md:col-span-7">
					<div class="gap-gutter-md flex items-start justify-between">
						<div>
							<span class="bg-pill-white text-on-pill-white font-label text-label-sm rounded-full px-3 py-1 uppercase">
								Cashflow Dynamics
							</span>
							<h3 class="font-headline text-headline-lg mt-3 uppercase">
								DASHBOARD ANALITIK &amp; FINANCIAL PULSE
							</h3>
						</div>
						<a
							href="#preview"
							class="bg-pill-white text-on-pill-white flex size-10 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105"
							aria-label="Lihat Pratinjau Dashboard"
						>
							<span class="material-symbols-outlined text-[18px]" aria-hidden="true">north_east</span>
						</a>
					</div>
					<p class="font-body text-body-md text-on-periwinkle/90 max-w-prose">
						Pantau Net Surplus, Savings Rate, tren arus kas 7D–1Y, hingga daily burn rata-rata dalam sekali lirik.
					</p>
					<div class="gap-gutter-sm grid h-28 grid-cols-7 items-end pt-2">
						<div class="bg-ink/25 h-12 rounded-md"></div>
						<div class="bg-ink/25 h-16 rounded-md"></div>
						<div class="bg-coral h-24 rounded-md"></div>
						<div class="bg-ink/25 h-14 rounded-md"></div>
						<div class="bg-marigold h-20 rounded-md"></div>
						<div class="bg-ink/25 h-10 rounded-md"></div>
						<div class="bg-sky-mint h-22 rounded-md"></div>
					</div>
				</div>

				<!-- Marigold Smart Wallets & Sync Card -->
				<div class="bg-marigold text-on-marigold gap-gutter-md col-span-12 flex flex-col justify-between rounded-xl p-6 md:col-span-5">
					<div class="gap-gutter-md flex items-start justify-between">
						<div>
							<span class="bg-ink text-on-surface font-label text-label-sm rounded-full px-3 py-1 uppercase">
								Multi-Dompet
							</span>
							<h3 class="font-headline text-headline-lg mt-3 uppercase">
								DOMPET &amp; BUDGET REAL-TIME
							</h3>
						</div>
						<a
							href="#preview"
							class="bg-ink text-on-surface flex size-10 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105"
							aria-label="Lihat Dompet"
						>
							<span class="material-symbols-outlined text-[18px]" aria-hidden="true">north_east</span>
						</a>
					</div>
					<div class="border-ink overflow-hidden rounded-lg border-2">
						<img
							src="/images/pop_wallets_sync.jpg"
							alt="Ilustrasi dompet dan sinkronisasi spreadsheet"
							class="h-36 w-full object-cover"
						/>
					</div>
					<div class="font-mono text-mono-md flex items-center justify-between tabular-nums">
						<span>Bank Utama</span>
						<span>Rp 4.850.000</span>
					</div>
				</div>

				<!-- Charcoal Import Card -->
				<div class="bg-surface-card border-outline-variant gap-gutter-md col-span-12 flex flex-col justify-between rounded-xl border p-6 md:col-span-6 lg:col-span-4">
					<div class="flex items-center justify-between">
						<span class="bg-sky-mint text-on-sky-mint font-label text-label-sm rounded-full px-3 py-1 uppercase">
							PDF &amp; CSV
						</span>
						<a
							href="#preview"
							class="bg-pill-white text-on-pill-white flex size-9 items-center justify-center rounded-full transition-transform hover:scale-105"
							aria-label="Lihat Impor Mutasi"
						>
							<span class="material-symbols-outlined text-[18px]" aria-hidden="true">north_east</span>
						</a>
					</div>
					<h3 class="font-headline text-headline-md text-on-surface uppercase">
						IMPORT MUTASI BANK OTOMATIS
					</h3>
					<p class="font-body text-body-sm text-on-surface-variant">
						Unggah e-Statement PDF/CSV (Krom, BCA, Mandiri, BNI, BRI, Jago, SeaBank). Terdeteksi di browser tanpa masuk server.
					</p>
				</div>

				<!-- Sky Mint Quick Search Card -->
				<div class="bg-sky-mint text-on-sky-mint gap-gutter-md col-span-12 flex flex-col justify-between rounded-xl p-6 md:col-span-6 lg:col-span-4">
					<div class="flex items-center justify-between">
						<span class="bg-ink text-on-surface font-label text-label-sm rounded-full px-3 py-1 uppercase">
							Shortcut /
						</span>
						<span class="font-mono text-mono-md">CSV EXPORT</span>
					</div>
					<h3 class="font-headline text-headline-md uppercase">PENCARIAN KILAT &amp; DUPLIKAT</h3>
					<p class="font-body text-body-sm text-ink/80">
						Tekan <code class="bg-ink text-on-surface rounded px-1.5 py-0.5 font-mono">/</code> untuk cari transaksi seketika, filter dompet, atau duplikat entri rutin.
					</p>
				</div>

				<!-- Stacked Folder-Tab Card -->
				<div class="col-span-12 flex flex-col lg:col-span-4">
					<div class="bg-coral text-on-coral font-label text-label-sm -mb-3 rounded-t-xl px-5 pt-2.5 pb-4 tracking-wider uppercase">
						ANGGARAN BULANAN
					</div>
					<div class="bg-surface-container text-on-surface border-outline-variant font-label text-label-sm -mb-3 rounded-t-xl border-t px-5 pt-2.5 pb-4 tracking-wider uppercase">
						BATAS HARIAN
					</div>
					<div class="bg-sage-cream text-on-sage-cream gap-gutter-sm flex flex-1 flex-col justify-between rounded-xl p-5">
						<div class="flex items-center justify-between">
							<span class="font-headline text-headline-md uppercase">MAKAN &amp; KOPI</span>
							<span class="bg-ink text-on-surface flex size-8 items-center justify-center rounded-full">
								<span class="material-symbols-outlined text-[16px]" aria-hidden="true">north_east</span>
							</span>
						</div>
						<div class="gap-gutter-sm font-body text-body-sm flex flex-wrap items-center">
							<span class="bg-marigold text-on-marigold font-label text-label-sm rounded-full px-2.5 py-0.5">
								Rp 1.200.000 limit
							</span>
							<span class="bg-ink/10 text-ink font-label text-label-sm rounded-full px-2.5 py-0.5">
								Real-time alert
							</span>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- 3. Beli Rame-rame Showcase (Coral Block + Stitch Illustration) -->
		<section id="patungan" class="px-gutter-md sm:px-gutter-lg mx-auto max-w-[1280px] py-10">
			<div class="bg-coral text-on-coral gap-gutter-lg grid grid-cols-12 items-center rounded-xl p-6 sm:p-8">
				<div class="gap-gutter-md col-span-12 flex flex-col lg:col-span-6">
					<span class="bg-ink text-on-surface font-label text-label-sm self-start rounded-full px-3 py-1 uppercase">
						FITUR FAVORIT PENGGUNA
					</span>
					<h2 class="font-headline text-headline-lg sm:text-display-md text-balance uppercase">
						BELI RAME-RAME? HITUNG DISKON &amp; ONGKIR JADI ADIL DALAM HITUNGAN DETIK.
					</h2>
					<p class="font-body text-body-md text-ink/85">
						Hitung multi-diskon proporsional (voucher % + plafon maks, potongan Rp, diskon ongkir), lacak status lunas per teman, dan bagikan Link Struk Digital Publik (<code class="bg-ink text-on-surface rounded px-1.5 py-0.5 font-mono text-xs">/s</code>) tanpa perlu login.
					</p>
					<div class="gap-gutter-sm flex flex-wrap pt-2">
						{#if data.configured}
							<a
								href="/auth/login"
								class="gap-gutter-sm px-gutter-lg bg-pill-white text-on-pill-white font-label text-label-lg inline-flex items-center rounded-full py-3 transition-opacity hover:opacity-90"
							>
								<span>Coba Kalkulator Patungan</span>
								<span class="bg-ink text-on-surface flex size-6 items-center justify-center rounded-full">
									<span class="material-symbols-outlined text-[15px]" aria-hidden="true">north_east</span>
								</span>
							</a>
						{/if}
					</div>
				</div>

				<div class="gap-gutter-md col-span-12 flex flex-col lg:col-span-6">
					<div class="border-ink overflow-hidden rounded-lg border-2">
						<img
							src="/images/pop_split_bill.jpg"
							alt="Ilustrasi patungan makan bersama teman"
							class="h-56 w-full object-cover"
						/>
					</div>
					<div class="bg-surface-card text-on-surface gap-gutter-md flex flex-wrap items-center justify-between rounded-lg p-5">
						<div>
							<div class="font-label text-label-sm text-on-surface-variant uppercase">
								Proportional Breakdown
							</div>
							<div class="font-title text-title-lg">Raka · Nadia · Dimas</div>
						</div>
						<div class="gap-gutter-sm flex items-center">
							<span class="bg-income text-on-income font-label text-label-sm rounded-full px-3 py-1 uppercase">
								Nadia Lunas
							</span>
							<span class="font-mono text-mono-md tabular-nums">Rp 128.500</span>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- 3b. Interactive Live Interface Preview -->
		<section id="preview" class="px-gutter-md sm:px-gutter-lg mx-auto max-w-[1280px] py-10">
			<div class="bg-surface-card border-outline-variant overflow-hidden rounded-xl border">
				<div class="border-outline-variant flex flex-wrap items-center justify-between gap-3 border-b p-5 sm:px-6">
					<div
						class="bg-ink inline-flex items-center gap-1 rounded-full p-1"
						role="tablist"
						aria-label="Pratinjau antarmuka Sanku"
					>
						{#each [
							{ id: 'overview', label: 'Ledger' },
							{ id: 'sheet', label: 'Google Sheet' },
							{ id: 'budgets', label: 'Anggaran' }
						] as tab (tab.id)}
							<button
								type="button"
								role="tab"
								aria-selected={activePreviewTab === tab.id}
								onclick={() => (activePreviewTab = tab.id as typeof activePreviewTab)}
								class={cn(
									'font-label text-label-sm cursor-pointer rounded-full px-4 py-1.5 transition-colors',
									activePreviewTab === tab.id
										? 'bg-pill-white text-on-pill-white'
										: 'text-on-surface-variant hover:text-on-surface'
								)}
							>
								{tab.label}
							</button>
						{/each}
					</div>

					<span class="bg-income text-on-income font-label text-label-sm inline-flex items-center gap-1.5 rounded-full px-3 py-1 uppercase">
						<span class="bg-ink size-1.5 rounded-full" aria-hidden="true"></span>
						Drive Synced
					</span>
				</div>

				<div class="p-5 sm:p-6">
					{#if activePreviewTab === 'overview'}
						<div class="space-y-5">
							<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
								<div class="bg-coral text-on-coral rounded-lg p-4">
									<span class="font-label text-label-sm block uppercase">Net Surplus</span>
									<span class="font-headline text-headline-md sm:text-headline-lg mt-1 block tabular-nums">+Rp 3.850.000</span>
								</div>
								<div class="bg-sky-mint text-on-sky-mint rounded-lg p-4">
									<span class="font-label text-label-sm block uppercase">Total Inflow</span>
									<span class="font-headline text-headline-md sm:text-headline-lg mt-1 block tabular-nums">Rp 8.400.000</span>
								</div>
								<div class="bg-sage-cream text-on-sage-cream rounded-lg p-4">
									<span class="font-label text-label-sm block uppercase">Total Outflow</span>
									<span class="font-headline text-headline-md sm:text-headline-lg mt-1 block tabular-nums">Rp 4.550.000</span>
								</div>
								<div class="bg-marigold text-on-marigold rounded-lg p-4">
									<span class="font-label text-label-sm block uppercase">Savings Rate</span>
									<span class="font-headline text-headline-md sm:text-headline-lg mt-1 block tabular-nums">45,8%</span>
								</div>
							</div>

							<div class="space-y-2">
								{#each [
									{
										date: '26 Nov 2026',
										title: 'Makan siang bareng tim',
										cat: 'Kuliner',
										wallet: 'Bank Utama',
										amount: '-Rp 85.000',
										income: false
									},
									{
										date: '25 Nov 2026',
										title: 'Gaji & Bonus Proyek',
										cat: 'Pemasukan',
										wallet: 'Bank Utama',
										amount: '+Rp 8.400.000',
										income: true
									},
									{
										date: '24 Nov 2026',
										title: 'Kopi susu & roti pagi',
										cat: 'Kafe',
										wallet: 'Dompet Digital',
										amount: '-Rp 38.000',
										income: false
									}
								] as row (row.title)}
									<div class="bg-surface-container flex flex-wrap items-center justify-between gap-3 rounded-lg p-4">
										<div class="min-w-0">
											<div class="font-title text-title-md text-on-surface truncate">{row.title}</div>
											<div class="mt-1 flex flex-wrap items-center gap-1.5">
												<span class="bg-marigold text-on-marigold font-label text-label-sm rounded-full px-2.5 py-0.5">
													{row.cat}
												</span>
												<span class="bg-sky-mint text-on-sky-mint font-label text-label-sm rounded-full px-2.5 py-0.5">
													{row.wallet}
												</span>
												<span class="font-mono text-mono-sm text-on-surface-variant">{row.date}</span>
											</div>
										</div>
										<span
											class={cn(
												'font-title text-title-md rounded-full px-3.5 py-1 tabular-nums',
												row.income ? 'bg-income text-on-income' : 'bg-coral text-on-coral'
											)}
										>
											{row.amount}
										</span>
									</div>
								{/each}
							</div>
						</div>
					{:else if activePreviewTab === 'sheet'}
						<div class="space-y-4">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<span class="font-title text-title-md text-on-surface">Sanku Finance.gsheet (Google Drive)</span>
								<span class="bg-sky-mint text-on-sky-mint font-mono text-mono-sm rounded-full px-3 py-0.5">
									scope: drive.file
								</span>
							</div>
							<div class="border-outline-variant overflow-x-auto rounded-lg border">
								<table class="w-full border-collapse text-left">
									<thead>
										<tr class="bg-surface-container-low border-outline-variant font-label text-label-sm text-on-surface-variant border-b uppercase">
											<th class="px-3 py-2.5">#</th>
											<th class="px-3 py-2.5">Date</th>
											<th class="px-3 py-2.5">Type</th>
											<th class="px-3 py-2.5">Description</th>
											<th class="px-3 py-2.5 text-right">Amount</th>
											<th class="px-3 py-2.5">Account</th>
										</tr>
									</thead>
									<tbody class="divide-outline-variant divide-y font-mono text-xs">
										<tr>
											<td class="text-on-surface-variant px-3 py-2.5">2</td>
											<td class="px-3 py-2.5">2026-11-26</td>
											<td class="text-coral px-3 py-2.5">expense</td>
											<td class="font-body px-3 py-2.5">Makan siang bareng tim</td>
											<td class="px-3 py-2.5 text-right">85000</td>
											<td class="font-body px-3 py-2.5">Bank Utama</td>
										</tr>
										<tr class="bg-surface-container/60">
											<td class="text-on-surface-variant px-3 py-2.5">3</td>
											<td class="px-3 py-2.5">2026-11-25</td>
											<td class="text-income px-3 py-2.5">income</td>
											<td class="font-body px-3 py-2.5">Gaji &amp; Bonus Proyek</td>
											<td class="px-3 py-2.5 text-right">8400000</td>
											<td class="font-body px-3 py-2.5">Bank Utama</td>
										</tr>
										<tr>
											<td class="text-on-surface-variant px-3 py-2.5">4</td>
											<td class="px-3 py-2.5">2026-11-24</td>
											<td class="text-coral px-3 py-2.5">expense</td>
											<td class="font-body px-3 py-2.5">Kopi susu &amp; roti pagi</td>
											<td class="px-3 py-2.5 text-right">38000</td>
											<td class="font-body px-3 py-2.5">Dompet Digital</td>
										</tr>
									</tbody>
								</table>
							</div>
							<div class="flex flex-wrap gap-1.5">
								{#each ['Transactions', 'Categories', 'Wallets', 'SplitBills', 'Settings'] as tabName (tabName)}
									<span class="bg-pill-white text-on-pill-white font-label text-label-sm rounded-full px-3 py-0.5">
										{tabName}
									</span>
								{/each}
							</div>
						</div>
					{:else}
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
							<div class="bg-surface-container space-y-2.5 rounded-lg p-5">
								<div class="flex items-center justify-between">
									<span class="font-title text-title-md text-on-surface">Hunian &amp; Tagihan</span>
									<span class="bg-income text-on-income font-label text-label-sm rounded-full px-2.5 py-0.5">
										100%
									</span>
								</div>
								<div class="font-mono text-mono-md text-on-surface tabular-nums">Rp 1.500.000 / Rp 1.500.000</div>
								<div class="bg-surface h-3 w-full overflow-hidden rounded-full">
									<div class="bg-income h-full w-full rounded-full"></div>
								</div>
							</div>
							<div class="bg-surface-container space-y-2.5 rounded-lg p-5">
								<div class="flex items-center justify-between">
									<span class="font-title text-title-md text-on-surface">Kuliner &amp; Kafe</span>
									<span class="bg-marigold text-on-marigold font-label text-label-sm rounded-full px-2.5 py-0.5">
										72%
									</span>
								</div>
								<div class="font-mono text-mono-md text-on-surface tabular-nums">Rp 864.000 / Rp 1.200.000</div>
								<div class="bg-surface h-3 w-full overflow-hidden rounded-full">
									<div class="bg-marigold h-full w-[72%] rounded-full"></div>
								</div>
							</div>
							<div class="bg-coral text-on-coral space-y-2.5 rounded-lg p-5">
								<div class="flex items-center justify-between">
									<span class="font-title text-title-md">Transportasi</span>
									<span class="bg-ink text-on-surface font-label text-label-sm rounded-full px-2.5 py-0.5">
										35%
									</span>
								</div>
								<div class="font-mono text-mono-md tabular-nums">Rp 210.000 / Rp 600.000</div>
								<div class="bg-ink/20 h-3 w-full overflow-hidden rounded-full">
									<div class="bg-ink h-full w-[35%] rounded-full"></div>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</section>

		<!-- 4. Privacy & How It Works -->
		<section id="privasi" class="px-gutter-md sm:px-gutter-lg mx-auto max-w-[1280px] py-10">
			<div class="gap-gutter-md grid grid-cols-12">
				<div class="bg-surface-card border-outline-variant gap-gutter-md col-span-12 flex flex-col justify-between rounded-xl border p-7 lg:col-span-5">
					<span class="bg-marigold text-on-marigold font-label text-label-sm self-start rounded-full px-3 py-1 uppercase">
						PRIVASI TANPA KOMPROMI
					</span>
					<h2 class="font-headline text-headline-lg text-on-surface uppercase">
						ZERO PRIVATE DATABASE. DATA TIDAK PERNAH MAMPIR KE SERVER KAMI.
					</h2>
					<p class="font-body text-body-md text-on-surface-variant">
						Autentikasi Google OAuth 2.0 + PKCE dengan cakupan terbatas
						<span class="text-on-surface font-mono">drive.file</span> &amp; sesi terenkripsi JWE A256GCM.
					</p>
				</div>

				<div id="cara-kerja" class="gap-gutter-md col-span-12 grid grid-cols-1 sm:grid-cols-3 lg:col-span-7">
					<div class="bg-sage-cream text-on-sage-cream gap-gutter-md flex flex-col justify-between rounded-xl p-6">
						<span class="bg-ink text-on-surface font-headline text-headline-md flex size-10 items-center justify-center rounded-full">
							01
						</span>
						<div>
							<h3 class="font-headline text-headline-md uppercase">LOGIN GOOGLE</h3>
							<p class="font-body text-body-sm text-ink/80 mt-1">
								Satu klik aman tanpa bikin password baru.
							</p>
						</div>
					</div>
					<div class="bg-sky-mint text-on-sky-mint gap-gutter-md flex flex-col justify-between rounded-xl p-6">
						<span class="bg-ink text-on-surface font-headline text-headline-md flex size-10 items-center justify-center rounded-full">
							02
						</span>
						<div>
							<h3 class="font-headline text-headline-md uppercase">SHEET OTOMATIS</h3>
							<p class="font-body text-body-sm text-ink/80 mt-1">
								Spreadsheet rapi siap di Google Drive kamu.
							</p>
						</div>
					</div>
					<div class="bg-marigold text-on-marigold gap-gutter-md flex flex-col justify-between rounded-xl p-6">
						<span class="bg-ink text-on-surface font-headline text-headline-md flex size-10 items-center justify-center rounded-full">
							03
						</span>
						<div>
							<h3 class="font-headline text-headline-md uppercase">MULAI CATAT</h3>
							<p class="font-body text-body-sm text-ink/80 mt-1">
								Pilih mata uang, tema favorit, dan nikmati ketenangan.
							</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	</main>

	<!-- Footer -->
	<footer class="border-outline-variant bg-surface-container-low mt-10 border-t">
		<div class="px-gutter-md sm:px-gutter-lg gap-gutter-md mx-auto flex max-w-[1280px] flex-wrap items-center justify-between py-8">
			<div class="gap-gutter-sm flex items-center">
				{@render brandMark('sm')}
				<span class="font-body text-body-sm text-on-surface-variant">
					Sanku · Personal finance ledger synced with your Google Sheet.
				</span>
			</div>
			<div class="gap-gutter-lg font-label text-label-sm text-on-surface-variant flex items-center uppercase">
				<a href="#fitur" class="hover:text-on-surface transition-colors">Fitur</a>
				<a href="#privasi" class="hover:text-on-surface transition-colors">Privasi</a>
				{#if data.configured}
					<a href="/auth/login" class="hover:text-on-surface transition-colors">Buka Aplikasi</a>
				{/if}
			</div>
		</div>
	</footer>
</div>
