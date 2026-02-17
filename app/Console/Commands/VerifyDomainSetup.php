<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Pixel;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;

final class VerifyDomainSetup extends Command
{
    protected $signature = 'tracking:verify-domain {domain}';

    protected $description = 'Verify first-party domain setup for Meta CAPI tracking';

    public function handle(): int
    {
        $domain = $this->argument('domain');

        $this->info("Verifying domain setup for: {$domain}");
        $this->newLine();

        $dnsOk = $this->checkDns($domain);
        $cnameOk = $this->checkCname($domain);
        $sslOk = $this->checkSsl($domain);
        $this->showCookieLifetimeComparison();
        $this->checkPixels($domain);

        $this->newLine();

        if ($dnsOk && $cnameOk && $sslOk) {
            $this->info('All checks passed. Domain is properly configured for first-party tracking.');
        } else {
            $this->warn('Some checks failed. Review the output above to resolve issues.');
        }

        return self::SUCCESS;
    }

    /**
     * Verify the domain resolves via A and AAAA records.
     */
    private function checkDns(string $domain): bool
    {
        $this->components->twoColumnDetail('<fg=cyan>DNS Resolution</>');

        $ipv4Addresses = [];
        $ipv6Addresses = [];

        $aRecords = @dns_get_record($domain, DNS_A);

        if ($aRecords !== false) {
            foreach ($aRecords as $record) {
                $ipv4Addresses[] = $record['ip'];
            }
        }

        $aaaaRecords = @dns_get_record($domain, DNS_AAAA);

        if ($aaaaRecords !== false) {
            foreach ($aaaaRecords as $record) {
                $ipv6Addresses[] = $record['ipv6'];
            }
        }

        if (empty($ipv4Addresses) && empty($ipv6Addresses)) {
            // Fallback to gethostbyname for basic resolution check
            $resolved = gethostbyname($domain);

            if ($resolved !== $domain) {
                $ipv4Addresses[] = $resolved;
            }
        }

        $hasRecords = ! empty($ipv4Addresses) || ! empty($ipv6Addresses);

        if (! empty($ipv4Addresses)) {
            $this->info("  IPv4 (A):    " . implode(', ', $ipv4Addresses));
        } else {
            $this->warn('  IPv4 (A):    No A records found');
        }

        if (! empty($ipv6Addresses)) {
            $this->info("  IPv6 (AAAA): " . implode(', ', $ipv6Addresses));
        } else {
            $this->warn('  IPv6 (AAAA): No AAAA records found');
        }

        if ($hasRecords) {
            $this->info('  DNS resolution: OK');
        } else {
            $this->error('  DNS resolution: FAILED — domain does not resolve');
        }

        $this->newLine();

        return $hasRecords;
    }

    /**
     * Check if the tracking subdomain has a CNAME record pointing to the app.
     */
    private function checkCname(string $domain): bool
    {
        $this->components->twoColumnDetail('<fg=cyan>CNAME Check</>');

        $trackingSubdomain = "t.{$domain}";
        $cnameRecords = @dns_get_record($trackingSubdomain, DNS_CNAME);

        if ($cnameRecords === false || empty($cnameRecords)) {
            $this->warn("  No CNAME record found for {$trackingSubdomain}");
            $this->warn('  Tip: Add a CNAME record for "t" pointing to your tracking server');
            $this->newLine();

            return false;
        }

        $targets = [];

        foreach ($cnameRecords as $record) {
            $targets[] = $record['target'];
        }

        $this->info("  {$trackingSubdomain} -> " . implode(', ', $targets));
        $this->info('  CNAME setup: OK');
        $this->newLine();

        return true;
    }

