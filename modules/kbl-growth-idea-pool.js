'use strict';

// Reuse Video Studio's saved product ideas as themes for the image pipeline.
// Text that may refer to a video's exact pair, price or timing stays in Video Studio.
function candidates(state, eligible, excluded=new Set()) {
  const catalog=new Map((eligible||[]).map(p=>[String(p.sku||'').toUpperCase(),p]));
  const rows=[];
  for(const record of (state?.records||[]).slice(0,120)) {
    const op=record?.opportunity;
    if(!op||!['product','comparison'].includes(op.type))continue;
    const linked=[...new Set((op.skus||[]).map(s=>String(s).toUpperCase()))].map(s=>catalog.get(s));
    if(!linked.length||linked.some(p=>!p))continue;
    const ideas=Array.isArray(record.ideas)?record.ideas:[];
    for(const row of ideas) {
      if(!row?.id||!row?.title||!row?.hook||row.repetition?.blocked)continue;
      const id='VIDEO-POST-'+record.id+'-'+row.id;
      if(excluded.has(id))continue;
      const names=linked.map(p=>String(p.name||p.sku).slice(0,70));
      const theme=op.type==='comparison'?'so sánh các mẫu trang sức':'khám phá các mẫu trang sức';
      const angle=String(row.angle||row.pattern||'').replace(/[\d.,]+\s*(?:đ|vnd|triệu|nghìn)/gi,'').slice(0,45);
      rows.push({id,source:'Video Studio',sourceRecordId:record.id,sourceIdeaId:row.id,
        safeFromCatalog:true,productIds:linked.map(p=>String(p.id)),score:row.recommended?86:82,
        title:(angle?angle+' · ':'')+(op.type==='comparison'?'Chọn mẫu nào hợp bạn?':'Gợi ý phối trang sức'),
        hook:op.type==='comparison'?'Cùng xem các mẫu '+names.join(' và ')+' để chọn kiểu hợp nhu cầu.':'Cùng xem '+names.join(' và ')+' trong bộ sưu tập Kim Bảo Lâm.',
        concept:'Góc '+theme+' từ Video Studio. Bài ảnh giới thiệu ba sản phẩm có thật; sản phẩm bổ sung do hệ thống đối chiếu từ kho.',
        targetAudience:'Khách đang tham khảo trang sức',cta:'Gửi Mã SP để hỏi mẫu và giá hiện tại.',riskNotes:[]});
    }
  }
  return rows;
}
module.exports={candidates};
