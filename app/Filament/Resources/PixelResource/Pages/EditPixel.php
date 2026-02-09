<?php

declare(strict_types=1);

namespace App\Filament\Resources\PixelResource\Pages;

use App\Filament\Resources\PixelResource;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;

class EditPixel extends EditRecord
{
    protected static string $resource = PixelResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\ViewAction::make(),
            Actions\DeleteAction::make(),
        ];
    }

    protected function getRedirectUrl(): string
    {
        return $this->getResource()::getUrl('view', ['record' => $this->getRecord()]);
    }
}
