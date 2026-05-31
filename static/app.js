/* ── Nerfstudio GUI ──────────────────────────── */
(() => {

// ================================================================
//  工具函数
// ================================================================
var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
var $$ = function (sel, ctx) { return (ctx || document).querySelectorAll(sel); };
var forEach = function (sel, fn, ctx) { (ctx || document).querySelectorAll(sel).forEach(fn); };
var setVisible = function (sel, show, ctx) {
  forEach(sel, function (e) { e.classList.toggle('hidden', !show); }, ctx);
};

// ================================================================
//  Tab 切换
// ================================================================
forEach('.tab', function (btn) {
  btn.addEventListener('click', function () {
    forEach('.tab', function (b) { b.classList.remove('active'); });
    forEach('.panel', function (p) { p.classList.remove('active'); });
    btn.classList.add('active');
    var panel = document.getElementById('panel-' + btn.dataset.tab);
    if (panel) panel.classList.add('active');
    if (btn.dataset.tab === 'step4') initBrowser();
  });
});

// ================================================================
//  可折叠区域
// ================================================================
forEach('.collapsible', function (leg) {
  leg.addEventListener('click', function () {
    var target = document.getElementById(leg.dataset.target);
    target.classList.toggle('collapsed');
    var isCollapsed = target.classList.contains('collapsed');
    leg.textContent = leg.textContent
      .replace('▾', '▸')
      .replace('▸', isCollapsed ? '▸' : '▾');
  });
});

// ================================================================
//  步骤1 — 数据源类型 / SfM 工具切换
// ================================================================
forEach('input[name="data_type"]', function (r) {
  r.addEventListener('change', function () { setVisible('.video-only', r.value === 'video'); });
});

$('#proc-sfm').addEventListener('change', function () { setVisible('.hloc-only', this.value === 'hloc'); });

// ================================================================
//  步骤2 — 训练方法切换 (nerfacto ↔ splatfacto)
// ================================================================
var mSel = document.getElementById('train-method');

function applyMethodVisibility() {
  var isGS = mSel.value.startsWith('splatfacto');
  forEach('.nerf-only', function (e) { e.classList.toggle('hidden', isGS); });
  forEach('.gs-only', function (e) { e.classList.toggle('hidden', !isGS); });
  // 更新背景色/相机优化的默认值提示 & 选项过滤
  forEach('[data-default-nerfacto]', function (el) {
    var def = isGS ? el.dataset.defaultSplatfacto : el.dataset.defaultNerfacto;
    el.options[0].textContent = '默认 ' + def;
  });
  // splatfacto 的 background-color 不支持 last_sample 和 white
  forEach('#train-bg option', function (opt) {
    if (opt.value === '') return; // 跳过"默认"占位
    if (opt.dataset.both) { opt.style.display = ''; return; }
    opt.style.display = isGS ? 'none' : '';
    // 如果当前选中的选项被隐藏，切换到 random
    if (isGS && opt.selected) { $('#train-bg').value = 'random'; }
  });
}
mSel.addEventListener('change', applyMethodVisibility);
applyMethodVisibility();

// ================================================================
//  步骤2 — 显存预设 (区分 nerfacto / splatfacto)
// ================================================================
var presets = {
  nerfacto: {
    low: { train_num_rays_per_batch: 1024, num_nerf_samples_per_ray: 24, num_proposal_samples_per_ray: '96 48', max_res: 512, log2_hashmap_size: 16, num_levels: 8, cache_images_type: 'uint8', hidden_dim: 32 },
    mid: { train_num_rays_per_batch: 2048, num_nerf_samples_per_ray: 32, num_proposal_samples_per_ray: '192 64', max_res: 1024, log2_hashmap_size: 17, num_levels: 10, cache_images_type: 'uint8' },
    high: {}
  },
  splatfacto: {
    low: { sh_degree: 1, cull_alpha_thresh: 0.2, ssim_lambda: 0.1 },
    mid: { sh_degree: 2, cull_alpha_thresh: 0.1, ssim_lambda: 0.2 },
    high: { sh_degree: 3 }
  }
};

forEach('.preset', function (b) {
  b.addEventListener('click', function () {
    forEach('.preset', function (x) { x.classList.remove('active'); });
    b.classList.add('active');

    var method = mSel.value.split('-')[0];
    var methodPresets = presets[method] || presets.nerfacto;
    var vals = methodPresets[b.dataset.preset] || {};

    Object.entries(vals).forEach(function (entry) {
      var el = $('[name="' + entry[0] + '"]');
      if (el) el.value = entry[1];
    });
  });
});

// ================================================================
//  步骤3 — 导出方式切换
// ================================================================
var exSel = document.getElementById('export-method');
var exGroups = {
  poisson: 'export-params-poisson',
  tsdf: 'export-params-tsdf',
  pointcloud: 'export-params-pointcloud',
  'marching-cubes': 'export-params-mc',
  'gaussian-splat': 'export-params-gs'
};

exSel.addEventListener('change', function () {
  forEach('.export-params', function (e) { e.classList.add('hidden'); });
  var v = exSel.value;
  var targetId = exGroups[v];
  if (targetId && $('#' + targetId)) $('#' + targetId).classList.remove('hidden');
  // poisson / pointcloud 共用点云采样参数
  if (v === 'poisson' || v === 'pointcloud') {
    $('#export-params-pc-shared').classList.remove('hidden');
  }
});
exSel.dispatchEvent(new Event('change'));

// ================================================================
//  路径书签系统
// ================================================================
var savedPaths = [];

async function loadPaths() {
  try { var r = await fetch('/api/paths'); var d = await r.json(); savedPaths = d.paths || []; } catch (e) {}
}
async function savePath(p) {
  await fetch('/api/paths', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) });
}
async function delPath(p) {
  await fetch('/api/paths', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) });
}
loadPaths();

