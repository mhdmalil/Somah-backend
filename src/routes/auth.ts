import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { AuthedRequest, requireCustomer } from '../middleware/auth';
import { asyncHandler, validateBody } from '../middleware/validate';
import { hashPassword, signToken, verifyPassword } from '../utils/auth';

const router = Router();

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(2).max(255),
  phone: z.string().max(50).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  '/register',
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, name, phone } = req.body as z.infer<typeof registerSchema>;
    const normalized = email.toLowerCase().trim();

    const { data: existing } = await db
      .from('customers')
      .select('id')
      .eq('email', normalized)
      .maybeSingle();

    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const password_hash = await hashPassword(password);
    const { data: customer, error } = await db
      .from('customers')
      .insert({
        email: normalized,
        password_hash,
        name: name.trim(),
        phone: phone?.trim() || null,
      })
      .select('id, email, name, phone, created_at')
      .single();

    if (error || !customer) {
      res.status(500).json({ error: 'Failed to create account' });
      return;
    }

    const token = signToken({
      sub: customer.id,
      type: 'customer',
      email: customer.email,
    });

    res.status(201).json({ token, customer });
  })
);

router.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const normalized = email.toLowerCase().trim();

    const { data: customer, error } = await db
      .from('customers')
      .select('id, email, name, phone, password_hash, is_active, created_at')
      .eq('email', normalized)
      .maybeSingle();

    if (error || !customer || !customer.is_active) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const ok = await verifyPassword(password, customer.password_hash);
    if (!ok) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = signToken({
      sub: customer.id,
      type: 'customer',
      email: customer.email,
    });

    const { password_hash: _, ...safe } = customer;
    res.json({ token, customer: safe });
  })
);

router.get(
  '/me',
  requireCustomer,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { data: customer, error } = await db
      .from('customers')
      .select('id, email, name, phone, created_at, updated_at')
      .eq('id', req.customer!.sub)
      .single();

    if (error || !customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    res.json({ customer });
  })
);

router.put(
  '/me',
  requireCustomer,
  validateBody(
    z.object({
      name: z.string().min(2).max(255).optional(),
      phone: z.string().max(50).optional().nullable(),
    })
  ),
  asyncHandler(async (req: AuthedRequest, res) => {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.phone !== undefined) updates.phone = req.body.phone;

    const { data, error } = await db
      .from('customers')
      .update(updates)
      .eq('id', req.customer!.sub)
      .select('id, email, name, phone, created_at, updated_at')
      .single();

    if (error || !data) {
      res.status(500).json({ error: 'Failed to update profile' });
      return;
    }
    res.json({ customer: data });
  })
);

export default router;
