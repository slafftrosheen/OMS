<script lang="ts">
  export let params = {};
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { currentUser } from '$lib/auth/user-store';
  import { logAction } from '$lib/auth/audit-log';
  import { Lock, User, AlertCircle, Loader2, Mail, BadgeCheck } from 'lucide-svelte';
  
  let mode: 'login' | 'signup' = 'login';
  let username = '';
  let email = '';
  let password = '';
  let confirmPassword = '';
  let errorMsg = '';
  let successMsg = '';
  let isLoading = false;
  
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

    if (!username || !password) {
      errorMsg = 'Username and password are required';
      return;
    }

    if (mode === 'signup') {
      if (!email) {
        errorMsg = 'Email is required for signup';
        return;
      }
      if (password !== confirmPassword) {
        errorMsg = 'Passwords do not match';
        return;
      }
      if (password.length < 8) {
        errorMsg = 'Password must be at least 8 characters';
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
      errorMsg = e.message || 'Connection error. Please try again.';
    } finally {
      isLoading = false;
    }
  }

  async function login() {
    const res = await fetch(`${base}/api/auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Invalid credentials');
    }
    
    const data = await res.json();
    const user = {
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
      throw new Error(data.error || 'Signup failed');
    }

    successMsg = 'Account created! You can now log in.';
    mode = 'login';
    password = '';
  }
  
  function handleKeyPress(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  }
</script>

<svelte:head>
  <title>{mode === 'login' ? 'Login' : 'Sign Up'} - Reclame OMS</title>
</svelte:head>

<div class="login-container">
  <div class="login-card">
    <div class="logo-section">
      <div class="logo-icon">RF</div>
      <h1>Reclame OMS</h1>
      <p class="subtitle">Production Management System</p>
    </div>
    
    {#if successMsg}
      <div class="success-banner" role="alert">
        <BadgeCheck size={18} />
        {successMsg}
      </div>
    {/if}

    <form on:submit|preventDefault={handleSubmit}>
      <div class="form-group">
        <label for="username">
          <User size={16} />
          Username
        </label>
        <input 
          id="username"
          type="text"
          bind:value={username} 
          on:keypress={handleKeyPress}
          required 
          disabled={isLoading}
          placeholder="e.g. jsmith"
          autocomplete="username"
        />
      </div>

      {#if mode === 'signup'}
        <div class="form-group">
          <label for="email">
            <Mail size={16} />
            Email
          </label>
          <input 
            id="email"
            type="email"
            bind:value={email} 
            on:keypress={handleKeyPress}
            required 
            disabled={isLoading}
            placeholder="john@example.com"
            autocomplete="email"
          />
        </div>
      {/if}
      
      <div class="form-group">
        <label for="password">
          <Lock size={16} />
          Password
        </label>
        <input 
          id="password"
          type="password" 
          bind:value={password} 
          on:keypress={handleKeyPress}
          required 
          disabled={isLoading}
          placeholder={mode === 'signup' ? 'Min 8 characters' : 'Enter your password'}
          autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      </div>

      {#if mode === 'signup'}
        <div class="form-group">
          <label for="confirm-password">
            <Lock size={16} />
            Confirm Password
          </label>
          <input 
            id="confirm-password"
            type="password" 
            bind:value={confirmPassword} 
            on:keypress={handleKeyPress}
            required 
            disabled={isLoading}
            placeholder="Repeat password"
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
          {mode === 'login' ? 'Signing in...' : 'Creating account...'}
        {:else}
          {mode === 'login' ? 'Sign In' : 'Create Account'}
        {/if}
      </button>
    </form>
    
    <div class="toggle-section">
      <p>
        {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
        <button class="link-btn" on:click={toggleMode} disabled={isLoading}>
          {mode === 'login' ? 'Sign Up' : 'Log In'}
        </button>
      </p>
    </div>
  </div>
  
  <div class="footer">
    <p>&copy; 2026 Reclame Factory</p>
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