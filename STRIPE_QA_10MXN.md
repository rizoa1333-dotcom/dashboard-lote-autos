# Prueba de pago real de VeloDrive ($10 MXN/mes)

## Enlace de Stripe

`https://buy.stripe.com/fZu8wRbcR09b0to93D3oA07`

Es un cargo real recurrente de **$10 MXN cada mes**. El enlace no agrega impuestos automáticamente. Cancela la suscripción de prueba después de validar el flujo para evitar renovaciones.

El enlace está integrado en el registro cuando se abre VeloDrive con `?stripe_live_qa=1`. El modo de Stripe de prueba (`?stripe_test=1`) continúa separado y no cobra dinero.

## Preparación requerida antes de pagar

1. Ejecuta `supabase_stripe_billing.sql` en Supabase SQL Editor.
2. Despliega estos cambios en Railway.
3. En Stripe, crea un webhook en modo **Live** con URL `https://velodrive.up.railway.app/api/stripe-webhook`.
4. Suscribe los eventos `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` e `invoice.payment_failed`.
5. Copia el secreto de firma que Stripe muestra (`whsec_...`) a Railway como `STRIPE_WEBHOOK_SECRET`. No lo publiques ni lo pongas en el frontend.
6. En Railway agrega `STRIPE_ALLOWED_PAYMENT_LINK_IDS` con los enlaces que VeloDrive puede reconocer:

   ```text
   plink_1UOJn1Qxq5crPvbR8AJMJJBQ,plink_1UKm41Qxq5crPvbRCNH64kOx
   ```

   También agrega `STRIPE_QA_PAYMENT_LINK_ID=plink_1UOJn1Qxq5crPvbR8AJMJJBQ` y `STRIPE_QA_EMAIL` con el correo administrador que usarás para el lote de prueba. El webhook solo activa este enlace QA para ese correo y además exige que coincida con `email_admin` del lote.

   `STRIPE_SECRET_KEY`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` deben estar configuradas en ese servicio.
7. Espera a que Railway termine el despliegue y confirma que `/health` responda `{"status":"ok"}`.
8. Para probar el flujo completo, registra un lote usando `?stripe_live_qa=1`, paga con el correo administrador de ese lote y espera el estado **Plan Activo** al regresar.

## Eventos y controles

- La firma se valida sobre el cuerpo original de la solicitud y se rechazan eventos con más de cinco minutos.
- Solo se aceptan los IDs de enlaces listados en `STRIPE_ALLOWED_PAYMENT_LINK_IDS`.
- Para completar la asociación, el correo de Checkout debe coincidir con `lotes.email_admin`.
- Los eventos repetidos actualizan los mismos campos, por lo que su aplicación es idempotente.
- Stripe reintentará respuestas HTTP 5xx. Revisa **Workbench → Entregas de eventos** si el lote no se activa.
- Al cancelar la suscripción, `customer.subscription.deleted` cambia `plan_status` a `inactive`; un fallo de renovación lo cambia a `past_due`.

No hagas el pago hasta completar la migración, el despliegue y la configuración del webhook; sin esas tres piezas Stripe puede cobrar, pero VeloDrive no confirmará el plan.
