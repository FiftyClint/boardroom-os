const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

router.post('/register', async (req, res) => {
  try {
    const { email, name, password } = req.body;
    
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Email, name, and password are required' });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    const userId = authData.user?.id;
    if (!userId) {
      return res.status(500).json({ error: 'Failed to create user in Auth' });
    }

    // Create matching row in our users table using admin key to bypass RLS
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .insert([{ id: userId, email, name }])
      .select('id, email, name')
      .single();

    if (userError) {
      return res.status(500).json({ error: userError.message });
    }

    // Store user ID and basic info in express session
    req.session.user = { id: userId, email: userData.email, name: userData.name };

    return res.json({ user: userData });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      return res.status(401).json({ error: authError.message });
    }

    const userId = authData.user.id;

    // Fetch user details from our users table
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, name')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      return res.status(500).json({ error: 'User record not found in database' });
    }

    // Store user info in express session
    req.session.user = { id: userId, email: userData.email, name: userData.name };

    return res.json({ user: userData });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}/`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: baseUrl
    });
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/update-password', async (req, res) => {
  try {
    const { password, access_token, refresh_token } = req.body;
    
    if (!password || !access_token || !refresh_token) {
      return res.status(400).json({ error: 'Missing required tokens or password' });
    }
    
    const { error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token
    });
    
    if (sessionError) {
      return res.status(401).json({ error: 'Invalid or expired recovery session' });
    }
    
    const { error: updateError } = await supabase.auth.updateUser({
      password
    });
    
    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }
    
    await supabase.auth.signOut();
    
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(err => {
      if (err) {
        return res.status(500).json({ error: 'Could not log out' });
      } else {
        res.clearCookie('connect.sid');
        return res.json({ success: true });
      }
    });
  } else {
    return res.json({ success: true });
  }
});

router.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ user: req.session.user });
  }
  return res.status(401).json({ error: 'Not logged in' });
});

// Middleware function
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
};

router.requireAuth = requireAuth;
module.exports = router;
module.exports.requireAuth = requireAuth;
