<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\EventStatus;
use App\Enums\MetaActionSource;
use App\Enums\MetaEventName;
use Illuminate\Database\Eloquent\Prunable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TrackedEvent extends Model
{
    use HasFactory, HasUuids, Prunable;

    protected $fillable = [
        'pixel_id',
        'event_id',
        'event_name',
        'custom_event_name',
        'action_source',
        'event_source_url',
        'event_time',
        'user_data',
        'custom_data',
        'match_quality',
        'status',
        'meta_response',
        'fbtrace_id',
        'error_message',
        'attempts',
        'sent_at',
    ];

    protected function casts(): array
    {
        return [
            'event_name' => MetaEventName::class,
            'action_source' => MetaActionSource::class,
            'event_time' => 'datetime',
            'user_data' => 'encrypted:array',
            'custom_data' => 'array',
            'match_quality' => 'integer',
            'meta_response' => 'array',
            'status' => EventStatus::class,
            'attempts' => 'integer',
            'sent_at' => 'datetime',
        ];
    }

    // ── Relationships ──────────────────────────────────────────────

    public function pixel(): BelongsTo
    {
        return $this->belongsTo(Pixel::class);
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopePending($query)
    {
        return $query->where('status', EventStatus::Pending);
    }

    public function scopeFailed($query)
    {
        return $query->where('status', EventStatus::Failed);
    }

    public function scopeForEventId($query, string $eventId)
    {
        return $query->where('event_id', $eventId);
    }

    // ── Methods ────────────────────────────────────────────────────

    public function markAsSent(array $response, ?string $fbtraceId = null): void
    {
        $this->update([
            'status' => EventStatus::Sent,
            'meta_response' => $response,
            'fbtrace_id' => $fbtraceId,
            'sent_at' => now(),
        ]);
    }

    public function markAsFailed(string $error, ?array $response = null): void
    {
        $this->update([
            'status' => EventStatus::Failed,
            'error_message' => $error,
            'meta_response' => $response,
            'attempts' => $this->attempts + 1,
        ]);
    }

    public function markAsDuplicate(): void
    {
        $this->update([
            'status' => EventStatus::Duplicate,
        ]);
    }

    /**
     * Get the prunable model query.
     *
     * @return Builder
     */
    public function prunable(): Builder
    {
        return static::where('created_at', '<=', now()->minus(days: 1));
    }
}
