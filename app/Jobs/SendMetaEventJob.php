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
use Illuminate\Support\Facades\Log;

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
            Log::warning('SendMetaEventJob: event not found, skipping', [
                'tracked_event_id' => $this->trackedEventId,
            ]);

            return;
        }

        // Skip if already sent
        if ($event->status->isFinal()) {
            return;
        }

        try {
            $action($event);
        } catch (MetaCapiException $e) {
            // Non-retryable errors should fail immediately instead of wasting retries
            if (! $e->isRetryable()) {
                Log::warning('SendMetaEventJob: non-retryable error, failing permanently', [
                    'tracked_event_id' => $this->trackedEventId,
                    'error' => $e->getMessage(),
                    'code' => $e->getCode(),
                ]);

                $event->markAsFailed(
                    error: $e->getMessage(),
                    response: $e->metaResponse,
                );

                $this->fail($e);

                return;
            }

            // Retryable error — increment attempts and let the queue retry
            $event->increment('attempts');

            Log::info('SendMetaEventJob: retryable error, will retry', [
                'tracked_event_id' => $this->trackedEventId,
                'attempt' => $this->attempts(),
                'error' => $e->getMessage(),
            ]);

            throw $e;
        } catch (\Throwable $e) {
            // Unexpected errors — log with full context and let queue retry
            Log::error('SendMetaEventJob: unexpected error', [
                'tracked_event_id' => $this->trackedEventId,
                'exception' => get_class($e),
                'message' => $e->getMessage(),
                'file' => $e->getFile() . ':' . $e->getLine(),
            ]);

            $event->increment('attempts');

            throw $e;
        }
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

        Log::error('SendMetaEventJob: permanently failed', [
            'tracked_event_id' => $this->trackedEventId,
            'exception' => get_class($exception),
            'message' => $exception->getMessage(),
        ]);
    }
}
