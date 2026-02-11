<x-filament-panels::page>
    <div class="space-y-6">
        {{-- Quick Start --}}
        <x-filament::section icon="heroicon-o-rocket-launch">
            <x-slot name="heading">Quick Start</x-slot>
            <x-slot name="description">Get tracking running on your website in under 5 minutes.</x-slot>

            <div class="prose dark:prose-invert max-w-none">
                <p>Add this snippet before the closing <code>&lt;/body&gt;</code> tag on every page you want to track:</p>

                <pre class="fi-code-block rounded-lg bg-gray-950 p-4 overflow-x-auto"><code class="text-sm text-white font-mono">&lt;script src="{{ url('/api/v1/track.js') }}"&gt;&lt;/script&gt;
&lt;script&gt;
    MetaTracker.init({
        endpoint: '{{ url('/api/v1/track/event') }}',
        apiKey: 'YOUR_API_KEY',
        pixelId: 'YOUR_PIXEL_ID',
        advancedMatching: { enabled: true, autoCaptureForms: true },
        cookieKeeper: { enabled: true },
        adBlockRecovery: { enabled: true, proxyPath: '/collect' }
    });
&lt;/script&gt;</code></pre>

                <p>That's it! The tracker will automatically send <strong>PageView</strong> events and capture form submissions for Advanced Matching.</p>
            </div>
        </x-filament::section>

        {{-- Tracking Events --}}
        <x-filament::section icon="heroicon-o-bolt" collapsible>
            <x-slot name="heading">Tracking Events</x-slot>

            <div class="prose dark:prose-invert max-w-none">
                <h4>Standard Events</h4>
                <pre class="fi-code-block rounded-lg bg-gray-950 p-4 overflow-x-auto"><code class="text-sm text-white font-mono">// Purchase
MetaTracker.trackPurchase(
    { value: 99.99, currency: 'USD', content_ids: ['SKU-123'] },
    { email: 'customer@example.com', phone: '+1234567890' }
);

// Lead
MetaTracker.trackLead({ content_name: 'Newsletter Signup' });

// Add to Cart
MetaTracker.trackAddToCart({ value: 29.99, currency: 'USD', content_ids: ['SKU-456'] });

// Complete Registration
MetaTracker.trackCompleteRegistration({ content_name: 'Free Trial' });</code></pre>

                <h4>Custom Events</h4>
                <pre class="fi-code-block rounded-lg bg-gray-950 p-4 overflow-x-auto"><code class="text-sm text-white font-mono">MetaTracker.track('LevelComplete', { level: 5, score: 1200 });</code></pre>

                <h4>Identifying Users</h4>
                <pre class="fi-code-block rounded-lg bg-gray-950 p-4 overflow-x-auto"><code class="text-sm text-white font-mono">// After login or form submission
MetaTracker.identify({
    email: 'user@example.com',
    phone: '+1234567890',
    first_name: 'John',
    last_name: 'Doe',
    external_id: 'user_12345'
});</code></pre>
            </div>
        </x-filament::section>

        {{-- Multi-Pixel Routing --}}
        <x-filament::section icon="heroicon-o-arrows-right-left" collapsible collapsed>
            <x-slot name="heading">Multi-Pixel Routing</x-slot>

            <div class="prose dark:prose-invert max-w-none">
                <p>Route events to different pixels based on domain:</p>

                <pre class="fi-code-block rounded-lg bg-gray-950 p-4 overflow-x-auto"><code class="text-sm text-white font-mono">MetaTracker.init({
    endpoint: '{{ url('/api/v1/track/event') }}',
    apiKey: 'YOUR_API_KEY',
    pixels: [
        { pixelId: '111111111', domains: ['shop.example.com'] },
        { pixelId: '222222222', domains: ['blog.example.com'] },
        { pixelId: '333333333', domains: ['*'] } // catch-all
    ]
});

