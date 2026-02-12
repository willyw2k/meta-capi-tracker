<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Prunable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
final class MatchQualityLog extends Model
{
    use Prunable;

    public $timestamps = false;

    protected $fillable = [
        'pixel_id', 'event_name', 'source_domain', 'score',
        'has_em', 'has_ph', 'has_fn', 'has_ln', 'has_external_id',
        'has_fbp', 'has_fbc', 'has_ip', 'has_ua', 'has_address',
        'was_enriched', 'score_before_enrichment', 'enrichment_source',
        'event_date', 'created_at',
    ];

    protected function casts(): array
    {
        return [
            'has_em' => 'boolean',
            'has_ph' => 'boolean',
            'has_fn' => 'boolean',
            'has_ln' => 'boolean',
            'has_external_id' => 'boolean',
            'has_fbp' => 'boolean',
            'has_fbc' => 'boolean',
            'has_ip' => 'boolean',
            'has_ua' => 'boolean',
            'has_address' => 'boolean',
            'was_enriched' => 'boolean',
            'event_date' => 'date',
            'created_at' => 'datetime',
        ];
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
