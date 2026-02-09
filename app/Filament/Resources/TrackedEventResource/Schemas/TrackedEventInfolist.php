<?php

declare(strict_types=1);

namespace App\Filament\Resources\TrackedEventResource\Schemas;

use App\Enums\EventStatus;
use App\Models\TrackedEvent;
use Filament\Infolists;
use Filament\Schemas\Schema;

class TrackedEventInfolist
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Infolists\Components\Section::make('Event Details')
                    ->icon('heroicon-o-bolt')
                    ->schema([
                        Infolists\Components\TextEntry::make('event_id')
                            ->label('Event ID')
                            ->fontFamily('mono')
                            ->copyable(),
                        Infolists\Components\TextEntry::make('event_name')
                            ->label('Event Type')
                            ->formatStateUsing(fn (TrackedEvent $record): string => $record->event_name->label())
                            ->badge(),
                        Infolists\Components\TextEntry::make('custom_event_name')
                            ->placeholder('—'),
                        Infolists\Components\TextEntry::make('pixel.name')
                            ->label('Pixel'),
                        Infolists\Components\TextEntry::make('action_source'),
                        Infolists\Components\TextEntry::make('event_source_url')
                            ->label('Source URL')
                            ->url(fn (TrackedEvent $record): string => $record->event_source_url, shouldOpenInNewTab: true)
                            ->columnSpanFull(),
                        Infolists\Components\TextEntry::make('event_time')
                            ->dateTime(),
                        Infolists\Components\TextEntry::make('match_quality')
                            ->suffix('/100')
                            ->badge()
                            ->color(fn (?int $state): string => match (true) {
                                $state === null => 'gray',
                                $state >= 61 => 'success',
                                $state >= 41 => 'warning',
                                default => 'danger',
                            }),
                    ])
                    ->columns(4),

                Infolists\Components\Section::make('Delivery Status')
                    ->icon('heroicon-o-paper-airplane')
                    ->schema([
                        Infolists\Components\TextEntry::make('status')
                            ->badge()
                            ->color(fn (EventStatus $state): string => match ($state) {
                                EventStatus::Sent => 'success',
                                EventStatus::Pending => 'warning',
                                EventStatus::Failed => 'danger',
                                EventStatus::Duplicate => 'gray',
                            }),
                        Infolists\Components\TextEntry::make('attempts'),
                        Infolists\Components\TextEntry::make('sent_at')
                            ->dateTime()
                            ->placeholder('Not yet sent'),
                        Infolists\Components\TextEntry::make('fbtrace_id')
                            ->label('FB Trace ID')
                            ->fontFamily('mono')
                            ->copyable()
                            ->placeholder('—'),
                        Infolists\Components\TextEntry::make('error_message')
                            ->color('danger')
                            ->placeholder('No errors')
                            ->columnSpanFull(),
                    ])
                    ->columns(4),

                Infolists\Components\Section::make('Custom Data')
                    ->icon('heroicon-o-code-bracket')
                    ->schema([
                        Infolists\Components\TextEntry::make('custom_data')
                            ->formatStateUsing(fn (?array $state): string => $state
                                ? json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
                                : 'None')
                            ->fontFamily('mono')
                            ->columnSpanFull(),
                    ])
                    ->collapsible(),

                Infolists\Components\Section::make('Meta API Response')
                    ->icon('heroicon-o-server')
                    ->schema([
                        Infolists\Components\TextEntry::make('meta_response')
                            ->formatStateUsing(fn (?array $state): string => $state
                                ? json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
                                : 'No response yet')
                            ->fontFamily('mono')
                            ->columnSpanFull(),
                    ])
                    ->collapsible()
                    ->collapsed(),
            ]);
    }
}