    /**
     * Verify HTTPS is working on the domain.
     */
    private function checkSsl(string $domain): bool
    {
        $this->components->twoColumnDetail('<fg=cyan>SSL / HTTPS Check</>');

        $context = stream_context_create([
            'ssl' => [
                'capture_peer_cert' => true,
                'verify_peer' => true,
                'verify_peer_name' => true,
                'allow_self_signed' => false,
            ],
        ]);

        $stream = @stream_socket_client(
            "ssl://{$domain}:443",
            $errorCode,
            $errorMessage,
            timeout: 10,
            context: $context,
        );

        if ($stream === false) {
            $this->error("  SSL connection failed: {$errorMessage} (code {$errorCode})");
            $this->newLine();

            return false;
        }

        $params = stream_context_get_params($stream);
        $certResource = $params['options']['ssl']['peer_certificate'] ?? null;

        if ($certResource !== null) {
            $certInfo = openssl_x509_parse($certResource);
            $validTo = $certInfo['validTo_time_t'] ?? null;

            if ($validTo !== null) {
                $expiresAt = date('Y-m-d H:i:s', $validTo);
                $daysRemaining = (int) ceil(($validTo - time()) / 86400);

                $this->info("  Certificate valid until: {$expiresAt} ({$daysRemaining} days remaining)");

                if ($daysRemaining < 30) {
                    $this->warn('  Warning: Certificate expires in less than 30 days');
                }
            }

            $commonName = $certInfo['subject']['CN'] ?? 'unknown';
            $this->info("  Certificate CN: {$commonName}");
        }

        fclose($stream);

        $this->info('  HTTPS: OK');
        $this->newLine();

        return true;
    }

    /**
     * Display a comparison table of cookie lifetimes across different setups.
     */
    private function showCookieLifetimeComparison(): void
    {
        $this->components->twoColumnDetail('<fg=cyan>Cookie Lifetime Comparison</>');

        $configuredDays = config('meta-capi.cookie_keeper.max_age_days', 180);

        $this->table(
            ['Cookie Method', 'Safari (ITP)', 'Chrome', 'Notes'],
            [
                ['JS-set cookies', '7 days', '400 days', 'Subject to ITP restrictions in Safari/WebKit'],
                ['Server-set HttpOnly', "{$configuredDays} days", "{$configuredDays} days", 'Bypasses ITP; configured via cookie_keeper.max_age_days'],
                ['Server-set with CNAME', 'Up to 2 years', 'Up to 2 years', 'First-party CNAME subdomain maximizes cookie lifetime'],
            ],
        );

        $cookieKeeperEnabled = config('meta-capi.cookie_keeper.enabled', true);

        if ($cookieKeeperEnabled) {
            $this->info("  Cookie Keeper is enabled (max age: {$configuredDays} days)");
        } else {
            $this->warn('  Cookie Keeper is disabled — server-set cookies are not active');
        }

        $this->newLine();
    }

    /**
     * Find and display active pixels configured for this domain.
     */
    private function checkPixels(string $domain): void
    {
        $this->components->twoColumnDetail('<fg=cyan>Pixel Configuration</>');

        /** @var Collection<int, Pixel> $pixels */
        $pixels = Pixel::query()->active()->get();

        $matchingPixels = $pixels->filter(
            fn (Pixel $pixel): bool => $pixel->acceptsDomain($domain),
        );

        if ($matchingPixels->isEmpty()) {
            $this->warn("  No active pixels are configured for domain: {$domain}");
            $this->newLine();

            return;
        }

        $rows = $matchingPixels->map(fn (Pixel $pixel): array => [
            $pixel->name,
            $pixel->pixel_id,
            $pixel->is_active ? '<fg=green>Active</>' : '<fg=red>Inactive</>',
            $pixel->test_event_code ?? '—',
            $pixel->domains ? implode(', ', $pixel->domains) : 'All domains',
        ])->all();

        $this->table(
            ['Name', 'Pixel ID', 'Status', 'Test Event Code', 'Domains'],
            $rows,
        );

        $this->info("  Found {$matchingPixels->count()} pixel(s) matching domain: {$domain}");
        $this->newLine();
    }
}
