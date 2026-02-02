<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { Filter, Plus, X, Save } from 'lucide-svelte';

    const dispatch = createEventDispatcher();

    interface FilterCondition {
        id: string;
        field: string;
        operator: string;
        value: any;
    }

    let conditions: FilterCondition[] = [
        { id: crypto.randomUUID(), field: 'status', operator: 'equals', value: '' }
    ];

    const orderFields = [
        { value: 'status', label: 'Status', type: 'select', options: ['pending', 'in_progress', 'completed', 'cancelled'] },
        { value: 'priority', label: 'Priority', type: 'number' },
        { value: 'customer', label: 'Customer', type: 'text' },
        { value: 'due_date', label: 'Due Date', type: 'date' },
        { value: 'progress', label: 'Progress', type: 'number' },
        { value: 'order_code', label: 'Order Code', type: 'text' }
    ];

    const operators = {
        text: [
            { value: 'contains', label: 'Contains' },
            { value: 'equals', label: 'Equals' },
            { value: 'starts_with', label: 'Starts with' },
            { value: 'ends_with', label: 'Ends with' }
        ],
        number: [
            { value: 'equals', label: 'Equals' },
            { value: 'greater_than', label: 'Greater than' },
            { value: 'less_than', label: 'Less than' },
            { value: 'between', label: 'Between' }
        ],
        date: [
            { value: 'equals', label: 'On' },
            { value: 'before', label: 'Before' },
            { value: 'after', label: 'After' },
            { value: 'between', label: 'Between' }
        ],
        select: [
            { value: 'equals', label: 'Is' },
            { value: 'not_equals', label: 'Is not' },
            { value: 'in', label: 'Is any of' }
        ]
    };

    function addCondition() {
        conditions = [
            ...conditions,
            { id: crypto.randomUUID(), field: 'status', operator: 'equals', value: '' }
        ];
    }

    function removeCondition(id: string) {
        conditions = conditions.filter(c => c.id !== id);
    }

    function getFieldType(fieldValue: string) {
        return orderFields.find(f => f.value === fieldValue)?.type || 'text';
    }

    function getOperators(fieldValue: string) {
        const type = getFieldType(fieldValue);
        return operators[type] || operators.text;
    }

    function getFieldOptions(fieldValue: string) {
        return orderFields.find(f => f.value === fieldValue)?.options || [];
    }

    function applyFilters() {
        const filters = {};
        conditions.forEach(condition => {
            if (condition.value) {
                filters[condition.field] = {
                    operator: condition.operator,
                    value: condition.value
                };
            }
        });
        dispatch('apply', filters);
    }

    function clearFilters() {
        conditions = [
            { id: crypto.randomUUID(), field: 'status', operator: 'equals', value: '' }
        ];
        dispatch('clear');
    }
</script>

<div class="filter-builder">
    <div class="builder-header">
        <Filter size={20} />
        <h3>Advanced Filters</h3>
    </div>

    <div class="conditions-list">
        {#each conditions as condition, index}
            <div class="condition-row">
                <select bind:value={condition.field} class="field-select">
                    {#each orderFields as field}
                        <option value={field.value}>{field.label}</option>
                    {/each}
                </select>

                <select bind:value={condition.operator} class="operator-select">
                    {#each getOperators(condition.field) as op}
                        <option value={op.value}>{op.label}</option>
                    {/each}
                </select>

                {#if getFieldType(condition.field) === 'select'}
                    <select bind:value={condition.value} class="value-input">
                        <option value="">Select...</option>
                        {#each getFieldOptions(condition.field) as option}
                            <option value={option}>{option}</option>
                        {/each}
                    </select>
                {:else if getFieldType(condition.field) === 'date'}
                    <input type="date" bind:value={condition.value} class="value-input" />
                {:else if getFieldType(condition.field) === 'number'}
                    <input type="number" bind:value={condition.value} class="value-input" placeholder="Value" />
                {:else}
                    <input type="text" bind:value={condition.value} class="value-input" placeholder="Value" />
                {/if}

                <button
                    class="remove-btn"
                    on:click={() => removeCondition(condition.id)}
                    disabled={conditions.length === 1}
                    title="Remove condition"
                >
                    <X size={16} />
                </button>
            </div>
        {/each}
    </div>

    <div class="builder-actions">
        <button class="add-condition-btn" on:click={addCondition}>
            <Plus size={16} />
            Add Condition
        </button>

        <div class="action-buttons">
            <button class="clear-btn" on:click={clearFilters}>
                Clear All
            </button>
            <button class="apply-btn" on:click={applyFilters}>
                <Filter size={16} />
                Apply Filters
            </button>
        </div>
    </div>
</div>

<style>
    .filter-builder {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 20px;
    }

    .builder-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 20px;
        padding-bottom: 15px;
        border-bottom: 1px solid #e5e7eb;
    }

    .builder-header h3 {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
    }

    .conditions-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 20px;
    }

    .condition-row {
        display: grid;
        grid-template-columns: 2fr 1.5fr 2fr auto;
        gap: 10px;
        align-items: center;
    }

    .field-select,
    .operator-select,
    .value-input {
        padding: 8px 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 0.875rem;
        outline: none;
        transition: border-color 0.2s;
    }

    .field-select:focus,
    .operator-select:focus,
    .value-input:focus {
        border-color: #3b82f6;
    }

    .remove-btn {
        width: 32px;
        height: 32px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 6px;
        color: #ef4444;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .remove-btn:hover:not(:disabled) {
        background: #fee2e2;
        border-color: #fca5a5;
    }

    .remove-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .builder-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-top: 15px;
        border-top: 1px solid #e5e7eb;
    }

    .add-condition-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        background: #f3f4f6;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    }

    .add-condition-btn:hover {
        background: #e5e7eb;
    }

    .action-buttons {
        display: flex;
        gap: 10px;
    }

    .clear-btn,
    .apply-btn {
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    }

    .clear-btn {
        background: white;
        border: 1px solid #e5e7eb;
        color: #6b7280;
    }

    .clear-btn:hover {
        background: #f9fafb;
    }

    .apply-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #3b82f6;
        border: 1px solid #3b82f6;
        color: white;
    }

    .apply-btn:hover {
        background: #2563eb;
        border-color: #2563eb;
    }

    @media (max-width: 768px) {
        .condition-row {
            grid-template-columns: 1fr;
        }

        .remove-btn {
            justify-self: end;
        }

        .builder-actions {
            flex-direction: column;
            gap: 10px;
        }

        .action-buttons {
            width: 100%;
        }

        .clear-btn,
        .apply-btn {
            flex: 1;
        }
    }
</style>
