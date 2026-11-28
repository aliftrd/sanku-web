<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	export const badgeVariants = tv({
		base: 'font-label text-label-sm inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 py-0.5 whitespace-nowrap transition-colors duration-state-change',
		variants: {
			variant: {
				default: 'bg-primary-container text-on-primary-container border-transparent',
				secondary: 'bg-surface-container-low text-on-surface-variant border-outline',
				destructive: 'bg-expense-container text-on-expense-container border-transparent',
				outline: 'border-outline text-on-surface-variant bg-surface-card',
				success: 'bg-income-container text-on-income-container border-transparent',
				warning: 'bg-warning-container text-on-warning-container border-transparent',
				info: 'bg-secondary-container text-on-secondary-container border-transparent'
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
