-- Prevents two overlapping runChatTurn calls for the same contract (e.g. a
-- double-submitted request, two open tabs, or a client retry racing an
-- in-flight call) from both reading stale state and writing interleaved,
-- duplicated section content. See lib/ai/chatEngine.ts.
alter table contracts add column active_turn_started_at timestamptz;