// Or send to a specific pixel
MetaTracker.trackToPixel('111111111', 'Purchase', { value: 49.99 });</code></pre>
            </div>
        </x-filament::section>

        {{-- API Endpoints --}}
        <x-filament::section icon="heroicon-o-server" collapsible collapsed>
            <x-slot name="heading">API Endpoints</x-slot>

            <div class="prose dark:prose-invert max-w-none">
                <table>
                    <thead>
                        <tr>
                            <th>Method</th>
                            <th>Endpoint</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>POST</code></td>
                            <td><code>/api/v1/track/event</code></td>
                            <td>Single event tracking</td>
                        </tr>
                        <tr>
                            <td><code>POST</code></td>
                            <td><code>/api/v1/track/batch</code></td>
                            <td>Batch event tracking (up to 1000)</td>
                        </tr>
                        <tr>
                            <td><code>POST</code></td>
                            <td><code>/api/v1/track/cookie-sync</code></td>
                            <td>Cookie Keeper sync</td>
                        </tr>
                        <tr>
                            <td><code>GET</code></td>
                            <td><code>/api/v1/track/pixel.gif</code></td>
                            <td>Image pixel fallback</td>
                        </tr>
                        <tr>
                            <td><code>GET</code></td>
                            <td><code>/api/v1/track/match-quality</code></td>
                            <td>Match quality diagnostics</td>
                        </tr>
                        <tr>
                            <td><code>GET</code></td>
                            <td><code>/api/v1/track.js</code></td>
                            <td>Client-side tracker script</td>
                        </tr>
                        <tr>
                            <td><code>POST</code></td>
                            <td><code>/collect/event</code></td>
                            <td>Disguised endpoint (ad blocker recovery)</td>
                        </tr>
                        <tr>
                            <td><code>POST</code></td>
                            <td><code>/api/v1/track/gtm</code></td>
                            <td>GTM Server-Side webhook</td>
                        </tr>
                    </tbody>
                </table>

                <h4>Authentication</h4>
                <p>All tracking endpoints require the <code>X-API-Key</code> header matching your <code>TRACKING_API_KEY</code> environment variable.</p>
            </div>
        </x-filament::section>

        {{-- Google Tag Manager (Client-Side) --}}
        <x-filament::section icon="heroicon-o-tag" collapsible collapsed>
            <x-slot name="heading">Google Tag Manager (Client-Side)</x-slot>
            <x-slot name="description">Use MetaTracker as a Custom HTML tag in GTM with automatic GA4 ecommerce event mapping.</x-slot>

            <div class="prose dark:prose-invert max-w-none">
                <h4>Step 1: Initialization Tag (trigger: All Pages)</h4>
                <p>Create a Custom HTML tag in GTM with the following code:</p>

                <pre class="fi-code-block rounded-lg bg-gray-950 p-4 overflow-x-auto"><code class="text-sm text-white font-mono">&lt;script src="{{ url('/api/v1/track.js') }}"&gt;&lt;/script&gt;
&lt;script&gt;
    MetaTracker.init({
        endpoint: '{{ url('/api/v1/track') }}',
        apiKey: 'YOUR_API_KEY',
        pixelId: 'YOUR_PIXEL_ID',
        autoPageView: true,
        gtm: {
            enabled: true,
            autoMapEcommerce: true,  // Auto-map GA4 events
            pushToDataLayer: true,   // Push results back to dataLayer
        },
        advancedMatching: {
            enabled: true,
            autoCaptureForms: true,
            captureDataLayer: true,
        },
    });
