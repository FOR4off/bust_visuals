/* BUST VISUALS Launcher renderer */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let API = 'http://127.0.0.1:4000';

let user = null;
let settings = null;

// ---------- sounds (WebAudio) ----------
let ac = null;
function sound(kind) {
  if (!settings?.soundsOn) return;
  try {
    ac ||= new AudioContext();
    const o = ac.createOscillator(), g = ac.createGain();
    const freq = { click: 660, hover: 440, open: 520, equip: 880, notification: 990 }[kind] || 600;
    o.frequency.value = freq; o.type = 'sine';
    g.gain.value = (settings?.soundVolume ?? 0.4) * 0.12;
    o.connect(g); g.connect(ac.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.12);
    o.stop(ac.currentTime + 0.13);
  } catch {}
}
document.addEventListener('click', () => sound('click'));

function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' err' : '');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), 3800);
}
function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.add('hidden'));
  $('#s-' + id).classList.remove('hidden');
  sound('open');
}
function applyAccent() {
  const ACC = { amber: '#FFB63D', blue: '#4D8DFF', purple: '#9B5CFF', cyan: '#33D6E2', red: '#FF4D5E', green: '#3DDC84' };
  document.documentElement.style.setProperty('--accent', ACC[settings?.accent] || ACC.amber);
}

// ---------- boot ----------
function startupError(error) {
  showScreen('welcome');
  const banner = $('#net-banner');
  banner.textContent = 'Не удалось загрузить приложение: ' + (error?.message || String(error)) + '. Перезапустите приложение или откройте логи.';
  banner.classList.remove('hidden');
}
window.addEventListener('error', (event) => startupError(event.error || event.message));
window.addEventListener('unhandledrejection', (event) => { event.preventDefault(); startupError(event.reason); });
window.bustVisuals.onSubscriptionRevoked((e) => {
  toast('Подписка BUST VISUALS закончилась' + (e.expiresAt ? ' (до ' + new Date(e.expiresAt).toLocaleDateString('ru-RU') + ')' : '') + '. Продлите Premium — launcher не удаляется, доступ вернётся после оплаты.', true);
  if (e.reason === 'offline_grace_expired') toast('Offline grace period истёк — требуется подключение к серверу', true);
});

(async () => {
  API = (await window.bustVisuals.appInfo()).api;
  settings = await window.bustVisuals.settingsGet();
  applyAccent();
  window.bustVisuals.onOauthTokens(() => { toast('Вход выполнен!'); boot(); });
  window.bustVisuals.onLaunchProgress((p) => launchProgress(p));
  window.bustVisuals.onCrash((c) => toast('BUST VISUALS: ошибка запуска: ' + c.message + ' — логи: Настройки → Открыть логи', true));
  $('#wl-logs').onclick = (e) => { e.preventDefault(); window.bustVisuals.openLogs(); };
  await boot();
})().catch(startupError);

async function boot() {
  const st = await window.bustVisuals.state();
  if (!st.user) {
    showScreen('welcome');
    return;
  }
  user = st.user;
  enterMain();
}

$('#wl-start').onclick = () => showScreen('auth');

// ---------- auth ----------
let authMode = 'login';
$$('.tab').forEach((t) => t.onclick = () => {
  authMode = t.dataset.t;
  $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
  $('#f-username').style.display = authMode === 'register' ? '' : 'none';
  $('#auth-submit').textContent = authMode === 'register' ? 'Создать аккаунт' : 'Войти';
});
$('#auth-form').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  $('#auth-err').textContent = '';
  try {
    const body = authMode === 'register'
      ? { email: fd.get('identifier'), password: fd.get('password') }
      : { identifier: fd.get('identifier'), password: fd.get('password') };
    const r = authMode === 'register'
      ? await window.bustVisuals.register({ ...body, username: fd.get('username') })
      : await window.bustVisuals.login(body);
    user = r.user;
    showScreen('mcsetup');
    renderMcList();
  } catch (err) { $('#auth-err').textContent = err.message; }
};

