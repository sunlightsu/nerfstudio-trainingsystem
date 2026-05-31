/* ── Nerfstudio GUI - Full JS ─────────────────── */
(() => {
/* ── Tab 切换 ─────────────────────────────────── */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById('panel-' + btn.dataset.tab);
    if (panel) panel.classList.add('active');
    if (btn.dataset.tab === 'step4') initBrowser();
  });
});

/* ── 可折叠 ──────────────────────────────────── */
document.querySelectorAll('.collapsible').forEach(l => {
  l.addEventListener('click', () => {
    const t = document.getElementById(l.dataset.target);
    t.classList.toggle('collapsed');
    l.textContent = l.textContent.replace('▾','▸').replace('▸',t.classList.contains('collapsed')?'▸':'▾');
  });
});

/* ── 步骤1: data_type / sfm 切换 ──────────────── */
document.querySelectorAll('input[name="data_type"]').forEach(r=>r.addEventListener('change',()=>{
  document.querySelectorAll('.video-only').forEach(e=>e.classList.toggle('hidden',r.value!=='video'));
}));
document.getElementById('proc-sfm').addEventListener('change',function(){
  document.querySelectorAll('.hloc-only').forEach(e=>e.classList.toggle('hidden',this.value!=='hloc'));
});

/* ── 步骤2: method 切换 ───────────────────────── */
const mSel=document.getElementById('train-method');
function applyMethodVisibility(){
  const gs=mSel.value.startsWith('splatfacto');
  document.querySelectorAll('.nerf-only,.gs-only').forEach(e=>{
    const isGs=e.classList.contains('gs-only');
    e.classList.toggle('hidden', gs ? !isGs : isGs);
  });
}
mSel.addEventListener('change',applyMethodVisibility);
applyMethodVisibility();

/* ── 步骤2: 显存预设 ──────────────────────────── */
const presets={nerfacto:{low:{train_num_rays_per_batch:1024,num_nerf_samples_per_ray:24,num_proposal_samples_per_ray:'96 48',max_res:512,log2_hashmap_size:16,num_levels:8,cache_images_type:'uint8',hidden_dim:32},mid:{train_num_rays_per_batch:2048,num_nerf_samples_per_ray:32,num_proposal_samples_per_ray:'192 64',max_res:1024,log2_hashmap_size:17,num_levels:10,cache_images_type:'uint8'},high:{}},splatfacto:{low:{sh_degree:1,cull_alpha_thresh:0.2,ssim_lambda:0.1},mid:{sh_degree:2,cull_alpha_thresh:0.1,ssim_lambda:0.2},high:{sh_degree:3}}};
document.querySelectorAll('.preset').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.preset').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  const method=mSel.value.split('-')[0];const vals=(presets[method]||presets.nerfacto)[b.dataset.preset]||{};
  Object.entries(vals).forEach(([k,v])=>{const e=document.querySelector(`[name="${k}"]`);if(e){if(e.tagName==='SELECT')e.value=v;else e.value=v;}});
}));

/* ── 步骤3: export_method 切换 ────────────────── */
const exSel=document.getElementById('export-method');
const exGroups={poisson:'export-params-poisson',tsdf:'export-params-tsdf',pointcloud:'export-params-pointcloud','marching-cubes':'export-params-mc','gaussian-splat':'export-params-gs'};
exSel.addEventListener('change',()=>{document.querySelectorAll('.export-params').forEach(e=>e.classList.add('hidden'));const t=exGroups[exSel.value];if(t)document.getElementById(t).classList.remove('hidden');});
exSel.dispatchEvent(new Event('change'));

/* ── 路径书签系统 ─────────────────────────────── */
let savedPaths=[];
async function loadPaths(){try{const r=await fetch('/api/paths');const d=await r.json();savedPaths=d.paths||[];}catch(e){}}
async function savePath(p){await fetch('/api/paths',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:p})});}
async function delPath(p){await fetch('/api/paths',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:p})});}
loadPaths();

