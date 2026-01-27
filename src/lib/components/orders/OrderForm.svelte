<!-- src/lib/components/orders/OrderForm.svelte -->
<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import type { Order } from '$lib/stores/orders';

    export let order: Partial<Order> | null = null;
    export let loading = false;

    const dispatch = createEventDispatcher();

    let formData = {
        title: order?.title || '',
        client: order?.client || '',
        description: order?.description || '',
        due_date: order?.due_date ? order.due_date.split('T')[0] : '',
        price: order?.price || null,
        stages: order?.stages || {
            CAD: 'NOT_STARTED',
            CNC: 'NOT_STARTED',
            EDGE: 'NOT_STARTED',
            ASSEMBLY: 'NOT_STARTED',
            PAINT: 'NOT_STARTED',
            PACKAGING: 'NOT_STARTED',
            DELIVERY: 'NOT_STARTED'
        }
    };

    let errors: Record<string, string> = {};

    const AVAILABLE_STAGES = [
        'CAD',
        'CNC',
        'EDGE',
        'ASSEMBLY',
        'PAINT',
        'PACKAGING',
        'DELIVERY',
        'QUALITY_CHECK'
    ];

    function validate(): boolean {
        errors = {};

        if (!formData.title.trim()) {
            errors.title = 'Title is required';
        }

        if (!formData.client.trim()) {
            errors.client = 'Client name is required';
        }

        if (!formData.due_date) {
            errors.due_date = 'Due date is required';
        } else {
            const dueDate = new Date(formData.due_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (dueDate < today) {
                errors.due_date = 'Due date cannot be in the past';
            }
        }

        if (formData.price !== null && formData.price < 0) {
            errors.price = 'Price cannot be negative';
        }

        if (Object.keys(formData.stages).length === 0) {
            errors.stages = 'At least one stage must be selected';
        }

        return Object.keys(errors).length === 0;
    }

    function toggleStage(stage: string) {
        if (formData.stages[stage]) {
            const { [stage]: removed, ...rest } = formData.stages;
            formData.stages = rest;
        } else {
            formData.stages[stage] = 'NOT_STARTED';
        }
    }

    function handleSubmit() {
        if (!validate()) return;

        const submitData = {
            ...formData,
            due_date: new Date(formData.due_date).toISOString()
        };

        dispatch('submit', submitData);
    }

    function handleCancel() {
        dispatch('cancel');
    }
</script>

<form on:submit|preventDefault={handleSubmit} class="order-form">
    <div class="form-section">
        <h3 class="section-title">Basic Information</h3>
        
        <div class="form-grid">
            <Input
                label="Order Title"
                bind:value={formData.title}
                placeholder="e.g., Kitchen Cabinet Set - Client Name"
                error={errors.title}
                required
                fullWidth
            />

            <Input
                label="Client Name"
                bind:value={formData.client}
                placeholder="e.g., John Doe Construction"
                error={errors.client}
                required
                fullWidth
            />

            <Input
                type="date"
                label="Due Date"
                bind:value={formData.due_date}
                error={errors.due_date}
                required
                fullWidth
            />

            <Input
                type="number"
                label="Price (€)"
                bind:value={formData.price}
                placeholder="0.00"
                error={errors.price}
                hint="Optional - leave empty if not set"
                fullWidth
            />
        </div>

        <div class="form-field">
            <label for="description" class="field-label">Description</label>
            <textarea
                id="description"
                bind:value={formData.description}
                placeholder="Detailed order description, specifications, special requirements..."
                rows="4"
                class="textarea"
            ></textarea>
            <p class="field-hint">Optional - provide any additional details</p>
        </div>
    </div>

    <div class="form-section">
        <h3 class="section-title">Production Stages</h3>
        <p class="section-description">Select which stages are required for this order</p>
        
        {#if errors.stages}
            <p class="error-message" role="alert">{errors.stages}</p>
        {/if}

        <div class="stages-grid">
            {#each AVAILABLE_STAGES as stage}
                <label class="stage-checkbox">
                    <input
                        type="checkbox"
                        checked={!!formData.stages[stage]}
                        on:change={() => toggleStage(stage)}
                    />
                    <span class="stage-label">{stage}</span>
                    <span class="checkmark"></span>
                </label>
            {/each}
        </div>

        {#if Object.keys(formData.stages).length > 0}
            <div class="selected-stages">
                <p class="selected-label">Selected stages ({Object.keys(formData.stages).length}):</p>
                <div class="stage-pills">
                    {#each Object.keys(formData.stages) as stage}
                        <span class="stage-pill">{stage}</span>
                    {/each}
                </div>
            </div>
        {/if}
    </div>

    <div class="form-actions">
        <Button type="button" variant="ghost" on:click={handleCancel} disabled={loading}>
            Cancel
        </Button>
        <Button type="submit" variant="primary" {loading}>
            {order ? 'Update Order' : 'Create Order'}
        </Button>
    </div>
</form>

<style>
    .order-form {
        display: flex;
        flex-direction: column;
        gap: 2rem;
    }

    .form-section {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .section-title {
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--color-text, #111827);
        margin: 0;
    }

    .section-description {
        font-size: 0.875rem;
        color: var(--color-gray-600, #6b7280);
        margin: 0;
    }

    .form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1rem;
    }

    .form-field {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
    }

    .field-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text, #333);
    }

    .textarea {
        width: 100%;
        padding: 0.5rem 0.75rem;
        font-size: 1rem;
        line-height: 1.5;
        color: var(--color-text, #333);
        background-color: var(--color-bg, white);
        border: 1px solid var(--color-border, #ced4da);
        border-radius: 0.375rem;
        font-family: inherit;
        resize: vertical;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .textarea:focus {
        outline: none;
        border-color: var(--color-primary, #0066cc);
        box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
    }

    .field-hint {
        font-size: 0.875rem;
        color: var(--color-gray-600, #6b7280);
        margin: 0;
    }

    .error-message {
        font-size: 0.875rem;
        color: var(--color-danger, #dc3545);
        margin: 0;
        padding: 0.5rem;
        background-color: #fee2e2;
        border-radius: 0.25rem;
    }

    .stages-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 0.75rem;
    }

    .stage-checkbox {
        position: relative;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem;
        border: 2px solid var(--color-border, #e5e7eb);
        border-radius: 0.375rem;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .stage-checkbox:hover {
        border-color: var(--color-primary, #0066cc);
        background-color: var(--color-gray-50, #f9fafb);
    }

    .stage-checkbox input {
        position: absolute;
        opacity: 0;
        cursor: pointer;
    }

    .stage-checkbox input:checked ~ .checkmark {
        background-color: var(--color-primary, #0066cc);
        border-color: var(--color-primary, #0066cc);
    }

    .stage-checkbox input:checked ~ .checkmark::after {
        display: block;
    }

    .stage-checkbox input:focus-visible ~ .checkmark {
        outline: 2px solid var(--color-primary, #0066cc);
        outline-offset: 2px;
    }

    .stage-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text, #374151);
        flex: 1;
    }

    .checkmark {
        height: 1.25rem;
        width: 1.25rem;
        border: 2px solid var(--color-border, #d1d5db);
        border-radius: 0.25rem;
        position: relative;
        transition: all 0.15s ease;
    }

    .checkmark::after {
        content: "";
        position: absolute;
        display: none;
        left: 0.35rem;
        top: 0.15rem;
        width: 0.375rem;
        height: 0.625rem;
        border: solid white;
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
    }

    .selected-stages {
        padding: 1rem;
        background-color: var(--color-gray-50, #f9fafb);
        border-radius: 0.375rem;
    }

    .selected-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-gray-700, #374151);
        margin: 0 0 0.5rem 0;
    }

    .stage-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .stage-pill {
        display: inline-block;
        padding: 0.375rem 0.75rem;
        background-color: #dbeafe;
        color: #1e40af;
        font-size: 0.875rem;
        font-weight: 500;
        border-radius: 9999px;
    }

    .form-actions {
        display: flex;
        gap: 0.75rem;
        justify-content: flex-end;
        padding-top: 1rem;
        border-top: 1px solid var(--color-border, #e5e7eb);
    }

    @media (max-width: 640px) {
        .form-grid {
            grid-template-columns: 1fr;
        }

        .stages-grid {
            grid-template-columns: 1fr;
        }

        .form-actions {
            flex-direction: column-reverse;
        }

        .form-actions :global(button) {
            width: 100%;
        }
    }
</style>