import { settings } from './store';
export async function publicationPlan(){
 const cfg=await settings(), map:Record<string,string>={};
 for(const [platform,id] of Object.entries(cfg.publicationConnections||{}))if(['facebook','instagram','threads','youtube','telegram','tiktok','zalo'].includes(platform)&&typeof id==='string'&&/^[a-f0-9]{32}$/.test(id))map[platform]=id;
 return {platforms:['website',...Object.keys(map)],publicationConnections:map};
}
