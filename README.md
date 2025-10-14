# Somah Land Backend

This directory contains the backend code for Somah Land, including database schema and integration with Supabase.

## Database Setup

The database schema is defined in `schema.sql`. This file contains all the tables, relationships, triggers, and functions needed for the Somah Land platform.

### How to Deploy the Schema to Supabase

1. Log in to your Supabase dashboard
2. Select your project
3. Go to the SQL Editor
4. Create a "New Query"
5. Copy and paste the contents of `schema.sql`
6. Run the query

## Environment Variables

The following environment variables need to be set:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-key
```

## Database Structure

The database includes the following tables:

- `admins`: Admin users for platform management
- `users`: User accounts
- `customer_addresses`: User delivery addresses
- `stores`: Stores created by users
- `store_locations`: Private pickup locations for stores
- `products`: Products listed by stores
- `product_images`: Images for products
- `cart_items`: Items in user carts
- `orders`: Customer orders
- `order_items`: Individual items within orders
- `manual_payouts`: Records of payouts to store owners
- `telegram_notifications`: Notifications sent to Telegram
- `order_status_history`: History of order status changes
- `favorites`: User favorite products

## Admin Access

A default admin user is created with the following credentials:

- Username: `admin`
- Password: `admin123`
- Email: `admin@somahland.com`

**IMPORTANT**: Change these credentials immediately after the first login for security reasons.

## Database Triggers

The schema includes several triggers:

1. `single_default_address_trigger`: Ensures only one address per user is marked as default
2. `order_notification_trigger`: Creates a Telegram notification when an order is created
3. `update_stock_trigger`: Updates product stock when an order is confirmed
4. `order_status_history_trigger`: Tracks changes to order status

## Functions

1. `ensure_single_default_address()`: Supports the single default address trigger
2. `generate_order_number()`: Generates unique order numbers in the format SOMAH-XXXXXXXX
3. `create_order_notification()`: Creates notification records for new orders
4. `update_product_stock()`: Updates product inventory when orders are confirmed
5. `track_order_status()`: Records order status changes in the history table
