<?php

declare(strict_types=1);

namespace App\Filament\Resources;

use App\Filament\Resources\MatchQualityLogResource\Pages;
use App\Filament\Resources\MatchQualityLogResource\Schemas\MatchQualityLogInfolist;
use App\Filament\Resources\MatchQualityLogResource\Tables\MatchQualityLogsTable;
use App\Models\MatchQualityLog;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Tables\Table;

class MatchQualityLogResource extends Resource
{
    protected static ?string $model = MatchQualityLog::class;

    protected static string | \BackedEnum | null $navigationIcon = 'heroicon-o-finger-print';

    protected static string | \UnitEnum | null $navigationGroup = 'Analytics';

    protected static ?int $navigationSort = 2;

    protected static ?string $navigationLabel = 'Match Quality';

    public static function canCreate(): bool
    {
        return false;
    }

    public static function table(Table $table): Table
    {
        return MatchQualityLogsTable::configure($table);
    }

    public static function infolist(Schema $schema): Schema
    {
        return MatchQualityLogInfolist::configure($schema);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListMatchQualityLogs::route('/'),
            'view' => Pages\ViewMatchQualityLog::route('/{record}'),
        ];
    }
}
