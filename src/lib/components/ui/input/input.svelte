<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from '#lib/utils.ts';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		...rest
	}: HTMLInputAttributes & {
		ref?: HTMLInputElement | null;
		value?: string | number;
		class?: string;
	} = $props();
</script>

<input
	bind:this={ref}
	bind:value
	data-slot="input"
	class={cn(
		'border-outline-variant bg-surface-container text-on-surface placeholder:text-on-surface-variant/70 flex h-10 w-full min-w-0 rounded border px-3.5 py-2 text-body-md transition-colors outline-none',
		'focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-2',
		'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...rest}
/>
