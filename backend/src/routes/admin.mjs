import { Router } from 'express';
import { q, audit } from '../db.mjs';
import { fail, uid, rid, premiumActive, publicUser } from '../util.mjs';
import { adminRequired } from '../middleware.mjs';
import { LEGAL_DOCUMENTS } from '../legal.mjs';
import { activatePremium } from './premium.mjs';
import { enqueueForType, enqueueForUser } from '../notify.mjs';

const r = Router();
r.use(adminRequired);

r.get('/legal', (req, res) => {
  const documents = Object.fromEntries(Object.keys(LEGAL_DOCUMENTS).map((key) => {
    const raw = q.get('SELECT value FROM settings WHERE key = ?', `legal_${key}`)?.value;
    try { return [key, JSON.parse(raw)]; } catch { return [key, LEGAL_DOCUMENTS[key]]; }
  }));
  res.json({ documents });
});
r.put('/legal/:doc', (req, res) => {
  if (!LEGAL_DOCUMENTS[req.params.doc]) return fail(res, 404, 'not_found', 'Документ не найден');
  const title = str_(req.body?.title, 120) || LEGAL_DOCUMENTS[req.params.doc].title;
  const html = str_(req.body?.html, 100000);
  if (!html) return fail(res, 400, 'invalid', 'Текст документа обязателен');
  const value = { title, html };
  q.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)', `legal_${req.params.doc}`, JSON.stringify(value));
  audit(req.user.id, 'legal.update', req.params.doc, { title });
  res.json({ ok: true, document: value });
});

r.get('/stats', (req, res) => {
  const day7 = Date.now() - 7 * 24 * 3600 * 1000;
  const day1 = Date.now() - 24 * 3600 * 1000;
  res.json({
    users: q.get('SELECT COUNT(*) c FROM users').c,
    premiumUsers: q.get("SELECT COUNT(*) c FROM users WHERE premium_is_lifetime = 1 OR (premium_expires_at IS NOT NULL AND premium_expires_at > ?)", Date.now()).c,
    orders: q.get('SELECT COUNT(*) c FROM orders').c,
    revenueRub: q.get("SELECT COALESCE(SUM(amount_rub),0) s FROM orders WHERE status = 'paid'").s,
    serversOnline: q.get("SELECT COUNT(*) c FROM server_status WHERE state = 'ONLINE'").c,
    sessions24h: q.get('SELECT COUNT(*) c FROM sessions WHERE created_at > ?', day1).c,
    newUsers7d: q.get('SELECT COUNT(*) c FROM users WHERE created_at > ?', day7).c,
    configs: q.get('SELECT COUNT(*) c FROM configs').c,
    telegramLinked: q.get('SELECT COUNT(*) c FROM tg_accounts').c,
  });
});

// ---- servers (IP меняется здесь) ----
const SERVER_FIELDS = ['name', 'host', 'port', 'mc_version', 'game_mode', 'is_temp_ip', 'is_featured', 'hidden', 'sort_order', 'banner_url'];

r.get('/servers', (req, res) => {
  res.json({ servers: q.all('SELECT * FROM servers ORDER BY is_featured DESC, sort_order ASC') });
});

r.post('/servers', (req, res) => {
  const b = req.body || {};
  if (!str_(b.name, 48) || !str_(b.host, 120)) return fail(res, 400, 'invalid', 'name и host обязательны');
  const id = uid();
  q.run('INSERT INTO servers (id, name, host, port, mc_version, game_mode, is_temp_ip, is_featured, hidden, sort_order, banner_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    id, b.name.trim(), b.host.trim(), parseInt(b.port) || 25565, str_(b.mcVersion, 16) || '1.16.5',
    str_(b.gameMode, 32) || 'SMP', b.isTempIp ? 1 : 0, b.isFeatured ? 1 : 0, b.hidden ? 1 : 0,
    parseInt(b.sortOrder) || 100, str_(b.bannerUrl, 500), Date.now());
  audit(req.user.id, 'server.create', id, { name: b.name, host: b.host, port: b.port });
  res.json({ ok: true, id });
});

