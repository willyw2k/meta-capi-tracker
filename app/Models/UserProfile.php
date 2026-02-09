<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Server-side user profile for Advanced Matching enrichment.
 *
 * Stores hashed PII from identified users so future events
 * (even from anonymous sessions) can be enriched with previously
 * collected data for better Meta match rates.
 */
final class UserProfile extends Model
{
    use HasUuids;

    protected $fillable = [
        'external_id', 'em', 'ph',
        'fn', 'ln', 'ge', 'db',
        'ct', 'st', 'zp', 'country',
        'em_all', 'ph_all',
        'fbp', 'fbc', 'visitor_id',
        'pixel_id', 'source_domain',
        'event_count', 'match_quality',
        'first_seen_at', 'last_seen_at',
    ];

    protected function casts(): array
    {
        return [
            'em_all' => 'array',
            'ph_all' => 'array',
            'event_count' => 'integer',
            'match_quality' => 'integer',
            'first_seen_at' => 'datetime',
            'last_seen_at' => 'datetime',
        ];
    }

    // ── Lookup Methods ─────────────────────────────────────────

    /**
     * Find a profile by any known identifier.
     * Priority: external_id > email > phone > visitor_id > fbp.
     */
    public static function findByIdentifiers(array $identifiers, ?string $pixelId = null): ?self
    {
        $query = self::query();

        if ($pixelId) {
            $query->where(fn ($q) => $q->where('pixel_id', $pixelId)->orWhereNull('pixel_id'));
        }

        // Try in priority order — first match wins
        $lookups = [
            'external_id' => $identifiers['external_id'] ?? null,
            'em'          => $identifiers['em'] ?? null,
            'ph'          => $identifiers['ph'] ?? null,
            'visitor_id'  => $identifiers['visitor_id'] ?? null,
            'fbp'         => $identifiers['fbp'] ?? null,
        ];

        foreach ($lookups as $field => $value) {
            if (! $value) {
                continue;
            }

            $profile = (clone $query)->where($field, $value)->first();

            if ($profile) {
                return $profile;
            }
        }

        return null;
    }

    // ── Update Methods ─────────────────────────────────────────

    /**
     * Merge new user data into this profile.
     * Only fills empty fields — never overwrites existing data.
     * Appends new emails/phones to the multi-value arrays.
     */
    public function mergeUserData(array $hashedData): self
    {
        $piiFields = ['em', 'ph', 'fn', 'ln', 'ge', 'db', 'ct', 'st', 'zp', 'country', 'external_id'];

        foreach ($piiFields as $field) {
            if (! empty($hashedData[$field]) && empty($this->{$field})) {
                $this->{$field} = $hashedData[$field];
            }
        }

        // Accumulate multi-value emails
        if (! empty($hashedData['em'])) {
            $allEmails = array_unique(array_merge(
                $this->em_all ?? [],
                [$hashedData['em']],
                $hashedData['em_multi'] ?? [],
            ));
            $this->em_all = array_values(array_slice($allEmails, 0, 10)); // cap at 10
        }

        // Accumulate multi-value phones
        if (! empty($hashedData['ph'])) {
            $allPhones = array_unique(array_merge(
                $this->ph_all ?? [],
                [$hashedData['ph']],
                $hashedData['ph_multi'] ?? [],
            ));
            $this->ph_all = array_values(array_slice($allPhones, 0, 10));
        }

        // Update non-PII identifiers (use latest)
        foreach (['fbp', 'fbc', 'visitor_id'] as $field) {
            if (! empty($hashedData[$field])) {
                $this->{$field} = $hashedData[$field];
            }
        }

        $this->event_count = ($this->event_count ?? 0) + 1;
        $this->last_seen_at = now();

        if (! $this->first_seen_at) {
            $this->first_seen_at = now();
        }

        return $this;
    }

    /**
     * Get all PII fields that have values (for enrichment).
     */
    public function getAvailableFields(): array
    {
        $fields = [];
        $piiFields = ['em', 'ph', 'fn', 'ln', 'ge', 'db', 'ct', 'st', 'zp', 'country', 'external_id'];

        foreach ($piiFields as $field) {
            if (! empty($this->{$field})) {
                $fields[$field] = $this->{$field};
            }
        }

        if (! empty($this->em_all) && count($this->em_all) > 1) {
            $fields['em_multi'] = array_slice($this->em_all, 1); // exclude primary
        }

        if (! empty($this->ph_all) && count($this->ph_all) > 1) {
            $fields['ph_multi'] = array_slice($this->ph_all, 1);
        }

        foreach (['fbp', 'fbc'] as $field) {
            if (! empty($this->{$field})) {
                $fields[$field] = $this->{$field};
            }
        }

        return $fields;
    }
}
