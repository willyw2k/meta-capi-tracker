<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Data\MetaCustomData;
use App\Data\MetaUserData;
use App\Data\TrackEventDto;
use App\Enums\MetaActionSource;
use App\Enums\MetaEventName;
use Illuminate\Foundation\Http\FormRequest;

final class TrackEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Handled by middleware
    }

    public function rules(): array
    {
        return [
            'pixel_id' => ['required', 'string'],
            'event_name' => ['required', 'string'],
            'custom_event_name' => ['nullable', 'string', 'max:255'],
            'action_source' => ['nullable', 'string'],
            'event_source_url' => ['required', 'url:http,https'],
            'event_id' => ['nullable', 'string', 'max:255'],
            'event_time' => ['nullable', 'integer'],
            'match_quality' => ['nullable', 'integer', 'min:0', 'max:100'],
            'visitor_id' => ['nullable', 'string', 'max:100'],

            // User data (all PII fields accepted — normalized server-side)
            'user_data' => ['nullable', 'array'],
            'user_data.em' => ['nullable', 'string'],
            'user_data.ph' => ['nullable', 'string'],
            'user_data.fn' => ['nullable', 'string'],
            'user_data.ln' => ['nullable', 'string'],
            'user_data.ge' => ['nullable', 'string'],
            'user_data.db' => ['nullable', 'string'],
            'user_data.ct' => ['nullable', 'string'],
            'user_data.st' => ['nullable', 'string'],
            'user_data.zp' => ['nullable', 'string'],
            'user_data.country' => ['nullable', 'string'],
            'user_data.external_id' => ['nullable', 'string'],
            'user_data.client_ip_address' => ['nullable', 'ip'],
            'user_data.client_user_agent' => ['nullable', 'string'],
            'user_data.fbc' => ['nullable', 'string'],
            'user_data.fbp' => ['nullable', 'string'],
            'user_data.subscription_id' => ['nullable', 'string'],
            'user_data.fb_login_id' => ['nullable', 'string'],
            'user_data.lead_id' => ['nullable', 'string'],

            // Advanced Matching: multi-value fields
            'user_data.em_multi' => ['nullable', 'array'],
            'user_data.em_multi.*' => ['string'],
            'user_data.ph_multi' => ['nullable', 'array'],
            'user_data.ph_multi.*' => ['string'],

            // Long-name aliases (accepted, mapped in MetaUserData::fromRaw)
            'user_data.email' => ['nullable', 'string'],
            'user_data.phone' => ['nullable', 'string'],
            'user_data.first_name' => ['nullable', 'string'],
            'user_data.last_name' => ['nullable', 'string'],
            'user_data.gender' => ['nullable', 'string'],
            'user_data.date_of_birth' => ['nullable', 'string'],
            'user_data.city' => ['nullable', 'string'],
            'user_data.state' => ['nullable', 'string'],
            'user_data.zip' => ['nullable', 'string'],
            'user_data.postal_code' => ['nullable', 'string'],
            'user_data.country_code' => ['nullable', 'string'],

            // Custom data
            'custom_data' => ['nullable', 'array'],
            'custom_data.value' => ['nullable', 'numeric'],
            'custom_data.currency' => ['nullable', 'string', 'size:3'],
            'custom_data.content_name' => ['nullable', 'string'],
            'custom_data.content_category' => ['nullable', 'string'],
            'custom_data.content_ids' => ['nullable', 'array'],
            'custom_data.content_ids.*' => ['string'],
            'custom_data.contents' => ['nullable', 'array'],
            'custom_data.content_type' => ['nullable', 'string'],
            'custom_data.order_id' => ['nullable', 'string'],
            'custom_data.num_items' => ['nullable', 'integer'],
            'custom_data.search_string' => ['nullable', 'string'],
            'custom_data.status' => ['nullable', 'string'],
        ];
    }

    public function toDto(): TrackEventDto
    {
        $userData = $this->input('user_data', []);

        // Build MetaUserData with normalization + hashing
        $metaUserData = MetaUserData::fromRaw($userData);

        // Enrich with server-side request data (IP, UA, validate fbc/fbp format)
        $metaUserData = $metaUserData->enrichFromRequest($this);

        return new TrackEventDto(
            pixel_id: $this->input('pixel_id'),
            event_name: MetaEventName::tryFrom($this->input('event_name')) ?? MetaEventName::Custom,
            custom_event_name: MetaEventName::tryFrom($this->input('event_name'))
                ? null
                : $this->input('event_name'),
            action_source: MetaActionSource::tryFrom($this->input('action_source', 'website'))
                ?? MetaActionSource::Website,
            event_source_url: $this->input('event_source_url'),
            user_data: $metaUserData,
            custom_data: $this->has('custom_data')
                ? MetaCustomData::from($this->input('custom_data'))
                : null,
            event_id: $this->input('event_id'),
            event_time: $this->input('event_time'),
            visitor_id: $this->input('visitor_id'),
        );
    }
}