r.patch('/servers/:id', (req, res) => {
  const s = q.get('SELECT * FROM servers WHERE id = ?', req.params.id);
  if (!s) return fail(res, 404, 'not_found', 'Сервер не найден');
  const b = req.body || {};
  const set = [], params = [];
  const map = { name: 'name', host: 'host', port: 'port', mcVersion: 'mc_version', gameMode: 'game_mode', isTempIp: 'is_temp_ip', isFeatured: 'is_featured', hidden: 'hidden', sortOrder: 'sort_order', bannerUrl: 'banner_url' };
  for (const [k, col] of Object.entries(map)) {
    if (b[k] === undefined) continue;
    let v = b[k];
    if (['port', 'sort_order'].includes(col)) v = parseInt(v) || 0;
    if (['is_temp_ip', 'is_featured', 'hidden'].includes(col)) v = v ? 1 : 0;
    if (typeof v === 'string') { v = v.trim(); if (!v && col !== 'banner_url') return fail(res, 400, 'invalid', `${k} не может быть пустым`); }
    set.push(`${col} = ?`); params.push(v);
  }
  if (!set.length) return fail(res, 400, 'nothing', 'Нет полей для обновления');
  params.push(s.id);
  q.run(`UPDATE servers SET ${set.join(', ')} WHERE id = ?`, ...params);
  audit(req.user.id, 'server.update', s.id, b);
  res.json({ ok: true });
});

r.delete('/servers/:id', (req, res) => {
  const s = q.get('SELECT * FROM servers WHERE id = ?', req.params.id);
  if (!s) return fail(res, 404, 'not_found', 'Сервер не найден');
  q.run('DELETE FROM servers WHERE id = ?', s.id);
  audit(req.user.id, 'server.delete', s.id, { name: s.name });
  res.json({ ok: true });
});

// ---- news ----
r.get('/news', (req, res) => {
  res.json({ news: q.all('SELECT * FROM news ORDER BY published_at DESC LIMIT 100') });
});
r.post('/news', (req, res) => {
  const title = str_(req.body?.title, 120);
  const body = str_(req.body?.body, 8000);
  if (!title || !body) return fail(res, 400, 'invalid', 'title и body обязательны');
  const id = uid();
  q.run('INSERT INTO news (id, title, body, image, published_at) VALUES (?,?,?,?,?)', id, title, body, str_(req.body?.image, 500), Date.now());
  enqueueForType('news', '📰 Новость BUST VISUALS', title);
  audit(req.user.id, 'news.create', id, { title });
  res.json({ ok: true, id });
});
r.patch('/news/:id', (req, res) => {
  const n = q.get('SELECT * FROM news WHERE id = ?', req.params.id);
  if (!n) return fail(res, 404, 'not_found', 'Новость не найдена');
  q.run('UPDATE news SET title = ?, body = ?, image = ? WHERE id = ?',
    str_(req.body?.title, 120) || n.title, str_(req.body?.body, 8000) || n.body,
    req.body?.image !== undefined ? str_(req.body?.image, 500) : n.image, n.id);
  audit(req.user.id, 'news.update', n.id, {});
  res.json({ ok: true });
});
r.delete('/news/:id', (req, res) => {
  q.run('DELETE FROM news WHERE id = ?', req.params.id);
  audit(req.user.id, 'news.delete', req.params.id, {});
  res.json({ ok: true });
});

// ---- cosmetics ----
r.get('/cosmetics', (req, res) => res.json({ cosmetics: q.all('SELECT * FROM cosmetics ORDER BY category, sort_order') }));

