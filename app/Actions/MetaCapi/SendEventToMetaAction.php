<?php

declare(strict_types=1);

namespace App\Actions\MetaCapi;

use App\Data\MetaCapiResponseDto;
use App\Data\MetaCustomData;
use App\Data\MetaUserData;
use App\Data\TrackEventDto;
use App\Models\TrackedEvent;
use App\Services\MetaCapi\Drivers\GraphApiDriver;
use App\Services\MetaCapi\Exceptions\MetaCapiException;
use Illuminate\Support\Facades\Log;

final readonly class SendEventToMetaAction
{
    public function __invoke(TrackedEvent $event): MetaCapiResponseDto
    {
        $pixel = $event->pixel;

        $this->guardPixelActive($pixel);

        $driver = new GraphApiDriver(
            accessToken: $pixel->access_token,
        );

        $dto = new TrackEventDto(
            pixel_id: $pixel->pixel_id,
            event_name: $event->event_name,
            custom_event_name: $event->custom_event_name,
            action_source: $event->action_source,
            event_source_url: $event->event_source_url,
            user_data: MetaUserData::from($event->user_data),
            custom_data: $event->custom_data ? MetaCustomData::from($event->custom_data) : null,
            event_id: $event->event_id,
            event_time: $event->event_time->timestamp,
        );

        $payload = [$dto->toMetaEventPayload()];

        try {
            $response = $driver->sendEvents(
                pixelId: $pixel->pixel_id,
                events: $payload,
                testEventCode: $pixel->test_event_code,
            );

            if ($response->success) {
                $event->markAsSent(
                    response: [
                        'events_received' => $response->events_received,
                        'messages' => $response->messages,
                    ],
                    fbtraceId: $response->fbtrace_id,
                );

                Log::info('Meta CAPI event sent', [
                    'event_id' => $event->event_id,
                    'pixel_id' => $pixel->pixel_id,
                    'event_name' => $dto->resolvedEventName(),
                    'fbtrace_id' => $response->fbtrace_id,
                ]);
            } else {
                $event->markAsFailed(
                    error: $response->error_message ?? 'Unknown error',
                    response: [
                        'error_code' => $response->error_code,
                        'error_message' => $response->error_message,
                    ],
                );

                Log::warning('Meta CAPI event failed', [
                    'event_id' => $event->event_id,
                    'pixel_id' => $pixel->pixel_id,
                    'error' => $response->error_message,
                ]);
            }

            return $response;
        } catch (MetaCapiException $e) {
            $event->markAsFailed(
                error: $e->getMessage(),
                response: $e->metaResponse,
            );

            Log::error('Meta CAPI exception', [
                'event_id' => $event->event_id,
                'pixel_id' => $pixel->pixel_id,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    private function guardPixelActive($pixel): void
    {
        if (! $pixel || ! $pixel->is_active) {
            throw MetaCapiException::pixelNotFound($pixel?->pixel_id ?? 'unknown');
        }
    }
}
