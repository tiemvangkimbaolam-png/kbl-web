import {sql} from './store';
export const UNFINISHED_STORY_WHERE = "s.kind='story' AND (json_extract(s.data,'$.status') IN ('working','waiting-revision') OR (json_extract(s.data,'$.status')='published' AND EXISTS(SELECT 1 FROM jobs j WHERE j.story_id=s.id AND j.stage='publish' AND j.status<>'complete')))";

// A website receipt alone does not release a story while its selected social
// formats still await receipts. Existing leases and frozen quotes stay intact.
export async function oldestUnfinishedStoryId(lane?: 'gold' | 'product' | 'editorial') {
    const scope = lane === 'gold' || lane === 'product' ? " AND json_extract(s.data,'$.kind')='"+lane+"'" : lane === 'editorial' ? " AND COALESCE(json_extract(s.data,'$.kind'),'news') NOT IN ('gold','product')" : '';
    const row = await sql().prepare('SELECT s.id FROM records s WHERE '+UNFINISHED_STORY_WHERE+scope+' ORDER BY s.created_at,s.id LIMIT 1').first<any>();
    return row?.id || null;
}
export async function unfinishedPublicationHeads() {
    return (await Promise.all([oldestUnfinishedStoryId('gold'),oldestUnfinishedStoryId('product'),oldestUnfinishedStoryId('editorial')])).filter((id): id is string => !!id);
}
