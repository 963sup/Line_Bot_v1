-- Deployment-only setup, using the migration role; never run by the Web runtime.
-- Populate Vault secrets attendance_worker_url and attendance_worker_secret first.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
DO $$
BEGIN
  IF (SELECT count(*) FROM vault.decrypted_secrets
      WHERE name IN ('attendance_worker_url', 'attendance_worker_secret')) <> 2 THEN
    RAISE EXCEPTION 'Attendance worker Vault secrets are not configured';
  END IF;
END $$;
SELECT cron.schedule('attendance-maintenance', '* * * * *', $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'attendance_worker_url'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
      'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'attendance_worker_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  WHERE EXISTS (
    SELECT 1 FROM app_private.attendance_menu_outbox
    WHERE revision > synced_revision
      AND available_at <= extract(epoch FROM clock_timestamp()) * 1000
      AND (lease_until IS NULL OR lease_until < extract(epoch FROM clock_timestamp()) * 1000)
  ) OR EXISTS (
    SELECT 1 FROM app_private.attendance_notification_outbox
    WHERE status = 'pending'
      AND available_at <= extract(epoch FROM clock_timestamp()) * 1000
      AND (lease_until IS NULL OR lease_until < extract(epoch FROM clock_timestamp()) * 1000)
  );
$job$);
COMMIT;
