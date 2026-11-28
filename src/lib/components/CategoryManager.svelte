<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { Category } from '#lib/types.ts';
	import { formatMoney, formatNumberWithDots, parseNumberWithDots } from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import ConfirmDialog from './ConfirmDialog.svelte';

	let {
		categories,
		currency,
		initialEditCategory = null,
		onclose
	}: {
		categories: Category[];
		currency: string;
		initialEditCategory?: Category | null;
		onclose: () => void;
	} = $props();

	const PALETTE = [
		'#F2644C',
		'#F5BA41',
		'#5C6BF2',
		'#A6DCEF',
		'#34D399',
		'#E6ECE8',
		'#F4F5F3',
		'#FB7185',
		'#38BDF8',
		'#FBBF24'
	];

	let expenseCategories = $derived(
		categories
			.filter((category) => category.type === 'expense')
			.sort((a, b) => a.name.localeCompare(b.name))
	);
	let incomeCategories = $derived(
		categories
			.filter((category) => category.type === 'income')
			.sort((a, b) => a.name.localeCompare(b.name))
	);

	let editingId = $state<string | null>(untrack(() => initialEditCategory?.id ?? null));
	let activeTab = $state<'expense' | 'income'>(untrack(() => initialEditCategory?.type ?? 'expense'));
	let name = $state(untrack(() => initialEditCategory?.name ?? ''));
	let type = $state<'income' | 'expense'>(untrack(() => initialEditCategory?.type ?? 'expense'));
	let color = $state(untrack(() => initialEditCategory?.color ?? PALETTE[0]));
	let emoji = $state(untrack(() => initialEditCategory?.emoji ?? '🏷️'));
	let displayBudget = $state(
		untrack(() =>
			initialEditCategory && initialEditCategory.budget > 0
				? formatNumberWithDots(initialEditCategory.budget)
				: ''
		)
	);
	let rawBudget = $derived(parseNumberWithDots(displayBudget));

	function handleBudgetInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const cursorPosition = target.selectionStart ?? target.value.length;
		const oldLength = target.value.length;
		displayBudget = formatNumberWithDots(target.value);
		const diff = displayBudget.length - oldLength;
		requestAnimationFrame(() => {
			const newPos = Math.max(0, cursorPosition + diff);
			target.setSelectionRange(newPos, newPos);
		});
	}

	let error = $state<string | null>(null);
	let saving = $state(false);
	let savedFlash = $state(false);
	let deletingCategory = $state<Category | null>(null);
	let isDeleting = $state(false);
	let deleteForm: HTMLFormElement | null = $state(null);
	let formEl: HTMLFormElement | null = $state(null);

	function executeDeleteCategory() {
		if (!deletingCategory || !deleteForm) return;
		isDeleting = true;
		deleteForm.requestSubmit();
	}

	let editingCategory = $derived(
		editingId ? (categories.find((category) => category.id === editingId) ?? null) : null
	);

	function resetForm() {
		editingId = null;
		name = '';
		type = 'expense';
		color = PALETTE[0];
		emoji = '🏷️';
		displayBudget = '';
		error = null;
	}

	function startEdit(category: Category) {
		editingId = category.id;
		name = category.name;
		type = category.type;
		activeTab = category.type;
		color = category.color;
		emoji = category.emoji;
		displayBudget = category.budget > 0 ? formatNumberWithDots(category.budget) : '';
		error = null;
		requestAnimationFrame(() => {
			formEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		});
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && !saving) onclose();
	}

	let activeList = $derived(activeTab === 'expense' ? expenseCategories : incomeCategories);
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="bg-ink/80 fixed inset-0 z-50 flex items-center justify-center p-3 backdrop-blur-[2px] sm:p-4"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget && !saving) onclose();
	}}
