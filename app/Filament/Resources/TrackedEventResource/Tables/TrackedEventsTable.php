<?php

declare(strict_types=1);

namespace App\Filament\Resources\TrackedEventResource\Tables;

use App\Enums\EventStatus;
use App\Enums\MetaEventName;
use App\Jobs\SendMetaEventJob;
use App\Models\TrackedEvent;
use Filament\Forms;
use Filament\Notifications\Notification;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

class TrackedEventsTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('event_name')
                    ->label('Event')
                    ->badge()
                    ->formatStateUsing(fn (TrackedEvent $record): string => $record->event_name->label())
                    ->color(fn (TrackedEvent $record): string => match ($record->event_name) {
                        MetaEventName::Purchase => 'success',
                        MetaEventName::Lead, MetaEventName::CompleteRegistration => 'info',
                        MetaEventName::PageView => 'gray',
                        MetaEventName::Custom => 'purple',
                        default => 'primary',
                    })
                    ->sortable()
                    ->searchable(),

                Tables\Columns\TextColumn::make('custom_event_name')
                    ->label('Custom Name')
                    ->placeholder('—')
                    ->toggleable(isToggledHiddenByDefault: true),

                Tables\Columns\TextColumn::make('pixel.name')
                    ->label('Pixel')
                    ->sortable()
                    ->searchable(),

                Tables\Columns\TextColumn::make('event_id')
                    ->label('Event ID')
                    ->fontFamily('mono')
                    ->limit(18)
                    ->copyable()
                    ->copyMessage('Event ID copied')
                    ->searchable()
                    ->toggleable(),

                Tables\Columns\TextColumn::make('event_source_url')
                    ->label('Source URL')
                    ->limit(40)
                    ->tooltip(fn (TrackedEvent $record): string => $record->event_source_url)
                    ->searchable(),

                Tables\Columns\TextColumn::make('match_quality')
                    ->label('Match')
                    ->suffix('/100')
                    ->alignCenter()
                    ->color(fn (?int $state): string => match (true) {
                        $state === null => 'gray',
                        $state >= 61 => 'success',
                        $state >= 41 => 'warning',
                        default => 'danger',
                    })
                    ->sortable(),

                Tables\Columns\TextColumn::make('status')
                    ->badge()
                    ->color(fn (EventStatus $state): string => match ($state) {
                        EventStatus::Sent => 'success',
                        EventStatus::Pending => 'warning',
                        EventStatus::Failed => 'danger',
                        EventStatus::Duplicate => 'gray',
                    })
                    ->sortable(),

                Tables\Columns\TextColumn::make('attempts')
                    ->alignCenter()
                    ->toggleable(isToggledHiddenByDefault: true),

                Tables\Columns\TextColumn::make('fbtrace_id')
                    ->label('FB Trace')
                    ->fontFamily('mono')
                    ->limit(12)
                    ->copyable()
                    ->toggleable(isToggledHiddenByDefault: true),

                Tables\Columns\TextColumn::make('sent_at')
                    ->label('Sent At')
                    ->dateTime('M j, H:i:s')
                    ->placeholder('—')
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),

                Tables\Columns\TextColumn::make('event_time')
                    ->label('Event Time')
                    ->dateTime('M j, H:i:s')
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),

                Tables\Columns\TextColumn::make('created_at')
                    ->label('Received')
                    ->since()
                    ->sortable(),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('status')
                    ->options(EventStatus::class)
                    ->multiple()
                    ->preloaded(),

                Tables\Filters\SelectFilter::make('event_name')
                    ->options(MetaEventName::class)
                    ->label('Event Type')
                    ->multiple()
                    ->preloaded(),

                Tables\Filters\SelectFilter::make('pixel')
                    ->relationship('pixel', 'name')
                    ->preloaded()
                    ->searchable(),

                Tables\Filters\Filter::make('low_match')
                    ->label('Low Match Quality (<40)')
                    ->query(fn (Builder $query): Builder => $query->where('match_quality', '<', 40))
                    ->toggle(),

                Tables\Filters\Filter::make('has_errors')
                    ->label('Has Errors')
                    ->query(fn (Builder $query): Builder => $query->whereNotNull('error_message'))
                    ->toggle(),

                Tables\Filters\Filter::make('date_range')
                    ->form([
                        Forms\Components\DatePicker::make('from')->label('From'),
                        Forms\Components\DatePicker::make('until')->label('Until'),
                    ])
                    ->query(function (Builder $query, array $data): Builder {
                        return $query
                            ->when($data['from'], fn (Builder $q, $date) => $q->whereDate('created_at', '>=', $date))
                            ->when($data['until'], fn (Builder $q, $date) => $q->whereDate('created_at', '<=', $date));
                    })
                    ->indicateUsing(function (array $data): array {
                        $indicators = [];
                        if ($data['from'] ?? null) {
                            $indicators['from'] = 'From ' . $data['from'];
                        }
                        if ($data['until'] ?? null) {
                            $indicators['until'] = 'Until ' . $data['until'];
                        }

                        return $indicators;
                    }),
            ])
            ->filtersLayout(Tables\Enums\FiltersLayout::AboveContentCollapsible)
            ->actions([
                Tables\Actions\ViewAction::make(),

                Tables\Actions\Action::make('retry')
                    ->icon('heroicon-o-arrow-path')
                    ->color('warning')
                    ->visible(fn (TrackedEvent $record): bool => $record->status === EventStatus::Failed)
                    ->requiresConfirmation()
                    ->action(function (TrackedEvent $record): void {
                        $record->update([
                            'status' => EventStatus::Pending,
                            'error_message' => null,
                        ]);

                        SendMetaEventJob::dispatch($record->id);

                        Notification::make()
                            ->title('Event queued for retry')
                            ->success()
                            ->send();
                    }),

                Tables\Actions\DeleteAction::make(),
            ])
            ->bulkActions([
                Tables\Actions\BulkActionGroup::make([
                    Tables\Actions\BulkAction::make('retry_failed')
                        ->label('Retry Failed')
                        ->icon('heroicon-o-arrow-path')
                        ->color('warning')
                        ->requiresConfirmation()
                        ->deselectRecordsAfterCompletion()
                        ->action(function ($records): void {
                            $count = 0;
                            $records->each(function (TrackedEvent $record) use (&$count): void {
                                if ($record->status !== EventStatus::Failed) {
                                    return;
                                }

                                $record->update(['status' => EventStatus::Pending, 'error_message' => null]);
                                SendMetaEventJob::dispatch($record->id);
                                $count++;
                            });

                            Notification::make()
                                ->title("{$count} events queued for retry")
                                ->success()
                                ->send();
                        }),

                    Tables\Actions\DeleteBulkAction::make(),
                ]),
            ])
            ->defaultSort('created_at', 'desc')
            ->poll('15s')
            ->striped();
    }
}
