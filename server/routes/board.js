const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');
const { MEMBERS, getMemberById } = require('../lib/members');
const { streamMemberResponse, parseQuestion } = require('../lib/anthropic');
const { buildPromptForMember } = require('../lib/context-manager');

const router = express.Router();
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Shared execution function for both starting a round and responding inside a round
async function runBoardStream(req, res, options) {
  const { sessionId } = req.params;
  const { isResponse, userText, directedMemberId, resumeFromMemberId } = options;
  const userId = req.session.user.id;

  try {
    // 4. Verify session ownership
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (sessionErr || !session) {
      return res.status(404).json({ error: 'Session not found or forbidden' });
    }

    // Initialize SSE streaming parameters
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendSSE = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // 5. Load User Context
    let userContextStr = '';
    const { data: userContext } = await supabaseAdmin
      .from('user_context')
      .select('content')
      .eq('user_id', userId)
      .single();
    if (userContext && userContext.content) {
      userContextStr = userContext.content;
    }

    // 6. Load Documents attached to session
    let documentStr = '';
    const { data: documents } = await supabaseAdmin
      .from('documents')
      .select('content, filename')
      .eq('session_id', sessionId);
    if (documents && documents.length > 0) {
      documentStr = documents.map(d => `--- ${d.filename} ---\n${d.content}`).join('\n\n');
    }

    // 7. Load all prior messages
    const { data: allMessages } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
      
    const messages = allMessages || [];

    // Calculate current round
    let currentRound = 1;
    if (messages.length > 0) {
      currentRound = Math.max(...messages.map(m => m.round));
    }
    
    // If it's a NEW round, increment the round number. Otherwise stay in current.
    if (!isResponse && messages.length > 0) {
        currentRound++;
    }

    // 9. Save user's message if provided
    if (userText) {
      await supabaseAdmin.from('messages').insert({
        session_id: sessionId,
        role: 'user',
        content: userText,
        round: currentRound
      });
    }

    // Refresh messages array to ensure we have the newly saved user text
    const { data: updatedMessagesData } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    
    const updatedMessages = updatedMessagesData || [];

    // Build historical conversation log
    const historicalMessages = updatedMessages.filter(m => m.round < currentRound);
    const conversationLog = historicalMessages.map(m => {
      if (m.role === 'user') return `User: ${m.content}`;
      const memName = getMemberById(m.member_id)?.name || m.member_id;
      return `${memName}: ${m.content}`;
    }).join('\n');

    // Build active round context array
    const currentRoundMessages = updatedMessages.filter(m => m.round === currentRound);
    let priorInRound = currentRoundMessages.map(m => {
      if (m.role === 'user') return `User: ${m.content}`;
      const memName = getMemberById(m.member_id)?.name || m.member_id;
      return `${memName}: ${m.content}`;
    });

    // 8. Determine speaking order
    let speakingOrderIds = MEMBERS.map(m => m.id);
    
    // For a brand new round, prioritize a user-directed member to speak first
    if (!isResponse && directedMemberId) {
      speakingOrderIds = [directedMemberId, ...speakingOrderIds.filter(id => id !== directedMemberId)];
    }
    
    // For a response (continuation), filter out board members who ALREADY spoke in this round
    if (isResponse) {
      const spokenIds = currentRoundMessages.filter(m => m.role === 'board').map(m => m.member_id);
      speakingOrderIds = speakingOrderIds.filter(id => !spokenIds.includes(id));
      
      // Also, if resumeFromMemberId is somehow not the first in the remaining list naturally, 
      // the logic is already correct since standard ordered members who haven't spoken remain!
    }

    // 10. Process each member in sequence
    let paused = false;
    for (const memberId of speakingOrderIds) {
      const member = getMemberById(memberId);
      if (!member) continue;

      // 10a. Send member start
      sendSSE({ type: 'member_start', memberId });

      // 10b. Build prompt (priorInRound naturally carries the user's latest text!)
      const promptData = buildPromptForMember(
        member,
        session.topic,
        conversationLog,
        priorInRound,
        userContextStr,
        documentStr
      );

      // 10c. Stream the response
      const fullText = await new Promise((resolve, reject) => {
        streamMemberResponse(member, promptData, 
          // 10d. Emit tokens
          (token) => sendSSE({ type: 'token', memberId, text: token }),
          resolve,
          reject
        );
      });

      // 10e. Parse for a question
      const question = parseQuestion(fullText);
      const hasQuestion = !!question;
      // Note: we identify cleanText here for UI logic if needed, but persist everything as required
      const cleanText = hasQuestion ? fullText.replace(/\[QUESTION FOR USER:[\s\S]*?\]/is, '').trim() : fullText;

      // 10f. Save full member response immediately to messages table
      await supabaseAdmin.from('messages').insert({
        session_id: sessionId,
        role: 'board',
        member_id: memberId,
        content: fullText,
        round: currentRound
      });

      // 10g. Add member response to active priorInRound for following members
      priorInRound.push(`${member.name}: ${fullText}`);

      // 10h. Emit completion
      sendSSE({ type: 'member_done', memberId, hasQuestion, question });

      // 10i. Handle pause
      if (hasQuestion) {
        sendSSE({ type: 'pause_required', memberId, question });
        paused = true;
        break; // Stop stream execution here
      }
    }

    // 11. Complete round sequence
    if (!paused) {
      sendSSE({ type: 'round_complete' });
    }

    // 12. Update session timestamp
    await supabaseAdmin.from('sessions').update({ updated_at: new Date() }).eq('id', sessionId);

    // 13. Close connection
    res.end();

  } catch (error) {
    console.error('SSE Stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.end();
    }
  }
}

// POST /api/board/session/:sessionId/round
router.post('/session/:sessionId/round', requireAuth, (req, res) => {
  const { userText, directedMemberId } = req.body || {};
  runBoardStream(req, res, { isResponse: false, userText, directedMemberId });
});

// POST /api/board/session/:sessionId/round/respond
router.post('/session/:sessionId/round/respond', requireAuth, (req, res) => {
  const { userText, resumeFromMemberId } = req.body || {};
  runBoardStream(req, res, { isResponse: true, userText, resumeFromMemberId });
});

// GET /members (Note: accessible via /api/board/members due to top-level app mounting)
router.get('/members', (req, res) => {
  const safeMembers = MEMBERS.map(m => {
    return {
      id: m.id,
      name: m.name,
      role: m.role,
      initials: m.initials,
      color: m.color,
      shortName: m.shortName
    };
  });
  res.json(safeMembers);
});

module.exports = router;
