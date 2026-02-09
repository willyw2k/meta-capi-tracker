<x-filament-panels::page>
    <div class="space-y-6">
        {{-- Quick Start --}}
        <x-filament::section icon="heroicon-o-rocket-launch">
            <x-slot name="heading">Quick Start</x-slot>
            <x-slot name="description">Get tracking running on your website in under 5 minutes.</x-slot>

            <div class="prose dark:prose-invert max-w-none">
                <p>Add this snippet before the closing <code>&lt;/body&gt;</code> tag on every page you want to track:</p>

                <x-filament::code-block language="html">
&lt;script src="{{ url('/api/v1/track.js') }}"&gt;&lt;/script&gt;
&lt;script&gt;
    MetaTracker.init({
        endpoint: '{{ url('/api/v1/track/event') }}',
        apiKey: 'YOUR_API_KEY',
        pixelId: 'YOUR_PIXEL_ID',
        advancedMatching: { enabled: true, autoCaptureForms: true },
        cookieKeeper: { enabled: true },
        adBlockRecovery: { enabled: true, proxyPath: '/collect' }
    });
&lt;/script&gt;
                </x-filament::code-block>

                <p>That's it! The tracker will automatically send <strong>PageView</strong> events and capture form submissions for Advanced Matching.</p>
            </div>
        </x-filament::section>

        {{-- Tracking Events --}}
        <x-filament::section icon="heroicon-o-bolt" collapsible>
            <x-slot name="heading">Tracking Events</x-slot>

            <div class="prose dark:prose-invert max-w-none">
                <h4>Standard Events</h4>
                <x-filament::code-block language="javascript">
// Purchase
MetaTracker.trackPurchase(
    { value: 99.99, currency: 'USD', content_ids: ['SKU-123'] },
    { email: 'customer@example.com', phone: '+1234567890' }
);

// Lead
MetaTracker.trackLead({ content_name: 'Newsletter Signup' });

// Add to Cart
MetaTracker.trackAddToCart({ value: 29.99, currency: 'USD', content_ids: ['SKU-456'] });

// Complete Registration
MetaTracker.trackCompleteRegistration({ content_name: 'Free Trial' });
                </x-filament::code-block>

                <h4>Custom Events</h4>
                <x-filament::code-block language="javascript">
MetaTracker.track('LevelComplete', { level: 5, score: 1200 });
                </x-filament::code-block>

                <h4>Identifying Users</h4>
                <x-filament::code-block language="javascript">
// After login or form submission
MetaTracker.identify({
    email: 'user@example.com',
    phone: '+1234567890',
    first_name: 'John',
    last_name: 'Doe',
    external_id: 'user_12345'
});
                </x-filament::code-block>
            </div>
        </x-filament::section>

        {{-- Multi-Pixel Routing --}}
        <x-filament::section icon="heroicon-o-arrows-right-left" collapsible collapsed>
            <x-slot name="heading">Multi-Pixel Routing</x-slot>

            <div class="prose dark:prose-invert max-w-none">
                <p>Route events to different pixels based on domain:</p>

                <x-filament::code-block language="javascript">
MetaTracker.init({
    endpoint: '{{ url('/api/v1/track/event') }}',
    apiKey: 'YOUR_API_KEY',
    pixels: [
        { pixelId: '111111111', domains: ['shop.example.com'] },
        { pixelId: '222222222', domains: ['blog.example.com'] },
        { pixelId: '333333333', domains: ['*'] } // catch-all
    ]
});

// Or send to a specific pixel
MetaTracker.trackToPixel('111111111', 'Purchase', { value: 49.99 });
                </x-filament::code-block>
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
                    </tbody>
                </table>

                <h4>Authentication</h4>
                <p>All tracking endpoints require the <code>X-API-Key</code> header matching your <code>TRACKING_API_KEY</code> environment variable.</p>
            </div>
        </x-filament::section>

        {{-- Server-Side Integration --}}
        <x-filament::section icon="heroicon-o-command-line" collapsible collapsed>
            <x-slot name="heading">Server-Side Integration (PHP/Laravel)</x-slot>

            <div class="prose dark:prose-invert max-w-none">
                <p>Send events directly from your backend:</p>

                <x-filament::code-block language="php">
use Illuminate\Support\Facades\Http;

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
]);
                </x-filament::code-block>
            </div>
        </x-filament::section>

        {{-- Debugging --}}
        <x-filament::section icon="heroicon-o-bug-ant" collapsible collapsed>
            <x-slot name="heading">Debugging & Diagnostics</x-slot>

            <div class="prose dark:prose-invert max-w-none">
                <h4>Browser Console</h4>
                <x-filament::code-block language="javascript">
// Check tracker status
MetaTracker.getDebugInfo();

// Check match quality
await MetaTracker.getMatchQuality();

// Check ad blocker detection
MetaTracker.isAdBlocked();

// Check current transport
MetaTracker.getTransport(); // 'fetch', 'beacon', 'image', or 'proxy'
                </x-filament::code-block>

                <h4>Test Event Mode</h4>
                <p>Set a <strong>Test Event Code</strong> on your Pixel configuration to send events to Meta's Test Events tab in Events Manager. This lets you validate events without affecting production data.</p>
            </div>
        </x-filament::section>
    </div>
</x-filament-panels::page>
