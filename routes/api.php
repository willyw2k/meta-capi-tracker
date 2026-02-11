<?php

declare(strict_types=1);

use App\Http\Controllers\Api\BatchTrackController;
use App\Http\Controllers\Api\CookieSyncController;
use App\Http\Controllers\Api\DisguisedTrackController;
use App\Http\Controllers\Api\MatchQualityController;
use App\Http\Controllers\Api\PixelGifController;
use App\Http\Controllers\Api\GtmWebhookController;
use App\Http\Controllers\Api\TrackEventController;
use App\Http\Middleware\HandleTrackingCors;
use App\Http\Middleware\ValidateTrackingApiKey;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Tracking API Routes
|--------------------------------------------------------------------------
|
| Primary endpoints: /api/v1/track/*
| Disguised endpoints: /collect/* (ad blocker recovery)
| Cookie sync: /api/v1/track/cookie-sync
|
*/

Route::prefix('v1')->group(function () {
    // Public: Serve the client-side tracking script
    // Protected: Primary tracking endpoints
    Route::middleware([HandleTrackingCors::class, ValidateTrackingApiKey::class])
        ->prefix('track')
        ->group(function () {
            // Single event
            Route::post('/event', TrackEventController::class)
                ->name('tracking.event');

            // Batch events
            Route::post('/batch', BatchTrackController::class)
                ->name('tracking.batch');

            // Cookie sync (server-side first-party cookie setting)
            Route::post('/cookie-sync', CookieSyncController::class)
                ->name('tracking.cookie-sync');

            // Image pixel fallback (for ad blocker recovery)
            Route::get('/pixel.gif', PixelGifController::class)
                ->name('tracking.pixel-gif');

            // Match quality diagnostics
            Route::get('/match-quality', MatchQualityController::class)
                ->name('tracking.match-quality');
        });

    // Health check (no auth)
    Route::get('/health', fn () => response()->json([
        'status' => 'ok',
        'timestamp' => now()->toIso8601String(),
    ]))->name('tracking.health');
});

/*
|--------------------------------------------------------------------------
| Disguised Endpoints (Ad Blocker Recovery)
|--------------------------------------------------------------------------
|
| These routes use generic-looking paths to evade ad blocker filter lists.
| The path is configurable client-side via adBlockRecovery.proxyPath.
|
| Default: /collect/*
| Auth is handled inside the controller (supports X-Request-Token header).
|
*/

Route::middleware([HandleTrackingCors::class])
    ->prefix(config('meta-capi.disguised_path', 'collect'))
    ->group(function () {
        // Disguised single/batch event endpoint
        Route::post('/event', DisguisedTrackController::class)
            ->name('tracking.disguised.event');

        Route::post('/batch', DisguisedTrackController::class)
            ->name('tracking.disguised.batch');

        // Disguised cookie sync
        Route::post('/cookie-sync', CookieSyncController::class)
            ->middleware(ValidateTrackingApiKey::class)
            ->name('tracking.disguised.cookie-sync');

        // Disguised image pixel
        Route::get('/pixel.gif', PixelGifController::class)
            ->name('tracking.disguised.pixel-gif');
    });

/*
|--------------------------------------------------------------------------
| GTM Server-Side Container Webhook
|--------------------------------------------------------------------------
|
| Receives events from Google Tag Manager Server-Side containers.
| Automatically maps GA4 event format to Meta CAPI events.
|
| Auth: X-GTM-Secret header (configured via GTM_WEBHOOK_SECRET env var).
| Pixel: X-Pixel-Id header, pixel_id in payload, or GTM_DEFAULT_PIXEL_ID.
|
*/

Route::prefix('v1')->group(function () {
    Route::post('/track/gtm', GtmWebhookController::class)
        ->middleware([HandleTrackingCors::class])
        ->name('tracking.gtm-webhook');
});
