const express = require('express');
const { supabaseAdmin } = require('../config/database');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

// Create Supabase client for auth operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Products Management Routes
 * All product operations go through backend for data consistency
 */

// Get all products (public)
router.get('/', async (req, res) => {
  try {
    const { storeId, category, query } = req.query;
    
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
        stores (
          id,
          name,
          logo_url
        ),
        product_images (
          id,
          image_url,
          is_primary,
          display_order
        )
      `)
      .eq('status', 'active')
      .eq('is_available', true);
    
    if (storeId) {
      productQuery = productQuery.eq('store_id', storeId);
    }
    
    if (category) {
      productQuery = productQuery.eq('category', category);
    }
    
    if (query) {
      productQuery = productQuery.ilike('name', `%${query}%`);
    }
    
    const { data: products, error } = await productQuery;
    
    if (error) {
      console.error('Products fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch products' });
    }
    
    // Add 20 AED delivery fee to all product prices for display
    const productsWithDeliveryFee = (products || []).map(product => ({
      ...product,
      price: Math.round((product.price + 20) * 100) / 100
    }));
    
    res.json(productsWithDeliveryFee);
  } catch (error) {
    console.error('Products GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single product by ID (public)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: product, error } = await supabaseAdmin
      .from('products')
      .select(`
        *,
        stores (
          id,
          name,
          logo_url,
          description
        ),
        product_images (
          id,
          image_url,
          is_primary
        )
      `)
      .eq('id', id)
      .single();
    
    if (error) {
      return res.status(500).json({ error: 'Product not found' });
    }
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Add 20 AED delivery fee to the product price for display
    const productWithDeliveryFee = {
      ...product,
      price: Math.round((product.price + 20) * 100) / 100
    };
    
    res.json(productWithDeliveryFee);
  } catch (error) {
    console.error('Product GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new product (authenticated)
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

    const { store_id, name, description, price, stock, category, status, images } = req.body;

    if (!store_id || !name || !description || !price || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify user owns the store
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('owner_id')
      .eq('id', store_id)
      .single();

    if (!store || store.owner_id !== userProfile.id) {
      return res.status(403).json({ error: 'Unauthorized to add products to this store' });
    }

    // Create the product
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .insert({
        store_id,
        name,
        description,
        price,
        stock: stock || 0,
        category,
        is_available: status === 'active',
        status: status || 'active'
      })
      .select()
      .single();

    if (productError) {
      console.error('Product creation error:', productError);
      return res.status(500).json({ error: 'Failed to create product' });
    }

    // Add product images if provided
    if (images && images.length > 0) {
      const imageInserts = images.map((image, index) => ({
        product_id: product.id,
        image_url: image,
        is_primary: index === 0,
        display_order: index
      }));
      
      const { error: imagesError } = await supabaseAdmin
        .from('product_images')
        .insert(imageInserts);
      
      if (imagesError) {
        console.error('Product images error:', imagesError);
      }
    }

    res.json(product);
  } catch (error) {
    console.error('Product POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product (authenticated)
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
    const { name, description, price, stock, category, status } = req.body;

    // Verify user owns the store that owns this product
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('store_id, stores!inner(owner_id)')
      .eq('id', id)
      .single();

    if (!product || product.stores.owner_id !== userProfile.id) {
      return res.status(403).json({ error: 'Unauthorized to update this product' });
    }

    // Update the product
    const { data: updatedProduct, error: updateError } = await supabaseAdmin
      .from('products')
      .update({
        name,
        description,
        price,
        stock,
        category,
        is_available: status === 'active',
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Product update error:', updateError);
      return res.status(500).json({ error: 'Failed to update product' });
    }

    res.json(updatedProduct);
  } catch (error) {
    console.error('Product PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete product (authenticated)
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

    // Verify user owns the store that owns this product
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('store_id, stores!inner(owner_id)')
      .eq('id', id)
      .single();

    if (!product || product.stores.owner_id !== userProfile.id) {
      return res.status(403).json({ error: 'Unauthorized to delete this product' });
    }

    // Delete the product (images will be cascade deleted)
    const { error: deleteError } = await supabaseAdmin
      .from('products')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Product delete error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete product' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Product DELETE error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
