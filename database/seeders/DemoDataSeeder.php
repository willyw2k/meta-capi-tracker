<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\EventStatus;
use App\Enums\MetaActionSource;
use App\Enums\MetaEventName;
use App\Models\MatchQualityLog;
use App\Models\Pixel;
use App\Models\TrackedEvent;
use App\Models\UserProfile;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $this->command->info('Seeding demo data...');

        // Create pixels
        $pixels = $this->seedPixels();
        $this->command->info('  ✓ Pixels created');

        // Create tracked events
        $this->seedTrackedEvents($pixels);
        $this->command->info('  ✓ Tracked events created');

        // Create user profiles
        $this->seedUserProfiles($pixels);
        $this->command->info('  ✓ User profiles created');

        // Create match quality logs
        $this->seedMatchQualityLogs($pixels);
        $this->command->info('  ✓ Match quality logs created');

        $this->command->info('Demo data seeding complete!');
    }

    private function seedPixels(): array
    {
        $pixelConfigs = [
            [
                'name' => 'Main Website',
                'pixel_id' => '123456789012345',
                'access_token' => 'EAABsbCS1IhnBADEMOTOKEN1234567890',
                'domains' => ['shop.example.com', '*.example.com'],
                'is_active' => true,
            ],
            [
                'name' => 'Blog & Content',
                'pixel_id' => '234567890123456',
                'access_token' => 'EAABsbCS1IhnBADEMOTOKEN0987654321',
                'domains' => ['blog.example.com'],
                'is_active' => true,
            ],
            [
                'name' => 'Landing Pages',
                'pixel_id' => '345678901234567',
                'access_token' => 'EAABsbCS1IhnBADEMOTOKEN5555555555',
                'test_event_code' => 'TEST54321',
                'domains' => ['lp.example.com', 'promo.example.com'],
                'is_active' => true,
            ],
            [
                'name' => 'Legacy (Inactive)',
                'pixel_id' => '456789012345678',
                'access_token' => 'EAABsbCS1IhnBADEMOTOKEN0000000000',
                'domains' => [],
                'is_active' => false,
            ],
        ];

        $pixels = [];
        foreach ($pixelConfigs as $config) {
            $pixels[] = Pixel::create($config);
        }

        return $pixels;
    }

    private function seedTrackedEvents(array $pixels): void
    {
        $activePixels = array_filter($pixels, fn (Pixel $p) => $p->is_active);
        $eventNames = MetaEventName::cases();
        $domains = ['shop.example.com', 'blog.example.com', 'lp.example.com', 'promo.example.com'];
        $pages = ['/products/widget', '/checkout', '/cart', '/register', '/blog/ai-trends', '/landing/summer-sale', '/'];

        // Create events over the last 30 days
        for ($day = 30; $day >= 0; $day--) {
            $date = Carbon::today()->subDays($day);
            $eventsPerDay = rand(20, 80);

            for ($i = 0; $i < $eventsPerDay; $i++) {
                $pixel = $activePixels[array_rand($activePixels)];
                $eventName = $this->weightedRandomEvent();
                $matchQuality = rand(15, 95);
                $domain = $domains[array_rand($domains)];
                $page = $pages[array_rand($pages)];

                // Determine status with realistic distribution
                $statusRoll = rand(1, 100);
                $status = match (true) {
                    $statusRoll <= 88 => EventStatus::Sent,
                    $statusRoll <= 93 => EventStatus::Duplicate,
                    $statusRoll <= 97 => EventStatus::Failed,
                    default => EventStatus::Pending,
                };

                $eventTime = $date->copy()->addMinutes(rand(0, 1439));

                TrackedEvent::create([
                    'pixel_id' => $pixel->id,
                    'event_id' => Str::uuid()->toString(),
                    'event_name' => $eventName,
                    'custom_event_name' => $eventName === MetaEventName::Custom ? 'CustomSignup' : null,
                    'action_source' => MetaActionSource::Website,
                    'event_source_url' => "https://{$domain}{$page}",
                    'event_time' => $eventTime,
                    'user_data' => json_encode([
                        'em' => hash('sha256', "user{$i}day{$day}@example.com"),
                        'client_ip_address' => '192.168.' . rand(1, 254) . '.' . rand(1, 254),
                        'client_user_agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                        'fbp' => 'fb.1.' . $eventTime->getTimestampMs() . '.' . rand(100000000, 999999999),
                    ]),
                    'custom_data' => $this->generateCustomData($eventName),
                    'match_quality' => $matchQuality,
                    'status' => $status,
                    'meta_response' => $status === EventStatus::Sent ? [
                        'events_received' => 1,
                        'messages' => [],
                        'fbtrace_id' => 'A' . Str::random(20),
                    ] : null,
                    'fbtrace_id' => $status === EventStatus::Sent ? 'A' . Str::random(20) : null,
                    'error_message' => $status === EventStatus::Failed ? $this->randomError() : null,
                    'attempts' => match ($status) {
                        EventStatus::Sent => 1,
                        EventStatus::Failed => rand(1, 3),
                        default => 0,
                    },
                    'sent_at' => $status === EventStatus::Sent ? $eventTime->copy()->addSeconds(rand(1, 10)) : null,
                    'created_at' => $eventTime,
                    'updated_at' => $eventTime,
                ]);
            }
        }
    }

    private function seedUserProfiles(array $pixels): void
    {
        $activePixels = array_filter($pixels, fn (Pixel $p) => $p->is_active);

        for ($i = 0; $i < 150; $i++) {
            $pixel = $activePixels[array_rand($activePixels)];
            $hasEmail = rand(1, 100) <= 75;
            $hasPhone = rand(1, 100) <= 45;
            $hasName = rand(1, 100) <= 55;
            $hasAddress = rand(1, 100) <= 25;

            $email = $hasEmail ? hash('sha256', "user{$i}@example.com") : null;

            UserProfile::create([
                'external_id' => rand(1, 100) <= 40 ? "ext_{$i}" : null,
                'em' => $email,
                'ph' => $hasPhone ? hash('sha256', '+1555' . str_pad((string) $i, 7, '0', STR_PAD_LEFT)) : null,
                'fn' => $hasName ? hash('sha256', 'john') : null,
                'ln' => $hasName ? hash('sha256', 'doe') : null,
                'ge' => rand(1, 100) <= 20 ? hash('sha256', 'm') : null,
                'db' => rand(1, 100) <= 15 ? hash('sha256', '19900101') : null,
                'ct' => $hasAddress ? hash('sha256', 'newyork') : null,
                'st' => $hasAddress ? hash('sha256', 'ny') : null,
                'zp' => $hasAddress ? hash('sha256', '10001') : null,
                'country' => $hasAddress ? hash('sha256', 'us') : null,
                'em_all' => $email ? [$email] : null,
                'ph_all' => $hasPhone ? [hash('sha256', '+1555' . str_pad((string) $i, 7, '0', STR_PAD_LEFT))] : null,
                'fbp' => 'fb.1.' . now()->subDays(rand(1, 90))->getTimestampMs() . '.' . rand(100000000, 999999999),
                'fbc' => rand(1, 100) <= 30 ? 'fb.1.' . now()->subDays(rand(1, 30))->getTimestampMs() . '.AbCdEfGh' : null,
                'visitor_id' => Str::uuid()->toString(),
                'pixel_id' => $pixel->pixel_id,
                'source_domain' => ['shop.example.com', 'blog.example.com', 'lp.example.com'][array_rand(['shop.example.com', 'blog.example.com', 'lp.example.com'])],
                'event_count' => rand(1, 120),
                'match_quality' => rand(15, 95),
                'first_seen_at' => now()->subDays(rand(7, 90)),
                'last_seen_at' => now()->subDays(rand(0, 14)),
            ]);
        }
    }

    private function seedMatchQualityLogs(array $pixels): void
    {
        $activePixels = array_filter($pixels, fn (Pixel $p) => $p->is_active);
        $eventNames = ['PageView', 'Purchase', 'Lead', 'AddToCart', 'ViewContent', 'CompleteRegistration'];
        $domains = ['shop.example.com', 'blog.example.com', 'lp.example.com'];

        for ($day = 30; $day >= 0; $day--) {
            $date = Carbon::today()->subDays($day);
            $logsPerDay = rand(20, 60);

            for ($i = 0; $i < $logsPerDay; $i++) {
                $pixel = $activePixels[array_rand($activePixels)];
                $score = rand(10, 100);
                $wasEnriched = rand(1, 100) <= 35;
                $scoreBefore = $wasEnriched ? max(5, $score - rand(5, 25)) : $score;

                MatchQualityLog::create([
                    'pixel_id' => $pixel->pixel_id,
                    'event_name' => $eventNames[array_rand($eventNames)],
                    'source_domain' => $domains[array_rand($domains)],
                    'score' => $score,
                    'has_em' => rand(1, 100) <= 70,
                    'has_ph' => rand(1, 100) <= 40,
                    'has_fn' => rand(1, 100) <= 50,
                    'has_ln' => rand(1, 100) <= 45,
                    'has_external_id' => rand(1, 100) <= 35,
                    'has_fbp' => rand(1, 100) <= 80,
                    'has_fbc' => rand(1, 100) <= 25,
                    'has_ip' => rand(1, 100) <= 95,
                    'has_ua' => rand(1, 100) <= 95,
                    'has_address' => rand(1, 100) <= 20,
                    'was_enriched' => $wasEnriched,
                    'score_before_enrichment' => $scoreBefore,
                    'enrichment_source' => $wasEnriched
                        ? ['profile', 'ip_geo', 'phone_prefix'][array_rand(['profile', 'ip_geo', 'phone_prefix'])]
                        : null,
                    'event_date' => $date,
                    'created_at' => $date->copy()->addMinutes(rand(0, 1439)),
                ]);
            }
        }
    }

    private function weightedRandomEvent(): MetaEventName
    {
        $weights = [
            MetaEventName::PageView->value => 40,
            MetaEventName::ViewContent->value => 20,
            MetaEventName::AddToCart->value => 12,
            MetaEventName::InitiateCheckout->value => 6,
            MetaEventName::Purchase->value => 8,
            MetaEventName::Lead->value => 5,
            MetaEventName::CompleteRegistration->value => 4,
            MetaEventName::Search->value => 3,
            MetaEventName::Custom->value => 2,
        ];

        $total = array_sum($weights);
        $rand = rand(1, $total);
        $cumulative = 0;

        foreach ($weights as $value => $weight) {
            $cumulative += $weight;
            if ($rand <= $cumulative) {
                return MetaEventName::from($value);
            }
        }

        return MetaEventName::PageView;
    }

    private function generateCustomData(MetaEventName $event): ?array
    {
        return match ($event) {
            MetaEventName::Purchase => [
                'value' => round(rand(999, 49999) / 100, 2),
                'currency' => 'USD',
                'content_ids' => ['SKU-' . rand(1000, 9999)],
                'num_items' => rand(1, 5),
            ],
            MetaEventName::AddToCart => [
                'value' => round(rand(499, 19999) / 100, 2),
                'currency' => 'USD',
                'content_ids' => ['SKU-' . rand(1000, 9999)],
            ],
            MetaEventName::ViewContent => [
                'content_name' => 'Product ' . rand(1, 100),
                'content_category' => ['Electronics', 'Clothing', 'Home', 'Sports'][array_rand(['Electronics', 'Clothing', 'Home', 'Sports'])],
            ],
            MetaEventName::Lead => [
                'content_name' => ['Newsletter', 'Contact Form', 'Demo Request', 'Free Trial'][array_rand(['Newsletter', 'Contact Form', 'Demo Request', 'Free Trial'])],
            ],
            MetaEventName::Search => [
                'search_string' => ['wireless headphones', 'running shoes', 'laptop stand', 'coffee maker'][array_rand(['wireless headphones', 'running shoes', 'laptop stand', 'coffee maker'])],
            ],
            default => null,
        };
    }

    private function randomError(): string
    {
        $errors = [
            'Meta API error: Invalid OAuth 2.0 Access Token',
            'Meta API error: (#100) Param events[0][event_time] must be within the last 7 days',
            'Meta API error: (#2200) Too many send requests for this ad account',
            'cURL error 28: Connection timed out after 30000 milliseconds',
            'Meta API error: (#803) Some of the aliases you requested do not exist',
        ];

        return $errors[array_rand($errors)];
    }
}
