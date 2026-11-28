<script lang="ts">
	import { cn } from '#lib/utils.ts';

	let {
		value = $bindable(''),
		options = [],
		placeholder = 'Select an option...',
		name = '',
		onchange,
		size = 'md',
		variant = 'default',
		class: className = '',
		align = 'left'
	}: {
		value?: string;
		options: Array<{
			value: string;
			label: string;
			icon?: string;
			color?: string;
			badge?: string;
			subtext?: string;
		}>;
		placeholder?: string;
		name?: string;
		onchange?: (value: string) => void;
		size?: 'sm' | 'md';
		variant?: 'default' | 'ghost' | 'pill-white';
		class?: string;
		align?: 'left' | 'right';
	} = $props();

	let open = $state(false);
	let rootEl: HTMLDivElement | null = $state(null);
	let triggerEl: HTMLButtonElement | null = $state(null);
	let dropdownEl: HTMLDivElement | null = $state(null);
	let hiddenInput: HTMLInputElement | null = $state(null);
	let dropdownStyle = $state('');

	let selectedOption = $derived(options.find((opt) => opt.value === value) ?? null);

	function updatePosition() {
		if (!triggerEl) return;
		const rect = triggerEl.getBoundingClientRect();
		const spaceBelow = window.innerHeight - rect.bottom;
		const openUpward = spaceBelow < 220 && rect.top > 220;
		const maxW = Math.min(320, window.innerWidth - 16);
		const minW = Math.min(rect.width, maxW);

		let horizontal = '';
		if (align === 'right') {
			const rightOffset = Math.max(8, window.innerWidth - rect.right);
			horizontal = `right: ${rightOffset}px;`;
		} else {
			const leftOffset = Math.max(8, Math.min(rect.left, window.innerWidth - minW - 8));
			horizontal = `left: ${leftOffset}px;`;
		}

		const vertical = openUpward
			? `bottom: ${window.innerHeight - rect.top + 4}px;`
			: `top: ${rect.bottom + 4}px;`;

		dropdownStyle = `position: fixed; ${horizontal} ${vertical} min-width: ${minW}px; max-width: ${maxW}px;`;
	}

	function toggle() {
		if (!open) {
			updatePosition();
			open = true;
		} else {
			open = false;
		}
	}

	function select(optValue: string) {
		value = optValue;
		if (hiddenInput) {
			hiddenInput.value = optValue;
		}
		open = false;
		if (onchange) {
			onchange(optValue);
		}
	}

	function handleWindowClick(event: MouseEvent) {
		const target = event.target as Node;
		if (open && rootEl && !rootEl.contains(target) && (!dropdownEl || !dropdownEl.contains(target))) {
			open = false;
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			open = false;
		}
	}

	$effect(() => {
		if (!open) return;
		updatePosition();
		const onScrollOrResize = () => updatePosition();
		window.addEventListener('scroll', onScrollOrResize, true);
		window.addEventListener('resize', onScrollOrResize);
		return () => {
			window.removeEventListener('scroll', onScrollOrResize, true);
			window.removeEventListener('resize', onScrollOrResize);
		};
	});
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeyDown} />

<div
	bind:this={rootEl}
	class={cn('relative inline-block w-full select-none', className)}
>
	{#if name}
		<input type="hidden" {name} {value} bind:this={hiddenInput} />
	{/if}

	<button
		bind:this={triggerEl}
		type="button"
		onclick={toggle}
		aria-haspopup="listbox"
		aria-expanded={open}
		class={cn(
			'flex w-full cursor-pointer items-center justify-between gap-2 text-left transition-colors outline-none',
			'focus-visible:ring-primary/40 focus-visible:ring-2',
			variant === 'default' &&
				'border-outline-variant bg-surface-container text-on-surface hover:bg-surface-container/80 rounded border font-medium',
			variant === 'ghost' &&
				'text-on-surface hover:bg-surface-container rounded-full border border-transparent bg-transparent font-medium',
			variant === 'pill-white' &&
				'bg-pill-white text-on-pill-white hover:opacity-90 rounded-full border border-transparent font-headline uppercase tracking-wide',
			size === 'sm' &&
				(variant === 'ghost' || variant === 'pill-white'
					? 'h-8 px-2.5 text-label-lg'
					: 'h-9 px-3 text-body-sm'),
			size === 'md' && 'h-10 px-3.5 text-body-md',
			open && variant === 'default' && 'border-primary/60'
		)}
	>
		<div class="flex min-w-0 items-center gap-2">
			{#if selectedOption}
				{#if selectedOption.icon}
					<span class="shrink-0 text-sm leading-none">{selectedOption.icon}</span>
				{/if}
				{#if selectedOption.color}
					<span class="size-2.5 shrink-0 rounded-full border border-ink/30" style={`background: ${selectedOption.color}`}></span>
				{/if}
				<span class="truncate">{selectedOption.label}</span>
				{#if selectedOption.badge}
					<span class="bg-ink text-on-surface shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold">
						{selectedOption.badge}
					</span>
				{/if}
			{:else}
				<span class="text-on-surface-variant truncate">{placeholder}</span>
			{/if}
		</div>

		<svg
			class={cn(
				'size-3.5 shrink-0 transition-transform duration-150',
				variant === 'pill-white' ? 'text-on-pill-white/75' : 'text-on-surface-variant',
				open && 'rotate-180'
			)}
			viewBox="0 0 16 16"
			aria-hidden="true"
		>
			<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>

	{#if open}
		<div
			bind:this={dropdownEl}
			style={dropdownStyle}
			class="bg-surface-card text-on-surface border-outline-variant z-[120] overflow-hidden rounded-lg border shadow-2xl"
			role="listbox"
		>
			<div class="max-h-60 overflow-y-auto p-1.5">
				{#each options as option (option.value)}
					{@const isSelected = option.value === value}
					<button
						type="button"
						class={cn(
							'flex w-full cursor-pointer items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-body-sm transition-colors sm:text-body-md',
							isSelected
								? 'bg-pill-white text-on-pill-white font-bold'
								: 'text-on-surface hover:bg-surface-container'
						)}
						role="option"
						aria-selected={isSelected}
						onclick={() => select(option.value)}
					>
						<div class="flex min-w-0 items-center gap-2">
							{#if option.icon}
								<span class="shrink-0 text-sm leading-none">{option.icon}</span>
							{/if}
							{#if option.color}
								<span class="size-2.5 shrink-0 rounded-full" style={`background: ${option.color}`}></span>
							{/if}
							<div class="flex min-w-0 flex-col">
								<span class="truncate">{option.label}</span>
								{#if option.subtext}
									<span class={cn('text-[11px]', isSelected ? 'text-on-pill-white/70' : 'text-on-surface-variant')}>
										{option.subtext}
									</span>
								{/if}
							</div>
						</div>

						<div class="flex shrink-0 items-center gap-1.5">
							{#if option.badge}
								<span
									class={cn(
										'rounded-full px-2 py-0.5 text-[10px] font-bold',
										isSelected ? 'bg-ink text-on-surface' : 'bg-surface text-on-surface-variant'
									)}
								>
									{option.badge}
								</span>
							{/if}
							{#if isSelected}
								<span class="material-symbols-outlined text-ink text-[16px]" aria-hidden="true">check</span>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