function attachBookmark(inputEl){
  const wrapper=document.createElement('span');wrapper.className='path-row';wrapper.style.display='flex';wrapper.style.flex='1';
  inputEl.parentNode.insertBefore(wrapper,inputEl);wrapper.appendChild(inputEl);
  const btn=document.createElement('button');btn.className='btn-bookmark';btn.textContent='📌';btn.title='快速选择路径';wrapper.appendChild(btn);
  const dd=document.createElement('div');dd.className='path-dropdown';wrapper.appendChild(dd);wrapper.style.position='relative';
  btn.addEventListener('click',async(e)=>{e.preventDefault();e.stopPropagation();
    if(dd.classList.contains('show')){dd.classList.remove('show');return;}
    dd.innerHTML='';savedPaths.forEach(p=>{const d=document.createElement('div');d.textContent=p;d.addEventListener('click',()=>{inputEl.value=p;dd.classList.remove('show');});dd.appendChild(d);});
    dd.classList.add('show');
    if(!savedPaths.length){const d=document.createElement('div');d.textContent='(暂无书签，在📁浏览页面添加)';d.style.color='#666';dd.appendChild(d);}
  });
  document.addEventListener('click',(e)=>{if(!wrapper.contains(e.target))dd.classList.remove('show');});
}
document.querySelectorAll('input[name="data"],input[name="output_dir"],input[name="load_config"]').forEach(attachBookmark);

/* ── 文件浏览器 (Step 4) ──────────────────────── */
let browserInit=false;
function initBrowser(){if(browserInit)return;browserInit=true;
  const inp=document.getElementById('browse-path');const list=document.getElementById('browse-list');const bc=document.getElementById('browse-breadcrumb');
  async function browse(p){try{const r=await fetch('/api/browse?path='+encodeURIComponent(p));if(!r.ok){appendTerm('浏览失败: '+r.status+'\n','err-line');return;}const d=await r.json();if(d.error){appendTerm(d.error+'\n','err-line');return;}inp.value=d.current||p;renderBreadcrumb(d.current);renderList(d.folders,d.current);}catch(e){appendTerm('浏览错误: '+e.message+'\n','err-line');}}
  function renderBreadcrumb(current){if(!current)return;const parts=current.split('\\').filter(Boolean);let acc='';let html='';parts.forEach((p,i)=>{acc+=(i===0?p:'\\'+p);html+=`<a data-path="${acc}">${p}</a> ${i<parts.length-1?'\\ ':''}`;});bc.innerHTML=html;bc.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>browse(a.dataset.path)));}
  function renderList(folders,current){list.innerHTML=''; folders.forEach(f=>{const div=document.createElement('div');div.className='browse-item';
    div.innerHTML=`<span class="folder-icon">📁</span><span class="item-name">${f.name}</span>`;
    const bm=document.createElement('button');bm.className='btn-bookmark-item';bm.textContent='📌';bm.title='添加到书签';
    bm.addEventListener('click',async(e)=>{e.stopPropagation();await savePath(f.path);savedPaths.push(f.path);bm.textContent='✓';setTimeout(()=>bm.textContent='📌',1500);});
    div.appendChild(bm);
    div.addEventListener('click',()=>browse(f.path));list.appendChild(div);});
    document.getElementById('btn-save-browse-path').onclick=async()=>{await savePath(current);savedPaths.push(current);};
  }
  document.getElementById('btn-browse-go').addEventListener('click',()=>browse(inp.value));
  browse('C:\\');

  // 书签管理列表
  const bml=document.getElementById('bookmark-list');
  function renderBookmarks(){
    bml.innerHTML='';
    savedPaths.forEach((p,i)=>{
      const row=document.createElement('div');row.className='bookmark-row';
      const span=document.createElement('span');span.className='bm-path';span.textContent=p;
      span.addEventListener('click',()=>browse(p));
      const del=document.createElement('button');del.className='bm-del';del.textContent='✕';
      del.addEventListener('click',async()=>{await delPath(p);savedPaths.splice(i,1);renderBookmarks();});
      row.appendChild(span);row.appendChild(del);
      bml.appendChild(row);
    });
    if(!savedPaths.length){bml.innerHTML='<div style="color:#666;font-size:0.73rem;padding:4px">暂无书签</div>';}
  }
  const origSave=document.getElementById('btn-save-browse-path');
  origSave.addEventListener('click',async()=>{
    const cur=inp.value;
    await savePath(cur);
    if(!savedPaths.includes(cur))savedPaths.push(cur);
    renderBookmarks();
  });
  // override initBrowser to call renderBookmarks
  const origBrowse=window._browseFn;
  document.getElementById('browse-path').addEventListener('keydown',e=>{if(e.key==='Enter')browse(inp.value);});
  // render bookmarks on init
  setTimeout(renderBookmarks,200);
}

