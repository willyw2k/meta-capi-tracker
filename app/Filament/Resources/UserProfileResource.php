<?php

declare(strict_types=1);

namespace App\Filament\Resources;

use App\Filament\Resources\UserProfileResource\Pages;
use App\Filament\Resources\UserProfileResource\Schemas\UserProfileInfolist;
use App\Filament\Resources\UserProfileResource\Tables\UserProfilesTable;
use App\Models\UserProfile;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Tables\Table;

class UserProfileResource extends Resource
{
    protected static ?string $model = UserProfile::class;

    protected static string | \BackedEnum | null $navigationIcon = 'heroicon-o-user-group';

    protected static string | \UnitEnum | null $navigationGroup = 'Analytics';

    protected static ?int $navigationSort = 1;

    protected static ?string $recordTitleAttribute = 'external_id';

    public static function canCreate(): bool
    {
        return false;
    }

    public static function table(Table $table): Table
    {
        return UserProfilesTable::configure($table);
    }

    public static function infolist(Schema $schema): Schema
    {
        return UserProfileInfolist::configure($schema);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListUserProfiles::route('/'),
            'view' => Pages\ViewUserProfile::route('/{record}'),
        ];
    }
}