function attachBookmark(inputEl) {
  var wrapper = document.createElement('span');
  wrapper.className = 'path-row';
  wrapper.style.display = 'flex'; wrapper.style.flex = '1'; wrapper.style.position = 'relative';
  inputEl.parentNode.insertBefore(wrapper, inputEl);
  wrapper.appendChild(inputEl);

  var btn = document.createElement('button');
  btn.className = 'btn-bookmark'; btn.textContent = '📌'; btn.title = '快速选择已保存路径';
  wrapper.appendChild(btn);

  var dd = document.createElement('div');
  dd.className = 'path-dropdown';
  wrapper.appendChild(dd);

  btn.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    if (dd.classList.contains('show')) { dd.classList.remove('show'); return; }
    dd.innerHTML = '';
    savedPaths.forEach(function (p) {
      var row = document.createElement('div');
      row.textContent = p;
      row.addEventListener('click', function () { inputEl.value = p; dd.classList.remove('show'); });
      dd.appendChild(row);
    });
    dd.classList.add('show');
    if (!savedPaths.length) {
      var empty = document.createElement('div');
      empty.textContent = '(暂无书签，在浏览页添加)'; empty.style.color = '#666';
      dd.appendChild(empty);
    }
  });
  document.addEventListener('click', function (e) { if (!wrapper.contains(e.target)) dd.classList.remove('show'); });
}

forEach('input[name="data"],input[name="output_dir"],input[name="load_config"]', attachBookmark);

// ================================================================
//  步骤4 — 文件浏览器
// ================================================================
var browserInit = false;
var _browseInp, _browseList, _browseBc, _browseBml;

async function browseDir(p) {
  try {
    var r = await fetch('/api/browse?path=' + encodeURIComponent(p));
    if (!r.ok) { appendTerm('浏览失败: ' + r.status + '\n', 'err-line'); return; }
    var d = await r.json();
    if (d.error) { appendTerm(d.error + '\n', 'err-line'); return; }
    _browseInp.value = d.current || p;
    _renderBreadcrumb(d.current);
    _renderList(d.folders, d.current);
  } catch (e) { appendTerm('浏览错误: ' + e.message + '\n', 'err-line'); }
}