/* ── 终端 (RAF 批量缓冲，解决训练卡死) ────────── */
const termOut=document.getElementById('terminal-output'),termStat=document.getElementById('terminal-status');
let lastCmd='',lineBuf=[],rafId=null;
function flushBuf(){if(!lineBuf.length)return;termOut.appendChild(document.createTextNode(lineBuf.join('')));lineBuf=[];termOut.scrollTop=termOut.scrollHeight;}
function appendTerm(text,cls){if(cls){const s=document.createElement('span');s.className=cls;s.textContent=text;termOut.appendChild(s);}else{lineBuf.push(text);if(!rafId)rafId=requestAnimationFrame(()=>{rafId=null;flushBuf();});}}
function setStat(s,t){termStat.className='terminal-status '+s;termStat.textContent=t;}
document.getElementById('btn-clear-term').addEventListener('click',()=>{termOut.innerHTML='';lastCmd='';setStat('idle','就绪');});
document.getElementById('btn-copy-cmd').addEventListener('click',()=>{if(lastCmd)navigator.clipboard.writeText(lastCmd);});

async function runCmd(endpoint,data){document.querySelectorAll('.btn-run').forEach(b=>b.disabled=true);termOut.innerHTML='';lastCmd='';setStat('running','执行中...');
  try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok){appendTerm('HTTP '+r.status+'\n','err-line');setStat('error','请求失败');return;}
    const reader=r.body.getReader(),dec=new TextDecoder();let buf='';
    while(true){const{done,value}=await reader.read();if(done){flushBuf();break;}buf+=dec.decode(value,{stream:true});const lines=buf.split('\n');buf=lines.pop();
      for(const l of lines){if(l.startsWith('__CMD__:')){lastCmd=l.slice(8);appendTerm('$ '+lastCmd+'\n','cmd-line');}else if(l.startsWith('__EXIT_CODE__:')){const c=parseInt(l.slice(14));if(c===0){appendTerm('\n── 完成 (exit 0) ──\n','info-line');setStat('done','完成 ✓');}else{appendTerm('\n── 失败 (exit '+c+') ──\n','err-line');setStat('error','失败');}}else{appendTerm(l+'\n');}}}
    flushBuf();
  }catch(e){appendTerm('Error: '+e.message+'\n','err-line');setStat('error','连接错误');flushBuf();}
  finally{document.querySelectorAll('.btn-run').forEach(b=>b.disabled=false);}
}

function collectForm(form){const fd=new FormData(form);const data={};for(const[k,v]of fd.entries()){if(v==='true')data[k]=true;else if(v==='false')data[k]=false;else if(v===''||v===null){}else if(!isNaN(v)&&v.trim()!=='')data[k]=v.includes('.')?parseFloat(v):parseInt(v);else data[k]=v;}form.querySelectorAll('input[type="checkbox"]').forEach(cb=>{if(!fd.has(cb.name))data[cb.name]=false;});return data;}

document.getElementById('form-step1').addEventListener('submit',e=>{e.preventDefault();const d=collectForm(e.target);d.data_type=document.querySelector('input[name="data_type"]:checked').value;runCmd('/api/process',d);});
document.getElementById('form-step2').addEventListener('submit',e=>{e.preventDefault();runCmd('/api/train',collectForm(e.target));});
document.getElementById('form-step3').addEventListener('submit',e=>{e.preventDefault();runCmd('/api/export',collectForm(e.target));});
})();
