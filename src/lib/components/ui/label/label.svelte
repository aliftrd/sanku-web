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
		'text-foreground flex items-center gap-1.5 text-xs leading-none font-semibold select-none',
		className
	)}
	{...rest}
>
	{@render children?.()}
</label>
