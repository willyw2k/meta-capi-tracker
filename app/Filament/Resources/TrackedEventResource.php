<?php

declare(strict_types=1);

namespace App\Filament\Resources;

use App\Enums\EventStatus;
use App\Filament\Resources\TrackedEventResource\Pages;
use App\Filament\Resources\TrackedEventResource\Schemas\TrackedEventInfolist;
use App\Filament\Resources\TrackedEventResource\Tables\TrackedEventsTable;
use App\Models\TrackedEvent;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Tables\Table;

class TrackedEventResource extends Resource
{
    protected static ?string $model = TrackedEvent::class;

    protected static string | \BackedEnum | null $navigationIcon = 'heroicon-o-bolt';

    protected static string | \UnitEnum | null $navigationGroup = 'Tracking';

    protected static ?int $navigationSort = 2;

    protected static ?string $recordTitleAttribute = 'event_id';

    public static function getNavigationBadge(): ?string
    {
        $failed = static::getModel()::where('status', EventStatus::Failed)->count();

        return $failed > 0 ? (string) $failed : null;
    }

    public static function getNavigationBadgeColor(): string | array | null
    {
        return 'danger';
    }

    public static function getNavigationBadgeTooltip(): ?string
    {
        return 'Failed events';
    }

    public static function canCreate(): bool
    {
        return false;
    }

    public static function table(Table $table): Table
    {
        return TrackedEventsTable::configure($table);
    }

    public static function infolist(Schema $schema): Schema
    {
        return TrackedEventInfolist::configure($schema);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListTrackedEvents::route('/'),
            'view' => Pages\ViewTrackedEvent::route('/{record}'),
        ];
    }
}
