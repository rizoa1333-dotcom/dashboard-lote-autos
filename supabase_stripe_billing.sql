-- Campos para vincular suscripciones de Stripe con cada lote.
-- Se puede ejecutar más de una vez; conserva los datos que ya existan.
ALTER TABLE public.lotes
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS plan_status text NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS fecha_vencimiento timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS lotes_stripe_subscription_id_uidx
  ON public.lotes (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON COLUMN public.lotes.stripe_subscription_id IS
  'Suscripción Stripe vinculada a este lote; solo la actual se conserva aquí.';
