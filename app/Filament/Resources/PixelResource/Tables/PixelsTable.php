<?php

declare(strict_types=1);

namespace App\Filament\Resources\PixelResource\Tables;

use App\Models\Pixel;
use Filament\Actions;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

class PixelsTable
{
    public static function configure(Table $table): Table
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
                    ->formatStateUsing(fn (string $state): string => empty($state) ? 'All' : implode(', ', json_decode($state, true)))
                    ->color(fn (string $state): string => empty($state) ? 'gray' : 'info')
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
            ->recordActions([
                Actions\ActionGroup::make([
                    Actions\EditAction::make(),
                    Actions\Action::make('toggle_active')
                        ->label(fn (Pixel $record): string => $record->is_active ? 'Deactivate' : 'Activate')
                        ->icon(fn (Pixel $record): string => $record->is_active ? 'heroicon-o-pause' : 'heroicon-o-play')
                        ->color(fn (Pixel $record): string => $record->is_active ? 'warning' : 'success')
                        ->requiresConfirmation()
                        ->action(fn (Pixel $record) => $record->update(['is_active' => ! $record->is_active])),

                    Actions\Action::make('clear_test_code')
                        ->label('Clear Test Code')
                        ->icon('heroicon-o-x-mark')
                        ->color('gray')
                        ->visible(fn (Pixel $record): bool => filled($record->test_event_code))
                        ->requiresConfirmation()
                        ->action(fn (Pixel $record) => $record->update(['test_event_code' => null])),

                    Actions\DeleteAction::make(),
                ]),
            ])
            ->toolbarActions([
                Actions\BulkActionGroup::make([
                    Actions\DeleteBulkAction::make(),

                    Actions\BulkAction::make('activate')
                        ->label('Activate Selected')
                        ->icon('heroicon-o-play')
                        ->color('success')
                        ->requiresConfirmation()
                        ->action(fn ($records) => $records->each->update(['is_active' => true])),

                    Actions\BulkAction::make('deactivate')
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
}
