<!-- src/lib/components/ui/Input.svelte -->
<script lang="ts">
    let {
        value = $bindable(""),
        type = "text",
        label = null,
        placeholder = "",
        error = null,
        hint = null,
        disabled = false,
        required = false,
        readonly = false,
        autocomplete = null,
        id = null,
        name = null,
        icon = null,
        iconPosition = "left",
        fullWidth = true,
        oninput,
        onchange,
        onblur,
        onfocus,
        ...restProps
    }: {
        value?: string | number;
        type?:
            | "text"
            | "email"
            | "password"
            | "number"
            | "tel"
            | "url"
            | "search"
            | "date"
            | "time";
        label?: string | null;
        placeholder?: string;
        error?: string | null;
        hint?: string | null;
        disabled?: boolean;
        required?: boolean;
        readonly?: boolean;
        autocomplete?: string | null;
        id?: string | null;
        name?: string | null;
        icon?: string | null;
        iconPosition?: "left" | "right";
        fullWidth?: boolean;
        oninput?: (value: string | number) => void;
        onchange?: (value: string | number) => void;
        onblur?: (event: FocusEvent) => void;
        onfocus?: (event: FocusEvent) => void;
        [key: string]: any;
    } = $props();

    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    function handleInput(event: Event) {
        const target = event.target as HTMLInputElement;
        value = type === "number" ? parseFloat(target.value) : target.value;
        oninput?.(value);
    }

    function handleChange(event: Event) {
        onchange?.(value);
    }

    function handleBlur(event: FocusEvent) {
        onblur?.(event);
    }

    function handleFocus(event: FocusEvent) {
        onfocus?.(event);
    }

    let hasError = $derived(!!error);
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

    <div
        class="input-wrapper"
        class:has-icon-left={icon && iconPosition === "left"}
        class:has-icon-right={icon && iconPosition === "right"}
    >
        {#if icon && iconPosition === "left"}
            <span class="input-icon input-icon-left" aria-hidden="true"
                >{icon}</span
            >
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
            {value}
            {autocomplete}
            oninput={handleInput}
            onchange={handleChange}
            onblur={handleBlur}
            onfocus={handleFocus}
            aria-invalid={hasError}
            aria-describedby={error
                ? `${inputId}-error`
                : hint
                  ? `${inputId}-hint`
                  : undefined}
            {...restProps}
        />

        {#if icon && iconPosition === "right"}
            <span class="input-icon input-icon-right" aria-hidden="true"
                >{icon}</span
            >
        {/if}
    </div>

    {#if error}
        <p
            id="{inputId}-error"
            class="input-message input-error-message"
            role="alert"
        >
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
        transition:
            border-color 0.15s ease,
            box-shadow 0.15s ease;
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
