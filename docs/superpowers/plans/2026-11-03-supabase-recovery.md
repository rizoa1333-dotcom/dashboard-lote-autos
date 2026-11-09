# Recuperación Supabase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** respaldar y ensayar recuperación de Supabase con pruebas de aislamiento,
dejando las intervenciones del propietario para el final.

**Architecture:** operadores separados de la aplicación, biblioteca de inventario
Storage y cifrado existente; datos privados fuera de OneDrive y laboratorio
aislado. PostgreSQL queda condicionado a credenciales válidas.

**Tech Stack:** Node 24.22.1, node:test, HTTPS, AES-256-GCM/DPAPI, PostgreSQL, Docker.

**Spec:** docs/superpowers/specs/2026-11-03-supabase-recovery-design.md

## Global Constraints

Sin gasto cloud adicional, sin cambios de credenciales ni módulos comerciales.
No execution_data, tokens de navegador, secretos en logs ni documentos reales
de prueba. Conservar styles.css y web-premium/. Copias no equivalen a restauración.

## Review Focus

- Más de una página o carpeta de objetos; no perder archivos silenciosamente.
- Cambios entre listado y descarga; marcar el punto incompleto.
- Rutas y metadatos hostiles; no escapar al destino ni filtrar claves por redirects.
- Muchos archivos pequeños; preservar presupuesto total de recuperación.
- Triggers y credenciales sintéticas; no generar acciones externas desde QA.

### Task 1: Inventario y ampliación acotada del paquete

**Files:** scripts/lib/recovery-files.cjs, scripts/lib/recovery-reader.cjs,
scripts/lib/storage-backup.cjs y sus pruebas en tests/unit/.

- [x] RED: 19 copias válidas, rechazo agregado antes de leer cuerpos, paginación,
  rutas hostiles, tamaños inválidos y cambios de inventario.
- [x] GREEN: ampliar a 256 con máximo total 1 GiB. Aplicar el límite también al
  archivo abierto y detectar cambios durante la lectura.
- [x] Ejecutar pruebas específicas y suite completa. Incorporar la revisión.

### Task 2: Copia real y restauración de archivos

**Files:** operadores privados .qa/supabase-storage-backup-20261103.cjs y
.qa/restore-supabase-storage-20261103.cjs; informe público sin datos privados.

- [x] Comprobar destino privado y preparar diario exclusivo de ejecución.
- [x] Capturar inventario, copiar cada objeto cifrado y comparar inventario final.
- [x] Restaurar localmente, comparar bytes/hash y configuración de buckets.
- [x] Registrar alcance del respaldo y de la restauración local.
- [ ] Completar la custodia portable con frase y USB al retomar los pasos manuales.

### Task 3: PostgreSQL/Auth y aislamiento

- [ ] Obtener acceso válido sin restablecer credenciales automáticamente.
- [x] Capturar 27 políticas vigentes, permisos por columna y funciones auxiliares.
- [x] Probar permisos y filtros de esas políticas con 10 lotes sintéticos en PostgreSQL.
- [ ] Inventariar versión, extensiones, policies, triggers y dependencias de Vault.
- [ ] Capturar y restaurar copia cifrada completa en laboratorio compatible.
- [ ] Comprobar la API con sesiones reales de dos cuentas de prueba.
- [ ] Documentar recuperación efectiva, RPO/RTO medidos y pendientes.

### Task 4: Capacidad

- [x] Medir la cola local con 10 clientes concurrentes, 1,000 operaciones y 500 duplicados.
- [x] Comprobar que un mismo mensaje reclamado por 10 clientes tenga un solo ganador.
- [ ] Medir el flujo integrado, sus colas y las cuotas de los proveedores.
