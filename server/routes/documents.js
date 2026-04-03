const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { requireAuth } = require('./auth');

const router = express.Router();
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Memory storage is important for parsing directly without file cleanup
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { sessionId } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filename = req.file.originalname;
    const ext = filename.split('.').pop().toLowerCase();
    
    let content = '';

    if (ext === 'docx') {
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      content = result.value;
    } else if (ext === 'pdf') {
      const data = await pdfParse(req.file.buffer);
      content = data.text;
    } else if (ext === 'txt' || ext === 'md') {
      content = req.file.buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Use .docx, .pdf, .txt, or .md.' });
    }

    // Truncate overly massive documents efficiently
    if (content.length > 40000) {
      content = content.substring(0, 40000) + '\n\n[... DOCUMENT TRUNCATED AT 40,000 CHARACTERS ...]';
    }

    const payload = {
      user_id: userId,
      filename,
      content,
      created_at: new Date()
    };
    
    // Optionally attach directly to a session inside upload payload immediately
    if (sessionId) {
      const { data: sessData } = await supabaseAdmin.from('sessions').select('id').eq('id', sessionId).eq('user_id', userId).single();
      if (sessData) {
        payload.session_id = sessionId;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('documents')
      .insert(payload)
      .select('id, filename, created_at')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('id, filename, created_at, session_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
