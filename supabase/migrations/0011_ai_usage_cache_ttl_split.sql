-- Splits cache_creation_input_tokens by TTL (5m vs 1h) so estimateCostUsd can
-- apply the correct write-premium multiplier per row once both TTLs are in use
-- (a single blended multiplier can't tell a 1.25x write from a 2x write apart).
alter table ai_usage_log
  add column cache_creation_5m_tokens int not null default 0,
  add column cache_creation_1h_tokens int not null default 0;