r.post('/cosmetics', (req, res) => {
  const id = str_(req.body?.id, 48)?.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const name = str_(req.body?.name, 48);
  const category = str_(req.body?.category, 24);
  if (!id || !name || !['capes', 'wings', 'hats', 'auras', 'particles', 'trails', 'emotes', 'badges'].includes(category)) {
    return fail(res, 400, 'invalid', 'id, name и корректная category обязательны');
  }
  q.run('INSERT INTO cosmetics (id, name, category, rarity, description, premium, asset_url, animated, enabled, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)',
    id, name, category, str_(req.body?.rarity, 16) || 'COMMON', str_(req.body?.description, 280),
    req.body?.premium ? 1 : 0, str_(req.body?.assetUrl, 300), req.body?.animated ? 1 : 0, 1, parseInt(req.body?.sortOrder) || 100);
  audit(req.user.id, 'cosmetic.create', id, { name, category });
  res.json({ ok: true, id });
});

r.patch('/cosmetics/:id', (req, res) => {
  const c = q.get('SELECT * FROM cosmetics WHERE id = ?', req.params.id);
  if (!c) return fail(res, 404, 'not_found', 'Косметика не найдена');
  const map = { name: 'name', category: 'category', rarity: 'rarity', description: 'description', assetUrl: 'asset_url', sortOrder: 'sort_order' };
  const set = [], params = [];
  for (const [k, col] of Object.entries(map)) if (req.body?.[k] !== undefined) { set.push(`${col} = ?`); params.push(String(req.body[k]).slice(0, 300)); }
  if (req.body?.premium !== undefined) { set.push('premium = ?'); params.push(req.body.premium ? 1 : 0); }
  if (req.body?.animated !== undefined) { set.push('animated = ?'); params.push(req.body.animated ? 1 : 0); }
  if (req.body?.enabled !== undefined) { set.push('enabled = ?'); params.push(req.body.enabled ? 1 : 0); }
  if (!set.length) return fail(res, 400, 'nothing', 'Нет полей');
  params.push(c.id);
  q.run(`UPDATE cosmetics SET ${set.join(', ')} WHERE id = ?`, ...params);
  audit(req.user.id, 'cosmetic.update', c.id, req.body);
  res.json({ ok: true });
});

r.delete('/cosmetics/:id', (req, res) => {
  q.run('DELETE FROM cosmetics WHERE id = ?', req.params.id);
  audit(req.user.id, 'cosmetic.delete', req.params.id, {});
  res.json({ ok: true });
});

r.post('/cosmetics/:id/grant', (req, res) => {
  const c = q.get('SELECT * FROM cosmetics WHERE id = ?', req.params.id);
  const u = q.get('SELECT * FROM users WHERE id = ?', req.body?.userId);
  if (!c || !u) return fail(res, 404, 'not_found', 'Косметика или пользователь не найдены');
  q.run('INSERT OR IGNORE INTO user_cosmetics (user_id, cosmetic_id, granted_at) VALUES (?,?,?)', u.id, c.id, Date.now());
  audit(req.user.id, 'cosmetic.grant', `${c.id} -> ${u.id}`, {});
  res.json({ ok: true });
});

r.post('/cosmetics/:id/revoke', (req, res) => {
  const c = q.get('SELECT * FROM cosmetics WHERE id = ?', req.params.id);
  const u = q.get('SELECT * FROM users WHERE id = ?', req.body?.userId);
  if (!c || !u) return fail(res, 404, 'not_found', 'Косметика или пользователь не найдены');
  q.run('DELETE FROM user_cosmetics WHERE user_id = ? AND cosmetic_id = ?', u.id, c.id);
  q.run(`UPDATE equipped SET ${c.category} = NULL WHERE user_id = ? AND ${c.category} = ?`, u.id, c.id);
  audit(req.user.id, 'cosmetic.revoke', `${c.id} -> ${u.id}`, {});
  res.json({ ok: true });
});

// ---- users / premium ----
r.get('/users', (req, res) => {
  const query = str_(req.query.q, 64);
  const like = query ? `%${query}%` : '%';
  const rows = q.all(`SELECT * FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY created_at DESC LIMIT 100`, like, like);
  res.json({ users: rows.map((u) => ({ ...publicUser(u), premiumActive: premiumActive(u), passwordSet: !!u.password_hash,
    mcAccounts: q.all('SELECT id, username, uuid, type, active, created_at FROM mc_accounts WHERE user_id = ? ORDER BY active DESC, created_at DESC', u.id) })) });
});

