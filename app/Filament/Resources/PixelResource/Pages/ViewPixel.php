<?php

declare(strict_types=1);

namespace App\Filament\Resources\PixelResource\Pages;

use App\Filament\Resources\PixelResource;
use App\Filament\Resources\PixelResource\Widgets\PixelStatsOverview;
use App\Models\Pixel;
use Filament\Actions;
use Filament\Resources\Pages\ViewRecord;

class ViewPixel extends ViewRecord
{
    protected static string $resource = PixelResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\Action::make('generate_script')
                ->label('Get Script')
                ->icon('heroicon-o-code-bracket')
                ->color('info')
                ->modalHeading('Client Tracking Script')
                ->modalDescription('Copy this script and paste it into your website.')
                ->modalSubmitAction(false)
                ->modalCancelActionLabel('Close')
                ->modalContent(fn (Pixel $record) => view('filament.modals.client-script', [
                    'pixel' => $record,
                ])),

            Actions\EditAction::make(),
        ];
    }

    protected function getHeaderWidgets(): array
    {
        return [
            PixelStatsOverview::class,
        ];
    }
}
