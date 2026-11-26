<script lang="ts">
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
		onclose
	}: {
		categories: Category[];
		currency: string;
		onclose: () => void;
	} = $props();

	const PALETTE = [
		'#2f6f4e',
		'#4f8f6a',
		'#4a7c9b',
		'#5c6fa8',
		'#8d6bab',
		'#b45f7a',
		'#d97757',
		'#c0603f',
		'#c2a24a',
		'#8a6a4f',
		'#3f8f8a',
		'#9a9489'
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

	let editingId = $state<string | null>(null);
	let activeTab = $state<'expense' | 'income'>('expense');
	let name = $state('');
	let type = $state<'income' | 'expense'>('expense');
	let color = $state(PALETTE[0]);
	let emoji = $state('🏷️');
	let displayBudget = $state('');
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
	class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-xs sm:p-4"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget && !saving) onclose();
	}}
>
	<div
		class="bg-card text-card-foreground border-border flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="category-modal-title"
	>
		<header class="border-border flex shrink-0 items-start justify-between border-b px-4 py-3.5 sm:px-6 sm:py-4">
			<div class="space-y-0.5">
				<span class="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
					Categories & Budgets
				</span>
				<h2 id="category-modal-title" class="text-base font-bold tracking-tight sm:text-xl">
					Shape how your money is organised
				</h2>
			</div>
			<Button variant="ghost" size="icon-sm" aria-label="Close" onclick={onclose}>
				✕
			</Button>
		</header>

		<div class="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 sm:gap-6 sm:p-6 md:grid-cols-[1.15fr_0.85fr]">
			<!-- Left Column: Category List -->
			<div class="flex flex-col gap-3">
				<div class="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1" role="tablist" aria-label="Category type filter">
					<button
						type="button"
						class={cn(
							'flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md text-xs font-semibold transition-all',
							activeTab === 'expense'
								? 'bg-card text-foreground shadow-2xs'
								: 'text-muted-foreground hover:text-foreground'
						)}
						role="tab"
						aria-selected={activeTab === 'expense'}
						onclick={() => (activeTab = 'expense')}
					>
						<span>Expenses</span>
						<span class="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
							{expenseCategories.length}
						</span>
					</button>
					<button
						type="button"
						class={cn(
							'flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md text-xs font-semibold transition-all',
							activeTab === 'income'
								? 'bg-card text-foreground shadow-2xs'
								: 'text-muted-foreground hover:text-foreground'
						)}
						role="tab"
						aria-selected={activeTab === 'income'}
						onclick={() => (activeTab = 'income')}
					>
						<span>Income Sources</span>
						<span class="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
							{incomeCategories.length}
						</span>
					</button>
				</div>

				<div class="border-border bg-muted/20 max-h-[230px] space-y-1.5 overflow-y-auto rounded-xl border p-2 md:max-h-[380px]">
					{#each activeList as category (category.id)}
						<div
							class={cn(
								'border-border bg-card hover:bg-accent/40 flex items-center justify-between gap-2.5 rounded-lg border px-3 py-2 transition-colors',
								editingId === category.id && 'border-primary bg-primary/5 ring-1 ring-primary/20'
							)}
						>
							<div class="flex min-w-0 items-center gap-2.5">
								<span
									class="flex size-8 shrink-0 items-center justify-center rounded-md text-base"
									style={`background: ${category.color}20`}
								>
									{category.emoji}
								</span>
								<div class="flex min-w-0 flex-col">
									<strong class="truncate text-xs font-semibold sm:text-sm">{category.name}</strong>
									{#if category.type === 'expense'}
										{#if category.budget > 0}
											<span class="text-[11px] font-medium text-emerald-700">
												Limit: {formatMoney(category.budget, currency)}/mo
											</span>
										{:else}
											<span class="text-muted-foreground text-[11px]">No budget limit</span>
										{/if}
									{:else}
										<span class="text-muted-foreground text-[11px]">Income Category</span>
									{/if}
								</div>
							</div>

							<div class="flex shrink-0 items-center gap-1">
								<Button
									variant="outline"
									size="icon-sm"
									class="size-7"
									title="Edit category"
									aria-label={`Edit ${category.name}`}
									onclick={() => startEdit(category)}
								>
									<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										<path d="M11.5 2.5a1.77 1.77 0 0 1 2.5 2.5L5 14H2v-3l9.5-8.5z" />
									</svg>
								</Button>
								<Button
									variant="outline"
									size="icon-sm"
									class="text-destructive size-7 hover:bg-rose-50 hover:text-rose-700"
									title="Delete category"
									aria-label={`Delete ${category.name}`}
									onclick={() => (deletingCategory = category)}
								>
									<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										<path d="M2.5 4.5h11M5.5 4.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5M13 4.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-9" />
										<path d="M6.5 7.5v4M9.5 7.5v4" />
									</svg>
								</Button>
							</div>
						</div>
					{/each}

					{#if activeList.length === 0}
						<div class="text-muted-foreground py-8 text-center text-xs">
							{activeTab === 'expense' ? 'No expense categories yet' : 'No income sources yet'}
						</div>
					{/if}
				</div>

				<p class="text-muted-foreground text-[11px] leading-relaxed">
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
					class="border-border bg-muted/40 flex flex-col gap-3 rounded-xl border p-4"
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
						<h3 class="text-sm font-bold">{editingCategory ? 'Edit category' : 'New category'}</h3>
						{#if editingCategory}
							<Button variant="link" size="sm" class="h-auto p-0 text-xs" onclick={resetForm}>
								Cancel edit
							</Button>
						{/if}
					</div>

					<div class="bg-card border-border grid grid-cols-2 gap-1 rounded-lg border p-1" role="group" aria-label="Category type">
						<button
							type="button"
							class={cn(
								'h-8 cursor-pointer rounded-md text-xs font-semibold transition-all',
								type === 'expense'
									? 'bg-primary text-primary-foreground shadow-2xs'
									: 'text-muted-foreground hover:text-foreground'
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
								'h-8 cursor-pointer rounded-md text-xs font-semibold transition-all',
								type === 'income'
									? 'bg-primary text-primary-foreground shadow-2xs'
									: 'text-muted-foreground hover:text-foreground'
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
						<div class="grid grid-cols-[60px_1fr] gap-2.5">
							<div class="space-y-1.5">
								<Label for="cat-emoji">Emoji</Label>
								<Input
									id="cat-emoji"
									name="emoji"
									bind:value={emoji}
									maxlength={8}
									class="text-center text-lg"
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
									placeholder="e.g. Coffee, Groceries..."
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
											color === swatch && 'border-foreground scale-115 ring-2 ring-offset-1 ring-foreground/20'
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
									Monthly Budget Limit <span class="text-muted-foreground font-normal">(optional)</span>
								</Label>
								<div class="border-input bg-card focus-within:ring-ring/25 flex h-9 items-center gap-2 rounded-md border px-3 shadow-2xs focus-within:ring-2">
									<span class="text-muted-foreground text-xs font-bold">{currency}</span>
									<input type="hidden" name="budget" value={rawBudget} />
									<input
										id="cat-budget"
										type="text"
										inputmode="numeric"
										placeholder="0"
										class="w-full bg-transparent text-sm font-semibold tabular-nums outline-none"
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
						<div class="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700" role="alert">
							<span class="font-bold">!</span>
							<p>{error}</p>
						</div>
					{/if}
				</form>
			</div>
		</div>

		<footer class="border-border bg-card flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-3.5 sm:px-6">
			<div class="text-xs">
				{#if savedFlash}
					<span class="font-semibold text-emerald-700" role="status">
						✓ Saved to Google Sheet
					</span>
				{:else}
					<span class="text-muted-foreground">
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
				<Button type="submit" form="category-manager-form" disabled={saving}>
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
