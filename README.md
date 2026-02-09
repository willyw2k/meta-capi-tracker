# Meta CAPI Tracker

Server-side Meta Conversions API (CAPI) tracker with advanced matching, cookie keeper, ad blocker recovery, and a FilamentPHP v5 admin panel.

## Features

- **Server-Side Event Tracking** — Receive browser events and forward them to Meta's Conversions API with full server-side enrichment
- **Advanced Matching** — Server-side user profile storage and enrichment for higher Event Match Quality scores
- **Cookie Keeper** — First-party server-set cookies to survive ITP/Safari 7-day limitations
- **Ad Blocker Recovery** — Disguised endpoints that bypass common ad blocker filter lists
- **Multi-Pixel Routing** — Route events to different pixels based on source domain
- **Event Deduplication** — Prevent duplicate events between browser pixel and server-side API
- **FilamentPHP v5 Admin Panel** — Full dashboard with real-time stats, event management, match quality analytics

## Tech Stack

- **PHP 8.2+** / **Laravel 12**
- **FilamentPHP v5** — Admin panel
- **Spatie Laravel Data** — DTOs
- **SQLite/MySQL/PostgreSQL** — Database
- **Redis** (optional) — Queue & cache

## Quick Start

```bash
git clone https://github.com/pfrfrfr/meta-capi-tracker.git
cd meta-capi-tracker
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan db:seed
php artisan serve
```

Open `http://localhost:8000/admin` and login with:
- **Email:** `admin@example.com`
- **Password:** `password`

## Admin Panel

| Section | Description |
|---|---|
| **Dashboard** | Real-time stats overview, events chart, match quality distribution, recent events feed |
| **Pixels** | CRUD for Meta Pixels with domain routing, access tokens, test event codes |
| **Tracked Events** | Browse, filter, view details, retry failed events |
| **User Profiles** | View enriched user profiles with PII field coverage |
| **Match Quality** | Per-event match quality logs with enrichment tracking |
| **Settings** | System configuration viewer |
| **Integration Guide** | Code snippets for client-side and server-side integration |

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/track/event` | Track single event |
| `POST` | `/api/v1/track/batch` | Batch tracking (up to 1000) |
| `POST` | `/api/v1/track/cookie-sync` | Cookie Keeper sync |
| `GET` | `/api/v1/track/pixel.gif` | Image pixel fallback |
| `GET` | `/api/v1/track/match-quality` | Match quality diagnostics |
| `GET` | `/api/v1/track.js` | Client-side tracker script |
| `GET` | `/api/v1/health` | Health check |
| `POST` | `/api/collect/event` | Disguised endpoint (ad blocker recovery) |

All tracking endpoints require the `X-API-Key` header.

## Client-Side Integration

```html
<script src="https://your-domain.com/api/v1/track.js"></script>
<script>
    MetaTracker.init({
        endpoint: 'https://your-domain.com/api/v1/track/event',
        apiKey: 'YOUR_API_KEY',
        pixelId: 'YOUR_PIXEL_ID',
        advancedMatching: { enabled: true, autoCaptureForms: true },
        cookieKeeper: { enabled: true },
        adBlockRecovery: { enabled: true, proxyPath: '/collect' }
    });
</script>
```

## Architecture

```
app/
├── Actions/MetaCapi/          # Domain logic (Track, Send, Enrich, Normalize, Batch)
├── Console/Commands/          # Artisan commands (prune old data)
├── Data/                      # Spatie DTOs (TrackEventDto, MetaUserData, etc.)
├── Enums/                     # EventStatus, MetaEventName, MetaActionSource
├── Filament/                  # Admin panel
│   ├── Pages/                 # Dashboard, Settings, Integration Guide
│   ├── Resources/             # Pixel, TrackedEvent, UserProfile, MatchQualityLog
│   └── Widgets/               # Stats overview, charts, recent events
├── Http/Controllers/Api/      # Tracking API controllers
├── Http/Middleware/            # CORS, API key validation
├── Jobs/                      # Queue jobs for Meta API sends
├── Models/                    # Eloquent models
├── Providers/                 # Service providers + Filament panel config
└── Services/MetaCapi/         # Meta Graph API integration (Saloon)
```

## Data Retention

Configurable via `.env`:

| Setting | Default | Description |
|---|---|---|
| `TRACKING_RETENTION_SENT` | 90 days | Keep sent events |
| `TRACKING_RETENTION_FAILED` | 30 days | Keep failed events |
| `TRACKING_PROFILE_RETENTION` | 365 days | Keep user profiles |

Run `php artisan tracker:prune` (scheduled daily at 3 AM) or manually with `--dry-run`.

## License

MIT
