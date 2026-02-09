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

final readonly class BatchTrackController
{
    public function __invoke(
        Request $request,
        TrackEventAction $action,
    ): JsonResponse {
        $request->validate([
            'events' => ['required', 'array', 'min:1', 'max:100'],
            'events.*.pixel_id' => ['required', 'string'],
            'events.*.event_name' => ['required', 'string'],
            'events.*.event_source_url' => ['required', 'url:http,https'],
            'events.*.user_data' => ['nullable', 'array'],
            'events.*.custom_data' => ['nullable', 'array'],
        ]);

        $results = [];

        foreach ($request->input('events') as $index => $eventData) {
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
                    event_source_url: $eventData['event_source_url'],
                    user_data: $metaUserData,
                    custom_data: isset($eventData['custom_data'])
                        ? MetaCustomData::from($eventData['custom_data'])
                        : null,
                    event_id: $eventData['event_id'] ?? null,
                    event_time: $eventData['event_time'] ?? null,
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
            'total' => count($results),
            'accepted' => $successCount,
            'rejected' => count($results) - $successCount,
            'results' => $results,
        ], 202);
    }
}