function _renderBreadcrumb(current) {
  if (!current) return;
  var parts = current.split('\\').filter(Boolean);
  var acc = '', html = '';
  parts.forEach(function (p, i) {
    acc += (i === 0 ? p : '\\' + p);
    html += '<a data-path="' + acc + '">' + p + '</a>';
    if (i < parts.length - 1) html += ' \\ ';
  });
  _browseBc.innerHTML = html;
  forEach('a', function (a) { a.addEventListener('click', function () { browseDir(a.dataset.path); }); }, _browseBc);
}

function _renderList(folders, current) {
  _browseList.innerHTML = '';
  folders.forEach(function (f) {
    var div = document.createElement('div');
    div.className = 'browse-item';
    div.innerHTML = '<span class="folder-icon">📁</span><span class="item-name">' + f.name + '</span>';

    var bm = document.createElement('button');
    bm.className = 'btn-bookmark-item'; bm.textContent = '📌'; bm.title = '添加到书签';
    bm.addEventListener('click', async function (e) {
      e.stopPropagation();
      await savePath(f.path);
      savedPaths.push(f.path);
      bm.textContent = '✓';
      _renderBookmarks();
      setTimeout(function () { bm.textContent = '📌'; }, 1500);
    });
    div.appendChild(bm);
    div.addEventListener('click', function () { browseDir(f.path); });
    _browseList.appendChild(div);
  });

  $('#btn-save-browse-path').onclick = async function () { await savePath(current); savedPaths.push(current); _renderBookmarks(); };
}

function _renderBookmarks() {
  _browseBml.innerHTML = '';
  savedPaths.forEach(function (p, i) {
    var row = document.createElement('div');
    row.className = 'bookmark-row';

    var span = document.createElement('span');
    span.className = 'bm-path'; span.textContent = p;
    span.addEventListener('click', function () { browseDir(p); });

    var del = document.createElement('button');
    del.className = 'bm-del'; del.textContent = '✕'; del.title = '删除此书签';
    del.addEventListener('click', async function () {
      await delPath(p); savedPaths.splice(i, 1); _renderBookmarks();
    });

    row.appendChild(span); row.appendChild(del); _browseBml.appendChild(row);
  });

  if (!savedPaths.length) {
    _browseBml.innerHTML = '<div style="color:#666;font-size:0.73rem;padding:4px">暂无书签</div>';
  }
}

function initBrowser() {
  if (browserInit) return;
  browserInit = true;
  _browseInp = $('#browse-path'); _browseList = $('#browse-list');
  _browseBc = $('#browse-breadcrumb'); _browseBml = $('#bookmark-list');

  $('#btn-browse-go').addEventListener('click', function () { browseDir(_browseInp.value); });
  _browseInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') browseDir(_browseInp.value); });

  browseDir('C:\\');
  setTimeout(_renderBookmarks, 200);
}

// ================================================================
//  终端输出 — RAF 批量缓冲
// ================================================================
var termOut = document.getElementById('terminal-output');
var termStat = document.getElementById('terminal-status');
var lastCmd = '';
var lineBuf = [];
var rafId = null;

function flushBuf() {
  if (!lineBuf.length) return;
  termOut.appendChild(document.createTextNode(lineBuf.join('')));
  lineBuf = [];
  termOut.scrollTop = termOut.scrollHeight;
}

function appendTerm(text, cls) {
  if (cls) {
    var span = document.createElement('span');
    span.className = cls; span.textContent = text;
    termOut.appendChild(span);
  } else {
    lineBuf.push(text);
    if (!rafId) rafId = requestAnimationFrame(function () { rafId = null; flushBuf(); });
  }
}

function setStat(state, text) {
  termStat.className = 'terminal-status ' + state;
  termStat.textContent = text;
}

$('#btn-clear-term').addEventListener('click', function () {
  termOut.innerHTML = ''; lastCmd = ''; setStat('idle', '就绪');
});
$('#btn-copy-cmd').addEventListener('click', function () {
  if (lastCmd) navigator.clipboard.writeText(lastCmd);
});

