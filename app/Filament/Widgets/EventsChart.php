<?php

declare(strict_types=1);

namespace App\Filament\Widgets;

use App\Enums\EventStatus;
use App\Models\TrackedEvent;
use Filament\Widgets\ChartWidget;
use Illuminate\Support\Carbon;

class EventsChart extends ChartWidget
{
    protected ?string $heading = 'Events Over Time';

    protected static ?int $sort = 2;

    protected int | string | array $columnSpan = 'full';

    public ?string $filter = '7d';

    protected function getFilters(): array
    {
        return [
            '24h' => 'Last 24 Hours',
            '7d' => 'Last 7 Days',
            '30d' => 'Last 30 Days',
            '90d' => 'Last 90 Days',
        ];
    }

    protected function getData(): array
    {
        [$labels, $from, $groupFormat, $labelFormat] = match ($this->filter) {
            '24h' => $this->buildHourlyRange(24),
            '7d' => $this->buildDailyRange(7),
            '30d' => $this->buildDailyRange(30),
            '90d' => $this->buildDailyRange(90),
            default => $this->buildDailyRange(7),
        };

        $sentQuery = TrackedEvent::where('created_at', '>=', $from)
            ->where('status', EventStatus::Sent)
            ->selectRaw("{$groupFormat} as period, COUNT(*) as total")
            ->groupBy('period')
            ->pluck('total', 'period');

        $failedQuery = TrackedEvent::where('created_at', '>=', $from)
            ->where('status', EventStatus::Failed)
            ->selectRaw("{$groupFormat} as period, COUNT(*) as total")
            ->groupBy('period')
            ->pluck('total', 'period');

        $pendingQuery = TrackedEvent::where('created_at', '>=', $from)
            ->whereIn('status', [EventStatus::Pending, EventStatus::Duplicate])
            ->selectRaw("{$groupFormat} as period, COUNT(*) as total")
            ->groupBy('period')
            ->pluck('total', 'period');

        $skippedQuery = TrackedEvent::where('created_at', '>=', $from)
            ->where('status', EventStatus::Skipped)
            ->selectRaw("{$groupFormat} as period, COUNT(*) as total")
            ->groupBy('period')
            ->pluck('total', 'period');

        $sentData = [];
        $failedData = [];
        $pendingData = [];
        $skippedData = [];
        $displayLabels = [];

        foreach ($labels as $key => $label) {
            $sentData[] = $sentQuery[$key] ?? 0;
            $failedData[] = $failedQuery[$key] ?? 0;
            $pendingData[] = $pendingQuery[$key] ?? 0;
            $skippedData[] = $skippedQuery[$key] ?? 0;
            $displayLabels[] = $label;
        }

        return [
            'datasets' => [
                [
                    'label' => 'Sent',
                    'data' => $sentData,
                    'borderColor' => '#10b981',
                    'backgroundColor' => 'rgba(16, 185, 129, 0.1)',
                    'fill' => true,
                ],
                [
                    'label' => 'Failed',
                    'data' => $failedData,
                    'borderColor' => '#ef4444',
                    'backgroundColor' => 'rgba(239, 68, 68, 0.1)',
                    'fill' => true,
                ],
                [
                    'label' => 'Pending / Deduped',
                    'data' => $pendingData,
                    'borderColor' => '#f59e0b',
                    'backgroundColor' => 'rgba(245, 158, 11, 0.1)',
                    'fill' => true,
                ],
                [
                    'label' => 'Skipped (Low Quality)',
                    'data' => $skippedData,
                    'borderColor' => '#6366f1',
                    'backgroundColor' => 'rgba(99, 102, 241, 0.1)',
                    'fill' => true,
                ],
            ],
            'labels' => $displayLabels,
        ];
    }

    protected function getType(): string
    {
        return 'line';
    }

    protected function getOptions(): array
    {
        return [
            'plugins' => [
                'legend' => [
                    'position' => 'top',
                ],
            ],
            'scales' => [
                'y' => [
                    'beginAtZero' => true,
                    'ticks' => [
                        'precision' => 0,
                    ],
                ],
            ],
            'elements' => [
                'line' => [
                    'tension' => 0.3,
                ],
            ],
        ];
    }

    /**
     * @return array{array<string, string>, Carbon, string, string}
     */
    private function buildHourlyRange(int $hours): array
    {
        $labels = [];
        $from = Carbon::now()->subHours($hours);

        for ($i = $hours; $i >= 0; $i--) {
            $dt = Carbon::now()->subHours($i);
            $key = $dt->format('Y-m-d H');
            $labels[$key] = $dt->format('H:00');
        }

        return [$labels, $from, "DATE_FORMAT(created_at, '%Y-%m-%d %H')", 'H:00'];
    }

    /**
     * @return array{array<string, string>, Carbon, string, string}
     */
    private function buildDailyRange(int $days): array
    {
        $labels = [];
        $from = Carbon::now()->subDays($days)->startOfDay();

        for ($i = $days; $i >= 0; $i--) {
            $dt = Carbon::now()->subDays($i);
            $key = $dt->format('Y-m-d');
            $labels[$key] = $dt->format('M j');
        }

        return [$labels, $from, "DATE(created_at)", 'M j'];
    }
}
