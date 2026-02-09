<?php

declare(strict_types=1);

namespace App\Filament\Resources\TrackedEventResource\Pages;

use App\Filament\Resources\TrackedEventResource;
use Filament\Resources\Pages\ListRecords;

class ListTrackedEvents extends ListRecords
{
    protected static string $resource = TrackedEventResource::class;

    protected function getHeaderActions(): array
    {
        return [];
    }
}
