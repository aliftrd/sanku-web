<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.ts';

	let {
		class: className,
		children,
		...rest
	}: HTMLAttributes<HTMLHeadingElement> & {
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<h3 data-slot="card-title" class={cn('leading-none font-semibold tracking-tight', className)} {...rest}>
	{@render children?.()}
</h3>
