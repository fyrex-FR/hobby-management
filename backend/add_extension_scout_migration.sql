CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS extension_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  exchange_secret_hash text NOT NULL,
  label text NOT NULL DEFAULT 'Chrome',
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'exchanged', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);

CREATE TABLE IF NOT EXISTS extension_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  pairing_id uuid NOT NULL UNIQUE REFERENCES extension_pairings(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Chrome',
  last_used_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS extension_pairings_code_idx ON extension_pairings(code);
CREATE INDEX IF NOT EXISTS extension_tokens_user_idx ON extension_tokens(user_id);

ALTER TABLE extension_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE extension_tokens ENABLE ROW LEVEL SECURITY;
