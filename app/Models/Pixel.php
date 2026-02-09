<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class Pixel extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'name',
        'pixel_id',
        'access_token',
        'test_event_code',
        'domains',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'access_token' => 'encrypted',
            'domains' => 'array',
            'is_active' => 'boolean',
        ];
    }

    // ── Relationships ──────────────────────────────────────────────

    public function trackedEvents(): HasMany
    {
        return $this->hasMany(TrackedEvent::class);
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeForPixelId($query, string $pixelId)
    {
        return $query->where('pixel_id', $pixelId);
    }

    /**
     * Find pixels that match a given domain.
     * Supports wildcard patterns: *.example.com, exact: shop.example.com
     * A null/empty domains field means "accept all domains".
     */
    public function scopeForDomain($query, string $domain)
    {
        return $query->where(function ($q) use ($domain) {
            // Null domains = accept all
            $q->whereNull('domains')
              ->orWhere('domains', '[]')
              ->orWhereJsonContains('domains', $domain)
              ->orWhereJsonContains('domains', '*');
        });
    }

    // ── Methods ────────────────────────────────────────────────────

    /**
     * Check if this pixel accepts events from the given domain.
     */
    public function acceptsDomain(string $domain): bool
    {
        // No domain restriction = accept all
        if (empty($this->domains)) {
            return true;
        }

        foreach ($this->domains as $pattern) {
            if ($pattern === '*') {
                return true;
            }

            if ($pattern === $domain) {
                return true;
            }

            // Wildcard: *.example.com matches sub.example.com
            if (str_starts_with($pattern, '*.')) {
                $suffix = substr($pattern, 2);
                if (str_ends_with($domain, '.' . $suffix) || $domain === $suffix) {
                    return true;
                }
            }

            // Bare domain matches subdomains: example.com matches sub.example.com
            if (str_ends_with($domain, '.' . $pattern)) {
                return true;
            }
        }

        return false;
    }
}
