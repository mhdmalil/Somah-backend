-- Additive waitlist only. Do not run schema.sql against this project until
-- waitlist_signups is excluded from DROP lists.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.waitlist_signups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    source TEXT NOT NULL DEFAULT 'coming_soon',
    launch_discount_percent INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_signups_email_lower
    ON public.waitlist_signups (lower(email));

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.waitlist_signups FROM anon, authenticated;
GRANT INSERT ON TABLE public.waitlist_signups TO anon, authenticated;
GRANT ALL ON TABLE public.waitlist_signups TO service_role;

DO $$
BEGIN
    ALTER TABLE public.waitlist_signups
        ADD CONSTRAINT waitlist_signups_email_key UNIQUE (email);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS waitlist_insert_anyone ON public.waitlist_signups;
CREATE POLICY waitlist_insert_anyone
    ON public.waitlist_signups
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);
