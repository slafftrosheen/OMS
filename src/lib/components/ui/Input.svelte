<!-- src/lib/components/ui/Input.svelte -->
<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    export let value: string | number = '';
    export let type: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search' | 'date' | 'time' = 'text';
    export let label: string | null = null;
    export let placeholder = '';
    export let error: string | null = null;
    export let hint: string | null = null;
    export let disabled = false;
    export let required = false;
    export let readonly = false;
    export let autocomplete: string | null = null;
    export let id: string | null = null;
    export let name: string | null = null;
    export let icon: string | null = null;
    export let iconPosition: 'left' | 'right' = 'left';
    export let fullWidth = true;

    const dispatch = createEventDispatcher();
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    function handleInput(event: Event) {
        const target = event.target as HTMLInputElement;
        value = type === 'number' ? parseFloat(target.value) : target.value;
        dispatch('input', value);
    }

    function handleChange(event: Event) {
        dispatch('change', value);
    }

    function handleBlur(event: FocusEvent) {
        dispatch('blur', event);
    }

    $: hasError = !!error;
</script>

<div class="input-group" class:input-full={fullWidth}>
    {#if label}
        <label for={inputId} class="input-label">
            {label}
            {#if required}
                <span class="input-required" aria-label="required">*</span>
            {/if}
        </label>
    {/if}

    <div class="input-wrapper" class:has-icon-left={icon && iconPosition === 'left'} class:has-icon-right={icon && iconPosition === 'right'}>
        {#if icon && iconPosition === 'left'}
            <span class="input-icon input-icon-left" aria-hidden="true">{icon}</span>
        {/if}

        <input
            {type}
            {name}
            {placeholder}
            {disabled}
            {readonly}
            {required}
            id={inputId}
            class="input"
            class:input-error={hasError}
            value={value}
            autocomplete={autocomplete}
            on:input={handleInput}
            on:change={handleChange}
            on:blur={handleBlur}
            on:focus
            aria-invalid={hasError}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...$$restProps}
        />

        {#if icon && iconPosition === 'right'}
            <span class="input-icon input-icon-right" aria-hidden="true">{icon}</span>
        {/if}
    </div>

    {#if error}
        <p id="{inputId}-error" class="input-message input-error-message" role="alert">
            {error}
        </p>
    {:else if hint}
        <p id="{inputId}-hint" class="input-message input-hint-message">
            {hint}
        </p>
    {/if}
</div>

<style>
    .input-group {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
    }

    .input-full {
        width: 100%;
    }

    .input-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text, #333);
        margin-bottom: 0.25rem;
    }

    .input-required {
        color: var(--color-danger, #dc3545);
        margin-left: 0.125rem;
    }

    .input-wrapper {
        position: relative;
        display: flex;
        align-items: center;
    }

    .input {
        width: 100%;
        padding: 0.5rem 0.75rem;
        font-size: 1rem;
        line-height: 1.5;
        color: var(--color-text, #333);
        background-color: var(--color-bg, white);
        border: 1px solid var(--color-border, #ced4da);
        border-radius: 0.375rem;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
        font-family: inherit;
    }

    .input:focus {
        outline: none;
        border-color: var(--color-primary, #0066cc);
        box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
    }

    .input:disabled {
        background-color: var(--color-gray-100, #f8f9fa);
        cursor: not-allowed;
        opacity: 0.6;
    }

    .input:read-only {
        background-color: var(--color-gray-50, #f9fafb);
    }

    .input-error {
        border-color: var(--color-danger, #dc3545);
    }

    .input-error:focus {
        box-shadow: 0 0 0 3px rgba(220, 53, 69, 0.1);
    }

    .has-icon-left .input {
        padding-left: 2.5rem;
    }

    .has-icon-right .input {
        padding-right: 2.5rem;
    }

    .input-icon {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.5rem;
        height: 100%;
        color: var(--color-gray-500, #6c757d);
        pointer-events: none;
    }

    .input-icon-left {
        left: 0;
    }

    .input-icon-right {
        right: 0;
    }

    .input-message {
        font-size: 0.875rem;
        margin: 0;
    }

    .input-error-message {
        color: var(--color-danger, #dc3545);
    }

    .input-hint-message {
        color: var(--color-gray-600, #6c757d);
    }
</style>