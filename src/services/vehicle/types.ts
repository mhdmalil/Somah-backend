/**
 * Replaceable vehicle identification provider (server-side).
 * Credentials stay in env — never expose to the browser.
 *
 * VIN / vehicle identity ≠ parts catalog ≠ SOMAHLAND commercial pricing.
 */

export type VehicleVerificationStatus =
  | "unverified"
  | "provider_decoded"
  | "manual"
  | "staff_verified"
  | "unknown";

export interface SomahVehicle {
  vehicle_id?: string;
  user_id?: string | null;
  vin?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  generation?: string | null;
  trim?: string | null;
  configuration?: string | null;
  engine?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  body_style?: string | null;
  /** Sales / registration market — independent of manufacturing_country */
  market?: string | null;
  manufacturing_country?: string | null;
  country_of_registration?: string | null;
  provider?: string | null;
  provider_vehicle_id?: string | null;
  verification_status?: VehicleVerificationStatus | null;
}

export interface VehicleMake {
  id: string;
  name: string;
  slug?: string;
}

export interface VehicleModel {
  id: string;
  make_id: string;
  name: string;
  slug?: string;
}

export interface VehicleYearOption {
  year: number;
}

export interface VehicleConfiguration {
  id: string;
  label: string;
  generation?: string | null;
  trim?: string | null;
  engine?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  body_style?: string | null;
  market?: string | null;
  manufacturing_country?: string | null;
  provider_vehicle_id?: string | null;
}

export interface DecodeVinResult {
  ok: boolean;
  vehicle?: Partial<SomahVehicle>;
  message?: string;
  providerUnavailable?: boolean;
}

export interface ProviderHealth {
  available: boolean;
  provider: string;
  message?: string;
}

export interface VehicleProvider {
  readonly name: string;
  health(): Promise<ProviderHealth>;
  decodeVIN(vin: string): Promise<DecodeVinResult>;
  getMakes(opts?: { market?: string }): Promise<VehicleMake[]>;
  getModels(makeId: string, opts?: { year?: number }): Promise<VehicleModel[]>;
  getYears(makeId: string, modelId: string): Promise<VehicleYearOption[]>;
  getConfigurations(
    makeId: string,
    modelId: string,
    year: number
  ): Promise<VehicleConfiguration[]>;
  getVehicle(providerVehicleId: string): Promise<DecodeVinResult>;
}
