import { state } from '../app.js';

let currentMessageContentEl = null;

export function initDiscussion() {
    // Expose scope bindings if needed, layout is handled by render function
}

export function renderMessages(messages, append = false) {
  const container = document.querySelector('.discussion');
  if (!append) container.innerHTML = '';
  
  messages.forEach(msg => {
    let name = 'Executive Officer';
    let color = 'var(--user-color)';
    let isUser = msg.role === 'user';
    
    if (!isUser) {
      const member = state.members.find(m => m.id === msg.member_id);
      if (member) {
        name = member.name;
        color = member.color;
      }
    }

    const template = `
      <div class="message ${isUser ? 'user' : 'board'}">
        <div class="message-header">
           <span class="dot" style="background:${color}"></span> ${name}
        </div>
        <div class="message-content"></div>
      </div>
    `;
    
    const wrapper = document.createElement('div');
    wrapper.innerHTML = template.trim();
    const msgEl = wrapper.firstChild;
    msgEl.querySelector('.message-content').textContent = msg.content; 
    container.appendChild(msgEl);
  });
  
  container.scrollTop = container.scrollHeight;
}

export function createNewMessageBubble(memberId) {
  const container = document.querySelector('.discussion');
  const member = state.members.find(m => m.id === memberId);
  if (!member) return;

  const template = `
    <div class="message board">
      <div class="message-header">
         <span class="dot" style="background:${member.color}"></span> ${member.name}
      </div>
      <div class="message-content"></div>
    </div>
  `;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template.trim();
  const msgEl = wrapper.firstChild;
  container.appendChild(msgEl);
  
  currentMessageContentEl = msgEl.querySelector('.message-content');
  container.scrollTop = container.scrollHeight;
}

export function appendToken(text) {
  if (!currentMessageContentEl) return;
  currentMessageContentEl.textContent += text;
  
  const container = document.querySelector('.discussion');
  container.scrollTop = container.scrollHeight;
}

export function finalizeMessage() {
  currentMessageContentEl = null;
}

export function showQuestionBanner(memberId, question) {
  const banner = document.getElementById('question-banner');
  const member = state.members.find(m => m.id === memberId);
  const color = member ? member.color : 'var(--alert)';
  const name = member ? member.name : 'Board Member';
  
  banner.innerHTML = `
    <div class="message-header"><span class="dot" style="background:${color}"></span> ${name}</div>
    <p></p>
  `;
  banner.querySelector('p').textContent = question;
  banner.classList.add('active');
  const container = document.querySelector('.discussion');
  container.scrollTop = container.scrollHeight;
}

export function hideQuestionBanner() {
  const banner = document.getElementById('question-banner');
  banner.classList.remove('active');
}
