
      (()=>{
        const salesRoot=document.getElementById('sales-studio-section');
        if(salesRoot){
          const buttons=[...salesRoot.querySelectorAll('[data-sales-studio-tab]')];
          const panels=[...salesRoot.querySelectorAll('[data-sales-studio-panel]')];
          const open=name=>{
            buttons.forEach(b=>b.classList.toggle('active',b.dataset.salesStudioTab===name));
            panels.forEach(p=>p.classList.toggle('active',p.dataset.salesStudioPanel===name));
            try{localStorage.setItem('kbl_sales_studio_tab',name)}catch(_){ }
          };
          const loadImagePipeline=()=>{if(typeof loadGrowthAutopilot!=='function')return;const token=document.getElementById('token')?.value.trim()||'';if(!token)return;window.setTimeout(()=>loadGrowthAutopilot(),0)};
          buttons.forEach(b=>b.addEventListener('click',()=>{open(b.dataset.salesStudioTab);if(b.dataset.salesStudioTab==='image')loadImagePipeline()}));
          let saved='video';
          try{saved=localStorage.getItem('kbl_sales_studio_tab')||'video'}catch(_){ }
          if(!buttons.some(b=>b.dataset.salesStudioTab===saved))saved='video';
          open(saved);
          if(saved==='image')loadImagePipeline();
          window.KBLSalesStudioImageBoot=loadImagePipeline;
        }
        const mount=document.getElementById('sales-studio-image-workflow-mount');
        const card=document.getElementById('growth-autopilot-card');
        if(mount&&card&&card.parentElement!==mount){
          mount.replaceChildren(card);
          const title=card.querySelector('h3');
          if(title)title.textContent='🖼️ Sales Studio · Hình ảnh & nội dung tự động';
          const kicker=card.querySelector('.cc-kicker');
          if(kicker)kicker.textContent='SALES STUDIO · HÌNH ẢNH & NỘI DUNG · SALES STUDIO IMAGE PIPELINE V1.3.1 · 3 ẢNH / BÀI · Ý TƯỞNG REVIEW → IMAGE REVIEW → READY → PUBLISH';
          const desc=card.querySelector('p.muted');
          if(desc)desc.innerHTML='Luồng này chuyên cho bài hình ảnh: quét cơ hội 2–3 SKU → AI duyệt ý tưởng → tạo trước 3 ảnh → AI Art Director duyệt → QA facts/QR/media → chuyển <b>READY TO POST</b> → đến giờ tự đăng. Ông chủ chỉ cần vào xem tiến trình và kết quả.';
        }
      })();
      