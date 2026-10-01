import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { requireAdmin } from '../middleware/auth';
import { asyncHandler, validateBody } from '../middleware/validate';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const placement = req.query.placement as string | undefined;
    let query = db
      .from('ad_slots')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (placement) query = query.eq('placement', placement);

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: 'Failed to load ads' });
      return;
    }
    res.json({ ads: data || [] });
  })
);

router.get(
  '/admin/all',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const { data, error } = await db
      .from('ad_slots')
      .select('*')
      .order('placement')
      .order('sort_order');

    if (error) {
      res.status(500).json({ error: 'Failed to load ads' });
      return;
    }
    res.json({ ads: data || [] });
  })
);

const adSchema = z.object({
  placement: z.string().min(2).max(100),
  title: z.string().max(255).optional().nullable(),
  subtitle: z.string().max(255).optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  link_url: z.string().url().optional().nullable(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

router.post(
  '/admin',
  requireAdmin,
  validateBody(adSchema),
  asyncHandler(async (req, res) => {
    const { data, error } = await db.from('ad_slots').insert(req.body).select('*').single();
    if (error || !data) {
      res.status(500).json({ error: 'Failed to create ad slot' });
      return;
    }
    res.status(201).json({ ad: data });
  })
);

router.put(
  '/admin/:id',
  requireAdmin,
  validateBody(adSchema.partial()),
  asyncHandler(async (req, res) => {
    const { data, error } = await db
      .from('ad_slots')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Ad slot not found' });
      return;
    }
    res.json({ ad: data });
  })
);

router.delete(
  '/admin/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { error } = await db.from('ad_slots').delete().eq('id', req.params.id);
    if (error) {
      res.status(500).json({ error: 'Failed to delete ad slot' });
      return;
    }
    res.json({ ok: true });
  })
);

export default router;
