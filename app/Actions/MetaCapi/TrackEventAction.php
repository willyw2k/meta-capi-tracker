<?php

declare(strict_types=1);

namespace App\Actions\MetaCapi;

use App\Data\TrackEventDto;
use App\Enums\EventStatus;
use App\Jobs\SendMetaEventJob;
use App\Models\Pixel;
use App\Models\TrackedEvent;
use App\Services\MetaCapi\Exceptions\MetaCapiException;
use App\Services\MetaCapi\MatchQualityScorer;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

final readonly class TrackEventAction
{
    public function __construct(
        private MatchQualityScorer $scorer = new MatchQualityScorer(),
        private EnrichUserDataAction $enricher = new EnrichUserDataAction(),
    ) {}

    public function __invoke(TrackEventDto $dto): TrackedEvent
    {
        $pixel = $this->resolvePixel($dto->pixel_id);

        $this->guardDomainAllowed($pixel, $dto);

        $this->guardDuplicateEvent($pixel, $dto);

        // ── Advanced Matching: Enrich user data ──────────────
        // Looks up stored profile, fills missing PII, infers
        // country from phone, logs match quality analytics.
        if (config('meta-capi.advanced_matching.enabled', true)) {
            $sourceDomain = parse_url($dto->event_source_url, PHP_URL_HOST) ?: null;

            $dto->user_data = ($this->enricher)(
                userData: $dto->user_data,
                pixelId: $pixel->pixel_id,
                eventName: $dto->resolvedEventName(),
                sourceDomain: $sourceDomain,
                visitorId: $dto->visitor_id,
            );
        }

        // Score match quality for monitoring
        $matchScore = $this->scorer->quickScore($dto->user_data);
        $minQuality = (int) config('meta-capi.min_match_quality', 20);

        $trackedEvent = $this->createTrackedEvent($pixel, $dto, $matchScore);

        // Only dispatch to Meta when match quality meets the threshold.
        // Low-quality events waste API quota and hurt EMQ scores.
        if ($matchScore < $minQuality) {
            $trackedEvent->markAsSkipped(
                "Match quality {$matchScore} below minimum threshold {$minQuality}"
            );

            Log::info('Event skipped — low match quality', [
                'pixel_id' => $pixel->pixel_id,
                'event_name' => $dto->resolvedEventName(),
                'match_score' => $matchScore,
                'min_required' => $minQuality,
            ]);

            return $trackedEvent;
        }

        SendMetaEventJob::dispatch($trackedEvent->id);

        return $trackedEvent;
    }

    private function resolvePixel(string $pixelId): Pixel
    {
        $pixel = Pixel::query()
            ->active()
            ->forPixelId($pixelId)
            ->first();

        if (! $pixel) {
            throw MetaCapiException::pixelNotFound($pixelId);
        }

        return $pixel;
    }

    private function guardDomainAllowed(Pixel $pixel, TrackEventDto $dto): void
    {
        if (empty($pixel->domains)) {
            return; // No domain restrictions
        }

        $hostname = parse_url($dto->event_source_url, PHP_URL_HOST);

        if (! $hostname) {
            return; // Can't validate
        }

        if (! $pixel->acceptsDomain($hostname)) {
            throw MetaCapiException::invalidPayload(
                "Domain [{$hostname}] not allowed for pixel [{$pixel->pixel_id}]"
            );
        }
    }

    private function guardDuplicateEvent(Pixel $pixel, TrackEventDto $dto): void
    {
        if (! $dto->event_id) {
            return;
        }

        $exists = TrackedEvent::query()
            ->where('pixel_id', $pixel->id)
            ->forEventId($dto->event_id)
            ->whereIn('status', [EventStatus::Sent, EventStatus::Pending])
            ->exists();

        if ($exists) {
            $event = $this->createTrackedEvent($pixel, $dto);
            $event->markAsDuplicate();

            throw MetaCapiException::invalidPayload(
                "Duplicate event_id [{$dto->event_id}] for pixel [{$pixel->pixel_id}]"
            );
        }
    }

    private function createTrackedEvent(Pixel $pixel, TrackEventDto $dto, ?int $matchScore = null): TrackedEvent
    {
        try {
            return TrackedEvent::create([
                'pixel_id' => $pixel->id,
                'event_id' => $dto->event_id ?? Str::uuid()->toString(),
                'event_name' => $dto->event_name,
                'custom_event_name' => $dto->custom_event_name,
                'action_source' => $dto->action_source,
                'event_source_url' => $dto->event_source_url,
                'event_time' => $dto->event_time
                    ? \Carbon\Carbon::createFromTimestamp($dto->event_time)
                    : now(),
                'user_data' => $dto->user_data->toArray(),
                'custom_data' => $dto->custom_data?->toArray(),
                'match_quality' => $matchScore,
                'status' => EventStatus::Pending,
            ]);
        } catch (\Illuminate\Database\QueryException $e) {
            Log::error('TrackEventAction: failed to store event', [
                'pixel_id' => $pixel->pixel_id,
                'event_name' => $dto->resolvedEventName(),
                'error' => $e->getMessage(),
            ]);

            throw new MetaCapiException(
                "Failed to store event: database error",
                previous: $e,
            );
        }
    }
}
