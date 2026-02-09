<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Actions\MetaCapi\TrackEventAction;
use App\Data\MetaCustomData;
use App\Data\MetaUserData;
use App\Data\TrackEventDto;
use App\Enums\MetaActionSource;
use App\Enums\MetaEventName;
use App\Services\MetaCapi\Exceptions\MetaCapiException;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;

/**
 * Pixel GIF Controller
 *
 * Handles image-pixel transport for ad blocker recovery.
 * Receives event data as base64-encoded query parameter,
 * processes it, and returns a 1x1 transparent GIF.
 *
 * Used as last-resort transport when fetch, beacon, and XHR are all blocked.
 */
final readonly class PixelGifController
{
    // 1x1 transparent GIF (43 bytes)
    private const TRANSPARENT_GIF = "\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00\x21\xf9\x04\x00\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b";

    public function __invoke(Request $request, TrackEventAction $action): Response
    {
        try {
            $encoded = $request->query('d', '');
            $data = json_decode(base64_decode($encoded), true);

            if (! $data || ! is_array($data)) {
                return $this->gifResponse();
            }

            $this->processEvent($data, $request, $action);
        } catch (\Throwable $e) {
            Log::warning('Pixel GIF tracking error', [
                'error' => $e->getMessage(),
                'ip' => $request->ip(),
            ]);
        }

        return $this->gifResponse();
    }

    private function processEvent(array $data, Request $request, TrackEventAction $action): void
    {
        // Handle single event or batch
        $events = isset($data['events']) ? $data['events'] : [$data];

        foreach ($events as $eventData) {
            if (! isset($eventData['pixel_id'], $eventData['event_name'])) {
                continue;
            }

            $userData = $eventData['user_data'] ?? [];

            try {
                $metaUserData = MetaUserData::fromRaw($userData);
                $metaUserData = $metaUserData->enrichFromRequest($request);

                $dto = new TrackEventDto(
                    pixel_id: $eventData['pixel_id'],
                    event_name: MetaEventName::tryFrom($eventData['event_name']) ?? MetaEventName::Custom,
                    custom_event_name: MetaEventName::tryFrom($eventData['event_name'])
                        ? null
                        : $eventData['event_name'],
                    action_source: MetaActionSource::tryFrom($eventData['action_source'] ?? 'website')
                        ?? MetaActionSource::Website,
                    event_source_url: $eventData['event_source_url'] ?? $request->header('Referer', ''),
                    user_data: $metaUserData,
                    custom_data: isset($eventData['custom_data'])
                        ? MetaCustomData::from($eventData['custom_data'])
                        : null,
                    event_id: $eventData['event_id'] ?? null,
                    event_time: $eventData['event_time'] ?? null,
                );

                $action($dto);
            } catch (MetaCapiException $e) {
                Log::debug('Pixel GIF event rejected', ['error' => $e->getMessage()]);
            }
        }
    }

    private function gifResponse(): Response
    {
        return response(self::TRANSPARENT_GIF, 200)
            ->header('Content-Type', 'image/gif')
            ->header('Content-Length', (string) strlen(self::TRANSPARENT_GIF))
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate')
            ->header('Pragma', 'no-cache')
            ->header('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT')
            ->header('Access-Control-Allow-Origin', '*');
    }
}
