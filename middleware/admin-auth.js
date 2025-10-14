import { supabaseAdmin } from '../supabase';
import { compare } from 'bcrypt';

/**
 * Middleware to authenticate admin users
 * This should be used on all admin API routes
 */
export async function adminAuthMiddleware(req, res, next) {
  // Check for Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization header' });
  }

  // Decode Basic Auth credentials
  try {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    // Query the admin from the database
    const { data: admin, error } = await supabaseAdmin
      .from('admins')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !admin) {
      return res.status(401).json({ error: 'Unauthorized: Invalid credentials' });
    }

    // Verify password
    const passwordValid = await compare(password, admin.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Unauthorized: Invalid credentials' });
    }

    // Update last login time
    await supabaseAdmin
      .from('admins')
      .update({ last_login: new Date().toISOString() })
      .eq('id', admin.id);

    // Attach admin to request object for use in route handlers
    req.admin = {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.role,
      fullName: admin.full_name
    };

    // Continue to the route handler
    return next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
}
