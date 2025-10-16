const express = require('express');
const { supabaseAdmin } = require('../config/database');
const { adminAuthMiddleware } = require('../middleware/admin-auth');
const router = express.Router();

/**
 * Admin Management Routes
 * All admin operations go through backend with proper authentication
 */

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Query the admin from the database
    const { data: admin, error } = await supabaseAdmin
      .from('admins')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const bcrypt = require('bcryptjs');
    const passwordValid = await bcrypt.compare(password, admin.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login time
    await supabaseAdmin
      .from('admins')
      .update({ last_login: new Date().toISOString() })
      .eq('id', admin.id);

    // Generate JWT token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      },
      process.env.JWT_SECRET || 'somah-admin-secret-key',
      { expiresIn: '8h' }
    );

    // Return admin info and token
    res.json({
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        fullName: admin.full_name,
        role: admin.role
      },
      token
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin dashboard statistics
router.get('/dashboard', adminAuthMiddleware, async (req, res) => {
  try {
    // Get counts from different tables
    const [
      { count: userCount },
      { count: storeCount },
      { count: productCount },
      { count: orderCount },
      { data: recentOrders },
      { data: pendingOrders }
    ] = await Promise.all([
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('stores').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('products').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('orders').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('orders').select('*').order('created_at', { ascending: false }).limit(5),
      supabaseAdmin.from('orders').select('*').eq('status', 'pending').limit(10)
    ]);

    // Calculate total sales
    const { data: orderItems } = await supabaseAdmin.from('order_items').select('price, quantity');
    const totalSales = orderItems?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;

    // Return dashboard data
    res.json({
      statistics: {
        userCount: userCount || 0,
        storeCount: storeCount || 0,
        productCount: productCount || 0,
        orderCount: orderCount || 0,
        totalSales
      },
      recentOrders: recentOrders || [],
      pendingOrders: pendingOrders || []
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all orders with pagination and filters
router.get('/orders', adminAuthMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, sortBy = 'created_at', sortOrder = 'desc' } = req.query;
    const offset = (page - 1) * limit;

    // Build query
    let query = supabaseAdmin
      .from('orders')
      .select(`
        *,
        customer:users(name, email),
        items:order_items(
          id,
          product_id,
          product_name,
          store_id,
          store_name,
          quantity,
          price,
          original_price
        )
      `)
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    // Apply status filter if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Execute query
    const { data: orders, error, count } = await query;

    if (error) {
      throw error;
    }

    // Get total count for pagination
    const { count: totalCount } = await supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact', head: true });

    res.json({
      orders: orders || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalItems: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Admin orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single order by ID
router.get('/orders/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        customer:users(name, email),
        items:order_items(
          id,
          product_id,
          product_name,
          store_id,
          store_name,
          quantity,
          price,
          original_price,
          image_url
        ),
        order_status_history(
          status,
          notes,
          created_at
        )
      `)
      .eq('id', id)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Admin order GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update order status
router.put('/orders/:id/status', adminAuthMiddleware, async (req, res) => {
  try {
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
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Add entry to order status history
    await supabaseAdmin
      .from('order_status_history')
      .insert({
        order_id: id,
        status,
        notes: notes || null
      });

    // If status is "confirmed", create Telegram notification
    if (status === 'confirmed') {
      // Get order details for notification
      const { data: orderDetails } = await supabaseAdmin
        .from('orders')
        .select(`
          *,
          customer:users(name, email),
          items:order_items(
            product_name,
            store_name,
            quantity,
            price,
            original_price
          )
        `)
        .eq('id', id)
        .single();

      // Create notification message
      const message = `Order #${orderDetails?.order_number} has been confirmed and is being prepared for delivery.`;

      // Insert notification
      await supabaseAdmin
        .from('telegram_notifications')
        .insert({
          order_id: id,
          notification_type: 'order_update',
          message,
          sent: false
        });
    }

    res.json({
      order,
      message: `Order status updated to ${status}`
    });
  } catch (error) {
    console.error('Admin order status update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users
router.get('/users', adminAuthMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    // Get total count for pagination
    const { count: totalCount } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true });

    res.json({
      users: users || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalItems: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all stores
router.get('/stores', adminAuthMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('stores')
      .select(`
        *,
        users (name, email)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: stores, error } = await query;

    if (error) {
      throw error;
    }

    // Get total count for pagination
    const { count: totalCount } = await supabaseAdmin
      .from('stores')
      .select('*', { count: 'exact', head: true });

    res.json({
      stores: stores || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalItems: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Admin stores error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update store status
router.put('/stores/:id/status', adminAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Valid status values
    const validStatuses = ['active', 'pending', 'suspended'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    // Update store status
    const { data: store, error } = await supabaseAdmin
      .from('stores')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json(store);
  } catch (error) {
    console.error('Admin store status update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get manual payouts
router.get('/payouts', adminAuthMiddleware, async (req, res) => {
  try {
    const { data: payouts, error } = await supabaseAdmin
      .from('manual_payouts')
      .select(`
        *,
        stores (name, owner_id)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json(payouts || []);
  } catch (error) {
    console.error('Admin payouts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create manual payout
router.post('/payouts', adminAuthMiddleware, async (req, res) => {
  try {
    const { store_id, amount, period_start, period_end, notes } = req.body;

    if (!store_id || !amount || !period_start || !period_end) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data: payout, error } = await supabaseAdmin
      .from('manual_payouts')
      .insert({
        store_id,
        amount,
        period_start,
        period_end,
        notes: notes || null
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json(payout);
  } catch (error) {
    console.error('Admin payout creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Telegram notifications
router.get('/telegram/notifications', adminAuthMiddleware, async (req, res) => {
  try {
    const { data: notifications, error } = await supabaseAdmin
      .from('telegram_notifications')
      .select(`
        *,
        orders (order_number, status)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json(notifications || []);
  } catch (error) {
    console.error('Admin Telegram notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
