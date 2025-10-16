require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Debug environment variables
console.log('🔍 Environment check:');
console.log('SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
console.log('SUPABASE_SERVICE_KEY:', supabaseServiceKey ? '✅ Set' : '❌ Missing');

// Validate that required environment variables are set
if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ ERROR: Missing required environment variables!');
  console.error('Please ensure Backend/.env file contains:');
  console.error('  - SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_KEY');
  console.error('Current values:');
  console.error('  SUPABASE_URL:', supabaseUrl);
  console.error('  SUPABASE_SERVICE_KEY:', supabaseServiceKey ? 'Set (hidden)' : 'Missing');
  process.exit(1);
}

// Create optimized Supabase client with connection pooling
let supabaseAdmin;
try {
  console.log('🔗 Creating Supabase client...');
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: {
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=30, max=1000'
      }
    }
  });
  console.log('✅ Supabase client created successfully');
  
  // Test the connection immediately
  console.log('🔍 Testing database connection...');
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('count')
    .limit(1);
  
  if (error) {
    console.error('❌ Database connection test failed:', error);
    process.exit(1);
  } else {
    console.log('✅ Database connection test successful');
  }
} catch (error) {
  console.error('❌ Failed to create Supabase client:', error);
  process.exit(1);
}

// Connection pool configuration
const poolConfig = {
  max: 20, // Maximum number of connections
  min: 5,  // Minimum number of connections
  idle: 10000, // Close idle connections after 10 seconds
  acquire: 30000, // Maximum time to get connection
  evict: 1000, // Check for idle connections every 1 second
  handleDisconnects: true
};

// Health check function
const checkConnection = async () => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('count')
      .limit(1);
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  }
};

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('Shutting down database connections...');
  // Supabase client handles cleanup automatically
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = { 
  supabaseAdmin, 
  poolConfig, 
  checkConnection 
};
