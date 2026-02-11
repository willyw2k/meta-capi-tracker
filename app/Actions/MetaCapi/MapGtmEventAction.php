<?php

declare(strict_types=1);

namespace App\Actions\MetaCapi;

use App\Data\MetaCustomData;
use App\Data\MetaUserData;
use App\Data\TrackEventDto;
use App\Enums\MetaActionSource;
use App\Enums\MetaEventName;
use App\Services\MetaCapi\Exceptions\MetaCapiException;
use Illuminate\Support\Facades\Log;

/**
 * Maps a GTM Server-Side Container event payload to a TrackEventDto.
 *
 * GTM server-side containers send events in a common event data format
 * (based on GA4 protocol). This action translates that format into
 * the Meta CAPI event structure used by TrackEventAction.
 */
final readonly class MapGtmEventAction
{
    /**
     * GA4 event name → Meta CAPI event name mapping.
     */
    private const GA4_EVENT_MAP = [
        'page_view' => MetaEventName::PageView,
        'view_item' => MetaEventName::ViewContent,
        'view_item_list' => MetaEventName::ViewContent,
        'select_item' => MetaEventName::ViewContent,
        'add_to_cart' => MetaEventName::AddToCart,
        'add_to_wishlist' => MetaEventName::AddToWishlist,
        'begin_checkout' => MetaEventName::InitiateCheckout,
        'add_payment_info' => MetaEventName::AddPaymentInfo,
        'add_shipping_info' => MetaEventName::AddPaymentInfo,
        'purchase' => MetaEventName::Purchase,
        'sign_up' => MetaEventName::CompleteRegistration,
        'generate_lead' => MetaEventName::Lead,
        'search' => MetaEventName::Search,
        'contact' => MetaEventName::Contact,
        'subscribe' => MetaEventName::Subscribe,
        'start_trial' => MetaEventName::StartTrial,
        'submit_application' => MetaEventName::SubmitApplication,
        'schedule' => MetaEventName::Schedule,
        'donate' => MetaEventName::Donate,
        'find_location' => MetaEventName::FindLocation,
        'customize_product' => MetaEventName::CustomizeProduct,
    ];

    public function __invoke(array $payload, string $pixelId): TrackEventDto
    {
        if (empty($payload)) {
            throw MetaCapiException::invalidPayload('GTM event payload is empty.');
        }

        if (empty($pixelId)) {
            throw MetaCapiException::invalidPayload('Pixel ID is required for GTM events.');
        }

        $eventName = $payload['event_name'] ?? $payload['event'] ?? 'page_view';

        // Resolve Meta event
        $metaEvent = self::GA4_EVENT_MAP[$eventName] ?? null;
        $customEventName = null;

        if (! $metaEvent) {
            // Check custom mappings from config
            $customMappings = config('meta-capi.gtm.event_mapping', []);
            if (isset($customMappings[$eventName])) {
                $metaEvent = MetaEventName::tryFrom($customMappings[$eventName]) ?? MetaEventName::Custom;
                if ($metaEvent === MetaEventName::Custom) {
                    $customEventName = $customMappings[$eventName];
                }
            } else {
                $metaEvent = MetaEventName::Custom;
                $customEventName = $eventName;
            }
        }

        return new TrackEventDto(
            pixel_id: $pixelId,
            event_name: $metaEvent,
            custom_event_name: $customEventName,
            action_source: $this->resolveActionSource($payload),
            event_source_url: $this->resolveEventSourceUrl($payload),
            user_data: $this->buildUserData($payload),
            custom_data: $this->buildCustomData($eventName, $payload),
            event_id: $payload['event_id'] ?? $payload['transaction_id'] ?? null,
            event_time: isset($payload['event_time'])
                ? (int) $payload['event_time']
                : null,
            visitor_id: $payload['client_id'] ?? $payload['visitor_id'] ?? null,
        );
    }

    private function resolveActionSource(array $payload): MetaActionSource
    {
        if (isset($payload['action_source'])) {
            return MetaActionSource::tryFrom($payload['action_source']) ?? MetaActionSource::Website;
        }

        return MetaActionSource::Website;
    }

    private function resolveEventSourceUrl(array $payload): string
    {
        // GTM server-side sends page_location or page_url
        return $payload['event_source_url']
            ?? $payload['page_location']
            ?? $payload['page_url']
            ?? $payload['document_location']
            ?? 'https://unknown';
    }

    private function buildUserData(array $payload): MetaUserData
    {
        $userData = $payload['user_data'] ?? [];

        if (! is_array($userData)) {
            $userData = [];
        }

        // Pre-extract address (may be array or object — normalize to array)
        $address = $userData['address'] ?? [];
        if (! is_array($address)) {
            $address = [];
        }

        // GTM server-side also puts user properties at top level
        $raw = [
            'em' => $userData['email_address'] ?? $userData['email'] ?? $userData['em'] ?? $payload['user_email'] ?? null,
            'ph' => $userData['phone_number'] ?? $userData['phone'] ?? $userData['ph'] ?? $payload['user_phone'] ?? null,
            'fn' => $userData['first_name'] ?? $userData['fn'] ?? null,
            'ln' => $userData['last_name'] ?? $userData['ln'] ?? null,
            'ge' => $userData['gender'] ?? $userData['ge'] ?? null,
            'db' => $userData['date_of_birth'] ?? $userData['db'] ?? null,
            'ct' => $userData['city'] ?? $userData['ct'] ?? $address['city'] ?? null,
            'st' => $userData['region'] ?? $userData['state'] ?? $userData['st'] ?? $address['region'] ?? $address['state'] ?? null,
            'zp' => $userData['postal_code'] ?? $userData['zip'] ?? $userData['zp'] ?? $address['postal_code'] ?? $address['zip'] ?? null,
            'country' => $userData['country'] ?? $userData['country_code'] ?? $address['country'] ?? $address['country_code'] ?? null,
            'external_id' => $userData['external_id'] ?? $payload['user_id'] ?? $payload['client_id'] ?? null,
            'client_ip_address' => $payload['ip_override'] ?? $payload['ip_address'] ?? $payload['client_ip'] ?? null,
            'client_user_agent' => $payload['user_agent'] ?? null,
            'fbc' => $payload['fbc'] ?? $userData['fbc'] ?? null,
            'fbp' => $payload['fbp'] ?? $userData['fbp'] ?? null,
        ];

        return MetaUserData::fromRaw(array_filter($raw));
    }

    private function buildCustomData(string $eventName, array $payload): ?MetaCustomData
    {
        $ecommerce = $payload['ecommerce'] ?? null;
        $items = [];

        if (is_array($ecommerce) && isset($ecommerce['items']) && is_array($ecommerce['items'])) {
            $items = $ecommerce['items'];
        } elseif (isset($payload['items']) && is_array($payload['items'])) {
            $items = $payload['items'];
        }

        $contentIds = [];
        $contents = [];
        $numItems = 0;

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $itemId = $item['item_id'] ?? $item['id'] ?? $item['item_name'] ?? '';
            if ($itemId) {
                $contentIds[] = (string) $itemId;
            }
            $qty = (int) ($item['quantity'] ?? 1);
            $contents[] = [
                'id' => (string) $itemId,
                'quantity' => $qty,
                'item_price' => isset($item['price']) ? (float) $item['price'] : null,
            ];
            $numItems += $qty;
        }

        $ecomArray = is_array($ecommerce) ? $ecommerce : [];
        $value = $payload['value'] ?? $payload['revenue'] ?? $ecomArray['value'] ?? null;
        $currency = $payload['currency'] ?? $ecomArray['currency'] ?? null;

        // If no value and we have items, sum item prices
        if ($value === null && $contents) {
            $value = array_reduce($contents, function ($carry, $item) {
                return $carry + (($item['item_price'] ?? 0) * ($item['quantity'] ?? 1));
            }, 0.0);
            if ($value === 0.0) {
                $value = null;
            }
        }

        $hasData = $value !== null || $currency || $contentIds
            || ($payload['search_term'] ?? null)
            || ($payload['transaction_id'] ?? null);

        if (! $hasData) {
            return null;
        }

        return new MetaCustomData(
            value: $value !== null ? (float) $value : null,
            currency: $currency ? (string) $currency : null,
            content_name: isset($items[0]['item_name']) ? (string) $items[0]['item_name'] : ($payload['content_name'] ?? null),
            content_category: isset($items[0]['item_category']) ? (string) $items[0]['item_category'] : ($payload['content_category'] ?? null),
            content_ids: $contentIds ?: null,
            contents: $contents ?: null,
            content_type: $contentIds ? 'product' : null,
            order_id: $payload['transaction_id'] ?? $payload['order_id'] ?? null,
            num_items: $numItems > 0 ? $numItems : null,
            search_string: $payload['search_term'] ?? $payload['search_string'] ?? null,
        );
    }
}
