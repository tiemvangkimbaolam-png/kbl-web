import * as S from './store';
// Range deletion probes the primary key instead of rescanning 2,000 retained logs.
export async function pruneEvents(){
 return S.sql().prepare('DELETE FROM events WHERE id < (SELECT id FROM events ORDER BY id DESC LIMIT 1 OFFSET 1999)').run();
}
export async function pruneCounters(at=Date.now()){
 await S.sql().prepare("DELETE FROM records WHERE kind IN ('rate','customer-rate') AND created_at<?").bind(at-86400000).run();
 await S.sql().prepare("DELETE FROM records WHERE kind='traffic' AND created_at<?").bind(at-60*86400000).run();
 await S.sql().prepare("DELETE FROM records WHERE kind='command' AND updated_at<? AND json_extract(data,'$.status') IN ('done','failed')").bind(at-7*86400000).run();
 await pruneEvents();
}
