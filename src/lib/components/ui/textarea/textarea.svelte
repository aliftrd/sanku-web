<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { cn } from '#lib/utils.ts';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		...rest
	}: HTMLTextareaAttributes & {
		ref?: HTMLTextAreaElement | null;
		value?: string;
		class?: string;
	} = $props();
</script>

<textarea
	bind:this={ref}
	bind:value
	data-slot="textarea"
	class={cn(
		'border-input bg-card text-foreground placeholder:text-muted-foreground flex min-h-[72px] w-full rounded-md border px-3 py-2 text-sm shadow-2xs transition-colors outline-none',
		'focus-visible:border-ring focus-visible:ring-ring/25 focus-visible:ring-2',
		'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...rest}
></textarea>
