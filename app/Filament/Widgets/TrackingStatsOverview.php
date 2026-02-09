<?php

declare(strict_types=1);

namespace App\Filament\Widgets;

use App\Enums\EventStatus;
use App\Models\MatchQualityLog;
use App\Models\Pixel;
use App\Models\TrackedEvent;
use App\Models\UserProfile;
use Filament\Widgets\StatsOverviewWidget as BaseWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;
use Illuminate\Support\Carbon;

class TrackingStatsOverview extends BaseWidget
{
    protected static ?int $sort = 1;

    protected ?string $pollingInterval = '30s';

    protected function getStats(): array
    {
        $today = Carbon::today();
        $last7 = Carbon::now()->subDays(7);
        $prev7 = Carbon::now()->subDays(14);

        // Events today
        $eventsToday = TrackedEvent::whereDate('created_at', $today)->count();
        $eventsYesterday = TrackedEvent::whereDate('created_at', $today->copy()->subDay())->count();
        $eventsTrend = $eventsYesterday > 0
            ? round((($eventsToday - $eventsYesterday) / $eventsYesterday) * 100)
            : 0;

        // Events last 7 days sparkline
        $eventsSparkline = collect(range(6, 0))->map(
            fn (int $i) => TrackedEvent::whereDate('created_at', $today->copy()->subDays($i))->count()
        )->toArray();

        // Sent rate
        $totalLast7 = TrackedEvent::where('created_at', '>=', $last7)->count();
        $sentLast7 = TrackedEvent::where('created_at', '>=', $last7)
            ->where('status', EventStatus::Sent)
            ->count();
        $sentRate = $totalLast7 > 0 ? round(($sentLast7 / $totalLast7) * 100, 1) : 0;

        // Failed events
        $failedCount = TrackedEvent::where('status', EventStatus::Failed)->count();
        $pendingCount = TrackedEvent::where('status', EventStatus::Pending)->count();

        // Match quality avg
        $avgMatchQuality = MatchQualityLog::where('event_date', '>=', $last7)
            ->avg('score');
        $prevAvgMatch = MatchQualityLog::whereBetween('event_date', [$prev7, $last7])
            ->avg('score');
        $matchTrend = ($prevAvgMatch && $prevAvgMatch > 0)
            ? round($avgMatchQuality - $prevAvgMatch, 1)
            : 0;

        // Match sparkline
        $matchSparkline = collect(range(6, 0))->map(
            fn (int $i) => (int) round(
                MatchQualityLog::whereDate('event_date', $today->copy()->subDays($i))->avg('score') ?? 0
            )
        )->toArray();

        // Active pixels & profiles
        $activePixels = Pixel::active()->count();
        $totalProfiles = UserProfile::count();

        // Enrichment rate
        $enrichedPct = MatchQualityLog::where('event_date', '>=', $last7)->count() > 0
            ? round(
                (MatchQualityLog::where('event_date', '>=', $last7)->where('was_enriched', true)->count()
                    / MatchQualityLog::where('event_date', '>=', $last7)->count()) * 100,
                1
            )
            : 0;

        return [
            Stat::make('Events Today', number_format($eventsToday))
                ->description($eventsTrend >= 0 ? "+{$eventsTrend}% vs yesterday" : "{$eventsTrend}% vs yesterday")
                ->descriptionIcon($eventsTrend >= 0 ? 'heroicon-m-arrow-trending-up' : 'heroicon-m-arrow-trending-down')
                ->color($eventsTrend >= 0 ? 'success' : 'danger')
                ->chart($eventsSparkline)
                ->chartColor('primary'),

            Stat::make('Delivery Rate', "{$sentRate}%")
                ->description("{$sentLast7} sent / {$totalLast7} total (7d)")
                ->descriptionIcon('heroicon-o-paper-airplane')
                ->color($sentRate >= 95 ? 'success' : ($sentRate >= 80 ? 'warning' : 'danger')),

            Stat::make('Avg Match Quality', round($avgMatchQuality ?? 0) . '/100')
                ->description($matchTrend >= 0 ? "+{$matchTrend} pts vs prev 7d" : "{$matchTrend} pts vs prev 7d")
                ->descriptionIcon($matchTrend >= 0 ? 'heroicon-m-arrow-trending-up' : 'heroicon-m-arrow-trending-down')
                ->color(match (true) {
                    ($avgMatchQuality ?? 0) >= 61 => 'success',
                    ($avgMatchQuality ?? 0) >= 41 => 'warning',
                    default => 'danger',
                })
                ->chart($matchSparkline)
                ->chartColor('success'),

            Stat::make('Active Pixels', (string) $activePixels)
                ->description("{$totalProfiles} user profiles")
                ->descriptionIcon('heroicon-o-signal')
                ->color('primary'),

            Stat::make('Failed / Pending', "{$failedCount} / {$pendingCount}")
                ->description($failedCount > 0 ? 'Attention needed' : 'All clear')
                ->descriptionIcon($failedCount > 0 ? 'heroicon-o-exclamation-triangle' : 'heroicon-o-check-circle')
                ->color($failedCount > 0 ? 'danger' : 'success'),

            Stat::make('Enrichment Rate', "{$enrichedPct}%")
                ->description('Events enriched from profiles (7d)')
                ->descriptionIcon('heroicon-o-sparkles')
                ->color($enrichedPct >= 30 ? 'success' : ($enrichedPct >= 10 ? 'warning' : 'info')),
        ];
    }
}
