import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { AuthedRequest, requireCustomer } from '../middleware/auth';
import { asyncHandler, validateBody } from '../middleware/validate';

const router = Router();

router.get(
  '/',
  requireCustomer,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { data, error } = await db
      .from('cart_items')
      .select('*, products(*, product_images(*))')
      .eq('customer_id', req.customer!.sub)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Failed to load cart' });
      return;
    }
    res.json({ items: data || [] });
  })
);

router.post(
  '/',
  requireCustomer,
  validateBody(
    z.object({
      product_id: z.string().uuid(),
      quantity: z.number().int().min(1).max(99).default(1),
    })
  ),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { product_id, quantity } = req.body as { product_id: string; quantity: number };

    const { data: product } = await db
      .from('products')
      .select('id, status, stock')
      .eq('id', product_id)
      .eq('status', 'active')
      .maybeSingle();

    if (!product) {
      res.status(404).json({ error: 'Product not available' });
      return;
    }

    const { data: existing } = await db
      .from('cart_items')
      .select('id, quantity')
      .eq('customer_id', req.customer!.sub)
      .eq('product_id', product_id)
      .maybeSingle();

    if (existing) {
      const nextQty = existing.quantity + quantity;
      const { data, error } = await db
        .from('cart_items')
        .update({ quantity: nextQty, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('*, products(*, product_images(*))')
        .single();
      if (error) {
        res.status(500).json({ error: 'Failed to update cart' });
        return;
      }
      res.json({ item: data });
      return;
    }

    const { data, error } = await db
      .from('cart_items')
      .insert({
        customer_id: req.customer!.sub,
        product_id,
        quantity,
      })
      .select('*, products(*, product_images(*))')
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to add to cart' });
      return;
    }
    res.status(201).json({ item: data });
  })
);

/** Merge guest cart after login */
router.post(
  '/merge',
  requireCustomer,
  validateBody(
    z.object({
      items: z.array(
        z.object({
          product_id: z.string().uuid(),
          quantity: z.number().int().min(1).max(99),
        })
      ),
    })
  ),
  asyncHandler(async (req: AuthedRequest, res) => {
    const items = req.body.items as Array<{ product_id: string; quantity: number }>;
    for (const item of items) {
      const { data: existing } = await db
        .from('cart_items')
        .select('id, quantity')
        .eq('customer_id', req.customer!.sub)
        .eq('product_id', item.product_id)
        .maybeSingle();

      if (existing) {
        await db
          .from('cart_items')
          .update({
            quantity: existing.quantity + item.quantity,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await db.from('cart_items').insert({
          customer_id: req.customer!.sub,
          product_id: item.product_id,
          quantity: item.quantity,
        });
      }
    }

    const { data } = await db
      .from('cart_items')
      .select('*, products(*, product_images(*))')
      .eq('customer_id', req.customer!.sub);

    res.json({ items: data || [] });
  })
);

router.put(
  '/:id',
  requireCustomer,
  validateBody(z.object({ quantity: z.number().int().min(1).max(99) })),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { data, error } = await db
      .from('cart_items')
      .update({ quantity: req.body.quantity, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('customer_id', req.customer!.sub)
      .select('*, products(*, product_images(*))')
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Cart item not found' });
      return;
    }
    res.json({ item: data });
  })
);

router.delete(
  '/:id',
  requireCustomer,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { error } = await db
      .from('cart_items')
      .delete()
      .eq('id', req.params.id)
      .eq('customer_id', req.customer!.sub);

    if (error) {
      res.status(500).json({ error: 'Failed to remove item' });
      return;
    }
    res.json({ ok: true });
  })
);

router.delete(
  '/',
  requireCustomer,
  asyncHandler(async (req: AuthedRequest, res) => {
    await db.from('cart_items').delete().eq('customer_id', req.customer!.sub);
    res.json({ ok: true });
  })
);

export default router;
