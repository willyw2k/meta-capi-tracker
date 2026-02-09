<?php

declare(strict_types=1);

namespace App\Filament\Resources\MatchQualityLogResource\Tables;

use App\Models\MatchQualityLog;
use Filament\Forms;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

class MatchQualityLogsTable
{
    public static function configure(Table $table): Table
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
}
