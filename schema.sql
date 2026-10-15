-- SOMAHLAND schema (retail auto parts)
-- DESTRUCTIVE for SOMAHLAND retail tables. Backup first.
-- Marketplace leftover tables and Telegram outbox are not part of this schema.
-- Do NOT DROP waitlist_signups — launch waitlist lives in the same database.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop leftover Telegram objects if an older schema was applied
DROP FUNCTION IF EXISTS create_order_notification() CASCADE;
DROP TABLE IF EXISTS telegram_notifications CASCADE;

-- Drop retail tables (safe re-run)
DROP TABLE IF EXISTS order_status_history CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS cart_items CASCADE;
DROP TABLE IF EXISTS product_images CASCADE;
DROP TABLE IF EXISTS fitments CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS customer_vehicles CASCADE;
DROP TABLE IF EXISTS customer_addresses CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS ad_slots CASCADE;
DROP TABLE IF EXISTS admins CASCADE;

-- Admins (separate from customers)
CREATE TABLE admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customers (custom auth — no Supabase Auth)
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customer_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(255) NOT NULL,
    emirate VARCHAR(255) NOT NULL,
    postal_code VARCHAR(50),
    country VARCHAR(100) NOT NULL DEFAULT 'UAE',
    label VARCHAR(50) NOT NULL DEFAULT 'Home',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_addresses_customer ON customer_addresses(customer_id);

-- Saved vehicles (VIN API decode comes later)
CREATE TABLE customer_vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    vin VARCHAR(32),
    make VARCHAR(100),
    model VARCHAR(100),
    year INTEGER,
    trim VARCHAR(100),
    engine VARCHAR(100),
    nickname VARCHAR(100),
    raw_decode JSONB,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vehicles_customer ON customer_vehicles(customer_id);
CREATE INDEX idx_vehicles_vin ON customer_vehicles(vin);

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    brand VARCHAR(255),
    part_number VARCHAR(120),
    oem_part_number VARCHAR(120),
    alt_part_numbers TEXT[] DEFAULT '{}',
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    compare_at_price NUMERIC(10,2),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    condition VARCHAR(50) NOT NULL DEFAULT 'new'
        CHECK (condition IN ('new', 'used', 'refurbished')),
    status VARCHAR(50) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'draft', 'out_of_stock', 'archived')),
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_part_number ON products(part_number);
CREATE INDEX idx_products_oem ON products(oem_part_number);
CREATE INDEX idx_products_name_trgm ON products(name);

CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    alt_text VARCHAR(255),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_images_product ON product_images(product_id);

-- Manual / future fitment rows (VIN provider fills later)
CREATE TABLE fitments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    make VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    year_from INTEGER,
    year_to INTEGER,
    engine VARCHAR(100),
    trim VARCHAR(100),
    notes TEXT,
    confidence VARCHAR(50) NOT NULL DEFAULT 'verification_required'
        CHECK (confidence IN ('confirmed', 'verification_required')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fitments_product ON fitments(product_id);
CREATE INDEX idx_fitments_make_model ON fitments(make, model);

-- Server cart for logged-in customers (guest cart is client-side until login)
CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (customer_id, product_id)
);

CREATE INDEX idx_cart_customer ON cart_items(customer_id);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    vehicle_id UUID REFERENCES customer_vehicles(id) ON DELETE SET NULL,
    address_id UUID REFERENCES customer_addresses(id) ON DELETE SET NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(255) NOT NULL,
    emirate VARCHAR(255) NOT NULL,
    postal_code VARCHAR(50),
    country VARCHAR(100) NOT NULL DEFAULT 'UAE',
    vehicle_snapshot JSONB,
    subtotal NUMERIC(10,2) NOT NULL,
    delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(10,2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'new'
        CHECK (status IN (
            'new', 'confirmed', 'preparing', 'out_for_delivery',
            'delivered', 'requires_verification', 'cancelled', 'failed'
        )),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'cash_on_delivery',
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    part_number VARCHAR(120),
    brand VARCHAR(255),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10,2) NOT NULL,
    line_total NUMERIC(10,2) NOT NULL,
    image_url TEXT,
    fitment_status VARCHAR(50) DEFAULT 'verification_required',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE order_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    notes TEXT,
    changed_by_admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Homepage / listing ad placements
CREATE TABLE ad_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    placement VARCHAR(100) NOT NULL,
    title VARCHAR(255),
    subtitle VARCHAR(255),
    image_url TEXT,
    link_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ad_slots_placement ON ad_slots(placement, is_active);

-- Triggers
CREATE OR REPLACE FUNCTION ensure_single_default_address()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default THEN
        UPDATE customer_addresses
        SET is_default = FALSE
        WHERE customer_id = NEW.customer_id AND id <> NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_single_default_address
BEFORE INSERT OR UPDATE ON customer_addresses
FOR EACH ROW
WHEN (NEW.is_default = TRUE)
EXECUTE FUNCTION ensure_single_default_address();

CREATE OR REPLACE FUNCTION ensure_single_default_vehicle()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default THEN
        UPDATE customer_vehicles
        SET is_default = FALSE
        WHERE customer_id = NEW.customer_id AND id <> NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_single_default_vehicle
BEFORE INSERT OR UPDATE ON customer_vehicles
FOR EACH ROW
WHEN (NEW.is_default = TRUE)
EXECUTE FUNCTION ensure_single_default_vehicle();

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
  timestamp_part TEXT;
  random_part TEXT;
BEGIN
  timestamp_part := right(to_char(extract(epoch from now()), 'FM9999999999'), 6);
  random_part := to_char(floor(random() * 1000), 'FM000');
  RETURN 'SOMAH-' || timestamp_part || random_part;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION track_order_status()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO order_status_history(order_id, status, created_at)
    VALUES (NEW.id, NEW.status, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_status_history
AFTER INSERT OR UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION track_order_status();

CREATE OR REPLACE FUNCTION update_product_stock_on_confirm()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status <> 'confirmed') THEN
    UPDATE products p
    SET stock = GREATEST(0, p.stock - oi.quantity),
        updated_at = NOW()
    FROM order_items oi
    WHERE oi.order_id = NEW.id AND oi.product_id = p.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_stock
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_product_stock_on_confirm();

-- Seed categories (automotive)
INSERT INTO categories (name, slug, description, sort_order) VALUES
('Brake System', 'brake-system', 'Brake pads, discs, calipers, and related parts', 1),
('Filters', 'filters', 'Oil, air, cabin, and fuel filters', 2),
('Engine', 'engine', 'Engine components and service parts', 3),
('Suspension', 'suspension', 'Shocks, struts, bushings, and arms', 4),
('Electrical', 'electrical', 'Batteries, sensors, lighting, and wiring', 5),
('Body & Exterior', 'body-exterior', 'Mirrors, bumpers, panels, and trim', 6),
('Cooling', 'cooling', 'Radiators, hoses, water pumps, thermostats', 7),
('Transmission', 'transmission', 'Clutch, gearbox, and drivetrain parts', 8);

-- Seed ad slot placeholders
INSERT INTO ad_slots (placement, title, subtitle, is_active, sort_order) VALUES
('home_hero', 'Ad placement — home hero', 'Replace with campaign creative', TRUE, 1),
('home_mid', 'Ad placement — mid page', 'Banner slot reserved', TRUE, 2),
('category_top', 'Ad placement — category top', 'Shown above category listings', TRUE, 1);

-- NOTE: Create the first admin via backend bootstrap (ADMIN_EMAIL / ADMIN_PASSWORD env).
-- Do not seed default passwords in SQL.