r.post('/users/:id/premium', (req, res) => {
  const u = q.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u) return fail(res, 404, 'not_found', 'Пользователь не найден');
  const plan = str_(req.body?.plan, 16);
  if (!['month', 'days90', 'year', 'lifetime'].includes(plan)) return fail(res, 400, 'invalid_plan', 'plan: month|days90|year|lifetime');
  activatePremium(u.id, plan, 'admin');
  enqueueForUser(u.id, 'premium', '✦ BUST PREMIUM активирован', 'Администратор выдал Premium. Приятной игры!');
  audit(req.user.id, 'premium.grant', u.id, { plan });
  res.json({ ok: true });
});

r.post('/users/:id/premium/revoke', (req, res) => {
  const u = q.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u) return fail(res, 404, 'not_found', 'Пользователь не найден');
  q.run('UPDATE users SET premium_tier = NULL, premium_plan = NULL, premium_is_lifetime = 0, premium_expires_at = NULL WHERE id = ?', u.id);
  audit(req.user.id, 'premium.revoke', u.id, {});
  res.json({ ok: true });
});

r.post('/users/:id/role', (req, res) => {
  const role = req.body?.role;
  if (!['user', 'admin'].includes(role)) return fail(res, 400, 'invalid_role', 'role: user|admin');
  if (req.params.id === req.user.id && role !== 'admin') return fail(res, 400, 'self_demote', 'Нельзя снять админа с себя');
  q.run('UPDATE users SET role = ? WHERE id = ?', role, req.params.id);
  audit(req.user.id, 'user.role', req.params.id, { role });
  res.json({ ok: true });
});

// ---- orders / promocodes / telegram / audit ----
r.get('/orders', (req, res) => {
  res.json({ orders: q.all('SELECT o.*, u.username FROM orders o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 200') });
});

r.get('/promocodes', (req, res) => res.json({ promocodes: q.all('SELECT * FROM promocodes ORDER BY created_at DESC') }));
r.post('/promocodes', (req, res) => {
  const code = str_(req.body?.code, 32)?.toUpperCase();
  const kind = str_(req.body?.kind, 16);
  const payload = str_(req.body?.payload, 48);
  if (!code || !['premium', 'cosmetic'].includes(kind) || !payload) return fail(res, 400, 'invalid', 'code, kind (premium|cosmetic) и payload обязательны');
  const id = uid();
  q.run('INSERT INTO promocodes (id, code, kind, payload, max_activations, active, created_at) VALUES (?,?,?,?,?,1,?)',
    id, code, kind, payload, req.body?.maxActivations ? parseInt(req.body.maxActivations) : null, Date.now());
  audit(req.user.id, 'promo.create', code, { kind, payload });
  res.json({ ok: true, id });
});
r.delete('/promocodes/:id', (req, res) => {
  q.run('DELETE FROM promocodes WHERE id = ?', req.params.id);
  audit(req.user.id, 'promo.delete', req.params.id, {});
  res.json({ ok: true });
});

r.get('/telegram', (req, res) => {
  res.json({ accounts: q.all('SELECT t.*, u.username AS waffle_username FROM tg_accounts t JOIN users u ON u.id = t.user_id ORDER BY t.linked_at DESC LIMIT 200') });
});

r.get('/audit', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  res.json({ entries: q.all('SELECT a.*, u.username AS admin_name FROM audit_log a LEFT JOIN users u ON u.id = a.admin_id ORDER BY a.created_at DESC LIMIT ?', limit) });
});

