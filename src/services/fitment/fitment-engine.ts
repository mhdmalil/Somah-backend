/**
 * Fitment engine stub (server).
 * Separate from VehicleService / VIN providers.
 * SOMAHLAND owns product catalog + commercial pricing.
 */

export type FitmentStatus =
  | "CONFIRMED"
  | "NOT_COMPATIBLE"
  | "REQUIRES_VERIFICATION"
  | "UNKNOWN";

export interface FitmentEvaluation {
  status: FitmentStatus;
  message: string;
  fitment_id?: string | null;
}

/**
 * Until product_fitments + vehicle_specific_prices are populated and a
 * fitment data source is approved, always require verification when a
 * vehicle context exists. Never invent CONFIRMED.
 */
export function evaluateFitmentStub(hasVehicle: boolean): FitmentEvaluation {
  if (!hasVehicle) {
    return {
      status: "UNKNOWN",
      message: "Select your vehicle to see exact compatibility and pricing.",
    };
  }
  return {
    status: "REQUIRES_VERIFICATION",
    message: "Compatibility requires verification until fitment data confirms it.",
  };
}

/** Commercial price for a product+vehicle — SOMAHLAND-owned, not provider-owned. */
export function lookupVehicleSpecificPrice(
  _productId: string,
  _vehicleId: string,
  priceMap?: Record<string, number> | null
): number | null {
  if (!priceMap) return null;
  const v = priceMap[`${_productId}:${_vehicleId}`];
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}
