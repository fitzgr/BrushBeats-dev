-- Forward-only household plans and invitation/device enrolment foundation.
-- No payment setup, live invites, entitlement enforcement or migration of existing brushing data.
-- The owner remains households.owner_account_id, not a second co-owner in memberships.

CREATE TABLE IF NOT EXISTS household_plan_catalog (
  plan_code text PRIMARY KEY,
  display_name text NOT NULL,
  currency text NOT NULL CHECK (currency = 'GBP'),
  annual_price_minor integer NOT NULL CHECK (annual_price_minor > 0),
  profile_limit integer NOT NULL CHECK (profile_limit > 0),
  registered_device_limit integer NOT NULL CHECK (registered_device_limit > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Prices are proposed GBP launch prices; no payment is initiated by this migration.
INSERT INTO household_plan_catalog
    (plan_code, display_name, currency, annual_price_minor, profile_limit, registered_device_limit)
VALUES
    ('family', 'Brush Beats Family', 'GBP', 1499, 6, 5),
    ('family_plus', 'Brush Beats Family Plus', 'GBP', 2499, 12, 10)
ON CONFLICT (plan_code) DO NOTHING;

-- Existing subscriptions and their historical prices are left unchanged.
-- New subscriptions default to Family, but payment prices must still be
-- confirmed server-side with the actual payment provider before charging.
ALTER TABLE household_subscriptions
  ADD COLUMN IF NOT EXISTS plan_code text NOT NULL DEFAULT 'family'
  REFERENCES household_plan_catalog(plan_code);
ALTER TABLE household_subscriptions ALTER COLUMN price_minor SET DEFAULT 1499;

-- A single household owner invites other *adult* accounts, such as a spouse.
-- Children can use owner-managed brushing profiles and enrolled devices without email.
CREATE TABLE IF NOT EXISTS household_account_memberships (
  household_id text NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  invited_by_account_id text REFERENCES accounts(account_id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (household_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_household_account_memberships_account
  ON household_account_memberships (account_id) WHERE status = 'active';

-- No raw tokens are retained: only the SHA-256 digest of cryptographically
-- random invitation secrets is stored. Never put invitation tokens in logs.
CREATE TABLE IF NOT EXISTS household_invitations (
  invitation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id text NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
  created_by_account_id text NOT NULL REFERENCES accounts(account_id),
  invited_email text,
  recipient_label text,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz NOT NULL,
  accepted_by_account_id text REFERENCES accounts(account_id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_household_invitations_household_status
  ON household_invitations(household_id, status, expires_at);

-- A household may enrol a child's device without needing the child's email.
-- Registration is distinct from the brushing-profile count.
-- A provisional device must expire if invitation acceptance is not completed.
CREATE TABLE IF NOT EXISTS household_devices (
  device_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id text NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
  account_id text REFERENCES accounts(account_id) ON DELETE SET NULL,
  invitation_id uuid REFERENCES household_invitations(invitation_id) ON DELETE SET NULL,
  device_label text NOT NULL DEFAULT 'Device',
  credential_hash text NOT NULL UNIQUE CHECK (credential_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'provisional'
    CHECK (status IN ('provisional', 'active', 'revoked')),
  provisional_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  CHECK (status <> 'provisional' OR provisional_expires_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_household_devices_active
  ON household_devices(household_id, status, provisional_expires_at)
  WHERE status IN ('active', 'provisional');

-- Capacity, role checks, provisional expiry, one-use invite redemption, token
-- hashing and owner-only revocation must be enforced transactionally by APIs
-- before these tables are used. Do not grant access from a client household ID.
