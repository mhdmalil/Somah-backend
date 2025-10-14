require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { supabaseAdmin, checkConnection } = require('./config/database');

// Initialize Telegram bot (it will run in the background)
const { bot, sendOrderNotification } = require('./telegram-bot');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API
  crossOriginEmbedderPolicy: false
}));

// Compression middleware
app.use(compression({
  level: 6,
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all requests
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3002',
  credentials: true,
  optionsSuccessStatus: 200
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbHealthy = await checkConnection();
  res.json({ 
    status: dbHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    database: dbHealthy ? 'connected' : 'disconnected',
    telegram_bot: bot ? 'running' : 'not initialized',
    uptime: process.uptime()
  });
});

// Readiness probe
app.get('/ready', async (req, res) => {
  const dbHealthy = await checkConnection();
  if (dbHealthy) {
    res.status(200).json({ status: 'ready' });
  } else {
    res.status(503).json({ status: 'not ready' });
  }
});

// Stores API
app.get('/api/stores', async (req, res) => {
  try {
    const { category, query } = req.query;
    
    let dbQuery = supabaseAdmin
      .from('stores')
      .select('*')
      .eq('status', 'active');
    
    if (category) {
      dbQuery = dbQuery.eq('category', category);
    }
    
    if (query) {
      dbQuery = dbQuery.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
    }
    
    const { data, error } = await dbQuery;
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching stores:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/stores', async (req, res) => {
  try {
    const { owner_id, name, description, category, logo, banner, phone, location } = req.body;
    
    // Create store
    const { data: store, error: storeError } = await supabaseAdmin
      .from('stores')
      .insert([{
        owner_id,
        name,
        description,
        category,
        logo_url: logo,
        banner_url: banner,
        phone,
        status: 'pending'
      }])
      .select()
      .single();
    
    if (storeError) throw storeError;
    
    // Create store location if provided
    if (location) {
      const { error: locationError } = await supabaseAdmin
        .from('store_locations')
        .insert([{
          store_id: store.id,
          location_type: location.locationType,
          street_name: location.streetName,
          place_name: location.placeName,
          street_number: location.streetNumber,
          additional_info: location.locationNotes
        }]);
      
      if (locationError) {
        console.error('Error creating store location:', locationError);
      }
    }
    
    res.json(store);
  } catch (error) {
    console.error('Error creating store:', error);
    res.status(500).json({ error: error.message });
  }
});

// Products API
app.get('/api/products', async (req, res) => {
  try {
    const { store_id } = req.query;
    
    let dbQuery = supabaseAdmin
      .from('products')
      .select('*, product_images(*)');
    
    if (store_id) {
      dbQuery = dbQuery.eq('store_id', store_id);
    }
    
    const { data, error } = await dbQuery;
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { store_id, name, description, price, stock, category, status } = req.body;
    
    const { data: product, error } = await supabaseAdmin
      .from('products')
      .insert([{
        store_id,
        name,
        description,
        price,
        stock,
        category,
        is_available: status === 'active',
        status: status || 'active'
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: error.message });
  }
});

// Orders API
app.post('/api/orders', async (req, res) => {
  try {
    const { customer_id, address_id, cart_items, notes } = req.body;
    
    // Fetch address details
    const { data: address, error: addressError } = await supabaseAdmin
      .from('customer_addresses')
      .select('*')
      .eq('id', address_id)
      .single();
    
    if (addressError) throw addressError;
    
    let subtotal = 0;
    const orderItemsData = [];
    
    // Fetch product details and calculate subtotal
    for (const item of cart_items) {
      const { data: product, error: productError } = await supabaseAdmin
        .from('products')
        .select('id, name, price, stock, store_id, product_images(image_url)')
        .eq('id', item.product_id)
        .single();
      
      if (productError) throw productError;
      
      if (product.stock < item.quantity) {
        return res.status(400).json({ error: `Not enough stock for product ${product.name}` });
      }
      
      const { data: store, error: storeError } = await supabaseAdmin
        .from('stores')
        .select('name')
        .eq('id', product.store_id)
        .single();
      
      if (storeError) throw storeError;
      
      subtotal += product.price * item.quantity;
      orderItemsData.push({
        product_id: product.id,
        store_id: product.store_id,
        product_name: product.name,
        store_name: store.name,
        quantity: item.quantity,
        price: product.price,
        original_price: product.price,
        image_url: product.product_images?.[0]?.image_url || null,
      });
    }
    
    const delivery_fee = parseFloat(process.env.DELIVERY_FEE || '20');
    const total_amount = subtotal + delivery_fee;
    
    // Create order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert([{
        customer_id,
        address_id: address.id,
        full_name: address.full_name,
        phone: address.phone,
        address_line1: address.address_line1,
        address_line2: address.address_line2,
        city: address.city,
        emirate: address.emirate,
        postal_code: address.postal_code,
        country: address.country,
        subtotal,
        delivery_fee,
        total_amount,
        notes,
        status: 'pending',
        payment_method: 'cash_on_delivery',
        estimated_delivery_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      }])
      .select()
      .single();
    
    if (orderError) throw orderError;
    
    // Insert order items
    const orderItemsWithOrderId = orderItemsData.map(item => ({ ...item, order_id: order.id }));
    const { error: orderItemsError } = await supabaseAdmin
      .from('order_items')
      .insert(orderItemsWithOrderId);
    
    if (orderItemsError) throw orderItemsError;
    
    // Telegram notification will be sent automatically via database trigger
    
    res.json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cart API
app.get('/api/cart', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    const { data, error } = await supabaseAdmin
      .from('cart_items')
      .select(`
        *,
        products (
          id,
          name,
          price,
          stock,
          product_images (image_url)
        )
      `)
      .eq('user_id', user_id);
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/cart', async (req, res) => {
  try {
    const { user_id, product_id, quantity } = req.body;
    
    // Check if product exists and has stock
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('stock')
      .eq('id', product_id)
      .single();
    
    if (productError) throw productError;
    
    if (product.stock < quantity) {
      return res.status(400).json({ error: 'Not enough stock available' });
    }
    
    // Check if item already in cart
    const { data: existingItem } = await supabaseAdmin
      .from('cart_items')
      .select('*')
      .eq('user_id', user_id)
      .eq('product_id', product_id)
      .single();
    
    if (existingItem) {
      // Update quantity
      const { data, error } = await supabaseAdmin
        .from('cart_items')
        .update({ quantity: existingItem.quantity + quantity })
        .eq('id', existingItem.id)
        .select()
        .single();
      
      if (error) throw error;
      return res.json(data);
    }
    
    // Add new item
    const { data, error } = await supabaseAdmin
      .from('cart_items')
      .insert([{ user_id, product_id, quantity }])
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 Telegram bot is running in the background`);
});

module.exports = app;

