import { navigateTo, loadApp } from '../app.js';

export function initContextEditor(initialContent) {
  document.getElementById('onboarding-context').value = initialContent || '';
  
  const btn = document.getElementById('btn-save-context');
  // Avoid duplicate listeners
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  
  newBtn.addEventListener('click', async () => {
    const content = document.getElementById('onboarding-context').value;
    const res = await fetch('/api/context', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (res.ok) {
      navigateTo('app-view');
      loadApp();
    }
  });
}
