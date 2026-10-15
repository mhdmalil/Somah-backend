import { NullVehicleProvider } from "./null-provider";
import type {
  DecodeVinResult,
  ProviderHealth,
  SomahVehicle,
  VehicleConfiguration,
  VehicleMake,
  VehicleModel,
  VehicleProvider,
  VehicleYearOption,
} from "./types";

/**
 * Internal VehicleService — routes call this, not a raw provider.
 * Swap adapters (Provider A → B) without changing storefront contracts.
 *
 * Env (when a real provider is approved):
 *   VEHICLE_API_KEY, VEHICLE_API_URL
 *   FITMENT_API_KEY, FITMENT_API_URL  (separate — fitment ≠ VIN)
 */
export class VehicleService {
  constructor(private provider: VehicleProvider = new NullVehicleProvider()) {}

  setProvider(provider: VehicleProvider) {
    this.provider = provider;
  }

  getProviderName(): string {
    return this.provider.name;
  }

  async health(): Promise<ProviderHealth> {
    try {
      return await this.provider.health();
    } catch {
      return {
        available: false,
        provider: this.provider.name,
        message:
          "Vehicle verification is temporarily unavailable. Browsing continues normally.",
      };
    }
  }

  async decodeVIN(vin: string): Promise<DecodeVinResult> {
    const cleaned = vin.trim().toUpperCase();
    if (cleaned.length < 11) {
      return { ok: false, message: "Enter a valid VIN (typically 17 characters)." };
    }
    try {
      const result = await this.provider.decodeVIN(cleaned);
      if (result.vehicle) {
        result.vehicle = normalizePartial(result.vehicle);
      }
      return result;
    } catch {
      return {
        ok: false,
        providerUnavailable: true,
        message: "VIN decode is temporarily unavailable. Select the vehicle manually.",
      };
    }
  }

  async getMakes(opts?: { market?: string }): Promise<VehicleMake[]> {
    try {
      return await this.provider.getMakes(opts);
    } catch {
      return [];
    }
  }

  async getModels(makeId: string, opts?: { year?: number }): Promise<VehicleModel[]> {
    try {
      return await this.provider.getModels(makeId, opts);
    } catch {
      return [];
    }
  }

  async getYears(makeId: string, modelId: string): Promise<VehicleYearOption[]> {
    try {
      return await this.provider.getYears(makeId, modelId);
    } catch {
      return [];
    }
  }

  async getConfigurations(
    makeId: string,
    modelId: string,
    year: number
  ): Promise<VehicleConfiguration[]> {
    try {
      return await this.provider.getConfigurations(makeId, modelId, year);
    } catch {
      return [];
    }
  }

  async getVehicle(providerVehicleId: string): Promise<DecodeVinResult> {
    try {
      const result = await this.provider.getVehicle(providerVehicleId);
      if (result.vehicle) {
        result.vehicle = normalizePartial(result.vehicle);
      }
      return result;
    } catch {
      return {
        ok: false,
        providerUnavailable: true,
        message: "Vehicle lookup is temporarily unavailable.",
      };
    }
  }
}

/** Never equate market with manufacturing_country. */
function normalizePartial(partial: Partial<SomahVehicle>): Partial<SomahVehicle> {
  return {
    ...partial,
    market: partial.market ?? null,
    manufacturing_country: partial.manufacturing_country ?? null,
    country_of_registration: partial.country_of_registration ?? null,
  };
}

let singleton: VehicleService | null = null;

export function getVehicleService(): VehicleService {
  if (!singleton) singleton = new VehicleService();
  return singleton;
}
