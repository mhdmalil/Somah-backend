const express = require('express');
const { supabaseAdmin } = require('../config/database');
const router = express.Router();

/**
 * Cart Management Routes
 * All cart operations go through backend for data consistency
 */

// Get user's cart items
router.get('/', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.json([]); // Return empty cart for unauthenticated users
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

    // Get cart items with product and store details
    const { data: cartItems, error: cartError } = await supabaseAdmin
      .from('cart_items')
      .select(`
        *,
        products (
          id,
          name,
          price,
          stock,
          product_images (image_url, is_primary)
        ),
        stores (
          id,
          name
        )
      `)
      .eq('user_id', userProfile.id);

    if (cartError) {
      console.error('Cart fetch error:', cartError);
      return res.json([]);
    }

    res.json(cartItems || []);
  } catch (error) {
    console.error('Cart GET error:', error);
    res.json([]);
  }
});

// Add item to cart
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

    const { product_id, store_id, quantity = 1, price } = req.body;

    if (!product_id || !store_id || !price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if item already exists in cart
    const { data: existingItem } = await supabaseAdmin
      .from('cart_items')
      .select('*')
      .eq('user_id', userProfile.id)
      .eq('product_id', product_id)
      .single();

    if (existingItem) {
      // Update quantity
      const { data: updatedItem, error: updateError } = await supabaseAdmin
        .from('cart_items')
        .update({ 
          quantity: existingItem.quantity + quantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingItem.id)
        .select()
        .single();
      
      if (updateError) {
        return res.status(500).json({ error: 'Failed to update cart' });
      }
      
      return res.json(updatedItem);
    }

    // Add new item
    const { data: newItem, error: insertError } = await supabaseAdmin
      .from('cart_items')
      .insert({
        user_id: userProfile.id,
        product_id,
        store_id,
        quantity,
        price
      })
      .select()
      .single();

    if (insertError) {
      console.error('Cart insert error:', insertError);
      return res.status(500).json({ error: 'Failed to add to cart' });
    }

    res.json(newItem);
  } catch (error) {
    console.error('Cart POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update cart item quantity
router.put('/:itemId', async (req, res) => {
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

    const { quantity } = req.body;
    const { itemId } = req.params;

    if (quantity <= 0) {
      // Remove item if quantity is 0 or negative
      const { error: deleteError } = await supabaseAdmin
        .from('cart_items')
        .delete()
        .eq('id', itemId)
        .eq('user_id', userProfile.id);

      if (deleteError) {
        return res.status(500).json({ error: 'Failed to remove item' });
      }

      return res.json({ message: 'Item removed' });
    }

    // Update quantity
    const { data: updatedItem, error: updateError } = await supabaseAdmin
      .from('cart_items')
      .update({ 
        quantity,
        updated_at: new Date().toISOString()
      })
      .eq('id', itemId)
      .eq('user_id', userProfile.id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update cart item' });
    }

    res.json(updatedItem);
  } catch (error) {
    console.error('Cart PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove cart item
router.delete('/:itemId', async (req, res) => {
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

    const { itemId } = req.params;

    const { error: deleteError } = await supabaseAdmin
      .from('cart_items')
      .delete()
      .eq('id', itemId)
      .eq('user_id', userProfile.id);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to remove item' });
    }

    res.json({ message: 'Item removed' });
  } catch (error) {
    console.error('Cart DELETE error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear entire cart
router.delete('/', async (req, res) => {
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

    const { error: deleteError } = await supabaseAdmin
      .from('cart_items')
      .delete()
      .eq('user_id', userProfile.id);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to clear cart' });
    }

    res.json({ message: 'Cart cleared' });
  } catch (error) {
    console.error('Cart clear error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
