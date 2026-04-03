import { state, loadSession, startNewTopic } from '../app.js';

export function initSidebar() {
  const newBtn = document.querySelector('.sidebar-header button');
  const clone = newBtn.cloneNode(true);
  newBtn.parentNode.replaceChild(clone, newBtn);

  clone.addEventListener('click', () => {
    startNewTopic();
  });
  refreshSessions();
}

export async function refreshSessions() {
  const res = await fetch('/api/sessions');
  if (!res.ok) return;
  const sessions = await res.json();
  
  const list = document.querySelector('.session-list');
  list.innerHTML = '';
  
  sessions.forEach(sess => {
    const el = document.createElement('div');
    el.className = 'session-item';
    el.dataset.id = sess.id;
    if (sess.id === state.currentSessionId) el.classList.add('active');
    
    el.innerHTML = `
      <div class="session-title" title="${sess.title}">${sess.title}</div>
      <div class="session-date">${new Date(sess.updated_at).toLocaleDateString()}</div>
    `;
    
    el.addEventListener('click', () => loadSession(sess.id));
    list.appendChild(el);
  });
}
