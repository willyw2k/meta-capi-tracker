<?php

declare(strict_types=1);

namespace App\Filament\Resources\PixelResource\Schemas;

use App\Enums\EventStatus;
use App\Models\Pixel;
use Filament\Infolists;
use Filament\Schemas;
use Filament\Schemas\Schema;

class PixelInfolist
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Schemas\Components\Section::make('Pixel Details')
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

                Schemas\Components\Section::make('Domains')
                    ->icon('heroicon-o-globe-alt')
                    ->schema([
                        Infolists\Components\TextEntry::make('domains')
                            ->badge()
                            ->separator(',')
                            ->placeholder('All domains accepted'),
                    ]),

                Schemas\Components\Section::make('Statistics')
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
}
