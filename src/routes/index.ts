import { Router } from 'express';
import authRoutes from './auth';
import adminAuthRoutes, { bootstrapAdmin } from './admin-auth';
import productRoutes from './products';
import categoryRoutes from './categories';
import addressRoutes from './addresses';
import vehicleRoutes from './vehicles';
import cartRoutes from './cart';
import orderRoutes from './orders';
import adRoutes from './ads';
import waitlistRoutes from './waitlist';

const router = Router();

router.use('/auth', authRoutes);
router.use('/admin', adminAuthRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/addresses', addressRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/ads', adRoutes);
router.use('/waitlist', waitlistRoutes);

export { bootstrapAdmin };
export default router;
