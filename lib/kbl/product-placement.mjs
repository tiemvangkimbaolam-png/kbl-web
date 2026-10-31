export const DISPLAY_SECTIONS=Object.freeze([['featured','Nổi bật'],['ring','Nhẫn'],['necklace','Dây'],['pendant','Mặt dây'],['earring','Bông tai'],['bracelet','Lắc tay'],['bangle','Vòng'],['gold-group','Sản phẩm 999.9 / 980']]);
export function productSections(p){return [...new Set(Array.isArray(p?.displaySections)?p.displaySections.filter(x=>DISPLAY_SECTIONS.some(([id])=>id===x)):[])];}
export function inProductSection(p,section){const sections=productSections(p);return p.published&&p.available&&(section==='all'?sections.length>0:sections.includes(section));}
