export function initRoster(members) {
  const rosterEl = document.querySelector('.roster');
  rosterEl.innerHTML = ''; 
  
  members.forEach(m => {
    const dom = document.createElement('div');
    dom.className = `chip ${m.id}`;
    dom.id = `chip-${m.id}`;
    dom.style.borderLeftColor = m.color;
    dom.innerText = `${m.initials} ${m.shortName}`;
    rosterEl.appendChild(dom);
  });
}

export function setSpeakingMember(memberId) {
  document.querySelectorAll('.roster .chip').forEach(el => {
    el.style.opacity = '0.5';
    el.style.fontWeight = 'normal';
    el.style.boxShadow = 'none';
  });
  
  if (memberId) {
    const active = document.getElementById(`chip-${memberId}`);
    if (active) {
      active.style.opacity = '1';
      active.style.fontWeight = '600';
      active.style.boxShadow = '0 0 10px rgba(255,255,255,0.1)';
    }
  } else {
    document.querySelectorAll('.roster .chip').forEach(el => {
      el.style.opacity = '1';
    });
  }
}