// ---------- mc setup ----------
if ($('#ms-start')) $('#ms-start').onclick = async () => {
  try {
    const dc = await window.bustVisuals.msDeviceCode();
    $('#ms-flow').classList.remove('hidden');
    $('#ms-code').textContent = dc.user_code;
    $('#ms-uri').href = dc.verification_uri;
    $('#ms-uri').onclick = (e) => { e.preventDefault(); window.bustVisuals.openExternal(dc.verification_uri); };
    $('#ms-status').textContent = 'Открываю официальный Microsoft…';
    window.bustVisuals.openExternal(dc.verification_uri);
    $('#ms-status').textContent = 'Ожидание подтверждения в браузере…';
    const poll = async () => {
      const r = await window.bustVisuals.msPoll(dc.device_code);
      if (r.status === 'pending') return setTimeout(poll, (dc.interval || 5) * 1000);
      if (r.status === 'slow_down') return setTimeout(poll, 10000);
      if (r.status === 'ok') { $('#ms-status').textContent = '✅ ' + r.mcAccount.username; renderMcList(); return; }
      $('#ms-status').textContent = '❌ ' + (r.message || r.status);
    };
    poll();
  } catch (err) {
    $('#ms-flow').classList.remove('hidden');
    $('#ms-status').textContent = '❌ ' + err.message;
    if (!document.getElementById('ms-setup')) {
      const box = document.createElement('div');
      box.id = 'ms-setup';
      box.style.marginTop = '10px';
      box.innerHTML = '<label class="f" style="text-align:left">Application (client) ID из portal.azure.com<input id="ms-cid" placeholder="00000000-0000-..."></label><button class="btn primary" id="ms-save" style="margin-top:8px">Сохранить и продолжить</button><p class="muted small" style="margin-top:6px">1) portal.azure.com → App registrations → New → Accounts: personal → Register. 2) Authentication → Add platform → Web → URL: http://localhost:4000/api/auth/microsoft/web-done. 3) Скопируйте Application (client) ID сюда.</p>';
      document.getElementById('ms-flow').appendChild(box);
      document.getElementById('ms-save').onclick = async () => {
        try {
          await window.bustVisuals.msSetup(document.getElementById('ms-cid').value.trim());
          toast('Настроено! Открываю вход Microsoft…');
          document.getElementById('ms-save').textContent = 'Готово ✓';
          document.getElementById('ms-start').click();
        } catch (e2) { toast(e2.message, true); }
      };
    }
  }
};
$('#offline-form').onsubmit = async (e) => {
  e.preventDefault();
  try {
    await window.bustVisuals.mcAddOffline(new FormData(e.target).get('username'));
    renderMcList();
  } catch (err) { toast(err.message, true); }
};
async function renderMcList() {
  try {
    const { accounts } = await window.bustVisuals.mcAccounts();
    $('#mc-list').innerHTML = accounts.map((a) => `
      <div class="mc-item ${a.active ? 'active' : ''}">
        <div><b>${esc(a.username)}</b> <span class="muted small">${a.type === 'microsoft' ? '· лицензия' : '· офлайн'}</span></div>
        ${a.active ? '<span class="temp">АКТИВЕН</span>' : `<button class="btn ghost" data-act="${a.id}">Выбрать</button>`}
      </div>`).join('');
    $$('#mc-list [data-act]').forEach((b) => b.onclick = async () => { await window.bustVisuals.mcActivate(b.dataset.act); renderMcList(); });
  } catch {}
}
$('#mc-done').onclick = async () => {
  const { accounts } = await window.bustVisuals.mcAccounts();
  if (!accounts?.length) return toast('Добавьте хотя бы один Minecraft-аккаунт', true);
  user = (await window.bustVisuals.state()).user;
  enterMain();
};

// ---------- main ----------
function enterMain() {
  showScreen('main');
  $('#chip-user').textContent = user.username;
  $('#chip-premium').classList.toggle('hidden', !user.premium?.active);
  connectWs();
  nav('home');
}

$('#nav').addEventListener('click', (e) => {
  const a = e.target.closest('[data-s]');
  if (a) nav(a.dataset.s);
});

const views = { accounts: viewAccounts, promocodes: viewPromocodes, home: viewHome, workshop: viewWorkshop, servers: viewServers, cosmetics: viewCosmetics, premium: viewPremium, configs: viewConfigs, versions: viewVersions, telegram: viewTelegram, news: viewNews, profile: viewProfile, settings: viewSettings, client: viewClient };

function viewClient() {
  const groups = [
    ['Visual', ['Blink', 'Chams', 'ChinaHat', 'Custom Crystals', 'Hit Color', 'HitBox']],
    ['World', ['Ambience', 'Bad Trip', 'BlockHighlighter', 'Bright', 'Custom Fog', 'Item Physics']],
    ['Particle', ['Ambient Particle', 'Block Particle', 'Damage Particle', 'Hit Particle', 'Particle Trail', 'Totem Particle']],
    ['Utils', ['Armor Durability', 'Arrows', 'Auto Sprint', 'Cape', 'ClickFriend', 'Item Highlighter']],
    ['Client', ['Theme', 'Config Manager', 'Custom Loading Screen', 'Friends Manager', 'Interface', 'Language']],
  ];
  $('#view').innerHTML = `<h1 class="page">BUST VISUALS Client</h1><p class="muted">Меню клиента в стиле Visual / World / Particle / Utils / Client. Настройки применяются к следующему запуску Minecraft.</p>
    <div class="client-menu-grid">${groups.map(([title, items]) => `<section class="client-panel"><header><b>${title}</b><span>•••</span></header>${items.map((item, i) => `<button class="client-row ${i === 2 ? 'enabled' : ''}" data-client-module="${esc(item)}"><span>${esc(item)}</span><span class="client-check">${i === 2 ? '✓' : ''}</span></button>`).join('')}</section>`).join('')}</div>
    <section class="card optimization-card"><div><h2>Оптимизация FPS</h2><p class="muted">Безопасные JVM-настройки, сниженная нагрузка частиц и профили памяти.</p></div><label class="switch"><input id="client-opt" type="checkbox" ${settings.fpsOptimization !== false ? 'checked' : ''}><span></span></label></section>`;
  $('#client-opt').onchange = (e) => { settings = { ...settings, fpsOptimization: e.target.checked }; window.bustVisuals.settingsSet({ fpsOptimization: e.target.checked }); toast(e.target.checked ? 'Оптимизация включена' : 'Оптимизация выключена'); };
  $$('.client-row').forEach((b) => b.onclick = () => { b.classList.toggle('enabled'); b.querySelector('.client-check').textContent = b.classList.contains('enabled') ? '✓' : ''; sound('click'); });
}

