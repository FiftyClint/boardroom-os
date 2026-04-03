import { initAuth, checkAuth } from './components/auth.js';
import { initSidebar, refreshSessions } from './components/sidebar.js';
import { initRoster, setSpeakingMember } from './components/roster.js';
import { initDiscussion, renderMessages, appendToken, finalizeMessage, showQuestionBanner, hideQuestionBanner, createNewMessageBubble } from './components/discussion.js';
import { initInputZone, setInputState } from './components/input-zone.js';
import { initContextEditor } from './components/context-editor.js';

export const state = {
  user: null,
  members: [],
  currentSessionId: null,
  streamActive: false,
  pauseData: null // { memberId, question }
};

export function navigateTo(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
}

export async function loadApp() {
  try {
    // 1. Fetch Members
    const memRes = await fetch('/api/board/members');
    if(memRes.ok) state.members = await memRes.json();
    
    // 2. Init UI
    initRoster(state.members);
    initSidebar();
    initDiscussion();
    initInputZone();
    
    // 3. Check for Context
    const ctxRes = await fetch('/api/context');
    const ctx = await ctxRes.json();
    if (!ctx.updated_at) { 
      // Needs initial context onboarding
      navigateTo('onboarding-view');
      initContextEditor(ctx.content);
    } else {
      navigateTo('app-view');
      refreshSessions();
    }
  } catch (err) {
    console.error(err);
  }
}

export async function loadSession(sessionId) {
  state.currentSessionId = sessionId;
  state.pauseData = null;
  hideQuestionBanner();
  
  const res = await fetch(`/api/sessions/${sessionId}`);
  if (!res.ok) return;
  const session = await res.json();
  
  renderMessages(session.messages || []);
  setInputState('idle');
  
  // Highlight active sidebar item
  document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
  const currentEl = document.querySelector(`.session-item[data-id="${sessionId}"]`);
  if (currentEl) currentEl.classList.add('active');
}

export function startNewTopic() {
  state.currentSessionId = null;
  state.pauseData = null;
  hideQuestionBanner();
  renderMessages([]);
  setInputState('idle');
  document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
}

export async function submitRound(userText) {
  state.streamActive = true;
  setInputState('streaming');
  
  // Render user text immediately
  if (userText) {
    renderMessages([{ role: 'user', content: userText }], true);
  }

  let finalUrl = '';
  let payload = {};

  if (!state.currentSessionId) {
    const sessRes = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: userText.substring(0, 50) + "..." })
    });
    const newSess = await sessRes.json();
    state.currentSessionId = newSess.id;
    await refreshSessions();
  }

  if (state.pauseData) {
    finalUrl = `/api/board/session/${state.currentSessionId}/round/respond`;
    payload = { userText, resumeFromMemberId: state.pauseData.memberId };
    state.pauseData = null;
    hideQuestionBanner();
  } else {
    finalUrl = `/api/board/session/${state.currentSessionId}/round`;
    payload = { userText };
  }

  try {
    const res = await fetch(finalUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();
      
      for (const part of parts) {
        if (part.startsWith('data: ')) {
          const jsonStr = part.replace(/^data: /, '');
          if (!jsonStr.trim()) continue;
          const ev = JSON.parse(jsonStr);
          
          if (ev.type === 'member_start') {
            setSpeakingMember(ev.memberId);
            createNewMessageBubble(ev.memberId);
          } else if (ev.type === 'token') {
            appendToken(ev.text);
          } else if (ev.type === 'member_done') {
            finalizeMessage();
            setSpeakingMember(null);
          } else if (ev.type === 'pause_required') {
            state.pauseData = { memberId: ev.memberId, question: ev.question };
            showQuestionBanner(ev.memberId, ev.question);
          } else if (ev.type === 'error') {
             console.error('SSE Error:', ev.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('Stream failed:', err);
  } finally {
    state.streamActive = false;
    setInputState(state.pauseData ? 'paused' : 'idle');
    refreshSessions();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  checkAuth();
  
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    navigateTo('auth-view');
  });

  document.getElementById('btn-context').addEventListener('click', () => {
    fetch('/api/context').then(r=>r.json()).then(c => {
       initContextEditor(c.content);
       navigateTo('onboarding-view');
    });
  });
});
