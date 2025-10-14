import { supabaseAdmin } from '../../../../supabase';
import { adminAuthMiddleware } from '../../../../middleware/admin-auth';

/**
 * Admin order status update endpoint
 * PUT /api/admin/orders/[id]/status
 */
export default async function handler(req, res) {
  // Apply admin authentication middleware
  await adminAuthMiddleware(req, res, async () => {
    const { id } = req.query;

    if (req.method !== 'PUT') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
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
        const message = `Order #${orderDetails.order_number} has been confirmed and is being prepared for delivery.`;

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

      return res.status(200).json({ 
        order,
        message: `Order status updated to ${status}`
      });
    } catch (error) {
      console.error('Admin order status update error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
}