async function viewPromocodes() {
  $('#view').innerHTML = '<h1 class="page">Промокоды</h1><form class="card" id="promo-form"><label class="f">Введите промокод<input id="promo-code" required maxlength="32" autocomplete="off"></label><button class="btn primary">Активировать</button><p id="promo-result" role="status"></p></form>';
  $('#promo-form').onsubmit = async (e) => {
    e.preventDefault(); const button = e.currentTarget.querySelector('button'); button.disabled = true;
    try { const r = await window.bustVisuals.promoRedeem($('#promo-code').value.trim()); $('#promo-result').textContent = r.granted === 'premium' ? 'Подписка активирована' : 'Получено: ' + r.detail.cosmetic; const s = await window.bustVisuals.state(); user = s.user; }
    catch (err) { $('#promo-result').textContent = err.message; } finally { button.disabled = false; }
  };
}

async function viewAccounts() {
  const { accounts } = await window.bustVisuals.mcAccounts();
  $('#view').innerHTML = `<h1 class="page">Аккаунты Minecraft</h1><form class="card" id="mc-new"><label class="f">Новый локальный ник<input id="mc-name" required pattern="[A-Za-z0-9_]{3,16}" maxlength="16"></label><button class="btn primary">Добавить</button></form><label class="f">Поиск<input id="mc-search" placeholder="По никнейму"></label><div class="grid c3" id="mc-cards"></div>`;
  const render = () => {
    const query = $('#mc-search').value.toLowerCase();
    $('#mc-cards').innerHTML = accounts.filter(a => a.username.toLowerCase().includes(query)).map(a => `<article class="card"><h2>${esc(a.username)}</h2><p class="muted">${a.type === 'microsoft' ? 'Microsoft' : 'Локальный'}</p><p class="small">${esc(a.uuid)}</p><button class="btn ${a.active ? 'ghost' : 'primary'}" data-account="${esc(a.id)}" ${a.active ? 'disabled' : ''}>${a.active ? 'Выбран' : 'Выбрать'}</button></article>`).join('');
    $('#mc-cards').querySelectorAll('[data-account]').forEach(b => b.onclick = async () => { try { await window.bustVisuals.mcActivate(b.dataset.account); await viewAccounts(); } catch(e) { toast(e.message, true); } });
  };
  $('#mc-search').oninput = render; render();
  $('#mc-new').onsubmit = async e => { e.preventDefault(); try { await window.bustVisuals.mcAddOffline($('#mc-name').value); await viewAccounts(); } catch(e) { toast(e.message, true); } };
}
async function nav(name) {
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.s === name));
  await views[name]().catch((e) => {
    $('#view').innerHTML = `<div class="card"><p class="muted">⚠️ ${esc(e.message || 'Не удалось загрузить раздел')}</p><button class="btn ghost" id="view-retry" style="margin-top:12px">Повторить</button></div>`;
    $('#view-retry').onclick = () => nav(name);
  });
}

function statusLine(s) {
  const st = s.status;
  return st.state === 'ONLINE'
    ? `ONLINE · ${st.players}/${st.maxPlayers} · ${st.latencyMs ?? '—'} мс`
    : st.state === 'OFFLINE' ? 'SERVER OFFLINE' : 'UNKNOWN';
}
function serverCard(s, hero = false) {
  const st = s.status;
  const body = hero ? `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
      <h2>${esc(s.name)}</h2>${s.isTempIp ? '<span class="temp">ВРЕМЕННЫЙ IP</span>' : ''}
    </div>
    <div class="srow">
      <span class="dot ${esc(st.state)}"></span><b>${esc(statusLine(s))}</b>
      <span class="ip">${esc(s.ipDisplay)}</span>
      ${s.mcVersion ? `<span class="muted small">MC ${esc(s.mcVersion)}</span>` : ''}
    </div>
    <button class="btn primary play-big" data-play="${esc(s.id)}">▶ PLAY</button>` : `
    <div style="display:flex;justify-content:space-between;align-items:center"><b>${esc(s.name)}</b>${s.isTempIp ? '<span class="temp">ВРЕМЕННЫЙ IP</span>' : ''}</div>
    <div class="srow"><span class="dot ${esc(st.state)}"></span><span class="small">${esc(statusLine(s))}</span><span class="ip">${esc(s.ipDisplay)}</span></div>
    <div class="srow">
      <button class="btn primary" style="flex:1" data-play="${esc(s.id)}">▶ PLAY</button>
      <button class="btn ghost" data-copy="${esc(s.ipDisplay)}">COPY IP</button>
    </div>`;
  return `<div class="${hero ? 'server-hero' : 'card'}">${body}</div>`;
}
function bindServerActions(root, servers) {
  root.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => { window.bustVisuals.clipboardWrite(b.dataset.copy); toast('IP скопирован'); });
  root.querySelectorAll('[data-play]').forEach((b) => b.onclick = () => playServer(b.dataset.play, servers));
}
async function playServer(id, servers) {
  try {
    $('#launch-overlay').classList.remove('hidden');
    $('#lp-close').style.display = 'none';
    $('#lp-bar').style.width = '0%';
    $('#lp-title').textContent = 'Запуск Minecraft';
    const mcVersion = $('#home-version')?.value || settings?.mcVersion || '1.16.5';
    await window.bustVisuals.play({ serverId: id, servers, mcVersion, safeMode: !!$('#safe-mode')?.checked });
  } catch (e) {
    $('#launch-overlay').classList.add('hidden');
    toast(e.message, true);
  }
}
function launchProgress(p) {
  $('#lp-detail').textContent = p.detail || p.stage;
  $('#lp-bar').style.width = (p.pct || 0) + '%';
  if (['exit', 'crash', 'error', 'done'].includes(p.stage)) $('#lp-close').style.display = '';
}
$('#lp-close').onclick = () => $('#launch-overlay').classList.add('hidden');

