import { supabaseAdmin } from '../../supabase';
import { adminAuthMiddleware } from '../../middleware/admin-auth';

/**
 * Admin orders management endpoint
 * GET /api/admin/orders - Get all orders with pagination and filters
 */
export default async function handler(req, res) {
  // Apply admin authentication middleware
  await adminAuthMiddleware(req, res, async () => {
    if (req.method === 'GET') {
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

        return res.status(200).json({
          orders,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            totalItems: totalCount,
            totalPages: Math.ceil(totalCount / limit)
          }
        });
      } catch (error) {
        console.error('Admin orders error:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  });
}
