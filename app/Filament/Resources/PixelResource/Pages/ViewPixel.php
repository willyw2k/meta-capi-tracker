<?php

declare(strict_types=1);

namespace App\Filament\Resources\PixelResource\Pages;

use App\Filament\Resources\PixelResource;
use App\Filament\Resources\PixelResource\Widgets\PixelStatsOverview;
use Filament\Actions;
use Filament\Resources\Pages\ViewRecord;

class ViewPixel extends ViewRecord
{
    protected static string $resource = PixelResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\EditAction::make(),
        ];
    }

    protected function getHeaderWidgets(): array
    {
        return [
            PixelStatsOverview::class,
        ];
    }
}
