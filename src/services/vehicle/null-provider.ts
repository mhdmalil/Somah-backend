import type {
  DecodeVinResult,
  ProviderHealth,
  VehicleConfiguration,
  VehicleMake,
  VehicleModel,
  VehicleProvider,
  VehicleYearOption,
} from "./types";

const UNAVAILABLE =
  "Vehicle verification is temporarily unavailable. Browse and manual vehicle selection still work.";

/** Default stub — no external API until a provider is approved and tested. */
export class NullVehicleProvider implements VehicleProvider {
  readonly name = "null";

  async health(): Promise<ProviderHealth> {
    return { available: false, provider: this.name, message: UNAVAILABLE };
  }

  async decodeVIN(_vin: string): Promise<DecodeVinResult> {
    return { ok: false, providerUnavailable: true, message: UNAVAILABLE };
  }

  async getMakes(): Promise<VehicleMake[]> {
    return [];
  }

  async getModels(_makeId: string): Promise<VehicleModel[]> {
    return [];
  }

  async getYears(_makeId: string, _modelId: string): Promise<VehicleYearOption[]> {
    return [];
  }

  async getConfigurations(
    _makeId: string,
    _modelId: string,
    _year: number
  ): Promise<VehicleConfiguration[]> {
    return [];
  }

  async getVehicle(_providerVehicleId: string): Promise<DecodeVinResult> {
    return { ok: false, providerUnavailable: true, message: UNAVAILABLE };
  }
}
