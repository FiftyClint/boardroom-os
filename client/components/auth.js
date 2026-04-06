import { state, navigateTo, loadApp } from '../app.js';

export function initAuth() {
  document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      state.user = (await res.json()).user;
      loadApp();
    } else {
      alert((await res.json()).error);
    }
  });

  document.getElementById('btn-register').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: "Executive" })
    });
    if (res.ok) {
      state.user = (await res.json()).user;
      loadApp();
    } else {
      alert((await res.json()).error);
    }
  });
  
  const btnForgot = document.getElementById('link-forgot-password');
  if (btnForgot) btnForgot.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('forgot-password-view');
  });

  const btnBackLogin = document.getElementById('link-back-login');
  if (btnBackLogin) btnBackLogin.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('auth-view');
  });

  const btnSendRecovery = document.getElementById('btn-send-recovery');
  if (btnSendRecovery) btnSendRecovery.addEventListener('click', async () => {
    const email = document.getElementById('forgot-email').value;
    if (!email) return alert('Email required');
    
    btnSendRecovery.textContent = 'Sending...';
    btnSendRecovery.disabled = true;
    
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    btnSendRecovery.textContent = 'Send Recovery Link';
    btnSendRecovery.disabled = false;
    
    if (res.ok) {
      alert('Recovery link sent! Check your email.');
      navigateTo('auth-view');
    } else {
      alert((await res.json()).error);
    }
  });

  const btnUpdatePw = document.getElementById('btn-update-password');
  if (btnUpdatePw) btnUpdatePw.addEventListener('click', async () => {
    const password = document.getElementById('reset-password').value;
    if (!password) return alert('Password required');
    const tokens = window.recoveryTokens;
    if (!tokens) return alert('Invalid recovery session');
    
    btnUpdatePw.textContent = 'Updating...';
    btnUpdatePw.disabled = true;
    
    const res = await fetch('/api/auth/update-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        password, 
        access_token: tokens.access_token, 
        refresh_token: tokens.refresh_token 
      })
    });
    
    btnUpdatePw.textContent = 'Update Password';
    btnUpdatePw.disabled = false;
    
    if (res.ok) {
      alert('Password updated successfully! Please login.');
      window.recoveryTokens = null;
      navigateTo('auth-view');
    } else {
      alert((await res.json()).error);
    }
  });
}

export async function checkAuth() {
  const res = await fetch('/api/auth/me');
  if (res.ok) {
    state.user = (await res.json()).user;
    loadApp();
  } else {
    navigateTo('auth-view');
  }
}
