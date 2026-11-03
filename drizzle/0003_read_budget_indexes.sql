-- Additive lookup/range indexes. Existing records and POS calculations are unchanged.
CREATE INDEX IF NOT EXISTS records_kind_created ON records(kind,created_at);
--> statement-breakpoint
-- Native widgets resolve one paired account; do not scan every customer's pairing.
CREATE INDEX IF NOT EXISTS holdings_widget_token ON records(json_extract(data,'$.tokenHash'))
WHERE kind='holdings-widget';
