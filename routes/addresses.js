const express = require('express');
const { supabaseAdmin } = require('../config/database');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

// Create Supabase client for auth operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Address Management Routes
 * All address operations go through backend for data consistency
 */

// Get user's addresses (authenticated)
router.get('/', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.json([]);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.json([]);
    }

    // Get user profile
    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single();

    if (!userProfile) {
      return res.json([]);
    }

    // Get addresses for this user
    const { data: addresses, error: addressesError } = await supabaseAdmin
      .from('customer_addresses')
      .select('*')
      .eq('user_id', userProfile.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (addressesError) {
      console.error('Addresses fetch error:', addressesError);
      return res.json([]);
    }

    res.json(addresses || []);
  } catch (error) {
    console.error('Addresses GET error:', error);
    res.json([]);
  }
});

// Create new address (authenticated)
router.post('/', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user profile
    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single();

    if (!userProfile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const { full_name, phone, address_line1, address_line2, city, emirate, postal_code, country, label, is_default } = req.body;

    if (!full_name || !phone || !address_line1 || !city || !emirate || !label) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create address - database trigger handles default logic
    const { data: address, error: addressError } = await supabaseAdmin
      .from('customer_addresses')
      .insert({
        user_id: userProfile.id,
        full_name,
        phone,
        address_line1,
        address_line2: address_line2 || null,
        city,
        emirate,
        postal_code: postal_code || null,
        country: country || 'UAE',
        label,
        is_default: is_default || false
      })
      .select()
      .single();

    if (addressError) {
      console.error('Address creation error:', addressError);
      return res.status(500).json({ error: 'Failed to create address' });
    }

    res.json(address);
  } catch (error) {
    console.error('Address POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update address (authenticated)
router.put('/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user profile
    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single();

    if (!userProfile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const { id } = req.params;
    const { full_name, phone, address_line1, address_line2, city, emirate, postal_code, country, label, is_default } = req.body;

    if (!full_name || !phone || !address_line1 || !city || !emirate || !label) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Update address - database trigger handles default logic
    const { data: updatedAddress, error: updateError } = await supabaseAdmin
      .from('customer_addresses')
      .update({
        full_name,
        phone,
        address_line1,
        address_line2: address_line2 || null,
        city,
        emirate,
        postal_code: postal_code || null,
        country: country || 'UAE',
        label,
        is_default: is_default || false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userProfile.id)
      .select()
      .single();

    if (updateError) {
      console.error('Address update error:', updateError);
      return res.status(500).json({ error: 'Failed to update address' });
    }

    res.json(updatedAddress);
  } catch (error) {
    console.error('Address PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete address (authenticated)
router.delete('/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user profile
    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single();

    if (!userProfile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const { id } = req.params;

    // Delete address with ownership check
    const { error: deleteError } = await supabaseAdmin
      .from('customer_addresses')
      .delete()
      .eq('id', id)
      .eq('user_id', userProfile.id);

    if (deleteError) {
      console.error('Address delete error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete address' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Address DELETE error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
