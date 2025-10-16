const express = require('express');
const { supabaseAdmin } = require('../config/database');
const router = express.Router();

/**
 * Stores Management Routes
 * All store operations go through backend for data consistency
 */

// Get all stores (public)
router.get('/', async (req, res) => {
  try {
    const { category, query } = req.query;
    
    let storeQuery = supabaseAdmin
      .from('stores')
      .select(`
        *,
        users (
          name
        )
      `)
      .eq('status', 'active');
    
    if (category) {
      storeQuery = storeQuery.eq('category', category);
    }
    
    if (query) {
      storeQuery = storeQuery.ilike('name', `%${query}%`);
    }
    
    const { data: stores, error } = await storeQuery;
    
    if (error) {
      console.error('Stores fetch error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return res.status(500).json({ 
        error: 'Failed to fetch stores',
        details: error.message,
        code: error.code
      });
    }
    
    res.json(stores || []);
  } catch (error) {
    console.error('Stores GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single store by ID (public)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: store, error } = await supabaseAdmin
      .from('stores')
      .select(`
        *,
        users (
          name
        )
      `)
      .eq('id', id)
      .single();
    
    if (error) {
      return res.status(500).json({ error: 'Store not found' });
    }
    
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }
    
    res.json(store);
  } catch (error) {
    console.error('Store GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get store products (public)
router.get('/:id/products', async (req, res) => {
  try {
    const { id } = req.params;
    const { category, query } = req.query;
    
    let productQuery = supabaseAdmin
      .from('products')
      .select(`
        id,
        store_id,
        name,
        description,
        price,
        stock,
        category,
        is_available,
        status,
        created_at,
        updated_at,
        product_images (
          id,
          image_url,
          is_primary,
          display_order
        )
      `)
      .eq('store_id', id)
      .eq('status', 'active')
      .eq('is_available', true);
    
    if (category) {
      productQuery = productQuery.eq('category', category);
    }
    
    if (query) {
      productQuery = productQuery.ilike('name', `%${query}%`);
    }
    
    const { data: products, error } = await productQuery;
    
    if (error) {
      console.error('Store products fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch products' });
    }
    
    // Add 20 AED delivery fee to all product prices for display
    const productsWithDeliveryFee = (products || []).map(product => ({
      ...product,
      price: Math.round((product.price + 20) * 100) / 100
    }));
    
    res.json(productsWithDeliveryFee);
  } catch (error) {
    console.error('Store products GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new store (authenticated)
router.post('/', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
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

    const { name, description, category, phone, logo, banner, location } = req.body;

    if (!name || !description || !category || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create the store
    const { data: store, error: storeError } = await supabaseAdmin
      .from('stores')
      .insert({
        owner_id: userProfile.id,
        name,
        description,
        category,
        phone,
        logo_url: logo || null,
        banner_url: banner || null,
        status: 'active'
      })
      .select()
      .single();

    if (storeError) {
      console.error('Store creation error:', storeError);
      return res.status(500).json({ error: 'Failed to create store' });
    }

    // Create store location if provided
    if (location && location.locationType && location.streetName && location.placeName && location.streetNumber) {
      const { error: locationError } = await supabaseAdmin
        .from('store_locations')
        .insert({
          store_id: store.id,
          location_type: location.locationType,
          street_name: location.streetName,
          place_name: location.placeName,
          street_number: location.streetNumber,
          additional_info: location.locationNotes || null
        });
      
      if (locationError) {
        console.error('Store location creation error:', locationError);
      }
    }

    res.json(store);
  } catch (error) {
    console.error('Store POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update store (authenticated)
router.put('/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
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
    const { name, description, category, phone, logo, banner } = req.body;

    // Verify user owns the store
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (!store || store.owner_id !== userProfile.id) {
      return res.status(403).json({ error: 'Unauthorized to update this store' });
    }

    // Update the store
    const { data: updatedStore, error: updateError } = await supabaseAdmin
      .from('stores')
      .update({
        name,
        description,
        category,
        phone,
        logo_url: logo || null,
        banner_url: banner || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Store update error:', updateError);
      return res.status(500).json({ error: 'Failed to update store' });
    }

    res.json(updatedStore);
  } catch (error) {
    console.error('Store PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete store (authenticated)
router.delete('/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
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

    // Verify user owns the store
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (!store || store.owner_id !== userProfile.id) {
      return res.status(403).json({ error: 'Unauthorized to delete this store' });
    }

    // Delete the store (products and locations will be cascade deleted)
    const { error: deleteError } = await supabaseAdmin
      .from('stores')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Store delete error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete store' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Store DELETE error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's stores (authenticated)
router.get('/user/my-stores', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.json([]);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
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

    // Get stores for this user
    const { data: stores, error: storesError } = await supabaseAdmin
      .from('stores')
      .select(`
        *,
        store_locations (*)
      `)
      .eq('owner_id', userProfile.id);

    if (storesError) {
      console.error('User stores fetch error:', storesError);
      return res.json([]);
    }

    res.json(stores || []);
  } catch (error) {
    console.error('User stores GET error:', error);
    res.json([]);
  }
});

module.exports = router;
