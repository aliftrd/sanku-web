<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.ts';

	let {
		class: className,
		children,
		...rest
	}: HTMLAttributes<HTMLParagraphElement> & {
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<p data-slot="card-description" class={cn('text-muted-foreground text-sm', className)} {...rest}>
	{@render children?.()}
</p>
