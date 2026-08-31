-- Deleting a contract has been failing all session with "still referenced
-- from table ai_usage_log" / "webhook_intake_events" - these two FKs were the
-- only ones on the contracts table without ON DELETE CASCADE. Needed for the
-- new delete-contract action; also just correct - an audit/log row for a
-- contract that no longer exists is dead weight, not something to keep.
alter table webhook_intake_events drop constraint webhook_intake_events_contract_id_fkey;
alter table webhook_intake_events add constraint webhook_intake_events_contract_id_fkey
  foreign key (contract_id) references contracts(id) on delete cascade;

alter table ai_usage_log drop constraint ai_usage_log_contract_id_fkey;
alter table ai_usage_log add constraint ai_usage_log_contract_id_fkey
  foreign key (contract_id) references contracts(id) on delete cascade;
