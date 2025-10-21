const express = require('express');
const { supabaseAdmin } = require('../config/database');
const router = express.Router();

/**
 * Orders Management Routes
 * All order operations go through backend for data consistency
 */

// Get user's orders (authenticated)
router.get('/', async (req, res) => {
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

    // Get orders with items
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          product_id,
          store_id,
          product_name,
          store_name,
          quantity,
          price,
          original_price,
          image_url
        )
      `)
      .eq('customer_id', userProfile.id)
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error('Orders fetch error:', ordersError);
      return res.json([]);
    }

    res.json(orders || []);
  } catch (error) {
    console.error('Orders GET error:', error);
    res.json([]);
  }
});

// Get single order by ID (authenticated)
router.get('/:id', async (req, res) => {
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

    // Get order with items and status history
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          products (name, product_images (image_url, is_primary)),
          stores (name)
        ),
        order_status_history (
          status,
          notes,
          created_at
        )
      `)
      .eq('id', id)
      .eq('customer_id', userProfile.id)
      .single();

    if (orderError) {
      console.error('Error fetching order:', orderError);
      if (orderError.code === 'PGRST116') {
        // No rows found - order doesn't exist
        return res.status(404).json({ error: 'Order not found' });
      }
      return res.status(500).json({ error: 'Failed to fetch order' });
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Order GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new order (checkout) (authenticated)
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

    const { address_id, items, payment_method, notes } = req.body;

    if (!address_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get delivery address
    const { data: address } = await supabaseAdmin
      .from('customer_addresses')
      .select('*')
      .eq('id', address_id)
      .eq('user_id', userProfile.id)
      .single();

    if (!address) {
      return res.status(404).json({ error: 'Address not found' });
    }

    // Generate order number using database function
    const { data: orderNumberResult } = await supabaseAdmin
      .rpc('generate_order_number');

    const orderNumber = orderNumberResult || `SOMAH-${Date.now()}`;

    // Calculate totals (delivery fee already included in item prices)
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const delivery_fee = 0.00; // No separate delivery fee - already included in prices
    const total_amount = subtotal;

    // Create order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_id: userProfile.id,
        address_id: address.id,
        full_name: address.full_name,
        phone: address.phone,
        address_line1: address.address_line1,
        address_line2: address.address_line2,
        city: address.city,
        emirate: address.emirate,
        postal_code: address.postal_code,
        country: address.country,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total_amount: total_amount,
        status: 'pending',
        payment_method: payment_method || 'cash_on_delivery',
        notes: notes || null
      })
      .select()
      .single();

    if (orderError) {
      console.error('Order creation error:', orderError);
      return res.status(500).json({ error: 'Failed to create order' });
    }

    // Fetch product details for order items
    const orderItems = [];
    for (const item of items) {
      const { data: product } = await supabaseAdmin
        .from('products')
        .select(`
          id, name, price,
          stores (id, name),
          product_images (image_url)
        `)
        .eq('id', item.product_id)
        .single();

      if (product) {
        orderItems.push({
          order_id: order.id,
          product_id: item.product_id,
          store_id: item.store_id,
          product_name: product.name,
          store_name: product.stores.name,
          quantity: item.quantity,
          price: item.price,
          original_price: product.price,
          image_url: product.product_images?.[0]?.image_url || null
        });
      }
    }

    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(orderItems);

    if (itemsError) {
      console.error('Order items error:', itemsError);
      // Rollback order
      await supabaseAdmin.from('orders').delete().eq('id', order.id);
      return res.status(500).json({ error: 'Failed to create order items' });
    }

    // Clear cart after successful order
    await supabaseAdmin
      .from('cart_items')
      .delete()
      .eq('user_id', userProfile.id);

    // Trigger Telegram notification (database trigger already created the notification record)
    try {
      const { sendOrderNotification } = require('../telegram-bot');
      await sendOrderNotification(order.id);
    } catch (telegramError) {
      console.error('Telegram notification error:', telegramError);
      // Don't fail the order if Telegram fails
    }

    res.json(order);
  } catch (error) {
    console.error('Order POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update order status (authenticated - for store owners)
router.put('/:id/status', async (req, res) => {
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
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Valid status values
    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    // Update order status
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Order status update error:', updateError);
      return res.status(500).json({ error: 'Failed to update order status' });
    }

    // Add entry to order status history
    await supabaseAdmin
      .from('order_status_history')
      .insert({
        order_id: id,
        status,
        notes: notes || null
      });

    res.json(updatedOrder);
  } catch (error) {
    console.error('Order status PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