&lt;/script&gt;</code></pre>

                <h4>Step 2: Automatic GA4 Event Mapping</h4>
                <p>When <code>gtm.autoMapEcommerce</code> is enabled, GA4 ecommerce events pushed to the dataLayer are automatically mapped to Meta CAPI events:</p>

                <table>
                    <thead>
                        <tr><th>GA4 Event</th><th>Meta CAPI Event</th></tr>
                    </thead>
                    <tbody>
                        <tr><td><code>page_view</code></td><td>PageView</td></tr>
                        <tr><td><code>view_item</code> / <code>view_item_list</code></td><td>ViewContent</td></tr>
                        <tr><td><code>add_to_cart</code></td><td>AddToCart</td></tr>
                        <tr><td><code>add_to_wishlist</code></td><td>AddToWishlist</td></tr>
                        <tr><td><code>begin_checkout</code></td><td>InitiateCheckout</td></tr>
                        <tr><td><code>add_payment_info</code></td><td>AddPaymentInfo</td></tr>
                        <tr><td><code>purchase</code></td><td>Purchase</td></tr>
                        <tr><td><code>sign_up</code></td><td>CompleteRegistration</td></tr>
                        <tr><td><code>generate_lead</code></td><td>Lead</td></tr>
                        <tr><td><code>search</code></td><td>Search</td></tr>
                    </tbody>
                </table>

                <h4>Step 3: Custom Event Mapping</h4>
                <p>Map custom dataLayer events to Meta CAPI events:</p>

                <pre class="fi-code-block rounded-lg bg-gray-950 p-4 overflow-x-auto"><code class="text-sm text-white font-mono">MetaTracker.init({
    // ...
    gtm: {
        enabled: true,
        eventMapping: {
            'custom_signup': 'CompleteRegistration',
            'custom_lead': 'Lead',
            'level_complete': 'CustomEvent',
        },
    },
});</code></pre>

                <h4>Step 4: Manual Event Tags (Optional)</h4>
                <p>For events not in the dataLayer, create additional Custom HTML tags:</p>

                <pre class="fi-code-block rounded-lg bg-gray-950 p-4 overflow-x-auto"><code class="text-sm text-white font-mono">&lt;!-- Purchase Tag (trigger: purchase dataLayer event) --&gt;
&lt;script&gt;
    MetaTracker.trackPurchase({
        value: {<!-- -->{DLV - transaction_total}},
        currency: {<!-- -->{DLV - currency}} || 'USD',
        content_ids: {<!-- -->{DLV - product_ids}},
        order_id: {<!-- -->{DLV - transaction_id}},
    }, {
        em: {<!-- -->{DLV - user_email}},
        ph: {<!-- -->{DLV - user_phone}},
        external_id: {<!-- -->{DLV - user_id}},
    });
&lt;/script&gt;</code></pre>
            </div>
        </x-filament::section>

        {{-- Google Tag Manager (Server-Side) --}}
        <x-filament::section icon="heroicon-o-server-stack" collapsible collapsed>
            <x-slot name="heading">Google Tag Manager (Server-Side Container)</x-slot>
            <x-slot name="description">Forward events from your GTM Server-Side container to Meta CAPI via webhook.</x-slot>

            <div class="prose dark:prose-invert max-w-none">
                <h4>Overview</h4>
                <p>The GTM server-side webhook endpoint receives events from your GTM Server-Side Container and automatically maps GA4 event parameters to Meta CAPI format.</p>

                <h4>Step 1: Enable GTM Integration</h4>
                <p>Add these environment variables to your <code>.env</code> file:</p>

                <pre class="fi-code-block rounded-lg bg-gray-950 p-4 overflow-x-auto"><code class="text-sm text-white font-mono">GTM_ENABLED=true
GTM_WEBHOOK_SECRET=your-secret-key-here
GTM_DEFAULT_PIXEL_ID=123456789012345</code></pre>

                <h4>Step 2: Create a Custom Tag in GTM Server-Side</h4>
                <p>In your GTM Server-Side container, create a custom tag that sends an HTTP request:</p>

                <pre class="fi-code-block rounded-lg bg-gray-950 p-4 overflow-x-auto"><code class="text-sm text-white font-mono">Endpoint: {{ url('/api/v1/track/gtm') }}
