<?php

declare(strict_types=1);

namespace App\Enums;

enum EventStatus: string
{
    case Pending = 'pending';
    case Sent = 'sent';
    case Failed = 'failed';
    case Duplicate = 'duplicate';
    case Skipped = 'skipped';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Pending',
            self::Sent => 'Sent',
            self::Failed => 'Failed',
            self::Duplicate => 'Duplicate (Deduplicated)',
            self::Skipped => 'Skipped (Low Match Quality)',
        };
    }

    public function isFinal(): bool
    {
        return in_array($this, [self::Sent, self::Failed, self::Duplicate, self::Skipped]);
    }
}
