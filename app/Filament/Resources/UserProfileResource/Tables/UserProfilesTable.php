<?php

declare(strict_types=1);

namespace App\Filament\Resources\UserProfileResource\Tables;

use App\Models\UserProfile;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

class UserProfilesTable
{
    public static function configure(Table $table): Table
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
}
