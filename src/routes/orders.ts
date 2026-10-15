import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { env } from '../config/env';
import { AuthedRequest, requireAdmin, requireCustomer } from '../middleware/auth';
import { asyncHandler, validateBody } from '../middleware/validate';

const router = Router();

const placeOrderSchema = z.object({
  address_id: z.string().uuid(),
  vehicle_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  payment_method: z.enum(['cash_on_delivery']).default('cash_on_delivery'),
});

router.get(
  '/',
  requireCustomer,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { data, error } = await db
      .from('orders')
      .select('*, order_items(*)')
      .eq('customer_id', req.customer!.sub)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Failed to load orders' });
      return;
    }
    res.json({ orders: data || [] });
  })
);

// Admin routes before /:id
router.get(
  '/admin/all',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status, page = '1', limit = '50' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    let query = db
      .from('orders')
      .select('*, order_items(*)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) {
      res.status(500).json({ error: 'Failed to load orders' });
      return;
    }
    res.json({ orders: data || [], total: count || 0, page: pageNum, limit: limitNum });
  })
);

router.put(
  '/admin/:id/status',
  requireAdmin,
  validateBody(
    z.object({
      status: z.enum([
        'new',
        'confirmed',
        'preparing',
        'out_for_delivery',
        'delivered',
        'requires_verification',
        'cancelled',
        'failed',
      ]),
      notes: z.string().max(1000).optional(),
    })
  ),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { status, notes } = req.body as { status: string; notes?: string };

    const { data, error } = await db
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('*, order_items(*)')
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (notes) {
      await db.from('order_status_history').insert({
        order_id: data.id,
        status,
        notes,
        changed_by_admin_id: req.admin!.sub,
      });
    }

    res.json({ order: data });
  })
);

router.get(
  '/:id',
  requireCustomer,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { data, error } = await db
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', req.params.id)
      .eq('customer_id', req.customer!.sub)
      .maybeSingle();

    if (error || !data) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json({ order: data });
  })
);

router.post(
  '/',
  requireCustomer,
  validateBody(placeOrderSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const customerId = req.customer!.sub;
    const { address_id, vehicle_id, notes, payment_method } = req.body as z.infer<
      typeof placeOrderSchema
    >;

    const { data: address } = await db
      .from('customer_addresses')
      .select('*')
      .eq('id', address_id)
      .eq('customer_id', customerId)
      .maybeSingle();

    if (!address) {
      res.status(400).json({ error: 'Invalid address' });
      return;
    }

    let vehicleSnapshot: Record<string, unknown> | null = null;
    if (vehicle_id) {
      const { data: vehicle } = await db
        .from('customer_vehicles')
        .select('*')
        .eq('id', vehicle_id)
        .eq('customer_id', customerId)
        .maybeSingle();
      if (!vehicle) {
        res.status(400).json({ error: 'Invalid vehicle' });
        return;
      }
      vehicleSnapshot = vehicle;
    }

    const { data: cartItems, error: cartError } = await db
      .from('cart_items')
      .select('*, products(*, product_images(*))')
      .eq('customer_id', customerId);

    if (cartError || !cartItems?.length) {
      res.status(400).json({ error: 'Cart is empty' });
      return;
    }

    // Server-side pricing — never trust client prices
    let subtotal = 0;
    const lineItems: Array<Record<string, unknown>> = [];

    for (const item of cartItems) {
      const product = item.products as {
        id: string;
        name: string;
        part_number: string | null;
        brand: string | null;
        price: number;
        stock: number;
        status: string;
        product_images?: Array<{ image_url: string; is_primary: boolean }>;
      } | null;

      if (!product || product.status !== 'active') {
        res.status(400).json({ error: `Product unavailable: ${item.product_id}` });
        return;
      }
      if (product.stock < item.quantity) {
        res.status(400).json({ error: `Insufficient stock for ${product.name}` });
        return;
      }

      const unit = Number(product.price);
      const lineTotal = unit * item.quantity;
      subtotal += lineTotal;

      const primaryImage =
        product.product_images?.find((i) => i.is_primary)?.image_url ||
        product.product_images?.[0]?.image_url ||
        null;

      lineItems.push({
        product_id: product.id,
        product_name: product.name,
        part_number: product.part_number,
        brand: product.brand,
        quantity: item.quantity,
        unit_price: unit,
        line_total: lineTotal,
        image_url: primaryImage,
        fitment_status: 'verification_required',
      });
    }

    const deliveryFee = env.deliveryFee;
    const total = subtotal + deliveryFee;

    const { data: orderNumberData, error: rpcError } = await db.rpc('generate_order_number');
    if (rpcError || !orderNumberData) {
      res.status(500).json({ error: 'Failed to generate order number' });
      return;
    }

    const { data: order, error: orderError } = await db
      .from('orders')
      .insert({
        order_number: orderNumberData,
        customer_id: customerId,
        vehicle_id: vehicle_id || null,
        address_id: address.id,
        full_name: address.full_name,
        phone: address.phone,
        address_line1: address.address_line1,
        address_line2: address.address_line2,
        city: address.city,
        emirate: address.emirate,
        postal_code: address.postal_code,
        country: address.country,
        vehicle_snapshot: vehicleSnapshot,
        subtotal,
        delivery_fee: deliveryFee,
        total_amount: total,
        status: 'new',
        payment_method,
        payment_status: 'pending',
        notes: notes || null,
      })
      .select('*')
      .single();

    if (orderError || !order) {
      res.status(500).json({ error: 'Failed to create order', details: orderError?.message });
      return;
    }

    const { error: itemsError } = await db.from('order_items').insert(
      lineItems.map((li) => ({ ...li, order_id: order.id }))
    );

    if (itemsError) {
      await db.from('orders').delete().eq('id', order.id);
      res.status(500).json({ error: 'Failed to create order items' });
      return;
    }

    await db.from('cart_items').delete().eq('customer_id', customerId);

    const { data: full } = await db
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', order.id)
      .single();

    res.status(201).json({ order: full || order });
  })
);

export default router;
