/* BUST VISUALS — site app (vanilla JS, hash router) */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const app = $('#app');
  const API = ''; // same origin

  // ---------- tokens ----------
  const tokens = {
    get: () => { try { return JSON.parse(localStorage.getItem('waffle_tokens')); } catch { return null; } },
    set: (t) => localStorage.setItem('waffle_tokens', JSON.stringify(t)),
    clear: () => localStorage.removeItem('waffle_tokens'),
  };

  async function api(path, { method = 'GET', body, auth = true, raw = false } = {}) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    const t = tokens.get();
    if (auth && t?.access) headers.Authorization = 'Bearer ' + t.access;
    let res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401 && auth && t?.refresh) {
      const r = await fetch(API + '/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: t.refresh }) });
      if (r.ok) {
        const j = await r.json();
        tokens.set({ access: j.accessToken, refresh: j.refreshToken });
        headers.Authorization = 'Bearer ' + j.accessToken;
        res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
      } else tokens.clear();
    }
    const text = await res.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) throw Object.assign(new Error(json?.error?.message || 'Ошибка запроса'), { status: res.status, code: json?.error?.code });
    return raw ? text : json;
  }

  // ---------- ui helpers ----------
  const toast = (msg, err = false) => {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast' + (err ? ' err' : '');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 3800);
  };
  const modal = (html) => { const m = $('#modal'); m.innerHTML = `<div class="box">${html}</div>`; m.classList.remove('hidden'); };
  const closeModal = () => $('#modal').classList.add('hidden');
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDate = (ts) => new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
  const stateDot = (st) => `<span class="status-dot ${esc(st)}"></span>`;

  // ---------- auth ui ----------
  function renderUserchip(user) {
    const el = $('#userchip');
    el.innerHTML = user
      ? `<b>${esc(user.username)}</b>${user.premium?.active ? ' <span style="color:var(--amber)">✦</span>' : ''} · <a href="#" id="logout" style="color:var(--dim)">выйти</a>`
      : '<a href="#" id="openlogin" style="color:var(--dim)">Войти</a>';
    $('#logout')?.addEventListener('click', (e) => { e.preventDefault(); tokens.clear(); renderUserchip(null); toast('Вы вышли из аккаунта'); route(); });
    $('#openlogin')?.addEventListener('click', (e) => { e.preventDefault(); loginModal(); });
  }
  async function currentUser() {
    if (!tokens.get()) return null;
    try { return (await api('/api/auth/me')).user; } catch { return null; }
  }

  let loginMode = 'login';
  function loginModal(after = null) {
    loginMode = 'login';
    modal(`
      <h3 style="margin-bottom:6px">BUST VISUALS</h3>
      <div class="chips" style="margin-bottom:10px">
        <button class="chip active" id="lm-login">Вход</button>
        <button class="chip" id="lm-reg">Регистрация</button>
      </div>
      <form class="stack" id="loginform">
        <label class="f" id="lm-user" style="display:none">Ник<input name="username" placeholder="Player"></label>
        <label class="f">Email или ник<input name="identifier" type="text" required autocomplete="username" placeholder="you@example.com или Player"></label>
        <label class="f">Пароль<input name="password" type="password" required minlength="6"></label>
        <button class="btn btn-primary" type="submit" id="lm-submit">Войти</button>
        <div class="chips" style="justify-content:center">
          <a class="chip" href="/api/auth/oauth/discord/start?redirect=site">Discord</a>
          <a class="chip" href="/api/auth/oauth/steam/start?redirect=site">Steam</a>
        </div>
        <p class="muted" style="font-size:12px;text-align:center">Steam — работает без настроек. Discord — после подключения приложения (docs/DEPLOYMENT.md).</p>
      </form>`);
    document.getElementById('lm-login').onclick = () => { loginMode='login'; lm2(); };
    document.getElementById('lm-reg').onclick = () => { loginMode='register'; lm2(); };
    function lm2() {
      document.getElementById('lm-login').classList.toggle('active', loginMode==='login');
      document.getElementById('lm-reg').classList.toggle('active', loginMode==='register');
      document.getElementById('lm-user').style.display = loginMode==='register' ? '' : 'none';
      document.getElementById('lm-submit').textContent = loginMode==='register' ? 'Создать аккаунт' : 'Войти';
    }
    document.getElementById('loginform').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const body = loginMode==='register'
          ? { email: fd.get('identifier'), username: fd.get('username'), password: fd.get('password') }
          : { identifier: fd.get('identifier'), password: fd.get('password') };
        const r = await api('/api/auth/' + (loginMode==='register' ? 'register' : 'login'), { method: 'POST', auth: false, body });
        tokens.set({ access: r.accessToken, refresh: r.refreshToken });
        user = r.user; renderUserchip(user); closeModal(); toast('Добро пожаловать, ' + r.user.username + '!'); route();
        if (after) after(r.user);
      } catch (err) { toast(err.message, true); }
    });
  }

  // ---------- data ----------
  let user = null;
  const copyIp = (ip) => navigator.clipboard.writeText(ip).then(() => toast('IP скопирован: ' + ip)).catch(() => toast('Не удалось скопировать', true));

  function serverCard(s, hero = false) {
    const st = s.status;
    const stText = st.state === 'ONLINE' ? `ONLINE · ${st.players}/${st.maxPlayers} · ${st.latencyMs ?? '—'} мс` : st.state === 'OFFLINE' ? 'SERVER OFFLINE' : 'UNKNOWN';
    if (hero) {
      return `<div class="server-hero">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">
          <div>
            <div class="section-title" style="margin:0">Главный сервер</div>
            <h2>${esc(s.name)}</h2>
          </div>
          ${s.isTempIp ? '<span class="temp-badge">Временный IP</span>' : ''}
        </div>
        <div class="server-row">
          ${stateDot(st.state)} <b style="font-size:13px;letter-spacing:.08em">${esc(stText)}</b>
          <span class="ip-chip">${esc(s.ipDisplay)}</span>
          ${s.mcVersion ? `<span class="muted" style="font-size:13px">MC ${esc(s.mcVersion)}</span>` : ''}
          <button class="btn btn-primary" data-play="${esc(s.id)}">PLAY</button>
          <button class="btn btn-ghost" data-copyip="${esc(s.ipDisplay)}">COPY IP</button>
        </div>
      </div>`;
    }
    return `<div class="card" style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>${esc(s.name)}</h3>
        ${s.isTempIp ? '<span class="temp-badge">Временный IP</span>' : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px;font-size:13px">${stateDot(st.state)} <b>${esc(stText)}</b></div>
      <div class="ip-chip" style="align-self:flex-start">${esc(s.ipDisplay)}</div>
      <div class="muted" style="font-size:12px">${esc(s.gameMode || '')} ${s.mcVersion ? '· MC ' + esc(s.mcVersion) : ''}</div>
      <div style="display:flex;gap:8px;margin-top:auto">
        <button class="btn btn-primary" style="flex:1" data-play="${esc(s.id)}">PLAY</button>
        <button class="btn btn-ghost" data-copyip="${esc(s.ipDisplay)}">COPY IP</button>
      </div>
    </div>`;
  }

  // ---------- pages ----------
  const pages = {
    async home() {
      app.innerHTML = `
        <div class="hero hero-sv">
          <div class="hero-copy">
            <div class="eyebrow">BUST VISUALS · 2026</div>
            <h1>Знакомый мир.<br><span>Другие ощущения.</span></h1>
            <p class="tag">Визуальные эффекты, удобный интерфейс и быстрый запуск Minecraft.</p>
            <div class="hero-btns">
              <a class="btn btn-primary" href="#/download">Скачать лаунчер</a>
              <a class="btn btn-ghost" href="#/features">Что внутри</a>
              <a class="btn btn-ghost" href="https://t.me/BustVisualsBot" target="_blank" rel="noopener">Telegram</a>
            </div>
            <p class="hero-note">Fabric 1.16.5 · 1.21.4 · 1.21.11</p>
          </div>
          <div class="hero-panel">
            <img src="assets/hero.svg" alt="BUST VISUALS">
            <div class="hero-panel-foot"><span class="live-dot"></span> Launcher готов к запуску <span class="muted">Safe Mode включён</span></div>
          </div>
        </div>
        <div class="feature-steps">
          <div><b>01</b><h3>Готов к запуску</h3><p>Лаунчер сам устанавливает Fabric, библиотеки и мод.</p></div>
          <div><b>02</b><h3>Настрой под себя</h3><p>HUD, косметика, профили, Modrinth и отдельная папка игры.</p></div>
          <div><b>03</b><h3>Safe Mode</h3><p>Запускай чистый профиль, если пользовательские моды мешают игре.</p></div>
        </div>
        <div class="section-title">Сервер онлайн прямо сейчас</div>
        <div id="home-servers"><p class="muted">Загрузка статуса…</p></div>
        <div class="section-title">Почему BUST VISUALS</div>
        ${featuresHtml()}`;
      loadServersInto('#home-servers', true);
    },

    async features() { app.innerHTML = `<div class="page-head"><h1>Возможности</h1><p>Всё, что нужно современному Minecraft-клиенту — и ничего лишнего.</p></div>${featuresHtml()}`; },

    async cosmetics() {
      app.innerHTML = `<div class="page-head"><h1>Косметика</h1><p>Накидки, крылья, ауры, следы и эмоции. Бесплатные предметы доступны каждому, Premium — с значком ✦.</p></div>
        <div class="chips" id="cos-chips"></div><div class="grid cols-4" id="cos-grid" style="margin-top:18px"><p class="muted">Загрузка…</p></div>`;
      let catalog;
      try { catalog = await api('/api/cosmetics'); } catch { return apiFail('#cos-grid'); }
      const cats = [['all', 'Все'], ...catalog.categories.map((c) => [c, c])];
      $('#cos-chips').innerHTML = cats.map(([id, label]) => `<button class="chip" data-cat="${esc(id)}">${esc(label)}</button>`).join('');
      const draw = (cat) => {
        const items = catalog.cosmetics.filter((c) => cat === 'all' || c.category === cat);
        $('#cos-grid').innerHTML = items.map((c) => `
          <div class="card cos-card ${c.premium ? 'premium' : ''}">
            <div class="rar-line rar-${esc(c.rarity)}" style="background:currentColor"></div>
            ${c.assetUrl ? `<img class="cos-preview ${c.animated ? 'cos-animated' : ''}" src="${esc(c.assetUrl)}" alt="MrCarrotY ${esc(c.name)}">` : ''}
            <h3>${esc(c.name)}</h3>
            <p>${esc(c.description || '')}</p>
            <p style="margin-top:8px"><span class="rar-${esc(c.rarity)}" style="font-size:12px;font-weight:800;letter-spacing:.08em">${esc(c.rarity)}</span></p>
            <button class="btn btn-primary" data-cos-buy="${esc(c.id)}" style="margin-top:12px;width:100%">КУПИТЬ · ${c.price || 99} ₽</button>
          </div>`).join('') || '<p class="muted">Пусто</p>';
      };
      $('#cos-chips').addEventListener('click', (e) => {
        const b = e.target.closest('[data-cat]'); if (!b) return;
        $('#cos-chips').querySelectorAll('.chip').forEach((x) => x.classList.remove('active'));
        b.classList.add('active'); draw(b.dataset.cat);
      });
      $('#cos-grid').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-cos-buy]'); if (!b) return;
        if (!user) return loginModal();
        try { await api('/api/economy/cosmetics/buy', { method: 'POST', body: { cosmeticId: b.dataset.cosBuy } }); toast('Косметика куплена'); pages.cosmetics(); }
        catch (err) { toast(err.message, true); }
      });
      $('#cos-chips').querySelector('.chip').classList.add('active');
      draw('all');
    },

    async premium() {
      app.innerHTML = `<div class="page-head"><h1>BUST VISUALS Premium</h1><p>UNLOCK THE FULL BUST EXPERIENCE. Premium синхронизируется между сайтом, launcher, клиентом и ботом.</p></div>
        <div class="premium-grid" id="plans"><p class="muted">Загрузка…</p></div>`;
      try {
        const { plans } = await api('/api/premium/plans');
        $('#plans').innerHTML = plans.map((p, i) => `
          <div class="card plan-card ${p.id === 'lifetime' ? 'hot' : ''}">
            ${p.id === 'lifetime' ? '<div class="hot-badge">ЛУЧШАЯ ЦЕНА</div>' : ''}
            <div class="ttl">${esc(p.title)}</div>
            <div class="price">${p.priceRub} ₽</div>
            <button class="btn btn-primary" data-buy="${esc(p.id)}">КУПИТЬ</button>
          </div>`).join('');
        $('#plans').addEventListener('click', async (e) => {
          const b = e.target.closest('[data-buy]'); if (!b) return;
          if (!user) { loginModal(); return toast('Войдите, чтобы купить Premium', true); }
          try {
            const { order } = await api('/api/premium/orders', { method: 'POST', body: { planId: b.dataset.buy } });
            if (order.paymentUrl) window.open(order.paymentUrl, '_blank', 'noopener');
            else toast(`Заказ создан. Оплата подключается администратором — заказ ${order.id.slice(0, 8)}`);
          } catch (err) { toast(err.message, true); }
        });
      } catch { apiFail('#plans'); }
    },

    async download() {
      app.innerHTML = `<div class="page-head"><h1>Скачать</h1><p>Два продукта: полный клиент через launcher и бесплатный Cosmetic Mod.</p></div>
        <div id="dl-launcher"><p class="muted">Загрузка…</p></div>
        <div class="section-title">BUST VISUALS COSMETIC MOD — бесплатно</div>
        <p class="muted" style="margin-bottom:14px">Показывает косметику BUST VISUALS других игроков (накидки, крылья, ауры, следы, значки). Не требует Premium. Выберите вашу версию Minecraft:</p>
        <div class="chips" id="mc-chips"></div>
        <div id="dl-cosmetic" style="margin-top:18px"></div>
        <div class="section-title">Клиент vs Cosmetic Mod</div>
        <div class="vs-grid">
          <div class="card vs-col"><h3 style="color:var(--amber)">✦ BUST VISUALS CLIENT</h3><ul>
            <li>Всё из Cosmetic Mod</li><li>HUD: FPS, CPS, Keystrokes, Target HUD и др.</li>
            <li>Visuals: ESP, Tracers, круг-индикатор, эффекты</li><li>Performance engine и профили</li>
            <li>Экипировка косметики</li><li>Полное меню клиента (Right Shift)</li></ul></div>
          <div class="card vs-col"><h3>BUST COSMETIC MOD</h3><ul>
            <li>Видеть косметику других игроков</li><li>Кейпы, крылья, шляпы, ауры, следы, частицы, значки</li>
            <li>Настройки отображения по категориям</li><li>Максимально лёгкий, не снижает FPS</li>
            <li>Полностью бесплатный</li><li>Версии 1.16.5 → новейшая</li></ul></div>
        </div>`;
      try {
        const { update } = await api('/api/updates/latest?channel=launcher');
        $('#dl-launcher').innerHTML = `
          <div class="card" style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
            <div style="flex:1;min-width:240px">
              <h3>BUST VISUALS LAUNCHER</h3>
              <p class="muted" style="font-size:13px">Версия ${esc(update.version)} · ${fmtDate(update.publishedAt)}${update.sha256 ? ' · sha256: <code>' + esc(update.sha256.slice(0, 16)) + '…</code>' : ''}</p>
              <p style="font-size:13px;margin-top:8px">${esc(update.changelog || '')}</p>
            </div>
            <div class="chips">
              <button class="btn btn-primary" data-dl="${esc(update.downloadUrl || '')}">WINDOWS</button>
              <button class="btn btn-ghost" data-dl="" disabled>MACOS — скоро</button>
              <button class="btn btn-ghost" data-dl="" disabled>LINUX — скоро</button>
            </div>
          </div>`;
        $('#dl-launcher').addEventListener('click', (e) => {
          const b = e.target.closest('[data-dl]'); if (!b || !b.dataset.dl) return;
          window.open(b.dataset.dl, '_blank', 'noopener');
        });
      } catch { $('#dl-launcher').innerHTML = '<p class="muted">Launcher: обновления не опубликованы</p>'; }
      try {
        const { versions } = await api('/api/versions');
        $('#mc-chips').innerHTML = versions.map((v) => `<button class="chip" data-mc="${esc(v.mc)}">${esc(v.mc)}${v.isLatest ? ' ·LATEST' : ''}</button>`).join('');
        $('#mc-chips').addEventListener('click', (e) => {
          const b = e.target.closest('[data-mc]'); if (!b) return;
          $('#mc-chips').querySelectorAll('.chip').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          drawCosmetic(versions.find((v) => v.mc === b.dataset.mc));
        });
        $('#mc-chips').querySelector('.chip').classList.add('active');
        drawCosmetic(versions[0]);
        function drawCosmetic(v) {
          $('#dl-cosmetic').innerHTML = !v ? '' : v.cosmetic.status === 'ready'
            ? `<div class="card" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
                 <div style="flex:1"><h3>Cosmetic Mod для Minecraft ${esc(v.mc)}</h3><p class="muted" style="font-size:13px">Готов к установке · Fabric</p></div>
                 <a class="btn btn-primary" href="${esc(v.cosmetic.downloadUrl)}">СКАЧАТЬ МОД</a></div>`
            : `<div class="card" style="display:flex;gap:16px;align-items:center">
                 <div style="flex:1"><h3>Cosmetic Mod для Minecraft ${esc(v.mc)}</h3><p class="muted" style="font-size:13px">В разработке — скоро</p></div>
                 <span class="chip" style="cursor:default">Скоро</span></div>`;
        }
      } catch { apiFail('#dl-cosmetic'); }
    },

    async servers() {
      app.innerHTML = `<div class="page-head"><h1>Серверы</h1><p>BUST VISUALS Network и каталог «СЕРВЕРА PRO». Статус реальный, обновляется автоматически.</p></div>
        <div id="srv-all"><p class="muted">Загрузка…</p></div>`;
      loadServersInto('#srv-all', false);
    },

    async news() {
      app.innerHTML = `<div class="page-head"><h1>Новости</h1></div><div id="news-list"><p class="muted">Загрузка…</p></div>`;
      try {
        const { news } = await api('/api/news');
        $('#news-list').innerHTML = news.map((n) => `
          <div class="card" style="margin-bottom:14px">
            <div class="muted" style="font-size:12px">${fmtDate(n.publishedAt)}</div>
            <h3 style="margin:6px 0">${esc(n.title)}</h3>
            <p>${esc(n.body)}</p>
          </div>`).join('') || '<p class="muted">Новостей пока нет.</p>';
      } catch { apiFail('#news-list'); }
    },

    async status() {
      app.innerHTML = `<div class="page-head"><h1>Статус сервисов</h1><p>Health checks обновляются в реальном времени.</p></div><div id="svc-list"><p class="muted">Загрузка…</p></div>`;
      const load = async () => {
        try {
          const { services } = await api('/api/status/health');
          $('#svc-list').innerHTML = services.map((s) => `
            <div class="svc">${stateDot(s.status === 'operational' ? 'ONLINE' : s.status === 'down' ? 'OFFLINE' : 'UNKNOWN')}
              <b>${esc(s.name)}</b>
              <span class="muted" style="font-size:12px">${s.latencyMs != null ? s.latencyMs + ' мс' : ''}</span>
              <span class="st ${esc(s.status)}">${esc(s.status)}</span></div>`).join('');
        } catch { apiFail('#svc-list'); }
      };
      await load();
      pages._statusTimer && clearInterval(pages._statusTimer);
      pages._statusTimer = setInterval(load, 30000);
    },

    async configs() {
      app.innerHTML = `<div class="page-head"><h1>Магазин конфигов</h1><p>Готовые профили клиента от сообщества: HUD, модули, производительность. Скачивай, лайкай, публикуй свои.</p></div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:18px">
          <input id="cfg-q" placeholder="Поиск конфигов…" style="flex:1;min-width:220px">
          <div class="chips">
            <button class="chip active" data-sort="popular">Популярные</button>
            <button class="chip" data-sort="new">Новые</button>
            <button class="chip" data-sort="downloads">По скачиваниям</button>
          </div>
          <button class="btn btn-primary" id="cfg-publish">Опубликовать конфиг</button>
        </div>
        <div class="grid cols-3" id="cfg-grid"><p class="muted">Загрузка…</p></div>`;
      let sort = 'popular';
      const load = async () => {
        try {
          const q = $('#cfg-q').value.trim();
          const { configs } = await api(`/api/configs?sort=${sort}${q ? '&q=' + encodeURIComponent(q) : ''}`);
          $('#cfg-grid').innerHTML = configs.map((c) => `
            <div class="card" style="display:flex;flex-direction:column;gap:8px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <h3>${esc(c.name)}</h3>
                ${c.premiumRequired ? '<span class="temp-badge">✦ Premium</span>' : ''}
              </div>
              <p style="font-size:13px">${esc(c.description || '')}</p>
              <div class="muted" style="font-size:12px">
                <span class="chip" style="cursor:default;padding:2px 10px">${esc(c.kind)}</span>
                MC ${esc(c.mcVersion)} · автор <b style="color:var(--text)">${esc(c.author?.username || '?')}</b>
                · ⬇ ${c.downloads} · ♥ ${c.likes}
              </div>
              <div style="display:flex;gap:8px;margin-top:auto">
                <button class="btn btn-primary" style="flex:1" data-cfgdl="${esc(c.id)}">Скачать</button>
                <button class="btn btn-ghost" data-cfglike="${esc(c.id)}">♥</button>
              </div>
            </div>`).join('') || '<p class="muted">Пока нет конфигов — стань первым!</p>';
        } catch { apiFail('#cfg-grid'); }
      };
      $('#cfg-q').addEventListener('input', () => clearTimeout(pages._cfgT) || (pages._cfgT = setTimeout(load, 350)));
      $('#cfg-grid').parentElement.addEventListener('click', async (e) => {
        const sortB = e.target.closest('[data-sort]');
        if (sortB) {
          sort = sortB.dataset.sort;
          document.querySelectorAll('[data-sort]').forEach((x) => x.classList.toggle('active', x === sortB));
          return load();
        }
        const dl = e.target.closest('[data-cfgdl]');
        if (dl) {
          try {
            const r = await api(`/api/configs/${dl.dataset.cfgdl}/download`);
            const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${r.name || 'config'}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
            toast('Конфиг скачан — установите в launcher (папка profiles)');
          } catch (err) { toast(err.message, true); }
          return;
        }
        const like = e.target.closest('[data-cfglike]');
        if (like) {
          if (!user) return loginModal();
          try { await api(`/api/configs/${like.dataset.cfglike}/like`, { method: 'POST' }); load(); }
          catch (err) { toast(err.message, true); }
        }
      });
      $('#cfg-publish').addEventListener('click', () => {
        if (!user) return loginModal();
        modal(`
          <h3 style="margin-bottom:14px">Опубликовать конфиг</h3>
          <form class="stack" id="pubform">
            <label class="f">Название<input name="name" required maxlength="48"></label>
            <label class="f">Описание<textarea name="description" rows="2" maxlength="280"></textarea></label>
            <label class="f">Тип<select name="kind"><option value="profile">profile — один профиль</option><option value="full">full — всё (профили+байнды)</option></select></label>
            <label class="f">Версия MC<input name="mcVersion" value="1.16.5"></label>
            <label class="f">Теги (через запятую)<input name="tags" placeholder="pvp, bedwars"></label>
            <label class="f" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="premiumRequired" style="width:auto"> Только для Premium</label>
            <label class="f">JSON конфига<textarea name="data" rows="7" required placeholder='{"hud":{"fps":true},"modules":{}}'></textarea></label>
            <button class="btn btn-primary">Опубликовать</button>
          </form>`);
        $('#pubform').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try {
            const tags = fd.get('tags').split(',').map((s) => s.trim()).filter(Boolean);
            await api('/api/configs', { method: 'POST', body: {
              name: fd.get('name'), description: fd.get('description'), kind: fd.get('kind'),
              mcVersion: fd.get('mcVersion'), tags, premiumRequired: fd.get('premiumRequired') === 'on',
              data: JSON.parse(fd.get('data')),
            } });
            closeModal(); toast('Конфиг опубликован!'); route();
          } catch (err) { toast(err.message, true); }
        });
      });
      await load();
    },
  };

  function featuresHtml() {
    const F = [
      ['🚀', 'FPS Boost', 'Dynamic FPS, Fast Math, умные лимиты частиц и сущностей — клиент, а не тормоз.'],
      ['👁', 'Visuals', 'ESP, Tracers, круг-индикатор на полу, кастомный прицел с realtime-превью.'],
      ['🧣', 'Косметика', 'Кейпы, крылья, ауры, следы, эмоции и значки. Бесплатный мод для просмотра.'],
      ['🎛', 'HUD', 'Полностью перетаскиваемый HUD: Keystrokes, Target HUD, CPS, Ping и другое.'],
      ['⚡', 'Performance', 'Пресеты LOW-END…ULTRA, Reduced Motion, профили под PvP/BedWars/SkyWars/SMP.'],
      ['🌐', 'Серверы', 'BUST VISUALS Network с реальным статусом, каталог «СЕРВЕРА PRO», favorites и recent.'],
      ['🧩', 'Конфиги', 'Магазин конфигов сообщества: публикуй свои профили в один клик.'],
      ['🎨', 'Кастомизация', 'Accent-цвета, UI-звуки, темы профиля — интерфейс под тебя.'],
    ];
    return `<div class="grid cols-4">${F.map(([i, t, d]) => `<div class="card"><span class="ico">${i}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>`;
  }

  async function loadServersInto(sel, heroOnly = false) {
    try {
      const { servers } = await api('/api/servers');
      const featured = servers.find((s) => s.isFeatured) || servers[0];
      const rest = servers.filter((s) => s !== featured);
      const html = featured ? serverCard(featured, true) : '<p class="muted">Серверы не добавлены</p>';
      const grid = rest.length ? `<div class="section-title">СЕРВЕРА PRO</div><div class="server-grid">${rest.map((s) => serverCard(s)).join('')}</div>` : '';
      document.querySelector(sel).innerHTML = heroOnly ? html : html + grid;
      bindServerButtons(document.querySelector(sel), servers);
    } catch { apiFail(sel); }
  }

  function bindServerButtons(root, servers) {
    root.addEventListener('click', (e) => {
      const cp = e.target.closest('[data-copyip]');
      if (cp) return copyIp(cp.dataset.copyip);
      const play = e.target.closest('[data-play]');
      if (play) toast('Запуск Minecraft — через BUST launcher (кнопка PLAY в нём подключается к ' + (servers.find((s) => s.id === play.dataset.play)?.ipDisplay || 'серверу') + ')');
    });
  }

  function apiFail(sel) {
    const el = document.querySelector(sel);
    if (el) el.innerHTML = '<p class="muted">⏳ Подключаемся к серверу…</p>';
    if (!apiFail._t) apiFail._t = setInterval(() => {
      fetch('/api/health').then((r) => { if (r.ok) { clearInterval(apiFail._t); apiFail._t = null; route(); } }).catch(() => {});
    }, 4000);
  }

  // ---------- router ----------
  async function promoPage() {
    app.innerHTML = '<h1>Промокоды</h1><form id="promo-form" class="card"><label class="f">Введите код<input id="promo-code" required maxlength="32" autocomplete="off"></label><button class="btn btn-primary">Активировать</button><p id="promo-status" role="status"></p></form>';
    $('#promo-form').onsubmit = async e => {
      e.preventDefault(); const button = e.currentTarget.querySelector('button'); button.disabled = true;
      try { const r = await api('/api/premium/promo/redeem', { method: 'POST', body: { code: $('#promo-code').value.trim() } }); $('#promo-status').textContent = r.granted === 'premium' ? 'Подписка активирована' : 'Получено: ' + r.detail.cosmetic; }
      catch(err) { $('#promo-status').textContent = err.status === 401 ? 'Войдите в аккаунт для активации промокода.' : err.message; }
      finally { button.disabled = false; }
    };
  }
  const ROUTES = { promocodes: promoPage, home: pages.home, features: pages.features, cosmetics: pages.cosmetics, premium: pages.premium, download: pages.download, servers: pages.servers, news: pages.news, status: pages.status, configs: pages.configs };
  let currentRoute = null;
  async function route() {
    pages._statusTimer && clearInterval(pages._statusTimer);
    if (location.hash.startsWith('#/oauth')) {
      const p = new URLSearchParams(location.hash.split('?')[1] || '');
      if (p.get('access')) { tokens.set({ access: p.get('access'), refresh: p.get('refresh') }); user = await currentUser(); renderUserchip(user); }
      location.hash = '#/home';
      return;
    }
    const name = (location.hash.replace('#/', '') || 'home').split('?')[0];
    const fn = ROUTES[name] || pages.home;
    currentRoute = name;
    window.scrollTo(0, 0);
    await fn();
  }
  window.addEventListener('hashchange', route);

  // init
  (async () => {
    user = await currentUser();
    renderUserchip(user);
    await route();
    // лёгкое обновление юзера каждые 60с
    setInterval(async () => { user = await currentUser(); renderUserchip(user); }, 60000);
  })();

  // ===== ЭКОНОМИКА: Кейсы / Creator / Профиль (v2) =====
  pages.cases = async function casesPage() {
    app.innerHTML = '<div class="page-head"><h1>Кейсы</h1><p>Открывай кейсы за баланс: косметика, дни Premium и денежные бонусы. Вероятности настраиваются администрацией.</p></div><div id="cases-grid"><p class="muted">Загрузка…</p></div>';
    let data;
    try { data = await api('/api/economy/cases'); } catch { return apiFail('#cases-grid'); }
    document.getElementById('cases-grid').innerHTML = data.cases.map((c) => `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
          <img src="${esc(c.image || '/cosmetics-assets/golden_cape.png')}" style="width:72px;height:72px;border-radius:12px" alt="">
          <div style="flex:1;min-width:200px">
            <h3>${esc(c.name)}</h3>
            <p class="muted" style="font-size:13px">Цена: <b style="color:var(--amber)">${c.price} ₽</b> · Лимит: ${c.monthlyLimit} / мес</p>
          </div>
          <button class="btn btn-primary" data-open="${esc(c.id)}">ОТКРЫТЬ</button>
        </div>
        <details style="margin-top:10px"><summary class="muted" style="cursor:pointer;font-size:13px">Содержимое и шансы</summary>
          <table class="tbl">${c.rewards.map((rw) => `<tr><td>${rw.type === 'cosmetic' ? 'Косметика: ' + esc(rw.payload) : rw.type === 'premium_days' ? '✦ Premium +' + rw.payload + ' дн.' : '💰 ' + rw.payload + ' ₽'}</td><td class="muted">шанс ${rw.chance}%</td></tr>`).join('')}</table>
        </details>
        <p class="muted" id="cl-${esc(c.id)}" style="font-size:12px;margin-top:6px"></p>
      </div>`).join('');
    document.getElementById('cases-grid').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-open]'); if (!btn) return;
      if (!user) return loginModal();
      try {
        const r = await api('/api/economy/cases/' + btn.dataset.open + '/open', { method: 'POST' });
        const t = r.reward.type === 'cosmetic' ? '🎁 Косметика: ' + r.reward.payload
          : r.reward.type === 'premium_days' ? '✦ Premium +' + r.reward.payload + ' дн.' : '💰 +' + r.reward.payload + ' ₽';
        toast('Открыто! ' + t + ' · Баланс: ' + r.balance + ' ₽');
      } catch (err) { toast(err.message, true); }
    });
  };

  pages.creator = async function creatorPage() {
    if (!user) return loginModal();
    app.innerHTML = '<div class="page-head"><h1>Content Creator</h1><p>200 просмотров = 50 ₽ (порог настраивается). Отправляй ссылки — после проверки администратора начисление придёт на баланс.</p></div><div id="cr-body"><p class="muted">Загрузка…</p></div>';
    let c;
    try { c = await api('/api/economy/creator'); } catch { return apiFail('#cr-body'); }
    document.getElementById('cr-body').innerHTML = `
      <div class="grid cols-3">
        <div class="card"><h3>Просмотры</h3><p style="font-size:28px;font-weight:800">${c.views}</p></div>
        <div class="card"><h3>Заработано</h3><p style="font-size:28px;font-weight:800;color:var(--amber)">${c.earned} ₽</p></div>
        <div class="card"><h3>Ставка</h3><p style="font-size:20px;font-weight:800">${c.rate.views} просм. = ${c.rate.rub} ₽</p></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h3>Отправить на проверку</h3>
        <form class="stack" id="cr-form" style="margin-top:10px">
          <label class="f">Ссылка на видео<input name="link" required placeholder="https://…"></label>
          <label class="f">Просмотры<input name="views" type="number" min="1" required></label>
          <button class="btn btn-primary">Отправить</button>
        </form>
      </div>
      <h2 class="section-title">История заявок</h2>
      <table class="tbl"><tr><th>Дата</th><th>Ссылка</th><th>Просмотры</th><th>Награда</th><th>Статус</th></tr>
      ${c.submissions.map((s) => `<tr><td class="muted">${fmtDate(s.created_at)}</td><td><a href="${esc(s.link)}" target="_blank" rel="noopener" class="muted">${esc(s.link.slice(0, 40))}…</a></td><td>${s.views}</td><td>${s.reward ? s.reward + ' ₽' : '—'}</td><td>${s.status === 'confirmed' ? '<span class="pill ok">ПОДТВЕРЖДЕНО</span>' : '<span class="pill am">НА ПРОВЕРКЕ</span>'}</td></tr>`).join('')}</table>`;
    document.getElementById('cr-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try { await api('/api/economy/creator/submit', { method: 'POST', body: { link: fd.get('link'), views: +fd.get('views') } }); toast('Отправлено на проверку'); pages.creator(); }
      catch (err) { toast(err.message, true); }
    });
  };

  pages.profile = async function profilePage() {
    if (!user) return loginModal();
    app.innerHTML = '<div class="page-head"><h1>Профиль</h1></div><div id="pf-body"><p class="muted">Загрузка…</p></div>';
    let p;
    try { p = await api('/api/economy/profile'); } catch { return apiFail('#pf-body'); }
    const prem = p.premium;
    const premLine = prem.isLifetime ? '✦ НАВСЕГДА' : prem.active ? '✦ до ' + fmtDate(prem.expiresAt) + ' (осталось ' + prem.daysLeft + ' дн.)' : 'Free аккаунт';
    document.getElementById('pf-body').innerHTML = `
      <div class="grid cols-3">
        <div class="card"><h3>Баланс</h3><p style="font-size:30px;font-weight:800;color:var(--amber)">${p.balance} ₽</p>
          <div class="chips" style="margin-top:10px">
            <button class="btn btn-primary" id="pf-topup">Пополнить</button>
            <button class="btn btn-ghost" id="pf-withdraw">Вывести</button>
          </div></div>
        <div class="card"><h3>Premium</h3><p style="font-size:18px;font-weight:800">${premLine}</p><p class="muted" style="font-size:13px">Тариф: ${prem.plan ? esc(prem.plan) : '—'}</p></div>
        <div class="card"><h3>Аккаунты</h3>${p.minecraft[0] ? `<img src="https://mc-heads.net/body/${encodeURIComponent(p.minecraft[0].username)}/100" alt="${esc(p.minecraft[0].username)}" style="width:96px;height:154px;object-fit:contain;image-rendering:pixelated;filter:drop-shadow(0 0 16px rgba(126,99,255,.65));animation:cosPulse 2.2s ease-in-out infinite">` : ''}<p class="muted" style="font-size:13px">${p.minecraft[0] ? esc(p.minecraft[0].username) : 'Добавьте локальный ник'} · Minecraft-профиль</p><p class="muted" style="font-size:13px">Discord: ${p.discord ? esc(p.discord.username) : 'не привязан'}</p>
          ${p.minecraft.map((m) => '<p class="muted" style="font-size:13px">MC: ' + esc(m.username) + (m.type === 'microsoft' ? ' (лицензия)' : ' (офлайн)') + (m.active ? ' ✓' : '') + '</p>').join('')}</div>
      </div>
      <h2 class="section-title">Косметика (${p.cosmetics.owned.length})</h2>
      <div class="grid cols-4">${p.cosmetics.owned.map((c) => `<div class="card cos-card ${c.price ? 'premium' : ''}"><div class="rar-line rar-${esc(c.rarity)}" style="background:currentColor"></div><h3>${esc(c.name)}</h3><p class="rar-${esc(c.rarity)}" style="font-size:12px;font-weight:800">${esc(c.rarity)}</p>${Object.values(p.cosmetics.equipped).includes(c.id) ? '<span class="temp">АКТИВНА</span>' : ''}</div>`).join('') || '<p class="muted">Пусто</p>'}</div>
      <h2 class="section-title">История операций</h2>
      <table class="tbl"><tr><th>Дата</th><th>Тип</th><th>Сумма</th></tr>
      ${p.history.transactions.map((t) => `<tr><td class="muted">${fmtDate(t.created_at)}</td><td>${esc(t.kind)}</td><td style="color:${t.amount >= 0 ? 'var(--green)' : 'var(--red)'}">${t.amount >= 0 ? '+' : ''}${t.amount} ₽</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Пусто</td></tr>'}</table>
      <h2 class="section-title">Кейсы и выводы</h2>
      <table class="tbl"><tr><th>Дата</th><th>Кейс</th><th>Награда</th></tr>
      ${p.history.caseOpenings.map((o) => `<tr><td class="muted">${fmtDate(o.created_at)}</td><td>${esc(o.case_id)}</td><td>${esc(o.reward_type)}: ${esc(o.reward_payload)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Пусто</td></tr>'}</table>
      <table class="tbl" style="margin-top:10px"><tr><th>Дата</th><th>Вывод</th><th>Метод</th><th>Статус</th></tr>
      ${p.history.withdrawals.map((w) => `<tr><td class="muted">${fmtDate(w.created_at)}</td><td>${w.amount} ₽</td><td>${esc(w.method)}</td><td>${w.status === 'paid' ? '<span class="pill ok">ВЫПЛАЧЕНО</span>' : w.status === 'rejected' ? '<span class="pill no">ОТКЛОНЕНО</span>' : '<span class="pill am">НА РАССМОТРЕНИИ</span>'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Пусто</td></tr>'}</table>`;
    document.getElementById('pf-topup').onclick = async () => {
      const amount = parseInt(prompt('Сумма пополнения (₽):'));
      if (!amount) return;
      try {
        const r = await api('/api/economy/balance/topup', { method: 'POST', body: { amount } });
        if (r.order.paymentUrl) window.open(r.order.paymentUrl, '_blank', 'noopener');
        else toast('Платёж создан. Оплата подключается администратором — заказ ' + r.order.id.slice(0, 8));
      } catch (err) { toast(err.message, true); }
    };
    document.getElementById('pf-withdraw').onclick = async () => {
      let wd; try { wd = await api('/api/economy/withdrawals'); } catch { return toast('Сервис вывода недоступен', true); }
      const amount = parseInt(prompt('Сумма вывода (мин. ' + wd.minAmount + ' ₽):'));
      if (!amount) return;
      const method = prompt('Способ (' + wd.methods.join('/') + '):') || '';
      const details = prompt('Реквизиты:') || '';
      try { const r = await api('/api/economy/withdrawals', { method: 'POST', body: { amount, method, details } }); toast('Заявка создана, баланс: ' + r.balance + ' ₽'); pages.profile(); }
      catch (err) { toast(err.message, true); }
    };
  };

  Object.assign(ROUTES, { cases: pages.cases, creator: pages.creator, profile: pages.profile });
})();
