<?php

declare(strict_types=1);

namespace App\Filament\Pages;

use Filament\Pages\Page;

class IntegrationGuide extends Page
{
    protected static string | \BackedEnum | null $navigationIcon = 'heroicon-o-book-open';

    protected static string | \UnitEnum | null $navigationGroup = 'Settings';

    protected static ?int $navigationSort = 11;

    protected static ?string $title = 'Integration Guide';

    protected string $view = 'filament.pages.integration-guide';
}