// ---- configs moderation ----
r.get('/configs', (req, res) => {
  const status = str_(req.query.status, 16);
  const where = status ? 'WHERE c.status = ?' : '';
  const params = status ? [status] : [];
  res.json({ configs: q.all(`SELECT c.*, u.username AS author_name FROM configs c LEFT JOIN users u ON u.id = c.author_id ${where} ORDER BY c.created_at DESC LIMIT 200`, ...params) });
});
r.post('/configs/:id/moderate', (req, res) => {
  const status = req.body?.status;
  if (!['published', 'unlisted'].includes(status)) return fail(res, 400, 'invalid_status', 'status: published|unlisted');
  q.run('UPDATE configs SET status = ? WHERE id = ?', status, req.params.id);
  audit(req.user.id, 'config.moderate', req.params.id, { status });
  res.json({ ok: true });
});
r.delete('/configs/:id', (req, res) => {
  q.run('DELETE FROM configs WHERE id = ?', req.params.id);
  audit(req.user.id, 'config.delete', req.params.id, {});
  res.json({ ok: true });
});

// ---- updates management ----
r.get('/updates', (req, res) => res.json({ updates: q.all('SELECT * FROM updates ORDER BY published_at DESC LIMIT 100') }));
r.post('/updates', (req, res) => {
  const channel = str_(req.body?.channel, 16);
  const version = str_(req.body?.version, 24);
  if (!channel || !['launcher', 'client', 'cosmetic-mod'].includes(channel) || !version) {
    return fail(res, 400, 'invalid', 'channel (launcher|client|cosmetic-mod) и version обязательны');
  }
  const id = uid();
  q.run('INSERT INTO updates (id, channel, version, mc_version, changelog, download_url, size_bytes, sha256, published_at) VALUES (?,?,?,?,?,?,?,?,?)',
    id, channel, version, str_(req.body?.mcVersion, 16), str_(req.body?.changelog, 4000),
    str_(req.body?.downloadUrl, 500), req.body?.sizeBytes ? parseInt(req.body.sizeBytes) : null,
    str_(req.body?.sha256, 128), Date.now());
  if (channel === 'cosmetic-mod') {
    const mc = str_(req.body?.mcVersion, 16);
    if (mc) q.run("UPDATE mc_versions SET client_status = 'ready' WHERE mc = ?", mc);
  }
  enqueueForType('updates', '🚀 Обновление BUST VISUALS', `${channel} ${version}`);
  audit(req.user.id, 'update.publish', `${channel}@${version}`, {});
  res.json({ ok: true, id });
});

// ---- Minecraft versions management ----
r.get('/mc-versions', (req, res) => {
  res.json({ versions: q.all('SELECT * FROM mc_versions ORDER BY sort_order DESC, mc DESC') });
});
r.patch('/mc-versions/:mc', (req, res) => {
  const mc = String(req.params.mc || '').trim();
  const row = q.get('SELECT * FROM mc_versions WHERE mc = ?', mc);
  if (!row) return fail(res, 404, 'not_found', 'Версия Minecraft не найдена');
  const supported = req.body?.supported === undefined ? row.supported : (req.body.supported ? 1 : 0);
  const status = ['planned', 'ready', 'disabled'].includes(req.body?.clientStatus) ? req.body.clientStatus : row.client_status;
  q.run('UPDATE mc_versions SET supported = ?, client_status = ? WHERE mc = ?', supported, status, mc);
  audit(req.user.id, 'mc_version.update', mc, { supported, clientStatus: status });
  res.json({ ok: true, version: q.get('SELECT * FROM mc_versions WHERE mc = ?', mc) });
});

// ---- ЭКОНОМИКА: тарифы, балансы, выводы, кейсы, creator, настройки ----

