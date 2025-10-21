const express = require('express');
const { supabaseAdmin } = require('../config/database');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

// Create Supabase client for auth operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ ERROR: Missing Supabase environment variables!');
  console.error('Required: SUPABASE_URL and SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * User Authentication Routes
 * All auth operations go through backend for security
 */

// Get current user profile
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get user profile from users table
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('auth_id', user.id)
      .single();

    if (profileError) {
      // If profile doesn't exist, create it automatically
      const { data: newProfile, error: createError } = await supabaseAdmin
        .from('users')
        .insert({
          auth_id: user.id,
          name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
          email: user.email,
          phone: user.user_metadata?.phone || null,
          avatar_url: user.user_metadata?.avatar_url || null
        })
        .select()
        .single();

      if (createError) {
        console.error('Auto-create profile error:', createError);
        return res.status(500).json({ error: 'Failed to create user profile' });
      }

      return res.json({
        user: {
          id: user.id,
          email: user.email,
          ...newProfile
        }
      });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        ...userProfile
      }
    });
  } catch (error) {
    console.error('Auth me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { name, phone, avatar_url } = req.body;

    // Update user profile in users table
    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        name: name || null,
        phone: phone || null,
        avatar_url: avatar_url || null,
        updated_at: new Date().toISOString()
      })
      .eq('auth_id', user.id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    res.json(updatedProfile);
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create user profile (called after signup)
router.post('/create-profile', async (req, res) => {
  try {
    const { auth_id, name, email, phone, avatar_url } = req.body;

    if (!auth_id || !name || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create user profile in users table
    const { data: userProfile, error: createError } = await supabaseAdmin
      .from('users')
      .insert({
        auth_id,
        name,
        email,
        phone: phone || null,
        avatar_url: avatar_url || null
      })
      .select()
      .single();

    if (createError) {
      console.error('Profile creation error:', createError);
      return res.status(500).json({ error: 'Failed to create profile' });
    }

    res.json(userProfile);
  } catch (error) {
    console.error('Create profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
