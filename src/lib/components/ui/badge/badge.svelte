<script lang="ts" module>
	import { tv, type VariantProps } from '#lib/utils.ts';

	export const badgeVariants = tv({
		base: 'font-label text-label-sm inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border border-transparent px-3 py-0.5 whitespace-nowrap transition-colors duration-state-change',
		variants: {
			variant: {
				default: 'bg-primary text-on-primary',
				coral: 'bg-coral text-on-coral',
				marigold: 'bg-marigold text-on-marigold',
				'sky-mint': 'bg-sky-mint text-on-sky-mint',
				ink: 'bg-ink text-on-surface',
				'pill-white': 'bg-pill-white text-on-pill-white',
				secondary: 'bg-surface-container text-on-surface-variant border-outline-variant',
				destructive: 'bg-coral text-on-coral',
				outline: 'border-outline-variant text-on-surface-variant bg-surface-card',
				success: 'bg-income text-on-income',
				warning: 'bg-marigold text-on-marigold',
				info: 'bg-sky-mint text-on-sky-mint'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.ts';

	let {
		class: className,
		variant = 'default',
		children,
		...rest
	}: HTMLAttributes<HTMLSpanElement> & {
		class?: string;
		variant?: BadgeVariant;
		children?: Snippet;
	} = $props();
</script>

<span data-slot="badge" class={cn(badgeVariants({ variant }), className)} {...rest}>
	{@render children?.()}
</span>
