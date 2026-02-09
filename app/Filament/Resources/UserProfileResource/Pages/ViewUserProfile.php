<?php

declare(strict_types=1);

namespace App\Filament\Resources\UserProfileResource\Pages;

use App\Filament\Resources\UserProfileResource;
use Filament\Actions;
use Filament\Resources\Pages\ViewRecord;

class ViewUserProfile extends ViewRecord
{
    protected static string $resource = UserProfileResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\DeleteAction::make(),
        ];
    }
}
