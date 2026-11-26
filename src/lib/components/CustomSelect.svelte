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
		variant?: 'default' | 'ghost';
		class?: string;
		align?: 'left' | 'right';
	} = $props();

	let open = $state(false);
	let rootEl: HTMLDivElement | null = $state(null);
	let hiddenInput: HTMLInputElement | null = $state(null);

	let selectedOption = $derived(options.find((opt) => opt.value === value) ?? null);

	function toggle() {
		open = !open;
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
		if (open && rootEl && !rootEl.contains(event.target as Node)) {
			open = false;
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			open = false;
		}
	}
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
		type="button"
		onclick={toggle}
		aria-haspopup="listbox"
		aria-expanded={open}
		class={cn(
			'text-foreground flex w-full cursor-pointer items-center justify-between gap-2 text-left font-medium transition-colors outline-none',
			'focus-visible:ring-ring/30 focus-visible:ring-2',
			variant === 'default' &&
				'border-input bg-card hover:bg-accent/60 rounded-md border shadow-2xs',
			variant === 'ghost' && 'hover:bg-accent rounded-md border-transparent bg-transparent',
			size === 'sm' && (variant === 'ghost' ? 'h-7 px-2 text-xs' : 'h-8 px-2.5 text-xs'),
			size === 'md' && 'h-9 px-3 text-sm',
			open && variant === 'default' && 'border-ring/50 bg-accent/40'
		)}
	>
		<div class="flex min-w-0 items-center gap-2">
			{#if selectedOption}
				{#if selectedOption.icon}
					<span class="shrink-0 text-sm leading-none">{selectedOption.icon}</span>
				{/if}
				{#if selectedOption.color}
					<span class="size-2 shrink-0 rounded-full" style={`background: ${selectedOption.color}`}></span>
				{/if}
				<span class="truncate">{selectedOption.label}</span>
				{#if selectedOption.badge}
					<span class="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold">
						{selectedOption.badge}
					</span>
				{/if}
			{:else}
				<span class="text-muted-foreground truncate">{placeholder}</span>
			{/if}
		</div>

		<svg
			class={cn('text-muted-foreground size-3.5 shrink-0 transition-transform duration-150', open && 'rotate-180')}
			viewBox="0 0 16 16"
			aria-hidden="true"
		>
			<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>

	{#if open}
		<div
			class={cn(
				'bg-popover text-popover-foreground border-border absolute top-[calc(100%+4px)] z-50 w-max min-w-full max-w-[320px] overflow-hidden rounded-lg border shadow-lg',
				align === 'right' ? 'right-0 left-auto' : 'left-0'
			)}
			role="listbox"
		>
			<div class="max-h-60 overflow-y-auto p-1">
				{#each options as option (option.value)}
					{@const isSelected = option.value === value}
					<button
						type="button"
						class={cn(
							'hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-xs sm:text-sm transition-colors',
							isSelected && 'bg-accent/80 font-semibold'
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
								<span class="size-2 shrink-0 rounded-full" style={`background: ${option.color}`}></span>
							{/if}
							<div class="flex min-w-0 flex-col">
								<span class="truncate">{option.label}</span>
								{#if option.subtext}
									<span class="text-muted-foreground text-[11px]">{option.subtext}</span>
								{/if}
							</div>
						</div>

						<div class="flex shrink-0 items-center gap-1.5">
							{#if option.badge}
								<span class="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-semibold">
									{option.badge}
								</span>
							{/if}
							{#if isSelected}
								<svg class="text-emerald-600 size-3.5 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
									<path d="M13.5 4.5 6 12 2.5 8.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
