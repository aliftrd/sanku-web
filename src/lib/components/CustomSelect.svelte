<script lang="ts">
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
	class="custom-select-root {className}"
	class:size-sm={size === 'sm'}
	class:variant-ghost={variant === 'ghost'}
	class:is-open={open}
>
	{#if name}
		<input type="hidden" {name} {value} bind:this={hiddenInput} />
	{/if}

	<button
		type="button"
		class="select-trigger"
		onclick={toggle}
		aria-haspopup="listbox"
		aria-expanded={open}
	>
		<div class="trigger-content">
			{#if selectedOption}
				{#if selectedOption.icon}
					<span class="opt-icon">{selectedOption.icon}</span>
				{/if}
				{#if selectedOption.color}
					<span class="opt-dot" style={`background: ${selectedOption.color}`}></span>
				{/if}
				<span class="trigger-label">{selectedOption.label}</span>
				{#if selectedOption.badge}
					<span class="opt-badge">{selectedOption.badge}</span>
				{/if}
			{:else}
				<span class="trigger-placeholder">{placeholder}</span>
			{/if}
		</div>

		<svg class="chevron-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
			<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
	</button>

	{#if open}
		<div class="select-dropdown" class:align-right={align === 'right'} role="listbox">
			<div class="options-scroller">
				{#each options as option (option.value)}
					{@const isSelected = option.value === value}
					<button
						type="button"
						class="option-item"
						class:selected={isSelected}
						role="option"
						aria-selected={isSelected}
						onclick={() => select(option.value)}
					>
						<div class="opt-left">
							{#if option.icon}
								<span class="opt-icon">{option.icon}</span>
							{/if}
							{#if option.color}
								<span class="opt-dot" style={`background: ${option.color}`}></span>
							{/if}
							<div class="opt-texts">
								<span class="opt-label">{option.label}</span>
								{#if option.subtext}
									<span class="opt-sub">{option.subtext}</span>
								{/if}
							</div>
						</div>

						<div class="opt-right">
							{#if option.badge}
								<span class="opt-badge">{option.badge}</span>
							{/if}
							{#if isSelected}
								<svg class="check-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
									<path d="M13.5 4.5 6 12 2.5 8.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
								</svg>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.custom-select-root {
		position: relative;
		display: inline-block;
		user-select: none;
	}

	.select-trigger {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		height: 36px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--ink);
		font-size: 13px;
		font-weight: 550;
		cursor: pointer;
		width: 100%;
		text-align: left;
		box-shadow: var(--shadow-xs);
		transition: border-color 140ms ease, background 140ms ease;
	}

	.custom-select-root.size-sm .select-trigger {
		height: 32px;
		padding: 0 10px;
		font-size: 12px;
		border-radius: var(--radius-sm);
	}

	.custom-select-root.variant-ghost .select-trigger {
		height: 26px;
		padding: 0 6px;
		border: none;
		background: transparent;
		box-shadow: none;
		border-radius: var(--radius-sm);
	}

	.select-trigger:hover,
	.custom-select-root.is-open .select-trigger {
		border-color: var(--border-strong);
		background: var(--surface-hover);
	}

	.custom-select-root.variant-ghost .select-trigger:hover,
	.custom-select-root.variant-ghost.is-open .select-trigger {
		background: var(--surface-hover);
		border-color: transparent;
	}

	.trigger-content {
		display: flex;
		align-items: center;
		gap: 7px;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.trigger-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.trigger-placeholder {
		color: var(--muted-light);
	}

	.chevron-icon {
		color: var(--muted);
		flex-shrink: 0;
		transition: transform 140ms ease;
	}

	.custom-select-root.is-open .chevron-icon {
		transform: rotate(180deg);
	}

	.opt-icon {
		font-size: 14px;
		line-height: 1;
		flex-shrink: 0;
	}

	.opt-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.opt-badge {
		font-size: 10.5px;
		font-weight: 600;
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--bg-subtle);
		color: var(--muted);
	}

	/* Dropdown listbox */
	.select-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 500;
		min-width: 100%;
		width: max-content;
		max-width: 320px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		box-shadow: var(--shadow-xl);
		overflow: hidden;
		animation: dropdownFadeIn 120ms ease;
	}

	.select-dropdown.align-right {
		left: auto;
		right: 0;
	}

	@keyframes dropdownFadeIn {
		from { opacity: 0; transform: translateY(-4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.options-scroller {
		max-height: 240px;
		overflow-y: auto;
		padding: 4px;
	}

	.option-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 7px 10px;
		border-radius: var(--radius-sm);
		font-size: 12.5px;
		color: var(--ink);
		cursor: pointer;
		text-align: left;
		transition: background 100ms ease;
	}

	.option-item:hover {
		background: var(--surface-hover);
	}

	.option-item.selected {
		background: var(--bg-subtle);
		font-weight: 600;
	}

	.opt-left {
		display: flex;
		align-items: center;
		gap: 8px;
		overflow: hidden;
	}

	.opt-texts {
		display: flex;
		flex-direction: column;
	}

	.opt-label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.opt-sub {
		font-size: 10.5px;
		color: var(--muted);
	}

	.opt-right {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-left: 12px;
	}

	.check-icon {
		color: var(--green-deep);
		flex-shrink: 0;
	}
</style>
