export type {
  VehicleProvider,
  SomahVehicle,
  VehicleMake,
  VehicleModel,
  VehicleYearOption,
  VehicleConfiguration,
  DecodeVinResult,
  ProviderHealth,
  VehicleVerificationStatus,
} from "./types";
export { NullVehicleProvider } from "./null-provider";
export { VehicleService, getVehicleService } from "./vehicle-service";
