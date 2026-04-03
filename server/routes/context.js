const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');

const router = express.Router();
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const DEFAULT_CONTEXT_TEMPLATE = "Fill this in with your company or personal context. Example:\n\nYou are advising ACME Corp. The company is actively looking to expand infrastructure capacity. You must focus on systemic stability and capital efficiency.";

router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { data, error } = await supabaseAdmin
      .from('user_context')
      .select('content, updated_at')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 indicates no results found, which is completely expected
      throw error;
    }

    if (!data) {
      return res.json({ content: DEFAULT_CONTEXT_TEMPLATE });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { content } = req.body;

    // Use Postgres upsert conflict resolution safely
    const { data, error } = await supabaseAdmin
      .from('user_context')
      .upsert({ user_id: userId, content, updated_at: new Date() }, { onConflict: 'user_id' })
      .select('content, updated_at')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