function connectWs() {
  try {
    const ws = new WebSocket(API.replace('http', 'ws') + '/ws/status');
    ws.onmessage = (ev) => { /* live-статусы обновляются при переходах; карточки перерисовываются по nav() */ };
    ws.onclose = () => setTimeout(connectWs, 5000);
  } catch { /* backend оффлайн — баннер уже показан через ошибки fetch */ }
}

// ---------- views ----------
async function viewHome() {
  const b = await window.bustVisuals.bootstrap();
  const versionData = await window.bustVisuals.versions();
  const featured = b.servers.find((s) => s.isFeatured) || b.servers[0];
  const top = (b.cosmetics.catalog || []).slice(0, 6);
  document.getElementById('view').innerHTML = `
    <div class="hero-banner">
      <h1>Добро пожаловать<br>в <span>BUST VISUALS</span></h1>
      <div class="sub">Твой путь, твой стиль, твоя игра</div>
      <div class="hero-row">
        <button class="btn primary play-xl" data-play="${featured ? esc(featured.id) : ''}">🎮 ИГРАТЬ</button>
        <label class="small muted"><input type="checkbox" id="safe-mode"> Safe Mode</label>
        <button class="btn ghost" id="open-realms">◈ REALMS</button>
        <label class="vsel" title="Выберите версию Fabric"><span>🧩 Fabric</span><select id="home-version">${versionData.versions.map(v => `<option value="${esc(v.mc)}">${esc(v.mc)}</option>`).join('')}</select></label>
        <div class="nick-chip">🎮 Ник: <b>${esc(user.username)}</b></div>
      </div>
    </div>
    <div class="grid c2" style="margin-top:18px">
      <div><h2 class="sec">НОВОСТИ</h2>
        ${b.news.slice(0, 4).map((n) => `<div class="card" style="margin-bottom:10px"><b>${esc(n.title)}</b><p class="muted small" style="margin-top:4px">${esc(n.body.slice(0, 90))}…</p></div>`).join('')}</div>
      <div><h2 class="sec">ТОП КОСМЕТИКИ</h2>
        <div class="grid c3">${top.map((c) => `<div class="card" style="padding:12px;text-align:center"><div style="font-weight:800;font-size:12px">${esc(c.name)}</div><div class="muted small rar-${esc(c.rarity)}">${esc(c.rarity)}</div></div>`).join('')}</div></div>
    </div>`;
  bindServerActions(document.getElementById('view'), b.servers);
  if (versionData.versions.some(v => v.mc === settings?.mcVersion)) $('#home-version').value = settings.mcVersion;
  $('#home-version').onchange = async () => {
    try { settings = await window.bustVisuals.settingsSet({ mcVersion: $('#home-version').value }); }
    catch (e) { toast(e.message, true); }
  };
  $('#open-realms').onclick = () => window.bustVisuals.openRealms();
}

// Мастерская — реальный поиск по Modrinth (Fabric)
async function viewWorkshop() {
  document.getElementById('view').innerHTML = `
    <h1 class="page">Мастерская</h1>
    <div class="srow" style="margin-bottom:12px">
      <input id="ws-name" placeholder="Название сборки" style="width:180px">
      <select id="ws-loader"><option value="fabric">Fabric</option><option value="forge">Forge</option><option value="neoforge">NeoForge</option></select>
      <input id="ws-q" placeholder="Поиск модов (Modrinth): sodium, iris…" style="flex:1">
      <select id="ws-version"><option value="">Все версии</option><option>1.16.5</option><option>1.21.4</option><option>1.21.11</option></select>
      <button class="btn ghost" id="ws-create">Создать сборку</button><button class="btn primary" id="ws-search">Найти</button>
    </div>
    <div id="ws-list"><p class="muted">Введите запрос и нажмите «Найти»</p></div>`;
  const search = async () => {
    const query = document.getElementById('ws-q').value || 'sodium';
    document.getElementById('ws-list').innerHTML = '<p class="muted">Загрузка…</p>';
    try {
      const version = document.getElementById('ws-version')?.value || '';
      const j = await window.bustVisuals.modrinthSearch({ query, version, loader: 'fabric' });
      document.getElementById('ws-list').innerHTML = (j.hits || []).map((h) => `
        <div class="ws-item">
          ${h.icon_url ? '<img src="' + esc(h.icon_url) + '">' : '<div style="width:52px"></div>'}
          <div style="flex:1"><b>${esc(h.title)}</b> <span class="muted small">by ${esc(h.author)}</span>
          <p class="muted small">${esc((h.description || '').slice(0, 80))}</p></div>
          <div class="muted small">⬇ ${h.downloads} ♥ ${h.follows}</div>
          <a class="btn ghost" href="https://modrinth.com/mod/${esc(h.slug)}" target="_blank" rel="noopener">Открыть</a>
        </div>`).join('') || '<p class="muted">Ничего не найдено</p>';
    } catch (e) { document.getElementById('ws-list').innerHTML = '<p class="muted">Modrinth недоступен</p>'; }
  };
  document.getElementById('ws-search').onclick = search;
  document.getElementById('ws-create').onclick = async () => {
    try { const r = await window.bustVisuals.workshopCreate({ name: $('#ws-name').value, version: $('#ws-version').value || '1.21.4', loader: $('#ws-loader').value }); toast('Сборка создана: ' + r.name); }
    catch (e) { toast(e.message, true); }
  };
  document.getElementById('ws-q').addEventListener('keydown', (e) => e.key === 'Enter' && search());
}

