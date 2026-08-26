-- Distinguishes webhook-triggered intake from a lawyer manually uploading a
-- PDF/Word file to start a new contract (see app/api/environments/[id]/contracts).
alter table webhook_intake_events
  add column source text not null default 'webhook' check (source in ('webhook', 'manual_upload'));