r.get('/plans', (req, res) => res.json({ plans: q.all('SELECT * FROM premium_plans ORDER BY sort_order') }));
r.patch('/plans/:id', (req, res) => {
  const p = q.get('SELECT * FROM premium_plans WHERE id = ?', req.params.id);
  if (!p) return fail(res, 404, 'not_found', 'Тариф не найден');
  q.run('UPDATE premium_plans SET title = ?, price_rub = ?, days = ? WHERE id = ?',
    str_(req.body?.title, 40) || p.title, req.body?.priceRub !== undefined ? parseInt(req.body.priceRub) || p.price_rub : p.price_rub,
    req.body?.days !== undefined ? (req.body.days === null ? null : parseInt(req.body.days)) : p.days, p.id);
  audit(req.user.id, 'plan.update', p.id, req.body);
  res.json({ ok: true });
});

r.post('/users/:id/balance', async (req, res) => {
  const u = q.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u) return fail(res, 404, 'not_found', 'Пользователь не найден');
  const delta = parseInt(req.body?.delta);
  if (!delta) return fail(res, 400, 'invalid', 'Укажите delta (± рублей)');
  const { changeBalance, tx } = await import('./economy.mjs');
  changeBalance(u.id, delta);
  tx(u.id, delta > 0 ? 'admin_credit' : 'admin_debit', delta, { by: req.user.username });
  audit(req.user.id, 'balance.adjust', u.id, { delta });
  res.json({ ok: true, balance: q.get('SELECT balance FROM users WHERE id = ?', u.id).balance });
});

r.get('/withdrawals', (req, res) => {
  res.json({ withdrawals: q.all('SELECT w.*, u.username, u.email FROM withdrawals w LEFT JOIN users u ON u.id = w.user_id ORDER BY w.created_at DESC LIMIT 200') });
});
r.post('/withdrawals/:id/moderate', async (req, res) => {
  const w = q.get('SELECT * FROM withdrawals WHERE id = ?', req.params.id);
  if (!w) return fail(res, 404, 'not_found', 'Заявка не найдена');
  const status = req.body?.status;
  if (!['paid', 'rejected'].includes(status)) return fail(res, 400, 'invalid_status', 'status: paid | rejected');
  if (status === 'rejected') {
    const { changeBalance, tx } = await import('./economy.mjs');
    changeBalance(w.user_id, w.amount);
    tx(w.user_id, 'withdrawal_reject', w.amount, { withdrawalId: w.id });
  }
  q.run('UPDATE withdrawals SET status = ?, processed_at = ?, admin_note = ? WHERE id = ?', status, Date.now(), str_(req.body?.note, 200), w.id);
  enqueueForUser(w.user_id, 'payouts', status === 'paid' ? '💸 Выплата отправлена' : '💸 Заявка отклонена',
    `${w.amount} ₽ · ${w.method}${req.body?.note ? ' — ' + req.body.note : ''}`);
  audit(req.user.id, 'withdrawal.' + status, w.id, { amount: w.amount });
  res.json({ ok: true });
});