async function viewServers() {
  const { servers } = await window.bustVisuals.servers();
  $('#view').innerHTML = `<h1 class="page">Серверы</h1><div class="grid c3" id="srv-grid">${servers.map((s) => serverCard(s)).join('')}</div>`;
  bindServerActions($('#view'), servers);
}

async function viewCosmetics() {
  const [cat, me] = await Promise.all([window.bustVisuals.cosmeticsCatalog(), window.bustVisuals.cosmeticsMe()]);
  const owned = new Set(me.owned);
  const equippedIds = new Set(Object.values(me.equipped || {}));
  const CAT_RU = { capes: '🧣 Накидки', wings: '🪽 Крылья', hats: '🎩 Шляпы', auras: '✨ Ауры', particles: '❄️ Частицы', trails: '💫 Следы', emotes: '🕺 Эмоции', badges: '🎖 Значки' };
  $('#view').innerHTML = `
    <h1 class="page">Косметика</h1>
    <div class="srow" style="margin-bottom:12px">
      <span class="muted small">Скрыть мою косметику от других игроков:</span>
      <button class="btn ghost" id="vis-hide">Скрыть</button>
      <button class="btn ghost" id="vis-show">Показать</button>
    </div>
    <div class="chips" id="cos-chips">${['all', ...cat.categories].map((c) => `<button class="chip" data-c="${c}">${c === 'all' ? 'Все' : CAT_RU[c] || c}</button>`).join('')}</div>
    <div class="grid c4" id="cos-grid"></div>`;
  $('#vis-hide').onclick = async () => { await window.bustVisuals.cosmeticsVisibility({ visible: false }); toast('Косметика скрыта'); };
  $('#vis-show').onclick = async () => { await window.bustVisuals.cosmeticsVisibility({ visible: true }); toast('Косметика видна'); };
  const draw = (c) => {
    $('#cos-grid').innerHTML = cat.cosmetics.filter((x) => c === 'all' || x.category === c).map((x) => `
      <div class="card ${!owned.has(x.id) ? 'locked' : ''}">
        <b>${esc(x.name)}</b> ${x.premium ? '<span class="temp">✦ PREMIUM</span>' : ''}
        ${x.assetUrl ? `<img class="cos-preview ${x.animated ? 'cos-animated' : ''}" src="${esc(x.assetUrl)}" alt="MrCarrotY ${esc(x.name)}">` : ''}
        <div class="muted small" style="margin:6px 0">${esc(x.description || '')}</div>
        <span class="rar-${esc(x.rarity)} small"><b>${esc(x.rarity)}</b></span>
        <div style="margin-top:10px">
        ${owned.has(x.id)
          ? (equippedIds.has(x.id)
            ? `<button class="btn ghost" style="width:100%" data-uneq="${esc(x.category)}">Снять</button>`
            : `<button class="btn primary" style="width:100%" data-eq="${esc(x.id)}">Надеть</button>`)
          : `<button class="btn primary" style="width:100%" data-buy-cos="${esc(x.id)}">КУПИТЬ · ${x.price} ₽</button>`}
        </div>
      </div>`).join('');
    $('#cos-grid').querySelectorAll('[data-eq]').forEach((b) => b.onclick = async () => { await window.bustVisuals.cosmeticsEquip({ cosmeticId: b.dataset.eq }); sound('equip'); viewCosmetics(); });
    $('#cos-grid').querySelectorAll('[data-uneq]').forEach((b) => b.onclick = async () => { await window.bustVisuals.cosmeticsUnequip({ category: b.dataset.uneq }); viewCosmetics(); });
    $('#cos-grid').querySelectorAll('[data-buy-cos]').forEach((b) => b.onclick = async () => { try { await window.bustVisuals.cosmeticsBuy({ cosmeticId: b.dataset.buyCos }); toast('Косметика куплена'); viewCosmetics(); } catch (e) { toast(e.message, true); } });
  };
  $('#cos-chips').onclick = (e) => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    $$('#cos-chips .chip').forEach((x) => x.classList.toggle('active', x === b));
    draw(b.dataset.c);
  };
  $('#cos-chips').querySelector('.chip').classList.add('active');
  draw('all');
}

async function viewPremium() {
  const { plans } = await window.bustVisuals.premiumPlans();
  $('#view').innerHTML = `
    <h1 class="page">✦ BUST PREMIUM</h1>
    <p class="muted small" style="margin-bottom:14px">Premium синхронизируется между launcher, сайтом, клиентом и Telegram. Активация — после подтверждения платежа.</p>
    <div class="grid c4">${plans.map((p) => `
      <div class="card plan">
        <div class="ttl">${esc(p.title)}</div>
        <div class="price">${p.priceRub} ₽</div>
        <button class="btn primary" style="width:100%" data-buy="${esc(p.id)}">КУПИТЬ</button>
      </div>`).join('')}</div>`;
  $('#view').querySelectorAll('[data-buy]').forEach((b) => b.onclick = async () => {
    try {
      const r = await window.bustVisuals.premiumOrder(b.dataset.buy);
      toast(r.order?.paymentUrl ? 'Открыта страница оплаты' : 'Заказ создан. Оплата подключается администратором.');
      user = (await window.bustVisuals.state()).user;
      $('#chip-premium').classList.toggle('hidden', !user.premium?.active);
    } catch (e) { toast(e.message, true); }
  });
}

