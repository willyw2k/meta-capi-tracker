<?php

declare(strict_types=1);

namespace App\Actions\MetaCapi;

use App\Data\MetaCapiResponseDto;
use App\Data\MetaCustomData;
use App\Data\MetaUserData;
use App\Data\TrackEventDto;
use App\Enums\EventStatus;
use App\Models\Pixel;
use App\Models\TrackedEvent;
use App\Services\MetaCapi\Drivers\GraphApiDriver;
use App\Services\MetaCapi\Exceptions\MetaCapiException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;

final readonly class BatchSendEventsAction
{
    /**
     * Send pending events for a pixel in batches (max 1000 per Meta API call).
     */
    public function __invoke(Pixel $pixel, int $batchSize = 1000): int
    {
        $totalSent = 0;

        $driver = new GraphApiDriver(
            accessToken: $pixel->access_token,
        );

        TrackedEvent::query()
            ->where('pixel_id', $pixel->id)
            ->pending()
            ->where('attempts', '<', 3)
            ->orderBy('event_time')
            ->chunk($batchSize, function (Collection $events) use ($pixel, $driver, &$totalSent) {
                $payloads = $events->map(function (TrackedEvent $event) {
                    $dto = new TrackEventDto(
                        pixel_id: $event->pixel->pixel_id,
                        event_name: $event->event_name,
                        custom_event_name: $event->custom_event_name,
                        action_source: $event->action_source,
                        event_source_url: $event->event_source_url,
                        user_data: MetaUserData::from($event->user_data),
                        custom_data: $event->custom_data ? MetaCustomData::from($event->custom_data) : null,
                        event_id: $event->event_id,
                        event_time: $event->event_time->timestamp,
                    );

                    return $dto->toMetaEventPayload();
                })->all();

                try {
                    $response = $driver->sendEvents(
                        pixelId: $pixel->pixel_id,
                        events: $payloads,
                        testEventCode: $pixel->test_event_code,
                    );

                    if ($response->success) {
                        $events->each(fn (TrackedEvent $event) =>
                            $event->markAsSent(
                                response: ['batch' => true, 'events_received' => $response->events_received],
                                fbtraceId: $response->fbtrace_id,
                            )
                        );

                        $totalSent += $response->events_received;

                        Log::info('Meta CAPI batch sent', [
                            'pixel_id' => $pixel->pixel_id,
                            'events_sent' => $response->events_received,
                        ]);
                    }
                } catch (MetaCapiException $e) {
                    $events->each(fn (TrackedEvent $event) =>
                        $event->markAsFailed($e->getMessage(), $e->metaResponse)
                    );

                    Log::error('Meta CAPI batch failed', [
                        'pixel_id' => $pixel->pixel_id,
                        'error' => $e->getMessage(),
                        'events_count' => $events->count(),
                    ]);
                }
            });

        return $totalSent;
    }
}
