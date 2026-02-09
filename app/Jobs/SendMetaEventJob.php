<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Actions\MetaCapi\SendEventToMetaAction;
use App\Models\TrackedEvent;
use App\Services\MetaCapi\Exceptions\MetaCapiException;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;

final class SendMetaEventJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $timeout = 30;

    public array $backoff = [10, 60, 300]; // 10s, 1min, 5min

    public function __construct(
        public readonly string $trackedEventId,
    ) {}

    public function handle(SendEventToMetaAction $action): void
    {
        $event = TrackedEvent::with('pixel')->find($this->trackedEventId);

        if (! $event) {
            return;
        }

        // Skip if already sent
        if ($event->status->isFinal()) {
            return;
        }

        $action($event);
    }

    public function middleware(): array
    {
        return [
            new WithoutOverlapping($this->trackedEventId),
        ];
    }

    public function failed(\Throwable $exception): void
    {
        $event = TrackedEvent::find($this->trackedEventId);

        if ($event && ! $event->status->isFinal()) {
            $event->markAsFailed(
                error: $exception->getMessage(),
                response: $exception instanceof MetaCapiException ? $exception->metaResponse : null,
            );
        }
    }
}