>
	<div
		class="bg-surface-card text-on-surface border-outline-variant flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="category-modal-title"
	>
		<header class="border-outline-variant flex shrink-0 items-start justify-between border-b px-4 py-3.5 sm:px-6 sm:py-4">
			<div class="space-y-1">
				<span class="bg-sky-mint text-on-sky-mint font-label text-label-sm inline-block rounded-full px-2.5 py-0.5 uppercase">
					Categories &amp; Budgets
				</span>
				<h2 id="category-modal-title" class="font-headline text-headline-md text-on-surface uppercase">
					Shape how your money is organised
				</h2>
			</div>
			<button
				type="button"
				aria-label="Close"
				onclick={onclose}
				class="bg-pill-white text-on-pill-white inline-flex size-8 cursor-pointer items-center justify-center rounded-full transition-opacity hover:opacity-90"
			>
				<span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
			</button>
		</header>

		<div class="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 sm:gap-6 sm:p-6 md:grid-cols-[1.15fr_0.85fr]">
			<!-- Left Column: Category List -->
			<div class="flex flex-col gap-3">
				<div class="bg-ink grid grid-cols-2 gap-1 rounded-full p-1" role="tablist" aria-label="Category type filter">
					<button
						type="button"
						class={cn(
							'flex h-8 cursor-pointer items-center justify-center gap-2 rounded-full font-label text-label-sm transition-colors',
							activeTab === 'expense'
								? 'bg-pill-white text-on-pill-white'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
						role="tab"
						aria-selected={activeTab === 'expense'}
						onclick={() => (activeTab = 'expense')}
					>
						<span>Expenses</span>
						<span class="bg-coral text-on-coral rounded-full px-1.5 py-0 text-[10px] font-bold">
							{expenseCategories.length}
						</span>
					</button>
					<button
						type="button"
						class={cn(
							'flex h-8 cursor-pointer items-center justify-center gap-2 rounded-full font-label text-label-sm transition-colors',
							activeTab === 'income'
								? 'bg-pill-white text-on-pill-white'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
						role="tab"
						aria-selected={activeTab === 'income'}
						onclick={() => (activeTab = 'income')}
					>
						<span>Income Sources</span>
						<span class="bg-income text-on-income rounded-full px-1.5 py-0 text-[10px] font-bold">
							{incomeCategories.length}
						</span>
					</button>
				</div>

				<div class="border-outline-variant bg-surface-container-low max-h-[240px] space-y-2 overflow-y-auto rounded-lg border p-2.5 md:max-h-[380px]">
					{#each activeList as category (category.id)}
						<div
							class={cn(
								'flex items-center justify-between gap-2.5 rounded-lg border px-3 py-2.5 transition-colors',
								editingId === category.id
									? 'border-marigold bg-marigold/15'
									: 'border-outline-variant bg-surface-container hover:bg-surface-container/80'
							)}
						>
							<div class="flex min-w-0 items-center gap-2.5">
								<span
									class="flex size-8 shrink-0 items-center justify-center rounded-full text-base"
									style={`background: ${category.color}30`}
								>
									{category.emoji}
								</span>
								<div class="flex min-w-0 flex-col">
									<strong class="font-title text-title-md text-on-surface truncate">{category.name}</strong>
									{#if category.type === 'expense'}
										{#if category.budget > 0}
											<span class="font-mono text-[11px] font-semibold text-income tabular-nums">
												Limit: {formatMoney(category.budget, currency)}/mo
											</span>
										{:else}
											<span class="font-body text-on-surface-variant text-[11px]">No budget limit</span>
										{/if}
									{:else}
										<span class="font-body text-on-surface-variant text-[11px]">Income Category</span>
									{/if}
								</div>
							</div>

							<div class="flex shrink-0 items-center gap-1">
								<button
									type="button"
									title="Edit category"
									aria-label={`Edit ${category.name}`}
									onclick={() => startEdit(category)}
									class="bg-surface-card text-on-surface-variant hover:bg-pill-white hover:text-on-pill-white flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors"
								>
									<span class="material-symbols-outlined text-[15px]" aria-hidden="true">edit</span>
								</button>
								<button
									type="button"
									title="Delete category"
									aria-label={`Delete ${category.name}`}
									onclick={() => (deletingCategory = category)}
									class="bg-surface-card text-on-surface-variant hover:bg-coral hover:text-on-coral flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors"
								>
									<span class="material-symbols-outlined text-[15px]" aria-hidden="true">delete</span>
								</button>
							</div>
						</div>
					{/each}

					{#if activeList.length === 0}
						<div class="text-on-surface-variant py-8 text-center text-xs">
							{activeTab === 'expense' ? 'No expense categories yet' : 'No income sources yet'}
						</div>
					{/if}
				</div>

				<p class="font-body text-on-surface-variant text-[11px] leading-relaxed">
					Deleting a category does not delete past transactions — they simply display as uncategorized.
				</p>
			</div>

			<!-- Right Column: Add / Edit Form -->
			<div>
				<form
					id="category-manager-form"
					bind:this={formEl}
					method="POST"
					action="?/saveCategory"
					class="border-outline-variant bg-surface-container flex flex-col gap-3.5 rounded-lg border p-4"
					use:enhance={() => {
						saving = true;
						error = null;

						return async ({ result, update }) => {
							saving = false;

							if (result.type === 'success') {
								await update({ reset: false });
								resetForm();
								savedFlash = true;
								setTimeout(() => (savedFlash = false), 2000);
							} else if (result.type === 'failure') {
								const data = result.data as { error?: string } | undefined;
								error = data?.error ?? 'Could not save this category.';
							} else {
								await update();
							}
						};
					}}
				>
					{#if editingId}
						<input type="hidden" name="id" value={editingId} />
					{/if}

					<div class="flex items-center justify-between">
						<h3 class="font-headline text-headline-md text-on-surface uppercase">
							{editingCategory ? 'Edit category' : 'New category'}
						</h3>
						{#if editingCategory}
							<Button variant="link" size="sm" class="h-auto p-0 text-xs" onclick={resetForm}>
								Cancel edit
							</Button>
						{/if}
					</div>

					<div class="bg-ink grid grid-cols-2 gap-1 rounded-full p-1" role="group" aria-label="Category type">
						<button
							type="button"
							class={cn(
								'h-8 cursor-pointer rounded-full font-label text-label-sm transition-colors',
								type === 'expense'
									? 'bg-coral text-on-coral'
									: 'text-on-surface-variant hover:text-on-surface'
							)}
							onclick={() => {
								type = 'expense';
								activeTab = 'expense';
							}}
						>
							Expense
						</button>
						<button
							type="button"
							class={cn(
								'h-8 cursor-pointer rounded-full font-label text-label-sm transition-colors',
								type === 'income'
									? 'bg-income text-on-income'
									: 'text-on-surface-variant hover:text-on-surface'
							)}
							onclick={() => {
								type = 'income';
								activeTab = 'income';
							}}
						>
							Income
						</button>
					</div>
					<input type="hidden" name="type" value={type} />

					<div class="flex flex-col gap-3">
						<div class="grid grid-cols-[68px_1fr] gap-2.5">
							<div class="space-y-1.5">
								<Label for="cat-emoji">Emoji</Label>
								<Input
									id="cat-emoji"
									name="emoji"
									bind:value={emoji}
									maxlength={8}
									class="bg-surface text-center text-lg"
									aria-label="Category emoji"
								/>
							</div>

							<div class="space-y-1.5">
								<Label for="cat-name">Name</Label>
								<Input
									id="cat-name"
									name="name"
									bind:value={name}
									maxlength={40}
									placeholder="e.g. Jajan, Kost..."
									class="bg-surface"
									required
								/>
							</div>
						</div>

						<div class="space-y-1.5">
							<Label>Color Tag</Label>
							<div class="flex flex-wrap gap-2">
								{#each PALETTE as swatch (swatch)}
									<button
										type="button"
										class={cn(
											'size-6 cursor-pointer rounded-full border-2 border-transparent transition-transform hover:scale-110',
											color === swatch && 'border-pill-white scale-115 ring-2 ring-pill-white/30'
										)}
										style={`background: ${swatch}`}
										aria-label={`Use colour ${swatch}`}
										onclick={() => (color = swatch)}
									></button>
								{/each}
							</div>
							<input type="hidden" name="color" value={color} />
						</div>

						{#if type === 'expense'}
							<div class="space-y-1.5">
								<Label for="cat-budget">
									Monthly Limit <span class="text-on-surface-variant font-normal lowercase">(optional)</span>
								</Label>
								<div class="border-outline-variant bg-surface focus-within:border-primary flex h-10 items-center gap-2 rounded border px-3">
									<span class="font-mono text-mono-sm text-on-surface-variant font-bold">{currency}</span>
									<input type="hidden" name="budget" value={rawBudget} />
									<input
										id="cat-budget"
										type="text"
										inputmode="numeric"
										placeholder="0"
										class="text-on-surface w-full bg-transparent font-mono text-sm font-semibold tabular-nums outline-none"
										value={displayBudget}
										oninput={handleBudgetInput}
									/>
								</div>
							</div>
						{:else}
							<input type="hidden" name="budget" value="0" />
						{/if}
					</div>

					{#if error}
						<div class="bg-coral text-on-coral flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold" role="alert">
							<span class="font-bold">!</span>
							<p>{error}</p>
						</div>
					{/if}
				</form>
			</div>
		</div>

		<footer class="border-outline-variant bg-surface-container-low flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-3.5 sm:px-6">
			<div class="text-xs">
				{#if savedFlash}
					<span class="text-income font-semibold" role="status">
						✓ Saved to Google Sheet
					</span>
				{:else}
					<span class="text-on-surface-variant">
						{editingCategory ? `Editing "${editingCategory.name}"` : 'Saved to your Google Sheet Categories tab'}
					</span>
				{/if}
			</div>

			<div class="flex flex-wrap items-center justify-end gap-2">
				{#if editingCategory}
					<Button variant="ghost" size="sm" onclick={resetForm} disabled={saving}>
						Cancel edit
					</Button>
				{/if}
				<Button variant="outline" onclick={onclose} disabled={saving}>
					Close
				</Button>
				<Button type="submit" form="category-manager-form" variant="pill-white" disabled={saving}>
					{saving ? 'Saving…' : editingCategory ? 'Save changes' : 'Add category'}
				</Button>
			</div>
		</footer>
	</div>
</div>

<!-- Hidden Delete Category Form -->
<form
	method="POST"
	action="?/deleteCategory"
	bind:this={deleteForm}
	use:enhance={() => {
		return async ({ update }) => {
			isDeleting = false;
			const wasEditing = editingId === deletingCategory?.id;
			deletingCategory = null;
			await update({ reset: false });
			if (wasEditing) resetForm();
		};
	}}
>
	<input type="hidden" name="id" value={deletingCategory?.id ?? ''} />
</form>

<!-- Delete Category Confirm Alert Dialog -->
<ConfirmDialog
	open={deletingCategory !== null}
	title={`Delete "${deletingCategory?.name}"?`}
	message="Are you sure you want to delete this category? Past transactions will not be deleted, but will appear as uncategorized."
	confirmLabel="Delete Category"
	cancelLabel="Cancel"
	variant="danger"
	icon="delete"
	loading={isDeleting}
	onconfirm={executeDeleteCategory}
	oncancel={() => (deletingCategory = null)}
/>
