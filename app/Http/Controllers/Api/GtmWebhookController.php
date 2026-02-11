<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Actions\MetaCapi\MapGtmEventAction;
use App\Actions\MetaCapi\TrackEventAction;
use App\Services\MetaCapi\Exceptions\MetaCapiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Receives events from a GTM Server-Side Container.
 *
 * GTM server-side containers can send events via HTTP requests
 * to custom endpoints. This controller accepts those events,
 * maps them from GA4 format to Meta CAPI format, and processes
 * them through the standard tracking pipeline.
 *
 * Supports both single events and batch payloads.
 */
final readonly class GtmWebhookController
{
    public function __invoke(
        Request $request,
        MapGtmEventAction $mapper,
        TrackEventAction $tracker,
    ): JsonResponse {
        if (! config('meta-capi.gtm.enabled', false)) {
            return response()->json([
                'success' => false,
                'error' => 'GTM integration is not enabled.',
            ], 403);
        }

        // Validate shared secret
        $secret = config('meta-capi.gtm.webhook_secret');
        if ($secret) {
            $provided = $request->header('X-GTM-Secret')
                ?? $request->header('X-Webhook-Secret')
                ?? $request->query('secret');

            if ($provided !== $secret) {
                return response()->json([
                    'success' => false,
                    'error' => 'Invalid webhook secret.',
                ], 401);
            }
        }

        $payload = $request->all();

        // Determine pixel ID: from payload, header, query, or config default
        $pixelId = $payload['pixel_id']
            ?? $request->header('X-Pixel-Id')
            ?? $request->query('pixel_id')
            ?? config('meta-capi.gtm.default_pixel_id');

        if (! $pixelId) {
            return response()->json([
                'success' => false,
                'error' => 'Missing pixel_id. Provide it in the payload, X-Pixel-Id header, or set GTM_DEFAULT_PIXEL_ID.',
            ], 422);
        }

        // Support batch: if "events" array is present, process each
        $events = $payload['events'] ?? [$payload];
        $results = [];
        $errors = [];

        foreach ($events as $index => $eventPayload) {
            if (! is_array($eventPayload)) {
                continue;
            }

            // Inject server-side request metadata
            $eventPayload['ip_address'] = $eventPayload['ip_override']
                ?? $eventPayload['ip_address']
                ?? $request->ip();
            $eventPayload['user_agent'] = $eventPayload['user_agent']
                ?? $request->userAgent();

            try {
                $dto = $mapper($eventPayload, (string) $pixelId);

                // Enrich with request IP/UA if not set
                $dto->user_data = $dto->user_data->enrichFromRequest($request);

                $trackedEvent = $tracker($dto);

                $results[] = [
                    'index' => $index,
                    'event_id' => $trackedEvent->event_id,
                    'event_name' => $eventPayload['event_name'] ?? $eventPayload['event'] ?? 'unknown',
                    'status' => $trackedEvent->status->value,
                ];
            } catch (MetaCapiException $e) {
                $errors[] = [
                    'index' => $index,
                    'event_name' => $eventPayload['event_name'] ?? $eventPayload['event'] ?? 'unknown',
                    'error' => $e->getMessage(),
                ];

                Log::warning('GTM webhook event failed', [
                    'index' => $index,
                    'event_name' => $eventPayload['event_name'] ?? 'unknown',
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $success = count($results) > 0;
        $statusCode = $errors && ! $results ? 422 : ($errors ? 207 : 202);

        return response()->json([
            'success' => $success,
            'processed' => count($results),
            'failed' => count($errors),
            'results' => $results,
            'errors' => $errors ?: null,
        ], $statusCode);
    }
}
