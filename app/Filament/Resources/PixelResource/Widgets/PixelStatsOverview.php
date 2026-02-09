<?php

declare(strict_types=1);

namespace App\Filament\Resources\PixelResource\Widgets;

use App\Enums\EventStatus;
use App\Models\MatchQualityLog;
use App\Models\Pixel;
use Filament\Widgets\StatsOverviewWidget as BaseWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

class PixelStatsOverview extends BaseWidget
{
    public ?Model $record = null;

    protected function getStats(): array
    {
        /** @var Pixel $pixel */
        $pixel = $this->record;
        $last7 = Carbon::now()->subDays(7);

        $totalEvents = $pixel->trackedEvents()->count();
        $sentEvents = $pixel->trackedEvents()->where('status', EventStatus::Sent)->count();
        $failedEvents = $pixel->trackedEvents()->where('status', EventStatus::Failed)->count();
        $pendingEvents = $pixel->trackedEvents()->where('status', EventStatus::Pending)->count();

        $deliveryRate = $totalEvents > 0
            ? round(($sentEvents / $totalEvents) * 100, 1)
            : 0;

        $avgMatch = MatchQualityLog::where('pixel_id', $pixel->pixel_id)
            ->where('event_date', '>=', $last7)
            ->avg('score');

        $eventsToday = $pixel->trackedEvents()->whereDate('created_at', Carbon::today())->count();

        // Sparkline for last 7 days
        $sparkline = collect(range(6, 0))->map(
            fn (int $i) => $pixel->trackedEvents()
                ->whereDate('created_at', Carbon::today()->subDays($i))
                ->count()
        )->toArray();

        return [
            Stat::make('Total Events', number_format($totalEvents))
                ->description("{$eventsToday} today")
                ->descriptionIcon('heroicon-o-bolt')
                ->chart($sparkline)
                ->chartColor('primary'),

            Stat::make('Delivery Rate', "{$deliveryRate}%")
                ->description("{$sentEvents} sent / {$failedEvents} failed / {$pendingEvents} pending")
                ->descriptionIcon('heroicon-o-paper-airplane')
                ->color($deliveryRate >= 95 ? 'success' : ($deliveryRate >= 80 ? 'warning' : 'danger')),

            Stat::make('Avg Match Quality', round($avgMatch ?? 0) . '/100')
                ->description('Last 7 days')
                ->descriptionIcon('heroicon-o-finger-print')
                ->color(match (true) {
                    ($avgMatch ?? 0) >= 61 => 'success',
                    ($avgMatch ?? 0) >= 41 => 'warning',
                    default => 'danger',
                }),
        ];
    }
}
