-- Prompt-cache stats alongside the existing token counts, so the admin usage
-- view can show real evidence of cache savings (cache_read is billed at ~10%
-- of input price) rather than just trusting that caching is configured.
alter table ai_usage_log
  add column cache_creation_input_tokens int not null default 0,
  add column cache_read_input_tokens int not null default 0;
