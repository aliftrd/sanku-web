<script lang="ts" module>
	import { cn } from '#lib/utils.ts';
	import { tv, type VariantProps } from 'tailwind-variants';

	export const buttonVariants = tv({
		base: cn(
			'font-label inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded text-label-md whitespace-nowrap transition-colors duration-state-change',
			'focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45',
			'[&_svg]:pointer-events-none [&_svg]:shrink-0'
		),
		variants: {
			variant: {
				default: 'bg-primary text-on-primary hover:opacity-95',
				destructive: 'bg-expense text-white hover:opacity-95',
				outline:
					'border-outline bg-surface-card text-on-surface hover:bg-surface-container-low hover:border-outline-variant border',
				secondary:
					'bg-surface-container-low text-on-surface hover:bg-outline/70 border border-transparent',
				ghost: 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface',
				link: 'text-primary underline-offset-4 hover:underline'
			},
			size: {
				default: 'h-9 px-4 py-2 text-label-lg',
				sm: 'h-8 rounded px-3 text-label-md',
				lg: 'h-10 rounded px-6 text-label-lg',
				icon: 'size-9',
				'icon-sm': 'size-8'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];
</script>

<script lang="ts">
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';

	type Props = {
		class?: string;
		variant?: ButtonVariant;
		size?: ButtonSize;
		href?: string;
		children?: Snippet;
	} & HTMLButtonAttributes &
		HTMLAnchorAttributes;

	let {
		class: className,
		variant = 'default',
		size = 'default',
		type = 'button',
		href = undefined,
		children,
		...rest
	}: Props = $props();
</script>

{#if href}
	<a {href} class={cn(buttonVariants({ variant, size }), className)} {...rest}>
		{@render children?.()}
	</a>
{:else}
	<button {type} class={cn(buttonVariants({ variant, size }), className)} {...rest}>
		{@render children?.()}
	</button>
{/if}
