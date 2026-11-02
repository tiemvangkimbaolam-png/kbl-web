// Owner-requested routing preferences, not a claim about benchmark performance.
// All existing role permissions remain intact; a ready fallback can work when
// preferred providers are offline, unpaired, disabled, excluded or already busy.
export const SPECIALISTS = Object.freeze({
    research: ['deepseek', 'grok', 'chatgpt', 'gemini'],
    write: ['deepseek', 'claude', 'chatgpt', 'gemini', 'grok'],
    review: ['claude', 'deepseek', 'chatgpt', 'gemini', 'grok'],
    image: ['gemini', 'chatgpt'],
    'image-review': ['claude', 'chatgpt', 'gemini'],
});
export function preferredSpecialist(accounts, stage, { at = Date.now(), exclude = null, busy = [] } = {}) {
    const priority = SPECIALISTS[stage];
    if (!priority) return null;
    const held = new Set(busy);
    const ready = accounts.filter(a => a.enabled !== false && a.paired === true && a.status === 'ready' && a.roles?.includes(stage) && a.id !== exclude && !held.has(a.id) && Number.isFinite(a.lastSeen) && at - a.lastSeen >= -60000 && at - a.lastSeen <= 90000 && priority.includes(a.provider));
    ready.sort((a, b) => priority.indexOf(a.provider) - priority.indexOf(b.provider) || a.id.localeCompare(b.id));
    return ready[0]?.id || null;
}