async function viewConfigs() {
  const { configs } = await window.bustVisuals.configsList({});
  $('#view').innerHTML = `
    <h1 class="page">Магазин конфигов</h1>
    <div class="srow" style="margin-bottom:12px">
      <input id="cfg-q" placeholder="Поиск…" style="flex:1">
      <select id="cfg-sort"><option value="popular">Популярные</option><option value="new">Новые</option><option value="downloads">По скачиваниям</option></select>
      <button class="btn primary" id="cfg-pub">Опубликовать свой</button>
    </div>
    <div class="grid c3" id="cfg-grid">${configs.map((c) => `
      <div class="card">
        <div style="display:flex;justify-content:space-between"><b>${esc(c.name)}</b>${c.premiumRequired ? '<span class="temp">✦</span>' : ''}</div>
        <p class="muted small" style="margin:6px 0">${esc(c.description || '')}</p>
        <div class="muted small">${esc(c.kind)} · MC ${esc(c.mcVersion)} · <b style="color:var(--text)">${esc(c.author?.username || '?')}</b> · ⬇ ${c.downloads} ♥ ${c.likes}</div>
        <div class="srow">
          <button class="btn primary" style="flex:1" data-dl="${esc(c.id)}">Установить</button>
          <button class="btn ghost" data-like="${esc(c.id)}">♥</button>
        </div>
      </div>`).join('') || '<p class="muted">Пока пусто — опубликуйте первый конфиг!</p>'}</div>`;
  $('#view').querySelectorAll('[data-dl]').forEach((b) => b.onclick = async () => {
    try { const r = await window.bustVisuals.configsDownload(b.dataset.dl); toast('Установлен: ' + r.installedTo); }
    catch (e) { toast(e.message, true); }
  });
  $('#view').querySelectorAll('[data-like]').forEach((b) => b.onclick = async () => { await window.bustVisuals.configsLike(b.dataset.like); viewConfigs(); });
  $('#cfg-pub').onclick = publishModal;
  const reload = async () => {
    const q = $('#cfg-q')?.value || '';
    const sort = $('#cfg-sort')?.value || 'popular';
    const { configs: list } = await window.bustVisuals.configsList({ q, sort });
    // упрощённо: полная перерисовка
    viewConfigs();
  };
  $('#cfg-q')?.addEventListener('keydown', (e) => e.key === 'Enter' && reload());
  $('#cfg-sort')?.addEventListener('change', reload);
}
async function publishModal() {
  const locals = await window.bustVisuals.configsReadLocal();
  const m = modal(`
    <h3>Опубликовать конфиг</h3>
    ${locals.length ? `
      <label class="f">Локальный профиль<select id="p-local"><option value="">— ввести JSON вручную —</option>${locals.map((l) => `<option value="${esc(l.file)}">${esc(l.file)}</option>`).join('')}</select></label>` : ''}
    <label class="f">Название<input id="p-name"></label>
    <label class="f">Описание<input id="p-desc"></label>
    <div class="grid c2">
      <label class="f">Тип<select id="p-kind"><option value="profile">profile</option><option value="full">full</option></select></label>
      <label class="f">MC версия<input id="p-mc" value="1.16.5"></label>
    </div>
    <label class="f">Теги (через запятую)<input id="p-tags"></label>
    <label class="f">JSON<textarea id="p-data" rows="8" placeholder='{"hud":{},"modules":{}}'></textarea></label>
    <label class="f" style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" id="p-prem" style="width:auto"> ✦ Только для Premium</label>
    <button class="btn primary" id="p-save">Опубликовать</button>`);
  m.querySelector('#p-local')?.addEventListener('change', () => {
    const f = locals.find((l) => l.file === m.querySelector('#p-local').value);
    if (f) m.querySelector('#p-data').value = JSON.stringify(f.data, null, 2);
  });
  m.querySelector('#p-save').onclick = async () => {
    try {
      const data = JSON.parse(m.querySelector('#p-data').value || '{}');
      await window.bustVisuals.configsPublish({
        name: m.querySelector('#p-name').value, description: m.querySelector('#p-desc').value,
        kind: m.querySelector('#p-kind').value, mcVersion: m.querySelector('#p-mc').value,
        tags: m.querySelector('#p-tags').value.split(',').map((s) => s.trim()).filter(Boolean),
        premiumRequired: m.querySelector('#p-prem').checked, data,
      });
      m.remove(); toast('Конфиг опубликован!'); viewConfigs();
    } catch (e) { toast('Ошибка: ' + e.message, true); }
  };
}

async function viewVersions() {
  const { versions } = await window.bustVisuals.versions();
  $('#view').innerHTML = `
    <h1 class="page">Версии Minecraft</h1>
    <table><tr><th>Версия</th><th>Клиент</th><th>Cosmetic Mod</th><th></th></tr>
    ${versions.map((v) => `<tr>
      <td><b>${esc(v.mc)}</b> ${v.isLatest ? '<span class="temp">LATEST</span>' : ''}</td>
      <td>${v.clientStatus === 'ready' ? '✅ готов' : '🕓 ' + esc(v.clientStatus)}</td>
      <td>${v.cosmetic.status === 'ready' ? '✅ готов' : '🕓 скоро'}</td>
      <td><button class="btn ghost" data-inst="${esc(v.mc)}">Установить vanilla</button></td>
    </tr>`).join('')}</table>
    <p class="muted small" style="margin-top:10px">Установка скачивает ванильную версию (клиент, библиотеки, ассеты) с проверкой sha1 — PLAY сделает это автоматически.</p>`;
  $('#view').querySelectorAll('[data-inst]').forEach((b) => b.onclick = async () => {
    $('#launch-overlay').classList.remove('hidden');
    $('#lp-close').style.display = 'none';
    $('#lp-title').textContent = 'Установка ' + b.dataset.inst;
    try { await window.bustVisuals.installVersion(b.dataset.inst); } catch (e) { $('#lp-detail').textContent = '❌ ' + e.message; }
  });
}

