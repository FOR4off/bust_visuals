# 🧇 WAFFLE VISUALS

> **LOOK BETTER. PLAY FASTER. EXPRESS YOURSELF.**
> Современный Minecraft Visual Client: производительность, визуальные эффекты, HUD, косметика, серверы, launcher, сайт и Telegram-бот — единая экосистема.

BEAUTY + PERFORMANCE + FUNCTIONALITY. FPS > EFFECTS — но премиально в любом режиме.

---

## Состав экосистемы

| Компонент | Что это | Где |
|---|---|---|
| **Backend** | Node.js API + SQLite, реальный server status (TCP ping), JWT-аутентификация, OAuth, Premium + платежи, Config Shop, админ-API, WebSocket | `backend/` |
| **Website** | Тёмный сайт: hero, фичи, косметика, Premium, скачивания, серверы (live), новости, статус, магазин конфигов | `backend/public/site` → `/site/` |
| **Admin Panel** | Управление: серверы (смена IP «ВРЕМЕННЫЙ IP»), юзеры, Premium, косметика, новости, конфиги, промокоды, аудит | `backend/public/admin` → `/admin` |
| **Launcher** | Electron-приложение: вход (email / Discord / Telegram / Steam / Microsoft), дашборд с WAFFLE SMP, реальный запуск Minecraft 1.16.5, косметика, Config Shop, версии | `launcher/` |
| **Minecraft Client** | Полный Fabric-клиент (отдельное приложение): HUD, Visuals (ESP/Tracers/круг и др.), Performance engine, косметика | `minecraft-client/` |
| **Cosmetic Mod** | **Бесплатный** мод — видна только косметика других игроков, 1.16.5 → новейшая | `cosmetic-mod/` |
| **Telegram Bot** | @WaffleVisualsBot — профиль, серверы, premium, новости, уведомления, привязка аккаунта | `telegram-bot/` |

Схема: `docs/ARCHITECTURE.md`. API и схема БД — контракт: [CONTRACT.md](CONTRACT.md).

## Быстрый старт (backend + сайт + админка + бот)

```bash
npm install                 # workspaces
npm start                   # backend → http://localhost:4000
npm run start:bot           # Telegram-бот (нужен BOT_TOKEN в telegram-bot/.env)
```

Откроется:

- Сайт — http://localhost:4000/site/
- Админка — http://localhost:4000/admin
- API — http://localhost:4000/api/health

При первом старте создаётся админ: `admin@waffle.local` / `WaffleAdmin!2026` (**смените после деплоя**).

### Требования
- Node.js ≥ 22.13 (используется встроенный `node:sqlite`, нативных модулей нет)
- Для бота — токен от @BotFather в `telegram-bot/.env` (если `api.telegram.org` заблокирован — см. раздел прокси ниже)

### Конфигурация
Все секреты — в `.env` (в git не попадают, есть `.env.example`):

- `backend/.env` — PORT, JWT_SECRET, INTERNAL_SECRET, PAYMENT_WEBHOOK_SECRET, OAuth (Discord/Steam), AZURE_CLIENT_ID (лицензионный вход), YooKassa (оплата)
- `telegram-bot/.env` — BOT_TOKEN, API_URL, INTERNAL_SECRET

## Возможности бесплатно vs Premium

**FREE (всегда):** полный базовый клиент, FPS-оптимизация, базовый HUD и Visuals, бесплатные косметики, серверы, launcher, **бесплатный Cosmetic Mod**, магазин конфигов.

**✦ PREMIUM (100 ₽ / 200 ₽ / 400 ₽ / 500 ₽ навсегда):** Premium-косметика (кейпы, крылья, ауры, частицы, эмоции, значок ✦), HUD-темы, анимации, доп. слоты и настройки. Статус хранится на сервере — синхронизируется везде, активация только через верифицированный webhook или админа.

## Server status — реальный

Backend сам опрашивает WAFFLE SMP (`213.171.18.147:31614`, помечен **ВРЕМЕННЫЙ IP**) по протоколу Server List Ping и раздаёт живой статус по REST и WebSocket. IP хранится **только в БД** и меняется через Admin Panel → Серверы.

## Бесплатный Cosmetic Mod

Скачивается на сайте → **Скачать** → выбор версии MC (1.16.5 → новейшая). Готовые сборки кладутся в `deployment/artifacts/cosmetic-mod/waffle-cosmetics-<mc>.jar` (сборка — `gradlew build` в `cosmetic-mod/`, см. CI). Файл отдаётся реально эндпоинтом `/api/downloads/cosmetic-mod/<mc>` с подсчётом загрузок.

## Telegram-бот за блокировкой

`api.telegram.org` может быть недоступен из РФ. В `telegram-bot/.env`:

```
NODE_USE_ENV_PROXY=1
HTTPS_PROXY=http://127.0.0.1:порт
```

(Node ≥ 24 поддерживает это нативно.)

## Разработка и тесты

```bash
npm test                    # backend: node --test (auth, косметика, premium-webhook, конфиги, админ, telegram, versions)
```

Документация: [ARCHITECTURE](docs/ARCHITECTURE.md) · [API](docs/API.md) · [DATABASE](docs/DATABASE.md) · [DEPLOYMENT](docs/DEPLOYMENT.md) · [INSTALLATION](docs/INSTALLATION.md) · [DEVELOPMENT](docs/DEVELOPMENT.md) · [CONTRIBUTING](docs/CONTRIBUTING.md) · [CHANGELOG](docs/CHANGELOG.md)

## Лицензия и границы

© 2026 WAFFLE VISUALS. Не является официальным продуктом Minecraft, не аффилирован с Mojang/Microsoft. Pulse Visuals и RW Visuals использованы только как качественный ориентир — код, дизайн и ассеты оригинальные.
