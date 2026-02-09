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
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Disguised Track Controller
 *
 * Handles events sent via the ad-blocker recovery path (/collect).
 * Accepts both normal JSON payloads and obfuscated payloads
 * where the real data is base64-encoded in a "d" field.
 *
 * Auth via either X-API-Key or X-Request-Token header.
 */
final readonly class DisguisedTrackController
{
    public function __invoke(Request $request, TrackEventAction $action): JsonResponse
    {
        // Auth via either header name (disguised or normal)
        $apiKey = $request->header('X-API-Key')
            ?? $request->header('X-Request-Token')
            ?? $request->query('api_key');

        if (! $apiKey || $apiKey !== config('meta-capi.api_key')) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        // Decode payload — may be obfuscated (base64 in "d" field) or plain JSON
        $data = $this->decodePayload($request);

        if (! $data) {
            return response()->json(['error' => 'Invalid payload'], 400);
        }

        // Handle batch vs single
        $events = isset($data['events']) ? $data['events'] : [$data];
        $results = [];

        foreach ($events as $index => $eventData) {
            try {
                $userData = $eventData['user_data'] ?? [];

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
                    visitor_id: $eventData['visitor_id'] ?? null,
                );

                $trackedEvent = $action($dto);

                $results[] = [
                    'index' => $index,
                    'success' => true,
                    'event_id' => $trackedEvent->event_id,
                ];
            } catch (MetaCapiException $e) {
                $results[] = [
                    'index' => $index,
                    'success' => false,
                    'error' => $e->getMessage(),
                ];
            }
        }

        $successCount = collect($results)->where('success', true)->count();

        return response()->json([
            'success' => true,
            'accepted' => $successCount,
            'results' => $results,
        ], 202);
    }

    /**
     * Decode payload from either plain JSON or obfuscated base64.
     */
    private function decodePayload(Request $request): ?array
    {
        $input = $request->all();

        // Check for obfuscated payload (base64 in "d" field)
        if (isset($input['d']) && is_string($input['d'])) {
            try {
                $decoded = base64_decode($input['d'], true);
                if ($decoded === false) {
                    return null;
                }
                $data = json_decode($decoded, true);
                return is_array($data) ? $data : null;
            } catch (\Throwable $e) {
                Log::debug('Disguised payload decode failed', ['error' => $e->getMessage()]);
                return null;
            }
        }

        // Plain JSON payload
        return $input ?: null;
    }
}
