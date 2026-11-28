<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '#lib/utils.ts';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & {
		ref?: HTMLDivElement | null;
	} = $props();
</script>

<div
	bind:this={ref}
	role="separator"
	aria-orientation="horizontal"
	data-slot="select-separator"
	class={cn('bg-outline-variant pointer-events-none -mx-1 my-1 h-px', className)}
	{...restProps}
></div>
