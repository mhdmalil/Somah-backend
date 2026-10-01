import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { AuthedRequest, requireAdmin } from '../middleware/auth';
import { asyncHandler, validateBody } from '../middleware/validate';
import { slugify } from '../utils/auth';

const router = Router();

const productSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(10000).optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  brand: z.string().max(255).optional().nullable(),
  part_number: z.string().max(120).optional().nullable(),
  oem_part_number: z.string().max(120).optional().nullable(),
  alt_part_numbers: z.array(z.string()).optional(),
  price: z.number().nonnegative(),
  compare_at_price: z.number().nonnegative().optional().nullable(),
  stock: z.number().int().nonnegative().default(0),
  condition: z.enum(['new', 'used', 'refurbished']).default('new'),
  status: z.enum(['active', 'draft', 'out_of_stock', 'archived']).default('draft'),
  is_featured: z.boolean().optional(),
  images: z
    .array(
      z.object({
        image_url: z.string().url(),
        alt_text: z.string().optional(),
        is_primary: z.boolean().optional(),
        display_order: z.number().int().optional(),
      })
    )
    .optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      category,
      q,
      featured,
      page = '1',
      limit = '24',
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(60, Math.max(1, parseInt(limit, 10) || 24));
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    let query = db
      .from('products')
      .select('*, product_images(*), categories(id, name, slug)', { count: 'exact' })
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (category) {
      const { data: cat } = await db
        .from('categories')
        .select('id')
        .eq('slug', category)
        .maybeSingle();
      if (cat) query = query.eq('category_id', cat.id);
    }
    if (featured === 'true') query = query.eq('is_featured', true);
    if (q) query = query.or(`name.ilike.%${q}%,part_number.ilike.%${q}%,oem_part_number.ilike.%${q}%,brand.ilike.%${q}%`);

    const { data, error, count } = await query;
    if (error) {
      res.status(500).json({ error: 'Failed to load products' });
      return;
    }
    res.json({ products: data || [], total: count || 0, page: pageNum, limit: limitNum });
  })
);

// Admin product management (must be registered before /:idOrSlug)
router.get(
  '/admin/all',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status, q, page = '1', limit = '50' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    let query = db
      .from('products')
      .select('*, product_images(*), categories(id, name, slug)', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (status) query = query.eq('status', status);
    if (q) query = query.or(`name.ilike.%${q}%,part_number.ilike.%${q}%`);

    const { data, error, count } = await query;
    if (error) {
      res.status(500).json({ error: 'Failed to load products' });
      return;
    }
    res.json({ products: data || [], total: count || 0, page: pageNum, limit: limitNum });
  })
);

router.get(
  '/:idOrSlug',
  asyncHandler(async (req, res) => {
    const key = req.params.idOrSlug;
    if (key === 'admin') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const isUuid = /^[0-9a-f-]{36}$/i.test(key);

    let query = db
      .from('products')
      .select('*, product_images(*), categories(id, name, slug), fitments(*)')
      .eq('status', 'active');

    query = isUuid ? query.eq('id', key) : query.eq('slug', key);

    const { data, error } = await query.maybeSingle();
    if (error || !data) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json({ product: data });
  })
);

router.post(
  '/admin',
  requireAdmin,
  validateBody(productSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = req.body as z.infer<typeof productSchema>;
    const baseSlug = slugify(body.name);
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    const { images, ...productFields } = body;
    const { data: product, error } = await db
      .from('products')
      .insert({ ...productFields, slug })
      .select('*')
      .single();

    if (error || !product) {
      res.status(500).json({ error: 'Failed to create product', details: error?.message });
      return;
    }

    if (images?.length) {
      await db.from('product_images').insert(
        images.map((img, i) => ({
          product_id: product.id,
          image_url: img.image_url,
          alt_text: img.alt_text || body.name,
          is_primary: img.is_primary ?? i === 0,
          display_order: img.display_order ?? i,
        }))
      );
    }

    const { data: full } = await db
      .from('products')
      .select('*, product_images(*)')
      .eq('id', product.id)
      .single();

    res.status(201).json({ product: full || product });
  })
);

router.put(
  '/admin/:id',
  requireAdmin,
  validateBody(productSchema.partial()),
  asyncHandler(async (req, res) => {
    const { images, ...fields } = req.body as z.infer<typeof productSchema> & {
      images?: z.infer<typeof productSchema>['images'];
    };

    const updates = { ...fields, updated_at: new Date().toISOString() };
    const { data: product, error } = await db
      .from('products')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error || !product) {
      res.status(404).json({ error: 'Product not found or update failed' });
      return;
    }

    if (images) {
      await db.from('product_images').delete().eq('product_id', product.id);
      if (images.length) {
        await db.from('product_images').insert(
          images.map((img, i) => ({
            product_id: product.id,
            image_url: img.image_url,
            alt_text: img.alt_text || product.name,
            is_primary: img.is_primary ?? i === 0,
            display_order: img.display_order ?? i,
          }))
        );
      }
    }

    const { data: full } = await db
      .from('products')
      .select('*, product_images(*)')
      .eq('id', product.id)
      .single();

    res.json({ product: full || product });
  })
);

router.delete(
  '/admin/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { error } = await db
      .from('products')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) {
      res.status(500).json({ error: 'Failed to archive product' });
      return;
    }
    res.json({ ok: true });
  })
);

export default router;