r.get('/cases', (req, res) => {
  res.json({ cases: q.all('SELECT * FROM cases').map((c) => ({ ...c, rewards: q.all('SELECT * FROM case_rewards WHERE case_id = ?', c.id) })) });
});
r.post('/cases', (req, res) => {
  const id = str_(req.body?.id, 48)?.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  if (!id || !str_(req.body?.name, 48)) return fail(res, 400, 'invalid', 'id и name обязательны');
  q.run('INSERT INTO cases (id, name, image, price, enabled, monthly_limit) VALUES (?,?,?,?,?,?)',
    id, req.body.name, str_(req.body?.image, 200), parseInt(req.body?.price) || 49, req.body?.enabled === false ? 0 : 1, parseInt(req.body?.monthlyLimit) || 3);
  audit(req.user.id, 'case.create', id, {});
  res.json({ ok: true, id });
});
r.patch('/cases/:id', (req, res) => {
  const c = q.get('SELECT * FROM cases WHERE id = ?', req.params.id);
  if (!c) return fail(res, 404, 'not_found', 'Кейс не найден');
  q.run('UPDATE cases SET price = ?, enabled = ?, monthly_limit = ?, image = ? WHERE id = ?',
    req.body?.price !== undefined ? parseInt(req.body.price) : c.price,
    req.body?.enabled !== undefined ? (req.body.enabled ? 1 : 0) : c.enabled,
    req.body?.monthlyLimit !== undefined ? parseInt(req.body.monthlyLimit) : c.monthly_limit,
    req.body?.image !== undefined ? str_(req.body.image, 200) : c.image, c.id);
  audit(req.user.id, 'case.update', c.id, req.body);
  res.json({ ok: true });
});
r.post('/cases/:id/rewards', (req, res) => {
  const c = q.get('SELECT * FROM cases WHERE id = ?', req.params.id);
  if (!c) return fail(res, 404, 'not_found', 'Кейс не найден');
  const type = str_(req.body?.type, 20);
  if (!['cosmetic', 'premium_days', 'money'].includes(type) || !req.body?.payload) return fail(res, 400, 'invalid', 'type: cosmetic|premium_days|money и payload обязательны');
  const id = uid();
  q.run('INSERT INTO case_rewards (id, case_id, type, payload, weight) VALUES (?,?,?,?,?)',
    id, c.id, type, String(req.body.payload), parseInt(req.body?.weight) || 10);
  audit(req.user.id, 'case.reward.add', c.id, req.body);
  res.json({ ok: true, id });
});
r.delete('/cases/:id/rewards/:rid', (req, res) => {
  q.run('DELETE FROM case_rewards WHERE id = ? AND case_id = ?', req.params.rid, req.params.id);
  audit(req.user.id, 'case.reward.delete', req.params.rid, {});
  res.json({ ok: true });
});

r.get('/creator', (req, res) => {
  res.json({
    submissions: q.all(`SELECT v.*, u.username FROM creator_views v LEFT JOIN users u ON u.id = v.user_id ORDER BY v.created_at DESC LIMIT 200`),
    profiles: q.all('SELECT cp.*, u.username FROM creator_profiles cp LEFT JOIN users u ON u.id = cp.user_id'),
    settings: Object.fromEntries(q.all('SELECT key, value FROM settings WHERE key LIKE ?').map((x) => [x.key, x.value])),
  });
});
r.post('/creator/:id/confirm', async (req, res) => {
  const v = q.get('SELECT * FROM creator_views WHERE id = ?', req.params.id);
  if (!v || v.status !== 'pending') return fail(res, 404, 'not_found', 'Заявка не найдена или уже обработана');
  const perViews = parseInt(getSettingK('creator_views_per_reward', '200'));
  const perRub = parseInt(getSettingK('creator_reward_rub', '50'));
  const reward = Math.floor(v.views / perViews) * perRub;
  if (reward > 0) {
    const { changeBalance, tx } = await import('./economy.mjs');
    changeBalance(v.user_id, reward);
    tx(v.user_id, 'creator', reward, { views: v.views, link: v.link });
    q.run('UPDATE creator_profiles SET views_confirmed = views_confirmed + ?, earned = earned + ? WHERE user_id = ?', v.views, reward, v.user_id);
    enqueueForUser(v.user_id, 'payouts', '🎥 Creator начисление', `+${reward} ₽ за ${v.views} просмотров`);
  }
  q.run("UPDATE creator_views SET status = 'confirmed', reward = ?, confirmed_at = ? WHERE id = ?", reward, Date.now(), v.id);
  audit(req.user.id, 'creator.confirm', v.id, { views: v.views, reward });
  res.json({ ok: true, reward });
});
r.post('/creator/settings', (req, res) => {
  for (const k of ['creator_views_per_reward', 'creator_reward_rub', 'withdrawal_min', 'withdrawal_methods', 'case_monthly_limit_default']) {
    if (req.body?.[k] !== undefined) q.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)', k, String(req.body[k]));
  }
  audit(req.user.id, 'settings.update', 'economy', req.body);
  res.json({ ok: true });
});

function getSettingK(k, d) { return q.get('SELECT value FROM settings WHERE key = ?', k)?.value ?? d; }

function str_(v, max = 255) { return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null; }

export default r;
