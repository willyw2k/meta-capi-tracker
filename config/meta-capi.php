<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Meta CAPI Tracker Configuration
    |--------------------------------------------------------------------------
    */

    // API key for authenticating tracking requests
    'api_key' => env('TRACKING_API_KEY'),

    // Allowed origins for CORS (array of domains or ['*'] for all)
    'allowed_origins' => array_filter(
        explode(',', env('TRACKING_ALLOWED_ORIGINS', '*'))
    ),

    // Default Meta Graph API version
    'graph_api_version' => env('META_GRAPH_API_VERSION', 'v21.0'),

    /*
    |--------------------------------------------------------------------------
    | Queue Configuration
    |--------------------------------------------------------------------------
    */

    'queue' => [
        'connection' => env('TRACKING_QUEUE_CONNECTION', 'redis'),
        'name' => env('TRACKING_QUEUE_NAME', 'meta-capi'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Event Deduplication
    |--------------------------------------------------------------------------
    */

    'dedup_window_minutes' => (int) env('TRACKING_DEDUP_WINDOW', 60),
    'max_retries' => (int) env('TRACKING_MAX_RETRIES', 3),

    /*
    |--------------------------------------------------------------------------
    | Batch Processing
    |--------------------------------------------------------------------------
    */

    'batch' => [
        'max_events_per_request' => 1000, // Meta API limit
        'chunk_size' => 100,
    ],

    /*
    |--------------------------------------------------------------------------
    | Data Retention (days)
    |--------------------------------------------------------------------------
    */

    'retention' => [
        'sent_events' => (int) env('TRACKING_RETENTION_SENT', 90),
        'failed_events' => (int) env('TRACKING_RETENTION_FAILED', 30),
    ],

    /*
    |--------------------------------------------------------------------------
    | Cookie Keeper
    |--------------------------------------------------------------------------
    |
    | Server-side first-party cookie management to survive ITP/Safari
    | 7-day cookie limitations. The server sets HttpOnly cookies that
    | browsers won't cap at 7 days.
    |
    */

    'cookie_keeper' => [
        'enabled' => (bool) env('TRACKING_COOKIE_KEEPER', true),
        'max_age_days' => (int) env('TRACKING_COOKIE_MAX_AGE', 180),
        'allowed_cookies' => ['_fbp', '_fbc', '_mt_id', '_mt_em', '_mt_ph'],
    ],

    /*
    |--------------------------------------------------------------------------
    | Ad Blocker Recovery
    |--------------------------------------------------------------------------
    |
    | Disguised endpoint path for when ad blockers block /track URLs.
    | The client falls back to this path automatically.
    |
    */

    'disguised_path' => env('TRACKING_DISGUISED_PATH', 'collect'),

    /*
    |--------------------------------------------------------------------------
    | Advanced Matching
    |--------------------------------------------------------------------------
    |
    | Server-side enrichment pipeline. Stores user profiles from identified
    | sessions and uses them to enrich future events (even anonymous ones)
    | for better Meta Event Match Quality.
    |
    */

    'advanced_matching' => [
        'enabled' => (bool) env('TRACKING_ADVANCED_MATCHING', true),
        'store_profiles' => (bool) env('TRACKING_STORE_PROFILES', true),
        'infer_country_from_phone' => true,
        'log_match_quality' => true,
        'profile_retention_days' => (int) env('TRACKING_PROFILE_RETENTION', 365),
    ],
];
