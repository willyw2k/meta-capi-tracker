<?php

declare(strict_types=1);

namespace App\Filament\Widgets;

use App\Models\MatchQualityLog;
use Filament\Widgets\ChartWidget;
use Illuminate\Support\Carbon;

class MatchQualityChart extends ChartWidget
{
    protected ?string $heading = 'Match Quality Distribution';

    protected static ?int $sort = 3;

    protected int | string | array $columnSpan = [
        'md' => 1,
        'xl' => 1,
    ];

    public ?string $filter = '7d';

    protected function getFilters(): array
    {
        return [
            '7d' => 'Last 7 Days',
            '30d' => 'Last 30 Days',
            '90d' => 'Last 90 Days',
        ];
    }

    protected function getData(): array
    {
        $days = match ($this->filter) {
            '7d' => 7,
            '30d' => 30,
            '90d' => 90,
            default => 7,
        };

        $from = Carbon::now()->subDays($days);

        $tiers = [
            'Poor (0-20)' => [0, 20],
            'Fair (21-40)' => [21, 40],
            'Good (41-60)' => [41, 60],
            'Great (61-80)' => [61, 80],
            'Excellent (81+)' => [81, 100],
        ];

        $data = [];
        foreach ($tiers as $label => [$min, $max]) {
            $data[$label] = MatchQualityLog::where('event_date', '>=', $from)
                ->whereBetween('score', [$min, $max])
                ->count();
        }

        return [
            'datasets' => [
                [
                    'data' => array_values($data),
                    'backgroundColor' => [
                        '#ef4444', // Poor - red
                        '#f59e0b', // Fair - amber
                        '#3b82f6', // Good - blue
                        '#10b981', // Great - emerald
                        '#059669', // Excellent - green
                    ],
                ],
            ],
            'labels' => array_keys($data),
        ];
    }

    protected function getType(): string
    {
        return 'doughnut';
    }

    protected function getOptions(): array
    {
        return [
            'plugins' => [
                'legend' => [
                    'position' => 'bottom',
                    'labels' => [
                        'padding' => 16,
                    ],
                ],
            ],
        ];
    }
}
