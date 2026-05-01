<script lang="ts">
  import AlertCircle from 'lucide-svelte/icons/alert-circle';
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import Globe from 'lucide-svelte/icons/globe';
  import Loader2 from 'lucide-svelte/icons/loader-2';
  import Lock from 'lucide-svelte/icons/lock';
  import Mail from 'lucide-svelte/icons/mail';
  import User from 'lucide-svelte/icons/user';
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { logAction } from '$lib/auth/audit-log';
  import Icon from '$lib/ui/Icon.svelte';
  import { t, locale } from 'svelte-i18n';
  import { setLocale } from '$lib/i18n';
  
  let mode: 'login' | 'signup' = $state('login');
  let email = $state('');
  let username = $state('');  // Only used in signup
  let password = $state('');
  let confirmPassword = $state('');
  let errorMsg = $state('');
  let successMsg = $state('');
  let isLoading = $state(false);
  let langMenuOpen = $state(false);
  
  const languages = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'ru', label: 'Русский', flag: '🇷🇺' },
    { code: 'lv', label: 'Latviešu', flag: '🇱🇻' }
  ];
  
  let currentLang = $derived($locale || 'en');
  let currentFlag = $derived(languages.find(l => l.code === currentLang)?.flag || '🇬🇧');
  
  function changeLang(lang: string) {
    setLocale(lang);
    langMenuOpen = false;
  }
  
  onMount(() => {
    const unsub = currentUser.subscribe(user => {
      if (user && !isLoading) {
        goto(`${base}/orders`);
      }
    });
    return unsub;
  });
  
  function toggleMode() {
    mode = mode === 'login' ? 'signup' : 'login';
    errorMsg = '';
    successMsg = '';
    password = '';
    confirmPassword = '';
  }

  async function handleSubmit() {
    errorMsg = '';
    successMsg = '';

    if (!email || !password) {
      errorMsg = $t('auth.errors.required');
      return;
    }

    if (mode === 'signup') {
      if (!username) {
        errorMsg = $t('auth.errors.usernameRequired');
        return;
      }
      if (password !== confirmPassword) {
        errorMsg = $t('auth.errors.passwordMismatch');
        return;
      }
      if (password.length < 8) {
        errorMsg = $t('auth.errors.passwordLength');
        return;
      }
    }
    
    isLoading = true;
    
    try {
      if (mode === 'login') {
        await login();
      } else {
        await signup();
      }
    } catch (e: any) {
      console.error(e);
      errorMsg = e.message || $t('auth.errors.connectionError');
    } finally {
      isLoading = false;
    }
  }

  async function login() {
    const res = await fetch(`${base}/api/auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || $t('auth.errors.invalidCredentials'));
    }
    
    const data = await res.json();
    const user = {
      id: data.user.id,
      username: data.user.username,
      displayName: data.user.displayName,
      email: data.user.email,
      primarySection: data.user.primarySection,
      sections: data.user.sections,
      roles: data.user.roles,
      stations: data.user.stations || [],
      passwordHash: '' // Required by User interface but not used on client
    };
    
    currentUser.set(user);
    logAction(user.username, user.primarySection, 'login', 'User logged in');
    goto(`${base}/orders`);
  }

  async function signup() {
    const res = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username,
        email,
        password,
        displayName: username // Default display name
      })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || $t('auth.errors.signupFailed'));
    }

    successMsg = $t('auth.accountCreated');
    mode = 'login';
    password = '';
  }
  
  function handleKeyPress(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  }
  
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.lang-menu')) {
      langMenuOpen = false;
    }
  }
</script>

<svelte:head>
  <title>{mode === 'login' ? $t('auth.login') : $t('auth.signup')} - Reclame OMS</title>
</svelte:head>

<svelte:window onclick={handleClickOutside} />

<div class="login-container">
  <div class="lang-selector">
    <div class="lang-menu">
      <button
        class="lang-btn"
        onclick={(event) => {
          event.stopPropagation();
          langMenuOpen = !langMenuOpen;
        }}
        aria-haspopup="menu"
        aria-expanded={langMenuOpen}
        aria-label={$t('topbar.language', { default: 'Language' })}
      >
        <Globe size={18} aria-hidden="true" />
        <span class="flag">{currentFlag}</span>
      </button>

      {#if langMenuOpen}
        <div class="dropdown" role="menu">
          {#each languages as lang}
            <button
              role="menuitem"
              class:active={currentLang === lang.code}
              onclick={(event) => {
                event.stopPropagation();
                changeLang(lang.code);
              }}
            >
              <span class="flag">{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <div class="login-card">
    <div class="logo-section">
      <div class="logo-icon">RF</div>
      <h1>Reclame OMS</h1>
      <p class="subtitle">{$t('auth.subtitle')}</p>
    </div>
    
    {#if successMsg}
      <div class="success-banner" role="alert">
        <BadgeCheck size={18} />
        {successMsg}
      </div>
    {/if}

    <form onsubmit={(event) => {
      event.preventDefault();
      handleSubmit();
    }}>
      <div class="form-group">
        <label for="email">
          <Mail size={16} />
          {$t('auth.email')}
        </label>
        <input 
          id="email"
          type="email"
          bind:value={email} 
          onkeypress={handleKeyPress}
          required 
          disabled={isLoading}
          placeholder={$t('auth.emailPlaceholder')}
          autocomplete="email"
        />
      </div>

      {#if mode === 'signup'}
        <div class="form-group">
          <label for="username">
            <User size={16} />
            {$t('auth.username')}
          </label>
          <input 
            id="username"
            type="text"
            bind:value={username} 
            onkeypress={handleKeyPress}
            required 
            disabled={isLoading}
            placeholder={$t('auth.usernamePlaceholder')}
            autocomplete="username"
          />
        </div>
      {/if}
      
      <div class="form-group">
        <label for="password">
          <Lock size={16} />
          {$t('auth.password')}
        </label>
        <input 
          id="password"
          type="password" 
          bind:value={password} 
          onkeypress={handleKeyPress}
          required 
          disabled={isLoading}
          placeholder={mode === 'signup' ? $t('auth.passwordPlaceholderNew') : $t('auth.passwordPlaceholder')}
          autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      </div>

      {#if mode === 'signup'}
        <div class="form-group">
          <label for="confirm-password">
            <Lock size={16} />
            {$t('auth.confirmPassword')}
          </label>
          <input 
            id="confirm-password"
            type="password" 
            bind:value={confirmPassword} 
            onkeypress={handleKeyPress}
            required 
            disabled={isLoading}
            placeholder={$t('auth.confirmPasswordPlaceholder')}
            autocomplete="new-password"
          />
        </div>
      {/if}
      
      {#if errorMsg}
        <div class="error" role="alert">
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      {/if}
      
      <button type="submit" disabled={isLoading} class="submit-btn">
        {#if isLoading}
          <Loader2 size={18} class="spinner" />
          {mode === 'login' ? $t('auth.signingIn') : $t('auth.creatingAccount')}
        {:else}
          {mode === 'login' ? $t('auth.signIn') : $t('auth.createAccount')}
        {/if}
      </button>
    </form>
    
    <div class="toggle-section">
      <p>
        {mode === 'login' ? $t('auth.noAccount') : $t('auth.haveAccount')}
        <button class="link-btn" onclick={toggleMode} disabled={isLoading}>
          {mode === 'login' ? $t('auth.signup') : $t('auth.login')}
        </button>
      </p>
    </div>

    <div class="divider"><span>{$t('auth.orContinueWith', { default: 'or continue with' })}</span></div>

    <div class="oauth-buttons">
      <a href="{base}/api/auth/oauth?provider=google" class="oauth-btn google-btn" aria-label="Sign in with Google">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Google
      </a>
      <a href="{base}/api/auth/oauth?provider=apple" class="oauth-btn apple-btn" aria-label="Sign in with Apple">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.39.07 2.35.82 3.15.87 1.2-.24 2.35-1 3.64-.84 1.56.19 2.73.94 3.5 2.36-3.21 1.93-2.44 6.04.58 7.23-.62 1.46-1.41 2.9-2.87 4.26zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
        </svg>
        Apple
      </a>
    </div>
  </div>
  
  <div class="footer">
    <p>{$t('auth.footer')}</p>
  </div>
</div>

<style>
.login-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--bg-0) 0%, var(--bg-1) 100%);
  padding: 20px;
  position: relative;
}

.lang-selector {
  position: absolute;
  top: 20px;
  right: 20px;
}

.lang-menu {
  position: relative;
}

.lang-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 40px;
  padding: 0 12px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  cursor: pointer;
  transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
}

.lang-btn:hover,
.lang-btn[aria-expanded="true"] {
  background: var(--bg-2);
  border-color: var(--accent, var(--brand));
}

.flag {
  font-size: 1.25rem;
  line-height: 1;
}

.dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 160px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 32px color-mix(in oklab, var(--bg-0) 18%, transparent);
  padding: 4px;
  z-index: var(--z-tooltip);
  animation: slideDown 0.15s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dropdown button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
  font-size: 0.875rem;
}

.dropdown button:hover {
  background: var(--bg-2);
}

.dropdown button.active {
  background: var(--accent, var(--brand));
  color: var(--bg-0);
  font-weight: 600;
}

.login-card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 40px;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 20px 40px -12px color-mix(in oklab, var(--bg-0) 25%, transparent);
}

.logo-section {
  text-align: center;
  margin-bottom: 32px;
}

.logo-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  background: linear-gradient(135deg, var(--brand) 0%, var(--error) 100%);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 800;
  color: var(--bg-0);
}

h1 {
  margin: 0 0 4px 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--text);
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--text-2);
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-weight: 500;
  font-size: 13px;
  color: var(--text-2);
}

input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 15px;
  background: var(--bg-0);
  color: var(--text);
  transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
}

input:focus {
  outline: none;
  border-color: var(--accent, var(--brand));
  box-shadow: 0 0 0 4px color-mix(in oklab, var(--brand) 10%, transparent);
}

input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

input::placeholder {
  color: var(--text-3);
}

.submit-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, var(--accent, var(--brand)) 0%, var(--brand) 100%);
  color: var(--bg-0);
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px -4px color-mix(in oklab, var(--brand) 40%, transparent);
}

.submit-btn:active:not(:disabled) {
  transform: translateY(0);
}

.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

:global(.spinner) {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: color-mix(in oklab, var(--error) 10%, transparent);
  color: var(--error);
  border: 1px solid color-mix(in oklab, var(--error) 20%, transparent);
  border-radius: 10px;
  font-size: 14px;
  margin-bottom: 20px;
}

.success-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: color-mix(in oklab, var(--ok) 10%, transparent);
  color: var(--ok);
  border: 1px solid color-mix(in oklab, var(--ok) 20%, transparent);
  border-radius: 10px;
  font-size: 14px;
  margin-bottom: 20px;
}

.toggle-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
  text-align: center;
}

.toggle-section p {
  margin: 0;
  font-size: 14px;
  color: var(--text-2);
}

.link-btn {
  background: none;
  border: none;
  color: var(--accent, var(--brand));
  font-weight: 600;
  cursor: pointer;
  padding: 0 4px;
  font-size: 14px;
}

.link-btn:hover {
  text-decoration: underline;
}

.footer {
  margin-top: 32px;
  text-align: center;
}

.footer p {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}

.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0 16px;
  color: var(--text-3);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

.oauth-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.oauth-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px 16px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-0);
  color: var(--text);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: background var(--motion-sm) var(--ease-standard), border-color var(--motion-sm) var(--ease-standard);
}

.oauth-btn:hover {
  background: var(--bg-2);
  border-color: var(--text-3);
}

.apple-btn svg {
  color: var(--text);
}

@media (max-width: 480px) {
  .login-card {
    padding: 32px 24px;
    border-radius: 12px;
  }

  .oauth-buttons {
    grid-template-columns: 1fr;
  }
}
</style>
