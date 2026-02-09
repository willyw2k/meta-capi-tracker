<?php

declare(strict_types=1);

namespace App\Filament\Resources\MatchQualityLogResource\Pages;

use App\Filament\Resources\MatchQualityLogResource;
use Filament\Resources\Pages\ListRecords;

class ListMatchQualityLogs extends ListRecords
{
    protected static string $resource = MatchQualityLogResource::class;
}
