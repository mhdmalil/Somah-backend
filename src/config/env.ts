import dotenv from 'dotenv';
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: optional('NODE_ENV', 'development'),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceKey: required('SUPABASE_SERVICE_KEY'),
  jwtCustomerSecret: required('JWT_CUSTOMER_SECRET'),
  jwtAdminSecret: required('JWT_ADMIN_SECRET'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '7d'),
  frontendUrls: optional('FRONTEND_URL', 'http://localhost:3002')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  deliveryFee: Number(process.env.DELIVERY_FEE || 25),
  adminEmail: optional('ADMIN_EMAIL'),
  adminPassword: optional('ADMIN_PASSWORD'),
  adminName: optional('ADMIN_NAME', 'SOMAHLAND Admin'),
  /** Vehicle identity provider (optional until approved). Never put these in frontend. */
  vehicleApiKey: optional('VEHICLE_API_KEY'),
  vehicleApiUrl: optional('VEHICLE_API_URL'),
  /** Fitment provider — separate from VIN/vehicle identity. */
  fitmentApiKey: optional('FITMENT_API_KEY'),
  fitmentApiUrl: optional('FITMENT_API_URL'),
};
