/*
  # Create Subscriptions Table

  1. New Tables
    - `subscriptions`
      - `id` (uuid, primary key)
      - `user_id` (text, references users)
      - `stripe_customer_id` (text, unique)
      - `stripe_subscription_id` (text, unique)
      - `stripe_price_id` (text)
      - `status` (text) - active, canceled, past_due, etc.
      - `current_period_start` (timestamptz)
      - `current_period_end` (timestamptz)
      - `cancel_at_period_end` (boolean)
      - `trial_start` (timestamptz, nullable)
      - `trial_end` (timestamptz, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `subscriptions` table
    - Add policy for users to read their own subscription data
    - Add policy for service role to manage subscriptions
*/

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  stripe_price_id text,
  status text NOT NULL DEFAULT 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  trial_start timestamptz,
  trial_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscription"
  ON subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::text);

CREATE POLICY "Service role can insert subscriptions"
  ON subscriptions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update subscriptions"
  ON subscriptions
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
