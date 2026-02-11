<?php

declare(strict_types=1);

namespace App\Filament\Widgets;

use App\Enums\EventStatus;
use App\Models\TrackedEvent;
use Filament\Tables;
use Filament\Tables\Table;
use Filament\Widgets\TableWidget as BaseWidget;

class RecentEventsTable extends BaseWidget
{
    protected static ?string $heading = 'Recent Events';

    protected static ?int $sort = 4;

    protected int | string | array $columnSpan = 'full';

    public function table(Table $table): Table
    {
        return $table
            ->query(
                TrackedEvent::query()
                    ->with('pixel')
                    ->latest()
            )
            ->columns([
                Tables\Columns\TextColumn::make('event_name')
                    ->label('Event')
                    ->badge()
                    ->color(fn (TrackedEvent $record): string => match ($record->event_name->value) {
                        'Purchase' => 'success',
                        'Lead', 'CompleteRegistration' => 'info',
                        'PageView' => 'gray',
                        default => 'primary',
                    })
                    ->formatStateUsing(fn (TrackedEvent $record): string => $record->event_name->label()),

                Tables\Columns\TextColumn::make('pixel.name')
                    ->label('Pixel')
                    ->limit(20),

                Tables\Columns\TextColumn::make('event_source_url')
                    ->label('Source URL')
                    ->limit(40)
                    ->tooltip(fn (TrackedEvent $record): string => $record->event_source_url)
                    ->toggleable(),

                Tables\Columns\TextColumn::make('match_quality')
                    ->label('Match')
                    ->suffix('/100')
                    ->color(fn (?int $state): string => match (true) {
                        $state === null => 'gray',
                        $state >= 61 => 'success',
                        $state >= 41 => 'warning',
                        default => 'danger',
                    })
                    ->alignCenter(),

                Tables\Columns\TextColumn::make('status')
                    ->badge()
                    ->color(fn (EventStatus $state): string => match ($state) {
                        EventStatus::Sent => 'success',
                        EventStatus::Pending => 'warning',
                        EventStatus::Failed => 'danger',
                        EventStatus::Duplicate => 'gray',
                        EventStatus::Skipped => 'info',
                    }),

                Tables\Columns\TextColumn::make('created_at')
                    ->label('Received')
                    ->since()
                    ->sortable(),
            ])
            ->defaultPaginationPageOption(10)
            ->defaultSort('created_at', 'desc');
    }
}
