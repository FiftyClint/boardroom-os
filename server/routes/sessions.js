const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');

const router = express.Router();
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { data, error } = await supabaseAdmin
      .from('sessions')
      .select('id, title, topic, created_at, updated_at, messages(count)')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const formatted = data.map(s => ({
      id: s.id,
      title: s.title,
      topic: s.topic,
      created_at: s.created_at,
      updated_at: s.updated_at,
      message_count: (s.messages && s.messages[0]) ? s.messages[0].count : 0
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { topic } = req.body;
    
    if (!topic) return res.status(400).json({ error: 'Topic is required' });

    const { data, error } = await supabaseAdmin
      .from('sessions')
      .insert({ user_id: userId, topic, title: topic })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /search must be defined before /:id to avoid mapping collisions
router.get('/search', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const q = req.query.q || '';
    if (!q) return res.json([]);

    // 1. Search sessions by title/topic
    const { data: sessionData, error: sessionErr } = await supabaseAdmin
      .from('sessions')
      .select('id, title')
      .eq('user_id', userId)
      .or(`title.ilike.%${q}%,topic.ilike.%${q}%`);

    // 2. Search messages by content (inner join to sessions to verify ownership implicitly)
    const { data: messagesData, error: msgErr } = await supabaseAdmin
      .from('messages')
      .select('content, session_id, sessions!inner(user_id, title)')
      .eq('sessions.user_id', userId)
      .ilike('content', `%${q}%`);

    const resultsMap = new Map();

    if (sessionData) {
      for (const s of sessionData) {
        resultsMap.set(s.id, { id: s.id, title: s.title, snippet: null });
      }
    }

    if (messagesData) {
      for (const m of messagesData) {
        if (!resultsMap.has(m.session_id)) {
          resultsMap.set(m.session_id, { id: m.session_id, title: m.sessions.title });
        }
        const obj = resultsMap.get(m.session_id);
        if (!obj.snippet) {
           obj.snippet = `...${m.content.substring(0, 100)}...`;
        }
      }
    }

    res.json(Array.from(resultsMap.values()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('sessions')
      .select('*, messages(*)')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    if (data && data.messages) {
      data.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/title', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { id } = req.params;
    const { title } = req.body;

    const { data, error } = await supabaseAdmin
      .from('sessions')
      .update({ title, updated_at: new Date() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Document attach/detach functions using exactly the requested URL format
router.post('/:sessionId/documents/:docId', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { sessionId, docId } = req.params;

    // Optional fast verification
    const { error: sessErr } = await supabaseAdmin.from('sessions').select('id').eq('id', sessionId).eq('user_id', userId).single();
    if (sessErr) return res.status(403).json({ error: 'Session not found or not owned by user' });

    const { error } = await supabaseAdmin
      .from('documents')
      .update({ session_id: sessionId })
      .eq('id', docId)
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:sessionId/documents/:docId', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { docId } = req.params;

    const { error } = await supabaseAdmin
      .from('documents')
      .update({ session_id: null })
      .eq('id', docId)
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
