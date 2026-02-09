<?php

declare(strict_types=1);

namespace App\Filament\Pages;

use Filament\Pages\Dashboard as BaseDashboard;

class Dashboard extends BaseDashboard
{
    protected static string | \BackedEnum | null $navigationIcon = 'heroicon-o-home';

    protected static ?string $title = 'Dashboard';

    public function getColumns(): int | array
    {
        return [
            'sm' => 1,
            'md' => 2,
            'xl' => 3,
        ];
    }
}
