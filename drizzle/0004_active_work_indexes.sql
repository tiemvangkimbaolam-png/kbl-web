-- Persist only the transition receipt identity, never modify POS/customer data.
ALTER TABLE jobs ADD COLUMN transitioned_result TEXT;
--> statement-breakpoint
UPDATE jobs SET transitioned_result=attempt||':'||COALESCE(result_hash,'')
WHERE status='complete' AND EXISTS(SELECT 1 FROM records WHERE kind='job-transition' AND records.id=jobs.id||':'||jobs.attempt||':'||COALESCE(jobs.result_hash,''));
--> statement-breakpoint
CREATE INDEX jobs_needing_transition ON jobs(updated_at)
WHERE status='complete' AND stage<>'publish' AND (transitioned_result IS NULL OR transitioned_result<>attempt||':'||COALESCE(result_hash,''));
--> statement-breakpoint
CREATE INDEX jobs_created ON jobs(created_at DESC);
--> statement-breakpoint
CREATE INDEX receipts_at ON receipts(at DESC);
--> statement-breakpoint
CREATE INDEX editions_created ON editions(created_at DESC);
--> statement-breakpoint
CREATE INDEX push_rule_status ON records(json_extract(data,'$.status'),updated_at) WHERE kind='customer-price-alert';
--> statement-breakpoint
CREATE INDEX push_job_status ON records(json_extract(data,'$.status'),created_at) WHERE kind='customer-push-job';
--> statement-breakpoint
CREATE INDEX inbox_status ON records(json_extract(data,'$.status'),created_at) WHERE kind='inbox-message';
--> statement-breakpoint
CREATE INDEX consultation_status ON records(json_extract(data,'$.status'),created_at) WHERE kind='consultation';
--> statement-breakpoint
CREATE INDEX feedback_status ON records(json_extract(data,'$.status'),created_at) WHERE kind='feedback';
--> statement-breakpoint
CREATE INDEX story_status ON records(json_extract(data,'$.status'),created_at) WHERE kind='story';
--> statement-breakpoint
CREATE INDEX tryon_status ON records(json_extract(data,'$.status'),created_at) WHERE kind='customer-tryon';
--> statement-breakpoint
CREATE INDEX jobs_active_created ON jobs(created_at) WHERE status IN ('queued','leased','running','attention','blocked','waiting-revision');
--> statement-breakpoint
CREATE INDEX jobs_queue_order ON jobs(CASE WHEN status IN ('complete','canceled') THEN 1 ELSE 0 END,created_at);
--> statement-breakpoint
CREATE INDEX command_pending ON records(json_extract(data,'$.workerId'),updated_at) WHERE kind='command' AND json_extract(data,'$.status')='pending';
