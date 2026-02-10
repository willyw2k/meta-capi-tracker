<?php

declare(strict_types=1);

namespace App\Filament\Resources\UserProfileResource\Schemas;

use Filament\Infolists;
use Filament\Schemas;
use Filament\Schemas\Schema;

class UserProfileInfolist
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Schemas\Components\Section::make('Identifiers')
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

                Schemas\Components\Section::make('PII Fields (Hashed)')
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

                Schemas\Components\Section::make('Multi-Value PII')
                    ->icon('heroicon-o-rectangle-stack')
                    ->schema([
                        Infolists\Components\TextEntry::make('em_all')
                            ->label('All Email Hashes')
                            ->formatStateUsing(fn (mixed $state): string => is_array($state)
                                ? implode("\n", array_map(fn (string $h) => substr($h, 0, 24) . '…', $state))
                                : ($state !== null ? (string) $state : 'None'))
                            ->fontFamily('mono'),
                        Infolists\Components\TextEntry::make('ph_all')
                            ->label('All Phone Hashes')
                            ->formatStateUsing(fn (mixed $state): string => is_array($state)
                                ? implode("\n", array_map(fn (string $h) => substr($h, 0, 24) . '…', $state))
                                : ($state !== null ? (string) $state : 'None'))
                            ->fontFamily('mono'),
                    ])
                    ->columns(2)
                    ->collapsible()
                    ->collapsed(),

                Schemas\Components\Section::make('Profile Metadata')
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
}
