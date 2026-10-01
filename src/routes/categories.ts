import { Router } from 'express';
import { db } from '../config/database';
import { asyncHandler } from '../middleware/validate';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { data, error } = await db
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      res.status(500).json({ error: 'Failed to load categories' });
      return;
    }
    res.json({ categories: data || [] });
  })
);

router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const { data, error } = await db
      .from('categories')
      .select('*')
      .eq('slug', req.params.slug)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.json({ category: data });
  })
);

export default router;
