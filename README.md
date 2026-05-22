# Spencer OS

Personal life dashboard — finances, health, workouts, BJJ, tasks, journal, CRM, calendar.

Built with React 18 (UMD), Babel standalone, Python 3 server, Supabase for persistence, Telegram bot for voice/text CRM capture.

---

## Local development

### 1. Prerequisites

- Python 3.9+
- A browser (Chrome/Safari)

### 2. Clone and configure

```bash
git clone https://github.com/your-username/spencer-os.git
cd spencer-os
cp .env.example .env
# Edit .env and fill in all values (see below)
```

### 3. Start the server

```bash
python3 serve.py
```

Open **http://localhost:8765**

### 4. Start the Telegram bot (optional, separate terminal)

```bash
python3 telegram_poll.py
```

Send voice notes or text to your bot — items land in the CRM view automatically.

---

## Environment variables

| Variable    | Description |
|-------------|-------------|
| `SUPA_URL`  | Supabase project URL |
| `SUPA_KEY`  | Supabase anon key |
| `TG_TOKEN`  | Telegram bot token (from @BotFather) |
| `OPENAI_KEY`| OpenAI API key (Whisper + GPT-4o-mini) |
| `PORT`      | Server port (default: 8765) |
| `BASE_URL`  | Public URL for OAuth redirects (default: http://localhost:8765) |

---

## Supabase setup

Run these in the **Supabase SQL Editor**:

```sql
-- Key-value store (all dashboard modules)
create table if not exists public.kv_store (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);
alter table public.kv_store enable row level security;
create policy "anon_full_access" on public.kv_store
  for all to anon using (true) with check (true);

-- CRM items (from Telegram bot)
create table if not exists public.crm_items (
  id             uuid        primary key default gen_random_uuid(),
  type           text        not null default 'task',
  title          text        not null,
  body           text,
  priority       text        default 'medium',
  status         text        default 'open',
  due_date       date,
  contact_name   text,
  tags           text[],
  source         text        default 'manual',
  raw_transcript text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.crm_items enable row level security;
create policy "anon_full_access" on public.crm_items
  for all to anon using (true) with check (true);
```

---

## Deployment (Fly.io)

### First deploy

```bash
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
flyctl auth login
flyctl launch          # creates the app, uses fly.toml
flyctl secrets set \
  SUPA_URL="https://your-project.supabase.co" \
  SUPA_KEY="your-anon-key" \
  TG_TOKEN="your-bot-token" \
  OPENAI_KEY="sk-proj-..." \
  BASE_URL="https://spencer-os.fly.dev"
flyctl deploy
```

### Set Telegram webhook (after deploy)

```
https://spencer-os.fly.dev/telegram/set-webhook?url=https://spencer-os.fly.dev/telegram/webhook
```

### Subsequent deploys

Push to `main` — GitHub Actions handles it automatically.

> **Note:** Add `FLY_API_TOKEN` (from `flyctl tokens create deploy`) to your GitHub repo secrets under *Settings → Secrets → Actions*.

---

## Architecture

```
Browser (React 18 UMD + Babel)
  └── useLocalStorage hook → writes to localStorage + Supabase kv_store
  └── CRM module → reads directly from Supabase crm_items

serve.py (Python 3, no deps)
  ├── GET  /              → static files (index.html, JSX, CSS)
  ├── GET  /api/config    → {supaUrl, supaKey} from env vars
  ├── GET  /api/quotes    → Stooq.com proxy (stock prices)
  ├── GET  /whoop/*       → WHOOP Developer API OAuth proxy
  └── POST /telegram/webhook → Telegram → Whisper → GPT → Supabase crm_items

telegram_poll.py        → alternative to webhook for local dev
```

---

## Modules

| Module | Storage | Source |
|--------|---------|--------|
| Cash | `kv_store` | Manual |
| Investments | `kv_store` | Stooq live prices |
| Health Pulse | `kv_store` | Manual + WHOOP OAuth |
| Workouts + BJJ | `kv_store` | Manual |
| Daily Checklist | `kv_store` | Manual |
| Calendar | Live | Google Calendar OAuth |
| Journal | `kv_store` | Manual |
| Goals | `kv_store` | Manual |
| CRM | `crm_items` | Telegram bot (voice + text) |
