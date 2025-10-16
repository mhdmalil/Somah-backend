const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('./auth');
const cartRoutes = require('./cart');
const productsRoutes = require('./products');
const storesRoutes = require('./stores');
const ordersRoutes = require('./orders');
const addressesRoutes = require('./addresses');
const adminRoutes = require('./admin');

// Mount all routes
router.use('/auth', authRoutes);
router.use('/cart', cartRoutes);
router.use('/products', productsRoutes);
router.use('/stores', storesRoutes);
router.use('/orders', ordersRoutes);
router.use('/addresses', addressesRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
