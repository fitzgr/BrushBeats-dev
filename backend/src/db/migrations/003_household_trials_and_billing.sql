-- Forward-only schema changes: account identity and server-controlled household entitlements.
-- Do not change or reinitialize existing family profiles, sessions or achievements.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS auth_subject text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_auth_subject
  ON accounts (auth_subject) WHERE auth_subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS household_subscriptions (
  household_id text PRIMARY KEY REFERENCES households(household_id) ON DELETE CASCADE,
  trial_started_at timestamptz NOT NULL DEFAULT now(),
  trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '60 days'),
  status text NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'past_due', 'canceled', 'expired')),
  currency text NOT NULL DEFAULT 'GBP' CHECK (currency = 'GBP'),
  price_minor integer NOT NULL DEFAULT 499 CHECK (price_minor > 0),
  billing_interval text NOT NULL DEFAULT 'year' CHECK (billing_interval = 'year'),
  provider text CHECK (provider IS NULL OR provider = 'paypal'),
  provider_plan_id text,
  provider_subscription_id text UNIQUE,
  paid_through timestamptz,
  canceled_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_trial_window CHECK (trial_ends_at > trial_started_at)
);

CREATE INDEX IF NOT EXISTS idx_household_subscriptions_trial_end
  ON household_subscriptions (trial_ends_at) WHERE status = 'trial';

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  provider text NOT NULL CHECK (provider = 'paypal'),
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  provider_subscription_id text,
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processed', 'ignored', 'failed')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  PRIMARY KEY (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_subscription
  ON payment_webhook_events (provider_subscription_id, received_at DESC);

-- Household subscription_tier remains a legacy display column. It must never
-- be trusted for authorization or accepted from a browser synchronization payload.
