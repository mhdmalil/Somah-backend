-- Database Performance Indexes for Somah
-- These indexes will significantly improve query performance
-- Works perfectly with RLS disabled

-- Enable trigram extension for better text search (run this first)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Products table optimization
CREATE INDEX IF NOT EXISTS idx_products_store_status 
ON products(store_id, status, is_available);

CREATE INDEX IF NOT EXISTS idx_products_category_available 
ON products(category, is_available) WHERE is_available = true;

CREATE INDEX IF NOT EXISTS idx_products_name_search 
ON products USING gin (name gin_trgm_ops);

-- Stores table optimization
CREATE INDEX IF NOT EXISTS idx_stores_status_category 
ON stores(status, category) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_stores_name_search 
ON stores USING gin (name gin_trgm_ops);

-- Orders table optimization
CREATE INDEX IF NOT EXISTS idx_orders_customer_created 
ON orders(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status_created 
ON orders(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_order_number 
ON orders(order_number);

-- Cart items optimization
CREATE INDEX IF NOT EXISTS idx_cart_items_user_product 
ON cart_items(user_id, product_id);

CREATE INDEX IF NOT EXISTS idx_cart_items_user_store 
ON cart_items(user_id, store_id);

-- Order items optimization
CREATE INDEX IF NOT EXISTS idx_order_items_order_id 
ON order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product_id 
ON order_items(product_id);

-- Users table optimization
CREATE INDEX IF NOT EXISTS idx_users_auth_id 
ON users(auth_id);

-- Product images optimization
CREATE INDEX IF NOT EXISTS idx_product_images_product_primary 
ON product_images(product_id, is_primary) WHERE is_primary = true;

-- Store locations optimization
CREATE INDEX IF NOT EXISTS idx_store_locations_store_id 
ON store_locations(store_id);

-- Admins table optimization
CREATE INDEX IF NOT EXISTS idx_admins_username 
ON admins(username);

CREATE INDEX IF NOT EXISTS idx_admins_email 
ON admins(email);

-- Customer addresses optimization
CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id 
ON customer_addresses(user_id);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_default 
ON customer_addresses(user_id, is_default) WHERE is_default = true;

-- Manual payouts optimization
CREATE INDEX IF NOT EXISTS idx_manual_payouts_store_id 
ON manual_payouts(store_id);

CREATE INDEX IF NOT EXISTS idx_manual_payouts_period 
ON manual_payouts(period_start, period_end);

-- Telegram notifications optimization
CREATE INDEX IF NOT EXISTS idx_telegram_notifications_order_id 
ON telegram_notifications(order_id);

CREATE INDEX IF NOT EXISTS idx_telegram_notifications_sent 
ON telegram_notifications(sent);

-- Order status history optimization
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id 
ON order_status_history(order_id);

CREATE INDEX IF NOT EXISTS idx_order_status_history_created_at 
ON order_status_history(created_at);

-- Favorites optimization
CREATE INDEX IF NOT EXISTS idx_favorites_user_id 
ON favorites(user_id);

CREATE INDEX IF NOT EXISTS idx_favorites_product_id 
ON favorites(product_id);

CREATE INDEX IF NOT EXISTS idx_favorites_user_product 
ON favorites(user_id, product_id);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_products_store_available_category 
ON products(store_id, is_available, category) WHERE is_available = true;

CREATE INDEX IF NOT EXISTS idx_orders_customer_status_created 
ON orders(customer_id, status, created_at DESC);

-- Text search optimization
CREATE INDEX IF NOT EXISTS idx_products_description_search 
ON products USING gin (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_stores_description_search 
ON stores USING gin (description gin_trgm_ops);

-- Performance monitoring
SELECT 
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) as index_size
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND indexname LIKE 'idx_%'
ORDER BY pg_relation_size(schemaname||'.'||indexname) DESC;
