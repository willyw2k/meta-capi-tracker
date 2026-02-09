<?php

declare(strict_types=1);

namespace App\Filament\Resources;

use App\Enums\EventStatus;
use App\Filament\Resources\PixelResource\Pages;
use App\Filament\Resources\PixelResource\RelationManagers;
use App\Filament\Resources\PixelResource\Widgets\PixelStatsOverview;
use App\Models\Pixel;
use Filament\Forms;
use Filament\Schemas\Schema;
use Filament\Infolists;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

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
        return $schema
            ->schema([
                Forms\Components\Section::make('Pixel Configuration')
                    ->description('Configure the Meta pixel and its access credentials.')
                    ->icon('heroicon-o-signal')
                    ->schema([
                        Forms\Components\TextInput::make('name')
                            ->required()
                            ->maxLength(255)
                            ->placeholder('e.g. Main Website Pixel')
                            ->columnSpan(1),

                        Forms\Components\TextInput::make('pixel_id')
                            ->label('Pixel ID')
                            ->required()
                            ->unique(ignoreRecord: true)
                            ->maxLength(50)
                            ->placeholder('e.g. 123456789012345')
                            ->helperText('Your Meta Pixel ID from Events Manager.')
                            ->columnSpan(1),

                        Forms\Components\Textarea::make('access_token')
                            ->label('Conversions API Access Token')
                            ->required()
                            ->rows(3)
                            ->placeholder('EAABsbCS1Ihn...')
                            ->helperText('System user token with ads_management permission. Stored encrypted.')
                            ->columnSpanFull(),

                        Forms\Components\TextInput::make('test_event_code')
                            ->label('Test Event Code')
                            ->maxLength(50)
                            ->placeholder('TEST12345')
                            ->helperText('Optional. Used to send events to Meta\'s Test Events tab for validation.')
                            ->columnSpan(1),

                        Forms\Components\Toggle::make('is_active')
                            ->label('Active')
                            ->default(true)
                            ->helperText('Inactive pixels will not receive events.')
                            ->columnSpan(1),
                    ])
                    ->columns(2),

                Forms\Components\Section::make('Domain Configuration')
                    ->description('Specify which domains this pixel should track. Leave empty to accept all domains.')
                    ->icon('heroicon-o-globe-alt')
                    ->schema([
                        Forms\Components\TagsInput::make('domains')
                            ->placeholder('Add domain...')
                            ->helperText('Supports exact match (shop.example.com), wildcards (*.example.com), and catch-all (*). Leave empty for all domains.')
                            ->columnSpanFull(),
                    ])
                    ->collapsible(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('name')
                    ->searchable()
                    ->sortable()
                    ->weight('bold'),

                Tables\Columns\TextColumn::make('pixel_id')
                    ->label('Pixel ID')
                    ->searchable()
                    ->copyable()
                    ->copyMessage('Pixel ID copied')
                    ->fontFamily('mono'),

                Tables\Columns\IconColumn::make('is_active')
                    ->label('Active')
                    ->boolean()
                    ->trueIcon('heroicon-o-check-circle')
                    ->falseIcon('heroicon-o-x-circle')
                    ->trueColor('success')
                    ->falseColor('danger'),

                Tables\Columns\TextColumn::make('domains')
                    ->label('Domains')
                    ->badge()
                    ->formatStateUsing(fn (?array $state): string => empty($state) ? 'All' : implode(', ', $state))
                    ->color(fn (?array $state): string => empty($state) ? 'gray' : 'info')
                    ->limit(30),

                Tables\Columns\TextColumn::make('tracked_events_count')
                    ->label('Events')
                    ->counts('trackedEvents')
                    ->sortable()
                    ->numeric()
                    ->alignCenter(),

                Tables\Columns\TextColumn::make('test_event_code')
                    ->label('Test Code')
                    ->badge()
                    ->color('warning')
                    ->placeholder('—')
                    ->toggleable(isToggledHiddenByDefault: true),

                Tables\Columns\TextColumn::make('created_at')
                    ->dateTime('M j, Y')
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                Tables\Filters\TernaryFilter::make('is_active')
                    ->label('Status')
                    ->placeholder('All')
                    ->trueLabel('Active')
                    ->falseLabel('Inactive'),

                Tables\Filters\Filter::make('has_test_code')
                    ->label('Has Test Code')
                    ->query(fn (Builder $query): Builder => $query->whereNotNull('test_event_code')),
            ])
            ->actions([
                Tables\Actions\ActionGroup::make([
                    Tables\Actions\ViewAction::make(),
                    Tables\Actions\EditAction::make(),

                    Tables\Actions\Action::make('toggle_active')
                        ->label(fn (Pixel $record): string => $record->is_active ? 'Deactivate' : 'Activate')
                        ->icon(fn (Pixel $record): string => $record->is_active ? 'heroicon-o-pause' : 'heroicon-o-play')
                        ->color(fn (Pixel $record): string => $record->is_active ? 'warning' : 'success')
                        ->requiresConfirmation()
                        ->action(fn (Pixel $record) => $record->update(['is_active' => ! $record->is_active])),

                    Tables\Actions\Action::make('clear_test_code')
                        ->label('Clear Test Code')
                        ->icon('heroicon-o-x-mark')
                        ->color('gray')
                        ->visible(fn (Pixel $record): bool => filled($record->test_event_code))
                        ->requiresConfirmation()
                        ->action(fn (Pixel $record) => $record->update(['test_event_code' => null])),

                    Tables\Actions\DeleteAction::make(),
                ]),
            ])
            ->bulkActions([
                Tables\Actions\BulkActionGroup::make([
                    Tables\Actions\DeleteBulkAction::make(),

                    Tables\Actions\BulkAction::make('activate')
                        ->label('Activate Selected')
                        ->icon('heroicon-o-play')
                        ->color('success')
                        ->requiresConfirmation()
                        ->action(fn ($records) => $records->each->update(['is_active' => true])),

                    Tables\Actions\BulkAction::make('deactivate')
                        ->label('Deactivate Selected')
                        ->icon('heroicon-o-pause')
                        ->color('warning')
                        ->requiresConfirmation()
                        ->action(fn ($records) => $records->each->update(['is_active' => false])),
                ]),
            ])
            ->defaultSort('created_at', 'desc')
            ->striped();
    }

    public static function infolist(Schema $schema): Schema
    {
        return $schema
            ->schema([
                Infolists\Components\Section::make('Pixel Details')
                    ->icon('heroicon-o-signal')
                    ->schema([
                        Infolists\Components\TextEntry::make('name'),
                        Infolists\Components\TextEntry::make('pixel_id')
                            ->label('Pixel ID')
                            ->fontFamily('mono')
                            ->copyable(),
                        Infolists\Components\IconEntry::make('is_active')
                            ->label('Active')
                            ->boolean(),
                        Infolists\Components\TextEntry::make('test_event_code')
                            ->label('Test Event Code')
                            ->badge()
                            ->color('warning')
                            ->placeholder('Not set'),
                    ])
                    ->columns(2),

                Infolists\Components\Section::make('Domains')
                    ->icon('heroicon-o-globe-alt')
                    ->schema([
                        Infolists\Components\TextEntry::make('domains')
                            ->badge()
                            ->separator(',')
                            ->placeholder('All domains accepted'),
                    ]),

                Infolists\Components\Section::make('Statistics')
                    ->icon('heroicon-o-chart-bar')
                    ->schema([
                        Infolists\Components\TextEntry::make('tracked_events_count')
                            ->label('Total Events')
                            ->state(fn (Pixel $record): int => $record->trackedEvents()->count()),
                        Infolists\Components\TextEntry::make('sent_events_count')
                            ->label('Sent Events')
                            ->state(fn (Pixel $record): int => $record->trackedEvents()->where('status', EventStatus::Sent)->count()),
                        Infolists\Components\TextEntry::make('failed_events_count')
                            ->label('Failed Events')
                            ->state(fn (Pixel $record): int => $record->trackedEvents()->where('status', EventStatus::Failed)->count())
                            ->color(fn (int $state): string => $state > 0 ? 'danger' : 'success'),
                        Infolists\Components\TextEntry::make('created_at')
                            ->dateTime(),
                    ])
                    ->columns(4),
            ]);
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
