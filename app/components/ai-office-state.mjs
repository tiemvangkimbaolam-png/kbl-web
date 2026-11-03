/* Public scene contract: no credentials, prompts, private customer data or lease tokens. */
const colors = { gemini: '#8bacff', chatgpt: '#7bdaba', claude: '#eeb88c', deepseek: '#8fc3ff', grok: '#c7d5df' };
const clean = (v, n = 100) => String(v || '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, n);
export function officeSnapshot(accounts = [], jobs = [], { now = Date.now(), enabled = false, fresh = true } = {}) {
    const bots = accounts.slice(0, 20).map(a => {
        const age = now - Number(a.lastSeen || 0), online = fresh && a.enabled !== false && age >= -5000 && age < 60000 && !['offline'].includes(a.status);
        const job = online ? jobs.filter(j => j.owner === a.id && ['leased', 'running', 'attention'].includes(j.status)).sort((a, b) => Number(b.updated_at) - Number(a.updated_at))[0] : null;
        const state = a.enabled === false ? 'offline' : !fresh ? 'unknown' : !online ? 'offline' : a.status === 'quota' ? 'quota' : ['challenge', 'attention'].includes(a.status) || job?.status === 'attention' ? 'error' : job ? job.stage === 'research' ? 'planning' : ['review', 'image-review'].includes(job.stage) ? 'reviewing' : 'working' : enabled && a.status === 'ready' ? 'ready' : 'waiting';
        return { connectionId: clean(a.id), name: clean(a.label || a.id), provider: clean(a.provider, 30), kind: 'account', color: colors[a.provider] || '#8695a4', connected: online, state, role: ['review', 'image-review'].includes(job?.stage) ? 'reviewer' : 'worker', roles: ['worker'], source: 'queue', jobs: job ? [{ id: clean(job.id), title: clean(job.stage, 40), state: 'working', source: 'queue' }] : [] };
    });
    for (let i = bots.length; i < 20; i++) bots.push({ connectionId: 'vacant-slot-' + (i + 1), name: 'Vị trí ' + String(i + 1).padStart(2, '0') + ' · chưa gắn', provider: '', kind: 'vacant', color: '#8695a4', connected: false, state: 'offline', role: 'unassigned', roles: [], jobs: [], source: 'slot' });
    return { schema: 1, source: 'live', generatedAt: new Date(now).toISOString(), bots };
}