async function viewTelegram() {
  const st = await window.bustVisuals.telegramStatus();
  if (!st.linked) {
    const l = await window.bustVisuals.telegramLinkStart();
    $('#view').innerHTML = `
      <h1 class="page">CONNECT TELEGRAM</h1>
      <div class="grid c2">
        <div class="card" style="text-align:center">
          <p class="muted small">Введи код в боте:</p>
          <div class="code-tele">${esc(l.code)}</div>
          <p class="muted small" style="margin:10px 0">команда <b>/link ${esc(l.code)}</b></p>
          <button class="btn primary" id="tg-open">Открыть бота</button>
        </div>
        <div class="card" style="text-align:center">
          <p class="muted small">Или отсканируй QR:</p>
          <img class="qr" src="${l.qrDataUrl}" alt="QR">
        </div>
      </div>
      <p class="muted small" style="margin-top:10px" id="tg-status">Ожидание привязки…</p>`;
    $('#tg-open').onclick = () => window.bustVisuals.openExternal(l.botLink);
    const t = setInterval(async () => {
      try {
        const s = await window.bustVisuals.telegramStatus();
        if (s.linked) { clearInterval(t); toast('Telegram привязан!'); viewTelegram(); }
      } catch {}
    }, 3000);
    setTimeout(() => clearInterval(t), 300000);
  } else {
    const prefs = await window.bustVisuals.notifyGet();
    const L = { updates: 'Обновления', premium: 'Premium', serverStatus: 'Статус серверов', news: 'Новости', maintenance: 'Техработы', cosmetics: 'Новая косметика' };
    $('#view').innerHTML = `
      <h1 class="page">Telegram</h1>
      <div class="card"><b>Привязан:</b> ${esc(st.username || 'да')} <button class="btn ghost" id="tg-un" style="margin-left:10px">Отвязать</button></div>
      <h2 class="sec">УВЕДОМЛЕНИЯ</h2>
      ${Object.entries(L).map(([k, v]) => `
        <div class="mc-item"><span>${v}</span>
          <button class="btn ghost" data-n="${k}">${prefs.settings[k] ? '✅ Вкл' : '❌ Выкл'}</button></div>`).join('')}`;
    $('#tg-un').onclick = async () => { await window.bustVisuals.telegramUnlink(); viewTelegram(); };
    $('#view').querySelectorAll('[data-n]').forEach((b) => b.onclick = async () => {
      await window.bustVisuals.notifyPut({ [b.dataset.n]: !prefs.settings[b.dataset.n] });
      viewTelegram();
    });
  }
}

async function viewNews() {
  const { news } = await window.bustVisuals.news();
  $('#view').innerHTML = `<h1 class="page">Новости</h1>${news.map((n) => `
    <div class="card" style="margin-bottom:10px">
      <div class="muted small">${new Date(n.publishedAt).toLocaleString('ru-RU')}</div>
      <b>${esc(n.title)}</b><p class="muted small" style="margin-top:6px">${esc(n.body)}</p>
    </div>`).join('')}`;
}

async function viewProfile() {
  const { accounts } = await window.bustVisuals.mcAccounts();
  const profile = await window.bustVisuals.economyProfile();
  const p = user.premium;
  $('#view').innerHTML = `
    <h1 class="page">Профиль</h1>
    <div class="card" style="margin-bottom:16px">
      <h3>Баланс: ${esc(profile.balance)} ₽</h3>
      <form id="profile-topup" class="srow" style="margin-top:12px">
        <label>Сумма, ₽ <input name="amount" type="number" min="10" max="100000" step="1" value="100" required></label>
        <button class="btn primary" type="submit">Пополнить</button>
        <button class="btn ghost" type="button" id="balance-refresh">Обновить баланс</button>
      </form>
      <p id="topup-result" role="status" class="muted small"></p>
    </div>
    <div class="grid c2">
      <div class="card">
        <div class="bust-logo" style="width:56px;height:56px;border-radius:14px"></div>
        <canvas id="profile-skin" width="160" height="256" aria-label="Скин MrCarrotY" style="height:256px;image-rendering:pixelated"></canvas>
        <h3 style="margin-top:10px">${esc(user.username)}</h3>
        <p class="muted small">${esc(user.email || 'OAuth-аккаунт')}</p>
        <p style="margin-top:10px">${p.active
          ? (p.isLifetime ? '<span class="temp">✦ PREMIUM — НАВСЕГДА</span>' : `<span class="temp">✦ PREMIUM до ${new Date(p.expiresAt).toLocaleDateString('ru-RU')}</span>`)
          : '<span class="muted">FREE аккаунт</span>'}</p>
        <button class="btn ghost" id="pf-out" style="margin-top:14px">Выйти из аккаунта</button>
      </div>
      <div class="card">
        <h3>Minecraft аккаунты</h3>
        <div id="pf-mc" style="margin-top:10px;display:flex;flex-direction:column;gap:6px">
          ${accounts.map((a) => `<div class="mc-item ${a.active ? 'active' : ''}"><span><b>${esc(a.username)}</b> <span class="muted small">${a.type === 'microsoft' ? '· лицензия' : '· офлайн'}</span></span>
            ${a.active ? '<span class="temp">АКТИВЕН</span>' : `<button class="btn ghost" data-act="${a.id}">Выбрать</button>`}</div>`).join('')}
        </div>
      </div>
    </div>`;
  $('#pf-out').onclick = async () => { await window.bustVisuals.logout(); location.reload(); };
  const skin = new Image();
  skin.onload = () => {
    const canvas = $('#profile-skin'); if (!canvas) return;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const part = (sx, sy, w, h, x, y) => ctx.drawImage(skin, sx, sy, w, h, x * 8, y * 8, w * 8, h * 8);
    part(8, 8, 8, 8, 6, 0); part(40, 8, 8, 8, 6, 0);
    part(20, 20, 8, 12, 6, 8); part(20, 36, 8, 12, 6, 8);
    part(44, 20, 3, 12, 3, 8); part(36, 52, 3, 12, 14, 8);
    part(4, 20, 4, 12, 6, 20); part(20, 52, 4, 12, 10, 20);
  };
  skin.src = '../../resources/mr-carroty-skin.png';
  $('#balance-refresh').onclick = () => viewProfile();
  $('#profile-topup').onsubmit = async (e) => {
    e.preventDefault();
    const button = e.target.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const { order } = await window.bustVisuals.balanceTopup(Number(new FormData(e.target).get('amount')));
      $('#topup-result').textContent = order.paymentUrl
        ? 'Оплата открыта в браузере. После оплаты обновите баланс.'
        : 'Платёжный провайдер ещё не подключён. Деньги не списаны. Заказ: ' + order.id;
    } catch (err) { $('#topup-result').textContent = err.message; }
    finally { button.disabled = false; }
  };
  $('#view').querySelectorAll('[data-act]').forEach((b) => b.onclick = async () => { await window.bustVisuals.mcActivate(b.dataset.act); viewProfile(); });
}

