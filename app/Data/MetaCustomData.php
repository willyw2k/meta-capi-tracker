<?php

declare(strict_types=1);

namespace App\Data;

use Spatie\LaravelData\Data;

final class MetaCustomData extends Data
{
    public function __construct(
        public ?float $value = null,
        public ?string $currency = null,
        public ?string $content_name = null,
        public ?string $content_category = null,
        public ?array $content_ids = null,
        public ?array $contents = null,
        public ?string $content_type = null,
        public ?string $order_id = null,
        public ?float $predicted_ltv = null,
        public ?int $num_items = null,
        public ?string $search_string = null,
        public ?string $status = null,
        public ?string $delivery_category = null,
        public ?array $custom_properties = null,
    ) {}

    /**
     * Convert to Meta CAPI format.
     */
    public function toMetaFormat(): array
    {
        $data = array_filter([
            'value' => $this->value,
            'currency' => $this->currency,
            'content_name' => $this->content_name,
            'content_category' => $this->content_category,
            'content_ids' => $this->content_ids,
            'contents' => $this->contents,
            'content_type' => $this->content_type,
            'order_id' => $this->order_id,
            'predicted_ltv' => $this->predicted_ltv,
            'num_items' => $this->num_items,
            'search_string' => $this->search_string,
            'status' => $this->status,
            'delivery_category' => $this->delivery_category,
        ], fn ($value) => $value !== null);

        // Merge custom properties at the top level
        if ($this->custom_properties) {
            $data = array_merge($data, $this->custom_properties);
        }

        return $data;
    }
}
