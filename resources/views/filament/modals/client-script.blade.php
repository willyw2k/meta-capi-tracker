<div class="space-y-4" x-data="{ copied: false }">
    <p class="text-sm text-gray-500 dark:text-gray-400">
        Add this snippet before the closing <code class="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-white/10">&lt;/body&gt;</code> tag on your website:
    </p>

    <div class="relative">
        <button
            type="button"
            x-on:click="
                navigator.clipboard.writeText($refs.scriptContent.textContent);
                copied = true;
                setTimeout(() => copied = false, 2000);
            "
            class="absolute right-2 top-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
        >
            <span x-show="!copied">Copy</span>
            <span x-show="copied" x-cloak>Copied!</span>
        </button>

        <pre class="rounded-lg bg-gray-950 p-4 pr-20 overflow-x-auto"><code x-ref="scriptContent" class="text-sm text-white font-mono">&lt;script src="{{ url('/api/v1/track.js') }}"&gt;&lt;/script&gt;
&lt;script&gt;
    MetaTracker.init({
        endpoint: '{{ url('/api/v1/track/event') }}',
        apiKey: '{{ config('meta-capi.api_key') ?: 'YOUR_API_KEY' }}',
        pixelId: '{{ $pixel->pixel_id }}',
        advancedMatching: { enabled: true, autoCaptureForms: true },
        cookieKeeper: { enabled: true },
        adBlockRecovery: { enabled: true, proxyPath: '/{{ config('meta-capi.disguised_path', 'collect') }}' }
    });
&lt;/script&gt;</code></pre>
    </div>

    @if($pixel->test_event_code)
        <x-filament::section compact>
            <div class="flex items-center gap-2 text-sm text-warning-600 dark:text-warning-400">
                <x-filament::icon icon="heroicon-m-exclamation-triangle" class="h-5 w-5" />
                <span>This pixel has a test event code (<strong>{{ $pixel->test_event_code }}</strong>) configured. Events will be sent to Meta's Test Events tab.</span>
            </div>
        </x-filament::section>
    @endif

    @if(empty($pixel->domains))
        <p class="text-xs text-gray-400 dark:text-gray-500">
            This pixel accepts events from all domains. Consider restricting domains in the pixel settings for added security.
        </p>
    @else
        <p class="text-xs text-gray-400 dark:text-gray-500">
            This pixel accepts events from: <strong>{{ implode(', ', $pixel->domains) }}</strong>
        </p>
    @endif
</div>
