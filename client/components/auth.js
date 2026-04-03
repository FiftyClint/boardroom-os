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
