import { settings } from './store';
export type PublicationVariant='images'|'video';
// The operator connects accounts once; each platform gets the formats it can
// actually publish. Facebook/Instagram/Threads/Telegram post approved images
// first, then the rendered video after the configured gap.
export const PUBLICATION_FORMATS:Record<string,PublicationVariant[]>={facebook:['images','video'],instagram:['images','video'],threads:['images','video'],telegram:['images','video'],youtube:['video'],tiktok:['video'],zalo:['images']};
export const DEFAULT_PUBLICATION_SPACING_MINUTES=120;
export function spacingMinutes(value:any){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(1440,Math.round(n))):DEFAULT_PUBLICATION_SPACING_MINUTES;}
export async function publicationPlan(){
 const cfg=await settings(), map:Record<string,string>={};
 for(const [platform,id] of Object.entries(cfg.publicationConnections||{}))if(['facebook','instagram','threads','youtube','telegram','tiktok'].includes(platform)&&typeof id==='string'&&/^[a-f0-9]{32}$/.test(id))map[platform]=id;
 const platforms=Object.keys(map);
 return {platforms:['website',...platforms],publicationConnections:map,publicationFormats:Object.fromEntries(platforms.map(p=>[p,PUBLICATION_FORMATS[p]||['video']])),publicationSpacingMinutes:spacingMinutes(cfg.publicationSpacingMinutes)};
}
