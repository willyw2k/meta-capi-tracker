<?php

declare(strict_types=1);

namespace App\Filament\Resources;

use App\Filament\Resources\PixelResource\Pages;
use App\Filament\Resources\PixelResource\RelationManagers;
use App\Filament\Resources\PixelResource\Schemas\PixelForm;
use App\Filament\Resources\PixelResource\Schemas\PixelInfolist;
use App\Filament\Resources\PixelResource\Tables\PixelsTable;
use App\Filament\Resources\PixelResource\Widgets\PixelStatsOverview;
use App\Models\Pixel;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Tables\Table;

class PixelResource extends Resource
{
    protected static ?string $model = Pixel::class;

    protected static string | \BackedEnum | null $navigationIcon = 'heroicon-o-signal';

    protected static string | \UnitEnum | null $navigationGroup = 'Tracking';

    protected static ?int $navigationSort = 1;

    protected static ?string $recordTitleAttribute = 'name';

    public static function getGloballySearchableAttributes(): array
    {
        return ['name', 'pixel_id'];
    }

    public static function form(Schema $schema): Schema
    {
        return PixelForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return PixelsTable::configure($table);
    }

    public static function infolist(Schema $schema): Schema
    {
        return PixelInfolist::configure($schema);
    }

    public static function getRelations(): array
    {
        return [
            RelationManagers\TrackedEventsRelationManager::class,
        ];
    }

    public static function getWidgets(): array
    {
        return [
            PixelStatsOverview::class,
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListPixels::route('/'),
            'create' => Pages\CreatePixel::route('/create'),
            'view' => Pages\ViewPixel::route('/{record}'),
            'edit' => Pages\EditPixel::route('/{record}/edit'),
        ];
    }
}
