<script lang="ts">
  export let params = {};
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { currentUser } from '$lib/auth/user-store';
  import { logAction } from '$lib/auth/audit-log';
  import { Lock, User, AlertCircle, Loader2 } from 'lucide-svelte';
  
  let username = '';
  let password = '';
  let errorMsg = '';
  let isLoading = false;
  
  onMount(() => {
    // Check if already logged in
    const unsub = currentUser.subscribe(user => {
      if (user && !isLoading) {
        goto(`${base}/orders`);
      }
    });
    return unsub;
  });
  
  async function handleLogin() {
    if (!username || !password) {
      errorMsg = 'Please enter username and password';
      return;
    }
    
    isLoading = true;
    errorMsg = '';
    
    try {
      const res = await fetch(`${base}/api/auth`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      if (!res.ok) {
        const data = await res.json();
        errorMsg = data.error || 'Invalid credentials';
        isLoading = false;
        return;
      }
      
      const data = await res.json();
      const user = {
        username: data.user.username,
        displayName: data.user.displayName,
        passwordHash: '',
        primarySection: data.user.primarySection,
        sections: data.user.sections,
        roles: data.user.roles,
        stations: data.user.stations || []
      };
      
      currentUser.set(user);
      logAction(user.username, user.primarySection, 'login', 'User logged in');
      
      // Redirect to orders (main page)
      goto(`${base}/orders`);
    } catch (e) {
      errorMsg = 'Connection error. Please try again.';
      isLoading = false;
    }
  }
  
  function handleKeyPress(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleLogin();
    }
  }
</script>

<svelte:head>
  <title>Login - Reclame OMS</title>
</svelte:head>

<div class="login-container">
  <div class="login-card">
    <div class="logo-section">
      <div class="logo-icon">RF</div>
      <h1>Reclame OMS</h1>
      <p class="subtitle">Order Management System</p>
    </div>
    
    <form on:submit|preventDefault={handleLogin}>
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
          placeholder="Enter your username"
          autocomplete="username"
        />
      </div>
      
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
          placeholder="Enter your password"
          autocomplete="current-password"
        />
      </div>
      
      {#if errorMsg}
        <div class="error" role="alert">
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      {/if}
      
      <button type="submit" disabled={isLoading}>
        {#if isLoading}
          <Loader2 size={18} class="spinner" />
          Signing in...
        {:else}
          Sign In
        {/if}
      </button>
    </form>
    
    <div class="help-text">
      <p>Contact your administrator for access</p>
    </div>
  </div>
  
  <div class="footer">
    <p>&copy; 2025 Reclame Factory</p>
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

button[type="submit"] {
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

button[type="submit"]:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px -4px rgba(59, 130, 246, 0.4);
}

button[type="submit"]:active:not(:disabled) {
  transform: translateY(0);
}

button[type="submit"]:disabled {
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

.help-text {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
  text-align: center;
}

.help-text p {
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
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
  
  .logo-icon {
    width: 56px;
    height: 56px;
    font-size: 20px;
  }
  
  h1 {
    font-size: 22px;
  }
}
</style>
