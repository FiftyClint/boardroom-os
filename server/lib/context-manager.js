const getLogExtract = (log) => {
  if (!log) return '';
  const words = log.split(/\s+/);
  if (words.length <= 2000) return log;
  return '... ' + words.slice(-2000).join(' ');
};

function buildPromptForMember(member, topic, conversationLog, priorInRound, userContext, documentContent) {
  let system = member.persona;
  
  if (userContext && userContext.trim()) {
    system += `\n\n${userContext.trim()}`;
  }
  
  if (documentContent && documentContent.trim()) {
    system += `\n\n=== DOCUMENTS PROVIDED ===\n${documentContent.trim()}\n=== END DOCUMENTS ===`;
  }
  
  let content = `MATTER BEFORE THE BOARD:\n${topic}\n\n`;
  
  content += `PRIOR SESSION HISTORY (background reference, max 2000 words):\n`;
  content += `${getLogExtract(conversationLog)}\n\n`;
  
  content += `THIS ROUND'S DISCUSSION SO FAR — react to these directly:\n`;
  if (priorInRound && priorInRound.length > 0) {
    content += priorInRound.join('\n') + '\n\n';
  } else {
    content += `(No one has spoken yet this round)\n\n`;
  }
  
  // Find most recent user entry
  let mostRecentUser = null;
  if (priorInRound) {
    for (let i = priorInRound.length - 1; i >= 0; i--) {
      // Look for an entry starting with "User:" (case insensitive)
      if (priorInRound[i].match(/^User:\s*/i)) {
        mostRecentUser = priorInRound[i];
        break;
      }
    }
  }
  
  if (mostRecentUser) {
    // Extract actual input removing the "User:" prefix
    const inputContent = mostRecentUser.replace(/^User:\s*/i, '');
    content += `USER'S MOST RECENT INPUT — address this directly and first:\n`;
    content += `"${inputContent}"\n\n`;
  }
  
  content += `Your turn, ${member.name}. Engage with what the user said and what the board has said. Be direct and useful.`;
  
  return {
    system,
    messages: [
      { role: 'user', content }
    ]
  };
}

module.exports = {
  buildPromptForMember
};
