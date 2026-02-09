<?php

declare(strict_types=1);

namespace App\Filament\Resources\PixelResource\Pages;

use App\Filament\Resources\PixelResource;
use Filament\Actions;
use Filament\Resources\Pages\ListRecords;

class ListPixels extends ListRecords
{
    protected static string $resource = PixelResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\CreateAction::make(),
        ];
    }
}
