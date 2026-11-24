<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Category } from '#lib/types.ts';
	import { formatMoney, formatNumberWithDots, parseNumberWithDots } from '#lib/finance.ts';
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
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && !saving) onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="modal-backdrop"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget && !saving) onclose();
	}}
>
	<div
		class="modal category-modal-window"
		role="dialog"
		aria-modal="true"
		aria-labelledby="category-modal-title"
	>
		<header class="cat-modal-header">
			<div>
				<span class="cat-eyebrow">Categories & Budgets</span>
				<h2 id="category-modal-title">Shape how your money is organised</h2>
			</div>
			<button class="cat-close-btn" type="button" aria-label="Close" onclick={onclose}>×</button>
		</header>

		<div class="cat-manager-grid">
			<!-- Left Column: Category List -->
			<div class="cat-list-column">
				<!-- Segmented Tabs for Expenses / Income -->
				<div class="cat-tabs-nav" role="tablist" aria-label="Category type filter">
					<button
						type="button"
						class="cat-tab-btn"
						class:active={activeTab === 'expense'}
						role="tab"
						aria-selected={activeTab === 'expense'}
						onclick={() => (activeTab = 'expense')}
					>
						<span>Expenses</span>
						<span class="count-pill">{expenseCategories.length}</span>
					</button>
					<button
						type="button"
						class="cat-tab-btn"
						class:active={activeTab === 'income'}
						role="tab"
						aria-selected={activeTab === 'income'}
						onclick={() => (activeTab = 'income')}
					>
						<span>Income Sources</span>
						<span class="count-pill">{incomeCategories.length}</span>
					</button>
				</div>

				{#if activeTab === 'expense'}
					<!-- Expenses Group -->
					<div class="cat-group-section">
						<div class="cat-items-list">
							{#each expenseCategories as category (category.id)}
								<div class="category-card" class:is-editing={editingId === category.id}>
									<div class="card-identity">
										<span class="emoji-avatar" style={`background: ${category.color}20`}>
											{category.emoji}
										</span>
										<div class="identity-texts">
											<strong class="cat-title">{category.name}</strong>
											{#if category.budget > 0}
												<span class="budget-badge active">
													Limit: {formatMoney(category.budget, currency)}/mo
												</span>
											{:else}
												<span class="budget-badge none">No budget limit</span>
											{/if}
										</div>
									</div>

									<div class="card-controls">
										<button
											type="button"
											class="btn-row-icon-action"
											data-tooltip="Edit"
											title="Edit category"
											aria-label={`Edit ${category.name}`}
											onclick={() => startEdit(category)}
										>
											<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
												<path d="M11.5 2.5a1.77 1.77 0 0 1 2.5 2.5L5 14H2v-3l9.5-8.5z" />
											</svg>
										</button>
										<button
											type="button"
											class="btn-row-icon-action del"
											data-tooltip="Delete"
											title="Delete category"
											aria-label={`Delete ${category.name}`}
											onclick={() => (deletingCategory = category)}
										>
											<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
												<path d="M2.5 4.5h11M5.5 4.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5M13 4.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-9" />
												<path d="M6.5 7.5v4M9.5 7.5v4" />
											</svg>
										</button>
									</div>
								</div>
							{/each}

							{#if expenseCategories.length === 0}
								<div class="empty-cat-placeholder">
									<span>No expense categories yet</span>
								</div>
							{/if}
						</div>
					</div>
				{:else}
					<!-- Income Group -->
					<div class="cat-group-section">
						<div class="cat-items-list">
							{#each incomeCategories as category (category.id)}
								<div class="category-card" class:is-editing={editingId === category.id}>
									<div class="card-identity">
										<span class="emoji-avatar" style={`background: ${category.color}20`}>
											{category.emoji}
										</span>
										<div class="identity-texts">
											<strong class="cat-title">{category.name}</strong>
											<span class="budget-badge income">Income Category</span>
										</div>
									</div>

									<div class="card-controls">
										<button
											type="button"
											class="btn-row-icon-action"
											data-tooltip="Edit"
											title="Edit category"
											aria-label={`Edit ${category.name}`}
											onclick={() => startEdit(category)}
										>
											<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
												<path d="M11.5 2.5a1.77 1.77 0 0 1 2.5 2.5L5 14H2v-3l9.5-8.5z" />
											</svg>
										</button>
										<button
											type="button"
											class="btn-row-icon-action del"
											data-tooltip="Delete"
											title="Delete category"
											aria-label={`Delete ${category.name}`}
											onclick={() => (deletingCategory = category)}
										>
											<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
												<path d="M2.5 4.5h11M5.5 4.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5M13 4.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-9" />
												<path d="M6.5 7.5v4M9.5 7.5v4" />
											</svg>
										</button>
									</div>
								</div>
							{/each}

							{#if incomeCategories.length === 0}
								<div class="empty-cat-placeholder">
									<span>No income sources yet</span>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<p class="cat-footnote">
					Deleting a category does not delete past transactions — they simply display as uncategorized.
				</p>
			</div>

			<!-- Right Column: Add / Edit Form -->
			<div class="cat-form-column">
				<form
					method="POST"
					action="?/saveCategory"
					class="cat-form-card"
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

					<div class="form-title-bar">
						<h3>{editingCategory ? 'Edit category' : 'New category'}</h3>
						{#if editingCategory}
							<button type="button" class="btn-cancel-edit" onclick={resetForm}>
								Cancel edit
							</button>
						{/if}
					</div>

					<div class="type-segmented-wrap" role="group" aria-label="Category type">
						<button
							type="button"
							class="type-pill"
							class:active={type === 'expense'}
							onclick={() => {
								type = 'expense';
								activeTab = 'expense';
							}}
						>
							Expense
						</button>
						<button
							type="button"
							class="type-pill"
							class:active={type === 'income'}
							onclick={() => {
								type = 'income';
								activeTab = 'income';
							}}
						>
							Income
						</button>
					</div>
					<input type="hidden" name="type" value={type} />

					<div class="form-inputs-stack">
						<div class="emoji-name-grid">
							<label class="form-field-unit emoji-unit">
								<span class="field-label">Emoji</span>
								<input
									name="emoji"
									bind:value={emoji}
									maxlength="8"
									class="emoji-input-box"
									aria-label="Category emoji"
								/>
							</label>

							<label class="form-field-unit name-unit">
								<span class="field-label">Name</span>
								<input
									name="name"
									bind:value={name}
									maxlength="40"
									placeholder="e.g. Coffee, Groceries..."
									class="text-input-box"
									required
								/>
							</label>
						</div>

						<div class="form-field-unit">
							<span class="field-label">Color Tag</span>
							<div class="palette-swatches-grid">
								{#each PALETTE as swatch (swatch)}
									<button
										type="button"
										class="palette-swatch"
										class:is-active={color === swatch}
										style={`background: ${swatch}`}
										aria-label={`Use colour ${swatch}`}
										onclick={() => (color = swatch)}
									></button>
								{/each}
							</div>
							<input type="hidden" name="color" value={color} />
						</div>

						{#if type === 'expense'}
							<label class="form-field-unit">
								<span class="field-label">
									Monthly Budget Limit <em class="optional-label">(optional)</em>
								</span>
								<div class="budget-input-wrapper">
									<span class="currency-tag">{currency}</span>
									<input type="hidden" name="budget" value={rawBudget} />
									<input
										type="text"
										inputmode="numeric"
										placeholder="0"
										class="budget-num-input"
										value={displayBudget}
										oninput={handleBudgetInput}
									/>
								</div>
							</label>
						{:else}
							<input type="hidden" name="budget" value="0" />
						{/if}
					</div>

					{#if error}
						<div class="cat-form-error" role="alert">
							<span>!</span>
							<p>{error}</p>
						</div>
					{/if}

					<div class="form-action-footer">
						<button type="submit" class="btn-submit-category" disabled={saving}>
							{saving ? 'Saving…' : editingCategory ? 'Save changes' : 'Add category'}
						</button>
						{#if savedFlash}
							<p class="saved-indicator" role="status">✓ Saved to Google Sheet</p>
						{/if}
					</div>
				</form>
			</div>
		</div>
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

<style>
	.category-modal-window {
		width: 100%;
		max-width: 920px;
		max-height: 90vh;
		background: var(--surface);
		border-radius: var(--radius-xl);
		border: 1px solid var(--border);
		box-shadow: var(--shadow-xl);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.cat-modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 24px 28px 18px;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}

	.cat-eyebrow {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}

	.cat-modal-header h2 {
		margin: 4px 0 0;
		font-size: 20px;
		font-weight: 800;
		letter-spacing: -0.025em;
		color: var(--ink);
	}

	.cat-close-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		font-size: 20px;
		color: var(--muted);
		transition: background 120ms ease, color 120ms ease;
	}

	.cat-close-btn:hover {
		background: var(--surface-hover);
		color: var(--ink);
	}

	.cat-manager-grid {
		display: grid;
		grid-template-columns: 1.15fr 0.85fr;
		gap: 28px;
		padding: 24px 28px;
		overflow-y: auto;
		background: var(--surface);
	}

	/* Left List Column */
	.cat-list-column {
		max-height: 540px;
		overflow-y: auto;
		padding-right: 8px;
	}

	.cat-tabs-nav {
		display: flex;
		align-items: center;
		padding: 3px;
		background: var(--bg-subtle);
		border-radius: var(--radius-md);
		gap: 3px;
		margin-bottom: 16px;
	}

	.cat-tab-btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 32px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--muted);
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
		transition: all 120ms ease;
	}

	.cat-tab-btn:hover {
		color: var(--ink);
	}

	.cat-tab-btn.active {
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-xs);
	}

	.cat-tab-btn .count-pill {
		font-size: 10px;
		font-weight: 600;
		padding: 1px 6px;
		border-radius: var(--radius-full);
		background: var(--bg-subtle);
		color: var(--muted);
	}

	.cat-tab-btn.active .count-pill {
		background: var(--bg);
		color: var(--ink);
	}

	.empty-cat-placeholder {
		padding: 36px 16px;
		text-align: center;
		border: 1px dashed var(--border);
		border-radius: var(--radius-md);
		color: var(--muted-light);
		font-size: 12.5px;
	}

	.cat-group-section {
		margin-bottom: 24px;
	}

	.count-pill {
		font-size: 10px;
		font-weight: 600;
		padding: 1px 7px;
		border-radius: var(--radius-full);
		background: var(--bg-subtle);
		color: var(--muted);
	}

	.cat-items-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.category-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		transition: border-color 140ms ease, background 140ms ease;
	}

	.category-card:hover {
		border-color: var(--border-strong);
		background: var(--surface-hover);
	}

	.category-card.is-editing {
		border-color: var(--theme-accent);
		background: var(--theme-accent-soft);
	}

	.card-identity {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.emoji-avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: var(--radius-sm);
		font-size: 17px;
		flex-shrink: 0;
	}

	.identity-texts {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.cat-title {
		font-size: 13.5px;
		font-weight: 650;
		color: var(--ink);
	}

	.budget-badge {
		font-size: 11px;
		font-weight: 550;
	}

	.budget-badge.active {
		color: var(--green-deep);
		font-weight: 600;
	}

	.budget-badge.none {
		color: var(--muted-light);
	}

	.budget-badge.income {
		color: var(--muted);
	}

	.card-controls {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.cat-footnote {
		margin: 16px 0 0;
		font-size: 11.5px;
		color: var(--muted);
		line-height: 1.5;
	}

	/* Right Form Column */
	.cat-form-card {
		padding: 22px;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-subtle);
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.form-title-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.form-title-bar h3 {
		margin: 0;
		font-size: 15px;
		font-weight: 750;
		color: var(--ink);
	}

	.btn-cancel-edit {
		font-size: 11.5px;
		font-weight: 600;
		color: var(--muted);
		text-decoration: underline;
	}

	.type-segmented-wrap {
		display: flex;
		padding: 3px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
	}

	.type-pill {
		flex: 1;
		height: 32px;
		border-radius: var(--radius-sm);
		font-size: 12.5px;
		font-weight: 600;
		color: var(--muted);
		transition: all 120ms ease;
	}

	.type-pill.active {
		background: var(--theme-primary);
		color: #ffffff;
		box-shadow: var(--shadow-xs);
	}

	.form-inputs-stack {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.form-field-unit {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		font-size: 11.5px;
		font-weight: 700;
		color: var(--ink-soft);
	}

	.optional-label {
		font-weight: 400;
		font-style: normal;
		color: var(--muted);
	}

	.emoji-name-grid {
		display: grid;
		grid-template-columns: 68px 1fr;
		gap: 10px;
	}

	.emoji-input-box {
		height: 38px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		font-size: 18px;
		text-align: center;
		outline: none;
	}

	.text-input-box {
		height: 38px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		font-size: 13px;
		outline: none;
	}

	.emoji-input-box:focus,
	.text-input-box:focus,
	.budget-num-input:focus {
		border-color: var(--theme-accent);
	}

	.palette-swatches-grid {
		display: flex;
		gap: 7px;
		flex-wrap: wrap;
	}

	.palette-swatch {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		transition: transform 120ms ease;
	}

	.palette-swatch:hover {
		transform: scale(1.15);
	}

	.palette-swatch.is-active {
		border-color: var(--ink);
		transform: scale(1.2);
	}

	.budget-input-wrapper {
		display: flex;
		align-items: center;
		height: 38px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		padding: 0 12px;
		gap: 6px;
	}

	.currency-tag {
		font-size: 12px;
		font-weight: 700;
		color: var(--muted);
	}

	.budget-num-input {
		width: 100%;
		border: none;
		background: transparent;
		font-size: 13.5px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		outline: none;
	}

	.cat-form-error {
		padding: 8px 12px;
		border: 1px solid var(--danger-border);
		border-radius: var(--radius-md);
		background: var(--danger-soft);
		color: var(--danger-deep);
		font-size: 12px;
	}

	.btn-submit-category {
		height: 40px;
		width: 100%;
		border-radius: var(--radius-md);
		background: var(--theme-primary);
		color: #ffffff;
		font-size: 13px;
		font-weight: 650;
		box-shadow: var(--shadow-sm);
		transition: all 120ms ease;
	}

	.btn-submit-category:hover:not(:disabled) {
		background: var(--theme-primary-hover);
		transform: translateY(-1px);
	}

	.saved-indicator {
		margin: 6px 0 0;
		font-size: 12px;
		color: var(--green-deep);
		font-weight: 600;
		text-align: center;
	}

	@media (max-width: 800px) {
		.cat-modal-header {
			padding: 16px 18px 12px;
		}

		.cat-modal-header h2 {
			font-size: 16px;
		}

		.cat-manager-grid {
			grid-template-columns: 1fr;
			padding: 16px;
			gap: 20px;
		}

		.cat-list-column {
			max-height: 280px;
			padding-right: 0;
		}

		.cat-form-card {
			padding: 16px;
		}
	}

	@media (max-width: 480px) {
		.emoji-name-grid {
			grid-template-columns: 52px 1fr;
			gap: 8px;
		}

		.cat-tab-btn {
			font-size: 12px;
			gap: 6px;
		}

		.category-card {
			padding: 10px 12px;
		}

		.card-identity {
			gap: 8px;
		}
	}
</style>
