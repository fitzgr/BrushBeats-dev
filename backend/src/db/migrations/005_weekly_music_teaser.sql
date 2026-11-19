-- One weekly music teaser per household after the 60-day trial.
-- Records are server-owned: browser storage cannot reset the weekly allowance.
-- UTC Monday is the start of each weekly period. Do not charge or delete
-- users' existing brushing history as part of this migration.
CREATE TABLE IF NOT EXISTS household_music_teaser_uses (
  household_id text NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
  week_start date NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_household_music_teaser_uses_reserved_at
  ON household_music_teaser_uses (reserved_at DESC);
-- Reserve a weekly use only in an authenticated transaction, when the
-- user has a playable random music selection. On failures before playback,
-- a trusted server endpoint should release the reservation safely.
-- Do not switch on paid music enforcement until all music API routes and
-- saved/direct-video entry points are protected by the same entitlement.