// ================================================================
//  SSE 通信
// ================================================================
async function runCmd(endpoint, data) {
  forEach('.btn-run', function (b) { b.disabled = true; });
  termOut.innerHTML = ''; lastCmd = ''; setStat('running', '执行中...');

  try {
    var r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!r.ok) { appendTerm('HTTP ' + r.status + '\n', 'err-line'); setStat('error', '请求失败'); return; }

    var reader = r.body.getReader();
    var dec = new TextDecoder();
    var buf = '';

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) { flushBuf(); break; }
      buf += dec.decode(chunk.value, { stream: true });

      var lines = buf.split('\n');
      buf = lines.pop();

      for (var i = 0; i < lines.length; i++) {
        var l = lines[i];
        if (l.startsWith('__CMD__:')) {
          lastCmd = l.slice(8);
          appendTerm('$ ' + lastCmd + '\n', 'cmd-line');
        } else if (l.startsWith('__EXIT_CODE__:')) {
          var code = parseInt(l.slice(14));
          if (code === 0) { appendTerm('\n── 完成 (exit 0) ──\n', 'info-line'); setStat('done', '完成'); }
          else { appendTerm('\n── 失败 (exit ' + code + ') ──\n', 'err-line'); setStat('error', '失败'); }
        } else {
          appendTerm(l + '\n');
        }
      }
    }
  } catch (e) {
    appendTerm('Error: ' + e.message + '\n', 'err-line'); setStat('error', '连接错误'); flushBuf();
  } finally {
    forEach('.btn-run', function (b) { b.disabled = false; });
  }
}

// ================================================================
//  表单数据收集
// ================================================================
function collectForm(form) {
  var fd = new FormData(form);
  var data = {};

  fd.forEach(function (v, k) {
    if (v === 'true') data[k] = true;
    else if (v === 'false') data[k] = false;
    else if (v === '' || v === null) { /* skip */ }
    else if (!isNaN(v) && v.trim() !== '') data[k] = v.includes('.') ? parseFloat(v) : parseInt(v);
    else data[k] = v;
  });

  forEach('input[type="checkbox"]', function (cb) { if (!fd.has(cb.name)) data[cb.name] = false; }, form);
  return data;
}

// ================================================================
//  表单提交
// ================================================================
$('#form-step1').addEventListener('submit', function (e) {
  e.preventDefault();
  var d = collectForm(e.target);
  d.data_type = $('input[name="data_type"]:checked').value;
  runCmd('/api/process', d);
});

$('#form-step2').addEventListener('submit', function (e) {
  e.preventDefault();
  runCmd('/api/train', collectForm(e.target));
});

$('#form-step3').addEventListener('submit', function (e) {
  e.preventDefault();
  runCmd('/api/export', collectForm(e.target));
});

// ================================================================
//  命令预览
// ================================================================
var cmdPreview = document.getElementById('cmd-preview');
var previewTimer = null;

function getPreviewType() {
  var ap = $('.panel.active');
  if (!ap) return 'train';
  if (ap.id === 'panel-step1') return 'process';
  if (ap.id === 'panel-step2') return 'train';
  if (ap.id === 'panel-step3') return 'export';
  return 'train';
}

async function updatePreview() {
  var ptype = getPreviewType();
  var form = $('.panel.active form');
  if (!form) return;

  var data = collectForm(form);
  data._type = ptype;
  if (ptype === 'process') data.data_type = $('input[name="data_type"]:checked').value;

  try {
    var r = await fetch('/api/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (r.ok) { var d = await r.json(); cmdPreview.value = d.cmd || ''; }
  } catch (e) {}
}

function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 250); }

forEach('.panel form', function (form) {
  form.addEventListener('input', schedulePreview);
  form.addEventListener('change', schedulePreview);
});
forEach('.tab', function (btn) { btn.addEventListener('click', function () { setTimeout(updatePreview, 150); }); });
setTimeout(updatePreview, 600);

// 执行时使用预览区中用户编辑后的命令
var originalRunCmd = runCmd;
runCmd = function (endpoint, data) {
  var userCmd = cmdPreview.value.trim();
  if (userCmd) lastCmd = userCmd;
  return originalRunCmd(endpoint, data);
};

})();
