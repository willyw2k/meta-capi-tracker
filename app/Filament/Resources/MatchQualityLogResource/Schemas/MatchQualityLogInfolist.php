<?php

declare(strict_types=1);

namespace App\Filament\Resources\MatchQualityLogResource\Schemas;

use Filament\Infolists;
use Filament\Schemas\Schema;

class MatchQualityLogInfolist
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Infolists\Components\Section::make('Event Info')
                    ->icon('heroicon-o-bolt')
                    ->schema([
                        Infolists\Components\TextEntry::make('event_name')
                            ->badge(),
                        Infolists\Components\TextEntry::make('pixel_id')
                            ->fontFamily('mono'),
                        Infolists\Components\TextEntry::make('source_domain')
                            ->placeholder('—'),
                        Infolists\Components\TextEntry::make('event_date')
                            ->date(),
                    ])
                    ->columns(4),

                Infolists\Components\Section::make('Match Quality Score')
                    ->icon('heroicon-o-finger-print')
                    ->schema([
                        Infolists\Components\TextEntry::make('score')
                            ->label('Final Score')
                            ->suffix('/100')
                            ->badge()
                            ->size(Infolists\Components\TextEntry\TextEntrySize::Large)
                            ->color(fn (int $state): string => match (true) {
                                $state >= 61 => 'success',
                                $state >= 41 => 'warning',
                                default => 'danger',
                            }),
                        Infolists\Components\TextEntry::make('score_before_enrichment')
                            ->label('Score Before Enrichment')
                            ->suffix('/100'),
                        Infolists\Components\IconEntry::make('was_enriched')
                            ->boolean(),
                        Infolists\Components\TextEntry::make('enrichment_source')
                            ->badge()
                            ->color('info')
                            ->placeholder('None'),
                    ])
                    ->columns(4),

                Infolists\Components\Section::make('PII Field Breakdown')
                    ->icon('heroicon-o-shield-check')
                    ->schema([
                        Infolists\Components\IconEntry::make('has_em')
                            ->label('Email')
                            ->boolean(),
                        Infolists\Components\IconEntry::make('has_ph')
                            ->label('Phone')
                            ->boolean(),
                        Infolists\Components\IconEntry::make('has_fn')
                            ->label('First Name')
                            ->boolean(),
                        Infolists\Components\IconEntry::make('has_ln')
                            ->label('Last Name')
                            ->boolean(),
                        Infolists\Components\IconEntry::make('has_external_id')
                            ->label('External ID')
                            ->boolean(),
                        Infolists\Components\IconEntry::make('has_fbp')
                            ->label('FBP Cookie')
                            ->boolean(),
                        Infolists\Components\IconEntry::make('has_fbc')
                            ->label('FBC Cookie')
                            ->boolean(),
                        Infolists\Components\IconEntry::make('has_ip')
                            ->label('IP Address')
                            ->boolean(),
                        Infolists\Components\IconEntry::make('has_ua')
                            ->label('User Agent')
                            ->boolean(),
                        Infolists\Components\IconEntry::make('has_address')
                            ->label('Address (ct/st/zp)')
                            ->boolean(),
                    ])
                    ->columns(5),
            ]);
    }
}
