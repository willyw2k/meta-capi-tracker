<?php

declare(strict_types=1);

namespace App\Filament\Resources;

use App\Filament\Resources\UserProfileResource\Pages;
use App\Models\UserProfile;
use Filament\Infolists;
use Filament\Schemas\Schema;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

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
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('external_id')
                    ->label('External ID')
                    ->fontFamily('mono')
                    ->limit(16)
                    ->copyable()
                    ->searchable()
                    ->placeholder('—'),

                Tables\Columns\TextColumn::make('visitor_id')
                    ->label('Visitor ID')
                    ->fontFamily('mono')
                    ->limit(16)
                    ->copyable()
                    ->searchable()
                    ->placeholder('—'),

                Tables\Columns\IconColumn::make('has_email')
                    ->label('Email')
                    ->state(fn (UserProfile $record): bool => filled($record->em))
                    ->boolean()
                    ->trueIcon('heroicon-o-check')
                    ->falseIcon('heroicon-o-minus')
                    ->trueColor('success')
                    ->falseColor('gray'),

                Tables\Columns\IconColumn::make('has_phone')
                    ->label('Phone')
                    ->state(fn (UserProfile $record): bool => filled($record->ph))
                    ->boolean()
                    ->trueIcon('heroicon-o-check')
                    ->falseIcon('heroicon-o-minus')
                    ->trueColor('success')
                    ->falseColor('gray'),

                Tables\Columns\IconColumn::make('has_name')
                    ->label('Name')
                    ->state(fn (UserProfile $record): bool => filled($record->fn) || filled($record->ln))
                    ->boolean()
                    ->trueIcon('heroicon-o-check')
                    ->falseIcon('heroicon-o-minus')
                    ->trueColor('success')
                    ->falseColor('gray'),

                Tables\Columns\TextColumn::make('pii_fields_count')
                    ->label('PII Fields')
                    ->state(function (UserProfile $record): int {
                        $count = 0;
                        foreach (['em', 'ph', 'fn', 'ln', 'ge', 'db', 'ct', 'st', 'zp', 'country', 'external_id'] as $field) {
                            if (filled($record->{$field})) {
                                $count++;
                            }
                        }

                        return $count;
                    })
                    ->suffix('/11')
                    ->alignCenter()
                    ->color(fn (int $state): string => match (true) {
                        $state >= 6 => 'success',
                        $state >= 3 => 'warning',
                        default => 'danger',
                    }),

                Tables\Columns\TextColumn::make('match_quality')
                    ->label('Match')
                    ->suffix('/100')
                    ->alignCenter()
                    ->color(fn (int $state): string => match (true) {
                        $state >= 61 => 'success',
                        $state >= 41 => 'warning',
                        default => 'danger',
                    })
                    ->sortable(),

                Tables\Columns\TextColumn::make('event_count')
                    ->label('Events')
                    ->numeric()
                    ->sortable()
                    ->alignCenter(),

                Tables\Columns\TextColumn::make('pixel_id')
                    ->label('Pixel')
                    ->fontFamily('mono')
                    ->limit(10)
                    ->placeholder('Global')
                    ->toggleable(isToggledHiddenByDefault: true),

                Tables\Columns\TextColumn::make('source_domain')
                    ->label('Domain')
                    ->limit(25)
                    ->placeholder('—')
                    ->searchable()
                    ->toggleable(),

                Tables\Columns\TextColumn::make('first_seen_at')
                    ->label('First Seen')
                    ->dateTime('M j, Y')
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),

                Tables\Columns\TextColumn::make('last_seen_at')
                    ->label('Last Seen')
                    ->since()
                    ->sortable(),
            ])
            ->filters([
                Tables\Filters\Filter::make('has_email')
                    ->label('Has Email')
                    ->query(fn (Builder $query): Builder => $query->whereNotNull('em'))
                    ->toggle(),

                Tables\Filters\Filter::make('has_phone')
                    ->label('Has Phone')
                    ->query(fn (Builder $query): Builder => $query->whereNotNull('ph'))
                    ->toggle(),

                Tables\Filters\Filter::make('high_quality')
                    ->label('High Quality (60+)')
                    ->query(fn (Builder $query): Builder => $query->where('match_quality', '>=', 60))
                    ->toggle(),

                Tables\Filters\Filter::make('low_quality')
                    ->label('Low Quality (<40)')
                    ->query(fn (Builder $query): Builder => $query->where('match_quality', '<', 40))
                    ->toggle(),

                Tables\Filters\Filter::make('active_recently')
                    ->label('Active Last 7 Days')
                    ->query(fn (Builder $query): Builder => $query->where('last_seen_at', '>=', now()->subDays(7)))
                    ->toggle(),
            ])
            ->actions([
                Tables\Actions\ViewAction::make(),
                Tables\Actions\DeleteAction::make(),
            ])
            ->bulkActions([
                Tables\Actions\BulkActionGroup::make([
                    Tables\Actions\DeleteBulkAction::make(),
                ]),
            ])
            ->defaultSort('last_seen_at', 'desc')
            ->striped();
    }

    public static function infolist(Schema $schema): Schema
    {
        return $schema
            ->schema([
                Infolists\Components\Section::make('Identifiers')
                    ->icon('heroicon-o-finger-print')
                    ->schema([
                        Infolists\Components\TextEntry::make('external_id')
                            ->label('External ID')
                            ->fontFamily('mono')
                            ->copyable()
                            ->placeholder('Not set'),
                        Infolists\Components\TextEntry::make('visitor_id')
                            ->label('Visitor ID')
                            ->fontFamily('mono')
                            ->copyable()
                            ->placeholder('Not set'),
                        Infolists\Components\TextEntry::make('fbp')
                            ->label('Facebook Browser ID (fbp)')
                            ->fontFamily('mono')
                            ->copyable()
                            ->placeholder('Not set'),
                        Infolists\Components\TextEntry::make('fbc')
                            ->label('Facebook Click ID (fbc)')
                            ->fontFamily('mono')
                            ->copyable()
                            ->placeholder('Not set'),
                    ])
                    ->columns(2),

                Infolists\Components\Section::make('PII Fields (Hashed)')
                    ->icon('heroicon-o-shield-check')
                    ->description('All PII is stored as SHA-256 hashes. Values shown are truncated hashes.')
                    ->schema([
                        Infolists\Components\TextEntry::make('em')
                            ->label('Email Hash')
                            ->fontFamily('mono')
                            ->limit(24)
                            ->placeholder('—'),
                        Infolists\Components\TextEntry::make('ph')
                            ->label('Phone Hash')
                            ->fontFamily('mono')
                            ->limit(24)
                            ->placeholder('—'),
                        Infolists\Components\TextEntry::make('fn')
                            ->label('First Name Hash')
                            ->fontFamily('mono')
                            ->limit(24)
                            ->placeholder('—'),
                        Infolists\Components\TextEntry::make('ln')
                            ->label('Last Name Hash')
                            ->fontFamily('mono')
                            ->limit(24)
                            ->placeholder('—'),
                        Infolists\Components\TextEntry::make('ge')
                            ->label('Gender Hash')
                            ->fontFamily('mono')
                            ->limit(24)
                            ->placeholder('—'),
                        Infolists\Components\TextEntry::make('db')
                            ->label('Date of Birth Hash')
                            ->fontFamily('mono')
                            ->limit(24)
                            ->placeholder('—'),
                        Infolists\Components\TextEntry::make('ct')
                            ->label('City Hash')
                            ->fontFamily('mono')
                            ->limit(24)
                            ->placeholder('—'),
                        Infolists\Components\TextEntry::make('st')
                            ->label('State Hash')
                            ->fontFamily('mono')
                            ->limit(24)
                            ->placeholder('—'),
                        Infolists\Components\TextEntry::make('zp')
                            ->label('Zip Code Hash')
                            ->fontFamily('mono')
                            ->limit(24)
                            ->placeholder('—'),
                        Infolists\Components\TextEntry::make('country')
                            ->label('Country Hash')
                            ->fontFamily('mono')
                            ->limit(24)
                            ->placeholder('—'),
                    ])
                    ->columns(5),

                Infolists\Components\Section::make('Multi-Value PII')
                    ->icon('heroicon-o-rectangle-stack')
                    ->schema([
                        Infolists\Components\TextEntry::make('em_all')
                            ->label('All Email Hashes')
                            ->formatStateUsing(fn (?array $state): string => $state
                                ? implode("\n", array_map(fn (string $h) => substr($h, 0, 24) . '…', $state))
                                : 'None')
                            ->fontFamily('mono'),
                        Infolists\Components\TextEntry::make('ph_all')
                            ->label('All Phone Hashes')
                            ->formatStateUsing(fn (?array $state): string => $state
                                ? implode("\n", array_map(fn (string $h) => substr($h, 0, 24) . '…', $state))
                                : 'None')
                            ->fontFamily('mono'),
                    ])
                    ->columns(2)
                    ->collapsible()
                    ->collapsed(),

                Infolists\Components\Section::make('Profile Metadata')
                    ->icon('heroicon-o-information-circle')
                    ->schema([
                        Infolists\Components\TextEntry::make('pixel_id')
                            ->label('Pixel ID')
                            ->placeholder('Global'),
                        Infolists\Components\TextEntry::make('source_domain')
                            ->placeholder('Unknown'),
                        Infolists\Components\TextEntry::make('event_count')
                            ->label('Total Events'),
                        Infolists\Components\TextEntry::make('match_quality')
                            ->suffix('/100')
                            ->badge()
                            ->color(fn (int $state): string => match (true) {
                                $state >= 61 => 'success',
                                $state >= 41 => 'warning',
                                default => 'danger',
                            }),
                        Infolists\Components\TextEntry::make('first_seen_at')
                            ->dateTime(),
                        Infolists\Components\TextEntry::make('last_seen_at')
                            ->dateTime(),
                    ])
                    ->columns(3),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListUserProfiles::route('/'),
            'view' => Pages\ViewUserProfile::route('/{record}'),
        ];
    }
}
