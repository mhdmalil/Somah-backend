import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { AuthedRequest, requireCustomer } from '../middleware/auth';
import { asyncHandler, validateBody } from '../middleware/validate';

const router = Router();

const addressSchema = z.object({
  full_name: z.string().min(2).max(255),
  phone: z.string().min(5).max(50),
  address_line1: z.string().min(3).max(255),
  address_line2: z.string().max(255).optional().nullable(),
  city: z.string().min(2).max(255),
  emirate: z.string().min(2).max(255),
  postal_code: z.string().max(50).optional().nullable(),
  country: z.string().max(100).optional(),
  label: z.string().max(50).optional(),
  is_default: z.boolean().optional(),
});

router.get(
  '/',
  requireCustomer,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { data, error } = await db
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', req.customer!.sub)
      .order('is_default', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Failed to load addresses' });
      return;
    }
    res.json({ addresses: data || [] });
  })
);

router.post(
  '/',
  requireCustomer,
  validateBody(addressSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { data, error } = await db
      .from('customer_addresses')
      .insert({ ...req.body, customer_id: req.customer!.sub })
      .select('*')
      .single();

    if (error || !data) {
      res.status(500).json({ error: 'Failed to create address' });
      return;
    }
    res.status(201).json({ address: data });
  })
);

router.put(
  '/:id',
  requireCustomer,
  validateBody(addressSchema.partial()),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { data, error } = await db
      .from('customer_addresses')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('customer_id', req.customer!.sub)
      .select('*')
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Address not found' });
      return;
    }
    res.json({ address: data });
  })
);

router.delete(
  '/:id',
  requireCustomer,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { error } = await db
      .from('customer_addresses')
      .delete()
      .eq('id', req.params.id)
      .eq('customer_id', req.customer!.sub);

    if (error) {
      res.status(500).json({ error: 'Failed to delete address' });
      return;
    }
    res.json({ ok: true });
  })
);

export default router;
