import { submitRound } from '../app.js';

export function initInputZone() {
  const btn = document.querySelector('.input-zone button');
  const textarea = document.querySelector('.input-zone textarea');
  
  const clone = btn.cloneNode(true);
  btn.parentNode.replaceChild(clone, btn);

  clone.addEventListener('click', () => {
    const val = textarea.value.trim();
    if (!val) return;
    textarea.value = '';
    submitRound(val);
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      clone.click();
    }
  });
}

// idle | streaming | paused
export function setInputState(status) {
  const btn = document.querySelector('.input-zone button');
  const textarea = document.querySelector('.input-zone textarea');
  
  if (status === 'streaming') {
    btn.disabled = true;
    textarea.disabled = true;
    btn.textContent = 'Board Deliberating...';
    btn.style.opacity = '0.5';
  } else if (status === 'paused') {
    btn.disabled = false;
    textarea.disabled = false;
    btn.textContent = 'Reply to Question';
    btn.style.opacity = '1';
    textarea.placeholder = "Provide the requested answer to continue...";
    textarea.focus();
  } else {
    btn.disabled = false;
    textarea.disabled = false;
    btn.textContent = 'Submit to Board';
    btn.style.opacity = '1';
    textarea.placeholder = "Address the board's inquiries...";
  }
}
