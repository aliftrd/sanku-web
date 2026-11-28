<script lang="ts" module>
	import { cn, tv, type VariantProps } from '#lib/utils.ts';

	export const buttonVariants = tv({
		base: cn(
			'font-label inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full text-label-lg whitespace-nowrap transition-all duration-state-change ease-out',
			'focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none disabled:pointer-events-none disabled:opacity-55',
			'[&_svg]:pointer-events-none [&_svg]:shrink-0'
		),
		variants: {
			variant: {
				default: 'bg-primary text-on-primary hover:opacity-90',
				'pill-white': 'bg-pill-white text-on-pill-white hover:opacity-90',
				ink: 'bg-ink text-on-surface hover:opacity-90',
				marigold: 'bg-marigold text-on-marigold hover:opacity-90',
				destructive: 'bg-coral text-on-coral hover:opacity-90',
				outline:
					'border-outline-variant bg-surface-card text-on-surface hover:bg-surface-container border',
				secondary:
					'bg-surface-container text-on-surface hover:bg-outline-variant/60 border border-outline-variant',
				ghost: 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
				link: 'text-primary underline-offset-4 hover:underline'
			},
			size: {
				default: 'h-9 px-4 py-2 text-label-lg',
				sm: 'h-8 px-3.5 text-label-md',
				lg: 'h-11 px-6 text-label-lg',
				icon: 'size-10',
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
