import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { asyncHandler, validateBody } from '../middleware/validate';

const router = Router();

const waitlistSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(255),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(50)
    .regex(/^[+\d][\d\s\-()]{6,}$/, 'Enter a valid phone number'),
  website: z.string().max(200).optional(),
});

router.post(
  '/',
  validateBody(waitlistSchema),
  asyncHandler(async (req, res) => {
    const { name, email, phone, website } = req.body as z.infer<typeof waitlistSchema>;

    if (website && website.trim().length > 0) {
      res.status(200).json({ ok: true });
      return;
    }

    const normalizedEmail = email.toLowerCase();

    const { error } = await db.from('waitlist_signups').insert({
      name,
      email: normalizedEmail,
      phone,
      source: 'coming_soon',
      launch_discount_percent: 10,
    });

    if (error) {
      if (error.code === '23505') {
        res.status(200).json({ ok: true, alreadyRegistered: true });
        return;
      }
      console.error('waitlist insert failed', error.message);
      res.status(500).json({ error: 'Could not save your details. Try again.' });
      return;
    }

    res.status(201).json({ ok: true, alreadyRegistered: false });
  })
);

export default router;