async function viewSettings() {
  $('#view').innerHTML = `
    <h1 class="page">Настройки</h1>
    <div class="grid c2">
      <div class="card">
        <h3>Внешний вид</h3>
        <div class="chips" style="margin-top:10px" id="accents">
          ${[['amber', '#FFB63D'], ['blue', '#4D8DFF'], ['purple', '#9B5CFF'], ['cyan', '#33D6E2'], ['red', '#FF4D5E'], ['green', '#3DDC84']]
            .map(([k, c]) => `<button class="chip ${settings.accent === k ? 'active' : ''}" data-a="${k}" style="border-bottom:3px solid ${c}">${k}</button>`).join('')}
        </div>
        <label class="f" style="margin-top:12px;flex-direction:row;gap:8px;align-items:center"><input type="checkbox" id="st-motion" style="width:auto" ${settings.reducedMotion ? 'checked' : ''}> Reduced motion</label>
      </div>
      <div class="card">
        <h3>Звуки UI</h3>
        <label class="f" style="margin-top:10px;flex-direction:row;gap:8px;align-items:center"><input type="checkbox" id="st-snd" style="width:auto" ${settings.soundsOn ? 'checked' : ''}> Включены</label>
        <label class="f" style="margin-top:10px">Громкость<input type="range" id="st-vol" min="0" max="100" value="${Math.round((settings.soundVolume ?? 0.4) * 100)}"></label>
      </div>
      <div class="card">
        <h3>Minecraft</h3>
        <label class="f" style="margin-top:10px;flex-direction:row;gap:8px;align-items:center"><input type="checkbox" id="st-opt" style="width:auto" ${settings.fpsOptimization !== false ? 'checked' : ''}> Оптимизация FPS</label>
        <p class="muted small">Применяет безопасные JVM-настройки. Реальный прирост зависит от ПК и мира.</p>
        <label class="f" style="margin-top:10px">RAM: <b id="st-ramv">${settings.ramMb}</b> МБ<input type="range" id="st-ram" min="1024" max="8192" step="512" value="${settings.ramMb}"></label>
      </div>
      <div class="card">
        <h3>О приложении</h3>
        <p class="muted small" style="margin-top:8px">BUST VISUALS Launcher v1.0.0</p>
        <p class="muted small">API: ${esc(API)}</p>
        <button class="btn ghost" id="st-logs" style="margin-top:10px">Открыть логи</button>
      </div>
    </div>`;
  const save = (patch) => { settings = { ...settings, ...patch }; window.bustVisuals.settingsSet(patch); applyAccent(); };
  $('#accents').onclick = (e) => { const b = e.target.closest('[data-a]'); if (b) { save({ accent: b.dataset.a }); $$('#accents .chip').forEach((x) => x.classList.toggle('active', x === b)); } };
  $('#st-motion').onchange = (e) => save({ reducedMotion: e.target.checked });
  $('#st-opt').onchange = (e) => save({ fpsOptimization: e.target.checked });
  $('#st-snd').onchange = (e) => save({ soundsOn: e.target.checked });
  $('#st-vol').onchange = (e) => save({ soundVolume: e.target.value / 100 });
  $('#st-ram').oninput = (e) => { $('#st-ramv').textContent = e.target.value; save({ ramMb: +e.target.value }); };
  $('#st-logs').onclick = () => window.bustVisuals.openLogs();
}

// ---------- modal ----------
function modal(html) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="box">${html}</div>`;
  m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  document.body.appendChild(m);
  return m;
}

// ---------- window controls ----------
$('#tb-min').onclick = () => window.bustVisuals.minimize();
$('#tb-max').onclick = () => window.bustVisuals.maximize();
$('#tb-close').onclick = () => window.bustVisuals.close();
