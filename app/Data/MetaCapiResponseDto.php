<?php

declare(strict_types=1);

namespace App\Data;

use Spatie\LaravelData\Data;

final class MetaCapiResponseDto extends Data
{
    public function __construct(
        public bool $success,
        public int $events_received,
        public ?array $messages = null,
        public ?string $fbtrace_id = null,
        public ?string $error_message = null,
        public ?int $error_code = null,
    ) {}

    public static function fromMetaResponse(array $data): self
    {
        // Success response
        if (isset($data['events_received'])) {
            return new self(
                success: true,
                events_received: $data['events_received'],
                messages: $data['messages'] ?? null,
                fbtrace_id: $data['fbtrace_id'] ?? null,
            );
        }

        // Error response
        $error = $data['error'] ?? [];

        return new self(
            success: false,
            events_received: 0,
            error_message: $error['message'] ?? 'Unknown error',
            error_code: $error['code'] ?? null,
            fbtrace_id: $error['fbtrace_id'] ?? null,
        );
    }
}
