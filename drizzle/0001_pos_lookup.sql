-- Expression index: keep json_extract as SQL, not quoted column names.
CREATE UNIQUE INDEX pos_receipt_token ON records (json_extract(data,'$.tokenHash'))
WHERE kind IN ('pos-pawn','pos-warranty') AND json_extract(data,'$.tokenHash') IS NOT NULL;
