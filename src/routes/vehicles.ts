import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { AuthedRequest, requireCustomer } from '../middleware/auth';
import { asyncHandler, validateBody } from '../middleware/validate';
import { getVehicleService } from '../services/vehicle';

const router = Router();

const vehicleSchema = z.object({
  vin: z.string().max(32).optional().nullable(),
  make: z.string().max(100).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  year: z.number().int().min(1950).max(2100).optional().nullable(),
  trim: z.string().max(100).optional().nullable(),
  engine: z.string().max(100).optional().nullable(),
  nickname: z.string().max(100).optional().nullable(),
  is_default: z.boolean().optional(),
});

router.get(
  '/',
  requireCustomer,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { data, error } = await db
      .from('customer_vehicles')
      .select('*')
      .eq('customer_id', req.customer!.sub)
      .order('is_default', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Failed to load vehicles' });
      return;
    }
    res.json({ vehicles: data || [] });
  })
);

router.post(
  '/',
  requireCustomer,
  validateBody(vehicleSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    // VIN decode provider TBD — store raw VIN/manual fields only for now
    const { data, error } = await db
      .from('customer_vehicles')
      .insert({ ...req.body, customer_id: req.customer!.sub })
      .select('*')
      .single();

    if (error || !data) {
      res.status(500).json({ error: 'Failed to save vehicle' });
      return;
    }
    res.status(201).json({ vehicle: data });
  })
);

router.put(
  '/:id',
  requireCustomer,
  validateBody(vehicleSchema.partial()),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { data, error } = await db
      .from('customer_vehicles')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('customer_id', req.customer!.sub)
      .select('*')
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }
    res.json({ vehicle: data });
  })
);

router.delete(
  '/:id',
  requireCustomer,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { error } = await db
      .from('customer_vehicles')
      .delete()
      .eq('id', req.params.id)
      .eq('customer_id', req.customer!.sub);

    if (error) {
      res.status(500).json({ error: 'Failed to delete vehicle' });
      return;
    }
    res.json({ ok: true });
  })
);

/**
 * VIN lookup via VehicleService → VehicleProvider.
 * Null provider returns gracefully — never crashes the storefront.
 * No provider credentials in frontend; none required until approved.
 */
router.post(
  '/vin-lookup',
  requireCustomer,
  validateBody(z.object({ vin: z.string().min(11).max(32) })),
  asyncHandler(async (req, res) => {
    const service = getVehicleService();
    const result = await service.decodeVIN(req.body.vin);
    if (!result.ok) {
      res.status(result.providerUnavailable ? 503 : 501).json({
        error: result.message || 'VIN lookup not configured',
        message: result.message,
        vin: req.body.vin,
        status: 'verification_required',
        provider: service.getProviderName(),
      });
      return;
    }
    res.json({
      vehicle: result.vehicle,
      status: 'provider_decoded',
      provider: service.getProviderName(),
    });
  })
);

export default router;