Method: POST
Headers:
  Content-Type: application/json
  X-GTM-Secret: your-secret-key-here
  X-Pixel-Id: 123456789012345  (optional, overrides default)</code></pre>

                <h4>Step 3: Payload Format</h4>
                <p>Send the standard GA4 event data. The server automatically maps fields:</p>

                <pre class="fi-code-block rounded-lg bg-gray-950 p-4 overflow-x-auto"><code class="text-sm text-white font-mono">{
    "event_name": "purchase",
    "event_id": "evt_abc123",
    "page_location": "https://shop.example.com/checkout",
    "ip_override": "203.0.113.50",
    "user_agent": "Mozilla/5.0 ...",
    "user_data": {
        "email_address": "customer@example.com",
        "phone_number": "+1234567890",
        "address": {
            "city": "New York",
            "region": "NY",
            "postal_code": "10001",
            "country": "US"
        }
    },
    "items": [
        {
            "item_id": "SKU-123",
            "item_name": "Product Name",
            "price": 99.99,
            "quantity": 1
        }
    ],
    "value": 99.99,
    "currency": "USD",
    "transaction_id": "order_456"
}</code></pre>

                <h4>Batch Events</h4>
                <p>Send multiple events in a single request:</p>

                <pre class="fi-code-block rounded-lg bg-gray-950 p-4 overflow-x-auto"><code class="text-sm text-white font-mono">{
    "pixel_id": "123456789012345",
    "events": [
        { "event_name": "page_view", "page_location": "..." },
        { "event_name": "purchase", "value": 99.99, ... }
    ]
}</code></pre>
            </div>
        </x-filament::section>

        {{-- Server-Side Integration --}}
        <x-filament::section icon="heroicon-o-command-line" collapsible collapsed>
            <x-slot name="heading">Server-Side Integration (PHP/Laravel)</x-slot>

            <div class="prose dark:prose-invert max-w-none">
                <p>Send events directly from your backend:</p>

                <pre class="fi-code-block rounded-lg bg-gray-950 p-4 overflow-x-auto"><code class="text-sm text-white font-mono">use Illuminate\Support\Facades\Http;

$response = Http::withHeaders([
    'X-API-Key' => config('meta-capi.api_key'),
])->post(url('/api/v1/track/event'), [
    'pixel_id' => '123456789',
    'event_name' => 'Purchase',
    'event_source_url' => 'https://shop.example.com/checkout',
    'user_data' => [
        'em' => hash('sha256', strtolower('customer@example.com')),
        'ph' => hash('sha256', preg_replace('/[^0-9]/', '', '+1234567890')),
        'client_ip_address' => request()->ip(),
        'client_user_agent' => request()->userAgent(),
        'fbc' => request()->cookie('_fbc'),
        'fbp' => request()->cookie('_fbp'),
    ],
    'custom_data' => [
        'value' => 99.99,
        'currency' => 'USD',
        'content_ids' => ['SKU-123'],
    ],
]);</code></pre>
            </div>
        </x-filament::section>

        {{-- Debugging --}}
        <x-filament::section icon="heroicon-o-bug-ant" collapsible collapsed>
            <x-slot name="heading">Debugging & Diagnostics</x-slot>

            <div class="prose dark:prose-invert max-w-none">
                <h4>Browser Console</h4>
                <pre class="fi-code-block rounded-lg bg-gray-950 p-4 overflow-x-auto"><code class="text-sm text-white font-mono">// Check tracker status
MetaTracker.getDebugInfo();

// Check match quality
await MetaTracker.getMatchQuality();

// Check ad blocker detection
MetaTracker.isAdBlocked();

// Check current transport
MetaTracker.getTransport(); // 'fetch', 'beacon', 'image', or 'proxy'</code></pre>

                <h4>Test Event Mode</h4>
                <p>Set a <strong>Test Event Code</strong> on your Pixel configuration to send events to Meta's Test Events tab in Events Manager. This lets you validate events without affecting production data.</p>
            </div>
        </x-filament::section>
    </div>
</x-filament-panels::page>
