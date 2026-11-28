import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { createTV, type VariantProps } from 'tailwind-variants';

const CUSTOM_FONT_SIZES = [
	'display-lg',
	'display-lg-mobile',
	'display-md',
	'display-md-mobile',
	'headline-lg',
	'headline-md',
	'title-lg',
	'title-md',
	'body-lg',
	'body-md',
	'body-sm',
	'label-lg',
	'label-md',
	'label-sm',
	'mono-md',
	'mono-sm'
];

const customTwMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			'font-size': [{ text: CUSTOM_FONT_SIZES }]
		}
	}
});

export function cn(...inputs: ClassValue[]) {
	return customTwMerge(clsx(inputs));
}

export const tv = createTV({ twMerge: customTwMerge });
export type { VariantProps };
