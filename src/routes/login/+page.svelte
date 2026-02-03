<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { currentUser } from '$lib/auth/user-store';
  import { logAction } from '$lib/auth/audit-log';
  import { Lock, User, AlertCircle, Loader2, Mail, BadgeCheck, Globe } from 'lucide-svelte';
  import { t, locale } from 'svelte-i18n';
  import { setLocale } from '$lib/i18n';
  
  let mode: 'login' | 'signup' = 'login';
  let email = '';
  let username = '';  // Only used in signup
  let password = '';
  let confirmPassword = '';
  let errorMsg = '';
  let successMsg = '';
  let isLoading = false;
  let langMenuOpen = false;
  
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

<svelte:window on:click={handleClickOutside} />

<div class="login-container">
  <div class="lang-selector">
    <div class="lang-menu">
      <button
        class="lang-btn"
        on:click|stopPropagation={() => langMenuOpen = !langMenuOpen}
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
              on:click|stopPropagation={() => changeLang(lang.code)}
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

    <form on:submit|preventDefault={handleSubmit}>
      <div class="form-group">
        <label for="email">
          <Mail size={16} />
          {$t('auth.email')}
        </label>
        <input 
          id="email"
          type="email"
          bind:value={email} 
          on:keypress={handleKeyPress}
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
            on:keypress={handleKeyPress}
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
          on:keypress={handleKeyPress}
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
            on:keypress={handleKeyPress}
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
        <button class="link-btn" on:click={toggleMode} disabled={isLoading}>
          {mode === 'login' ? $t('auth.signup') : $t('auth.login')}
        </button>
      </p>
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
  transition: all 0.15s ease;
}

.lang-btn:hover,
.lang-btn[aria-expanded="true"] {
  background: var(--bg-2);
  border-color: var(--accent, #3b82f6);
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
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  padding: 4px;
  z-index: 10000;
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
  background: var(--accent, #3b82f6);
  color: white;
  font-weight: 600;
}

.login-card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 40px;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.25);
}

.logo-section {
  text-align: center;
  margin-bottom: 32px;
}

.logo-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  background: linear-gradient(135deg, #ff2d95 0%, #ff6b6b 100%);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 800;
  color: white;
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
  transition: all 0.2s ease;
}

input:focus {
  outline: none;
  border-color: var(--accent, #3b82f6);
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
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
  background: linear-gradient(135deg, var(--accent, #3b82f6) 0%, #6366f1 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px -4px rgba(59, 130, 246, 0.4);
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
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 10px;
  font-size: 14px;
  margin-bottom: 20px;
}

.success-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.2);
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
  color: var(--accent, #3b82f6);
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

@media (max-width: 480px) {
  .login-card {
    padding: 32px 24px;
    border-radius: 12px;
  }
}
</style>
