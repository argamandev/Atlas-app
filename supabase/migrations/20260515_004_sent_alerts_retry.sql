ALTER TABLE sent_alerts ADD COLUMN IF NOT EXISTS failure_count int default 0;
ALTER TABLE sent_alerts ADD COLUMN IF NOT EXISTS error_message text;
