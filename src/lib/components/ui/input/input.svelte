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
		'border-input bg-card text-foreground placeholder:text-muted-foreground flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-2xs transition-colors outline-none',
		'focus-visible:border-ring focus-visible:ring-ring/25 focus-visible:ring-2',
		'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...rest}
/>
