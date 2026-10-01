import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { AuthedRequest, requireAdmin } from '../middleware/auth';
import { asyncHandler, validateBody } from '../middleware/validate';
import { hashPassword, signToken, verifyPassword } from '../utils/auth';
import { env } from '../config/env';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const normalized = email.toLowerCase().trim();

    const { data: admin, error } = await db
      .from('admins')
      .select('id, email, full_name, role, password_hash, is_active')
      .eq('email', normalized)
      .maybeSingle();

    if (error || !admin || !admin.is_active) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const ok = await verifyPassword(password, admin.password_hash);
    if (!ok) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    await db
      .from('admins')
      .update({ last_login: new Date().toISOString() })
      .eq('id', admin.id);

    const token = signToken({
      sub: admin.id,
      type: 'admin',
      email: admin.email,
      role: admin.role,
    });

    res.json({
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
        role: admin.role,
      },
    });
  })
);

router.get(
  '/me',
  requireAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { data, error } = await db
      .from('admins')
      .select('id, email, full_name, role, last_login, created_at')
      .eq('id', req.admin!.sub)
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Admin not found' });
      return;
    }
    res.json({ admin: data });
  })
);

router.get(
  '/dashboard',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const statuses = [
      'new',
      'requires_verification',
      'confirmed',
      'preparing',
      'out_for_delivery',
      'delivered',
      'cancelled',
    ];

    const counts: Record<string, number> = {};
    for (const status of statuses) {
      const { count } = await db
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', status);
      counts[status] = count || 0;
    }

    const { count: lowStock } = await db
      .from('products')
      .select('*', { count: 'exact', head: true })
      .lt('stock', 5)
      .neq('status', 'archived');

    const { count: products } = await db
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const { count: customers } = await db
      .from('customers')
      .select('*', { count: 'exact', head: true });

    res.json({
      orders: counts,
      lowStock: lowStock || 0,
      activeProducts: products || 0,
      customers: customers || 0,
    });
  })
);

/** Bootstrap helper — only creates admin if table is empty and env credentials exist */
export async function bootstrapAdmin(): Promise<void> {
  if (!env.adminEmail || !env.adminPassword) {
    console.warn('ADMIN_EMAIL/ADMIN_PASSWORD not set — skip admin bootstrap');
    return;
  }
  if (env.adminPassword.length < 10) {
    console.warn('ADMIN_PASSWORD too short — skip admin bootstrap');
    return;
  }

  const { count } = await db.from('admins').select('*', { count: 'exact', head: true });
  if ((count || 0) > 0) return;

  const password_hash = await hashPassword(env.adminPassword);
  const { error } = await db.from('admins').insert({
    email: env.adminEmail.toLowerCase().trim(),
    password_hash,
    full_name: env.adminName,
    role: 'super_admin',
  });

  if (error) {
    console.error('Admin bootstrap failed:', error.message);
  } else {
    console.log('Bootstrap admin created from env credentials');
  }
}

export default router;
