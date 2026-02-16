<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class CatalogProduct extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'pixel_id',
        'retailer_id',
        'title',
        'description',
        'url',
        'image_url',
        'additional_image_urls',
        'price',
        'sale_price',
        'currency',
        'availability',
        'brand',
        'category',
        'condition',
        'gtin',
        'mpn',
        'custom_label_0',
        'custom_label_1',
        'custom_label_2',
        'custom_label_3',
        'custom_label_4',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'additional_image_urls' => 'array',
            'price' => 'decimal:2',
            'sale_price' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    // ── Relationships ──────────────────────────────────────────────

    public function pixel(): BelongsTo
    {
        return $this->belongsTo(Pixel::class);
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

    public function scopeForRetailerId($query, string $retailerId)
    {
        return $query->where('retailer_id', $retailerId);
    }
}
