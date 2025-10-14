import { supabaseAdmin } from '../../supabase';
import { adminAuthMiddleware } from '../../middleware/admin-auth';

/**
 * Admin dashboard statistics endpoint
 * GET /api/admin/dashboard
 */
export default async function handler(req, res) {
  // Apply admin authentication middleware
  await adminAuthMiddleware(req, res, async () => {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

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
      const totalSales = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      // Return dashboard data
      return res.status(200).json({
        statistics: {
          userCount,
          storeCount,
          productCount,
          orderCount,
          totalSales
        },
        recentOrders,
        pendingOrders
      });
    } catch (error) {
      console.error('Admin dashboard error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
}
