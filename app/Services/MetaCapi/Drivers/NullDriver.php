<?php

declare(strict_types=1);

namespace App\Services\MetaCapi\Drivers;

use App\Data\MetaCapiResponseDto;
use App\Services\MetaCapi\Contracts\MetaCapiDriver;
use Illuminate\Support\Str;

final class NullDriver implements MetaCapiDriver
{
    /** @var array Stores sent events for assertions in tests */
    public array $sentEvents = [];

    public function sendEvents(string $pixelId, array $events, ?string $testEventCode = null): MetaCapiResponseDto
    {
        $this->sentEvents[] = [
            'pixel_id' => $pixelId,
            'events' => $events,
            'test_event_code' => $testEventCode,
        ];

        return new MetaCapiResponseDto(
            success: true,
            events_received: count($events),
            fbtrace_id: 'null-' . Str::random(16),
        );
    }

    public function reset(): void
    {
        $this->sentEvents = [];
    }
}
