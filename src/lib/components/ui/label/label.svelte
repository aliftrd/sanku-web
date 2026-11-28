<script lang="ts">
	import type { HTMLLabelAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.ts';

	let {
		class: className,
		children,
		...rest
	}: HTMLLabelAttributes & {
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<label
	data-slot="label"
	class={cn(
		'font-label text-label-sm text-on-surface-variant flex items-center gap-1.5 leading-none tracking-wider uppercase select-none',
		className
	)}
	{...rest}
>
	{@render children?.()}
</label>
