<?php

declare(strict_types=1);

namespace App\Filament\Resources;

use App\Filament\Resources\MatchQualityLogResource\Pages;
use App\Models\MatchQualityLog;
use Filament\Forms;
use Filament\Infolists;
use Filament\Schemas\Schema;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

class MatchQualityLogResource extends Resource
{
    protected static ?string $model = MatchQualityLog::class;

    protected static string | \BackedEnum | null $navigationIcon = 'heroicon-o-finger-print';

    protected static string | \UnitEnum | null $navigationGroup = 'Analytics';

    protected static ?int $navigationSort = 2;

    protected static ?string $navigationLabel = 'Match Quality';

    public static function canCreate(): bool
    {
        return false;
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('event_name')
                    ->label('Event')
                    ->badge()
                    ->sortable()
                    ->searchable(),

                Tables\Columns\TextColumn::make('pixel_id')
                    ->label('Pixel')
                    ->fontFamily('mono')
                    ->limit(10)
                    ->searchable(),

                Tables\Columns\TextColumn::make('source_domain')
                    ->label('Domain')
                    ->limit(25)
                    ->searchable()
                    ->placeholder('—'),

                Tables\Columns\TextColumn::make('score')
                    ->label('Score')
                    ->suffix('/100')
                    ->alignCenter()
                    ->color(fn (int $state): string => match (true) {
                        $state >= 61 => 'success',
                        $state >= 41 => 'warning',
                        default => 'danger',
                    })
                    ->sortable(),

                // PII field indicators
                Tables\Columns\IconColumn::make('has_em')
                    ->label('Em')
                    ->boolean()
                    ->trueIcon('heroicon-m-check')
                    ->falseIcon('heroicon-m-minus')
                    ->trueColor('success')
                    ->falseColor('gray')
                    ->alignCenter(),

                Tables\Columns\IconColumn::make('has_ph')
                    ->label('Ph')
                    ->boolean()
                    ->trueIcon('heroicon-m-check')
                    ->falseIcon('heroicon-m-minus')
                    ->trueColor('success')
                    ->falseColor('gray')
                    ->alignCenter(),

                Tables\Columns\IconColumn::make('has_fn')
                    ->label('Fn')
                    ->boolean()
                    ->trueIcon('heroicon-m-check')
                    ->falseIcon('heroicon-m-minus')
                    ->trueColor('success')
                    ->falseColor('gray')
                    ->alignCenter()
                    ->toggleable(isToggledHiddenByDefault: true),

                Tables\Columns\IconColumn::make('has_fbp')
                    ->label('FBP')
                    ->boolean()
                    ->trueIcon('heroicon-m-check')
                    ->falseIcon('heroicon-m-minus')
                    ->trueColor('success')
                    ->falseColor('gray')
                    ->alignCenter(),

                Tables\Columns\IconColumn::make('has_fbc')
                    ->label('FBC')
                    ->boolean()
                    ->trueIcon('heroicon-m-check')
                    ->falseIcon('heroicon-m-minus')
                    ->trueColor('success')
                    ->falseColor('gray')
                    ->alignCenter()
                    ->toggleable(isToggledHiddenByDefault: true),

                Tables\Columns\IconColumn::make('was_enriched')
                    ->label('Enriched')
                    ->boolean()
                    ->trueIcon('heroicon-o-sparkles')
                    ->falseIcon('heroicon-m-minus')
                    ->trueColor('info')
                    ->falseColor('gray')
                    ->alignCenter(),

                Tables\Columns\TextColumn::make('score_before_enrichment')
                    ->label('Pre-Enrich')
                    ->suffix('/100')
                    ->alignCenter()
                    ->color('gray')
                    ->toggleable(isToggledHiddenByDefault: true),

                Tables\Columns\TextColumn::make('enrichment_source')
                    ->label('Enrich Source')
                    ->badge()
                    ->color('info')
                    ->placeholder('—')
                    ->toggleable(isToggledHiddenByDefault: true),

                Tables\Columns\TextColumn::make('event_date')
                    ->date('M j, Y')
                    ->sortable(),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('event_name')
                    ->options(fn (): array => MatchQualityLog::query()
                        ->distinct()
                        ->pluck('event_name', 'event_name')
                        ->toArray())
                    ->multiple()
                    ->preloaded(),

                Tables\Filters\TernaryFilter::make('was_enriched')
                    ->label('Enrichment')
                    ->placeholder('All')
                    ->trueLabel('Enriched')
                    ->falseLabel('Not Enriched'),

                Tables\Filters\Filter::make('high_quality')
                    ->label('High Quality (60+)')
                    ->query(fn (Builder $query): Builder => $query->where('score', '>=', 60))
                    ->toggle(),

                Tables\Filters\Filter::make('low_quality')
                    ->label('Low Quality (<40)')
                    ->query(fn (Builder $query): Builder => $query->where('score', '<', 40))
                    ->toggle(),

                Tables\Filters\Filter::make('date_range')
                    ->form([
                        Forms\Components\DatePicker::make('from')->label('From'),
                        Forms\Components\DatePicker::make('until')->label('Until'),
                    ])
                    ->query(function (Builder $query, array $data): Builder {
                        return $query
                            ->when($data['from'], fn (Builder $q, $date) => $q->whereDate('event_date', '>=', $date))
                            ->when($data['until'], fn (Builder $q, $date) => $q->whereDate('event_date', '<=', $date));
                    }),
            ])
            ->filtersLayout(Tables\Enums\FiltersLayout::AboveContentCollapsible)
            ->actions([
                Tables\Actions\ViewAction::make(),
            ])
            ->bulkActions([
                Tables\Actions\BulkActionGroup::make([
                    Tables\Actions\DeleteBulkAction::make(),
                ]),
            ])
            ->defaultSort('created_at', 'desc')
            ->striped();
    }

    public static function infolist(Schema $schema): Schema
    {
        return $schema
            ->schema([
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

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListMatchQualityLogs::route('/'),
            'view' => Pages\ViewMatchQualityLog::route('/{record}'),
        ];
    }
}
