-- Requisito del endpoint /api/register-lote.
-- Seguro para ejecutar más de una vez; conserva los datos existentes.
ALTER TABLE public.lotes
  ADD COLUMN IF NOT EXISTS email_admin text;

COMMENT ON COLUMN public.lotes.email_admin IS
  'Correo del administrador asociado al lote; lo escribe el servidor durante el registro.';
