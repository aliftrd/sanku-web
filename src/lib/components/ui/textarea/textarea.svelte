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
		'border-outline-variant bg-surface-container text-on-surface placeholder:text-on-surface-variant/70 flex min-h-[76px] w-full rounded border px-3.5 py-2.5 text-body-md transition-colors outline-none',
		'focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-2',
		'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...rest}
></textarea>
