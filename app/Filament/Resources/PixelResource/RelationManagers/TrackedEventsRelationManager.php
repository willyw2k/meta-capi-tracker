<?php

declare(strict_types=1);

namespace App\Filament\Resources\PixelResource\RelationManagers;

use App\Enums\EventStatus;
use App\Enums\MetaEventName;
use App\Jobs\SendMetaEventJob;
use App\Models\TrackedEvent;
use Filament\Forms;
use Filament\Schemas\Schema;
use Filament\Notifications\Notification;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

class TrackedEventsRelationManager extends RelationManager
{
    protected static string $relationship = 'trackedEvents';

    protected static ?string $title = 'Tracked Events';

    protected static string | \BackedEnum | null $icon = 'heroicon-o-bolt';

    public function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('event_id')
            ->columns([
                Tables\Columns\TextColumn::make('event_name')
                    ->label('Event')
                    ->badge()
                    ->formatStateUsing(fn (TrackedEvent $record): string => $record->event_name->label())
                    ->color(fn (TrackedEvent $record): string => match ($record->event_name) {
                        MetaEventName::Purchase => 'success',
                        MetaEventName::Lead, MetaEventName::CompleteRegistration => 'info',
                        MetaEventName::PageView => 'gray',
                        default => 'primary',
                    })
                    ->sortable(),

                Tables\Columns\TextColumn::make('event_id')
                    ->label('Event ID')
                    ->fontFamily('mono')
                    ->limit(16)
                    ->tooltip(fn (TrackedEvent $record): string => $record->event_id ?? '')
                    ->searchable()
                    ->toggleable(),

                Tables\Columns\TextColumn::make('event_source_url')
                    ->label('Source')
                    ->limit(35)
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
                    ->toggleable(isToggledHiddenByDefault: true),

                Tables\Columns\TextColumn::make('event_time')
                    ->label('Event Time')
                    ->dateTime('M j, H:i:s')
                    ->sortable(),

                Tables\Columns\TextColumn::make('created_at')
                    ->label('Received')
                    ->since()
                    ->sortable(),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('status')
                    ->options(EventStatus::class),

                Tables\Filters\SelectFilter::make('event_name')
                    ->options(MetaEventName::class)
                    ->label('Event Type'),

                Tables\Filters\Filter::make('low_match')
                    ->label('Low Match Quality (<40)')
                    ->query(fn (Builder $query): Builder => $query->where('match_quality', '<', 40)),

                Tables\Filters\Filter::make('created_at')
                    ->form([
                        Forms\Components\DatePicker::make('from')->label('From'),
                        Forms\Components\DatePicker::make('until')->label('Until'),
                    ])
                    ->query(function (Builder $query, array $data): Builder {
                        return $query
                            ->when($data['from'], fn (Builder $q, $date) => $q->whereDate('created_at', '>=', $date))
                            ->when($data['until'], fn (Builder $q, $date) => $q->whereDate('created_at', '<=', $date));
                    }),
            ])
            ->actions([
                Tables\Actions\ViewAction::make()
                    ->modalHeading(fn (TrackedEvent $record): string => "{$record->event_name->label()} — {$record->event_id}")
                    ->infolist([
                        \Filament\Infolists\Components\Section::make('Event Details')
                            ->schema([
                                \Filament\Infolists\Components\TextEntry::make('event_id')
                                    ->fontFamily('mono')
                                    ->copyable(),
                                \Filament\Infolists\Components\TextEntry::make('event_name')
                                    ->formatStateUsing(fn (TrackedEvent $record): string => $record->event_name->label()),
                                \Filament\Infolists\Components\TextEntry::make('action_source'),
                                \Filament\Infolists\Components\TextEntry::make('event_source_url')
                                    ->columnSpanFull()
                                    ->url(fn (TrackedEvent $record): string => $record->event_source_url, shouldOpenInNewTab: true),
                                \Filament\Infolists\Components\TextEntry::make('event_time')
                                    ->dateTime(),
                                \Filament\Infolists\Components\TextEntry::make('match_quality')
                                    ->suffix('/100'),
                            ])
                            ->columns(3),

                        \Filament\Infolists\Components\Section::make('Delivery Status')
                            ->schema([
                                \Filament\Infolists\Components\TextEntry::make('status')
                                    ->badge(),
                                \Filament\Infolists\Components\TextEntry::make('attempts'),
                                \Filament\Infolists\Components\TextEntry::make('sent_at')
                                    ->dateTime()
                                    ->placeholder('Not sent'),
                                \Filament\Infolists\Components\TextEntry::make('fbtrace_id')
                                    ->label('FB Trace ID')
                                    ->fontFamily('mono')
                                    ->placeholder('—'),
                                \Filament\Infolists\Components\TextEntry::make('error_message')
                                    ->placeholder('No errors')
                                    ->color('danger')
                                    ->columnSpanFull(),
                            ])
                            ->columns(4),

                        \Filament\Infolists\Components\Section::make('Custom Data')
                            ->schema([
                                \Filament\Infolists\Components\TextEntry::make('custom_data')
                                    ->formatStateUsing(fn (?array $state): string => $state
                                        ? json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
                                        : 'None')
                                    ->fontFamily('mono')
                                    ->columnSpanFull(),
                            ])
                            ->collapsible(),

                        \Filament\Infolists\Components\Section::make('Meta Response')
                            ->schema([
                                \Filament\Infolists\Components\TextEntry::make('meta_response')
                                    ->formatStateUsing(fn (?array $state): string => $state
                                        ? json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
                                        : 'No response')
                                    ->fontFamily('mono')
                                    ->columnSpanFull(),
                            ])
                            ->collapsible()
                            ->collapsed(),
                    ]),

                Tables\Actions\Action::make('retry')
                    ->label('Retry')
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
            ])
            ->bulkActions([
                Tables\Actions\BulkActionGroup::make([
                    Tables\Actions\BulkAction::make('retry_failed')
                        ->label('Retry Failed')
                        ->icon('heroicon-o-arrow-path')
                        ->color('warning')
                        ->requiresConfirmation()
                        ->action(function ($records): void {
                            $count = 0;
                            $records->each(function (TrackedEvent $record) use (&$count): void {
                                if ($record->status !== EventStatus::Failed) {
                                    return;
                                }

                                $record->update([
                                    'status' => EventStatus::Pending,
                                    'error_message' => null,
                                ]);

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
            ->poll('15s');
    }
}
