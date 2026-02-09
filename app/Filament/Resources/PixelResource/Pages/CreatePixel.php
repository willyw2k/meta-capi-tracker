<?php

declare(strict_types=1);

namespace App\Filament\Resources\PixelResource\Pages;

use App\Filament\Resources\PixelResource;
use Filament\Resources\Pages\CreateRecord;

class CreatePixel extends CreateRecord
{
    protected static string $resource = PixelResource::class;

    protected function getRedirectUrl(): string
    {
        return $this->getResource()::getUrl('index');
    }
}
