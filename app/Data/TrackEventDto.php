<?php

declare(strict_types=1);

namespace App\Data;

use App\Enums\MetaActionSource;
use App\Enums\MetaEventName;
use Spatie\LaravelData\Data;

final class TrackEventDto extends Data
{
    public function __construct(
        public string $pixel_id,
        public MetaEventName $event_name,
        public ?string $custom_event_name,
        public MetaActionSource $action_source,
        public string $event_source_url,
        public MetaUserData $user_data,
        public ?MetaCustomData $custom_data = null,
        public ?string $event_id = null,
        public ?int $event_time = null,
        public ?int $opt_out = null,
        public ?string $data_processing_options = null,
        public ?int $data_processing_options_country = null,
        public ?int $data_processing_options_state = null,
        public ?string $visitor_id = null,  // Raw _mt_id for server-side profile linking
    ) {}

    /**
     * Resolve the effective event name (custom or standard).
     */
    public function resolvedEventName(): string
    {
        if ($this->event_name === MetaEventName::Custom && $this->custom_event_name) {
            return $this->custom_event_name;
        }

        return $this->event_name->value;
    }

    /**
     * Convert to Meta Conversions API event format.
     */
    public function toMetaEventPayload(): array
    {
        $event = [
            'event_name' => $this->resolvedEventName(),
            'event_time' => $this->event_time ?? now()->timestamp,
            'action_source' => $this->action_source->value,
            'event_source_url' => $this->event_source_url,
            'user_data' => $this->user_data->toMetaFormat(),
        ];

        if ($this->event_id) {
            $event['event_id'] = $this->event_id;
        }

        if ($this->custom_data) {
            $event['custom_data'] = $this->custom_data->toMetaFormat();
        }

        if ($this->opt_out !== null) {
            $event['opt_out'] = (bool) $this->opt_out;
        }

        if ($this->data_processing_options) {
            $event['data_processing_options'] = json_decode($this->data_processing_options, true) ?? [];
            $event['data_processing_options_country'] = $this->data_processing_options_country ?? 0;
            $event['data_processing_options_state'] = $this->data_processing_options_state ?? 0;
        }

        return $event;
    }
}
