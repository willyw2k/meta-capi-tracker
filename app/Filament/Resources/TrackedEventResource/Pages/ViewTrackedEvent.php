<?php

declare(strict_types=1);

namespace App\Filament\Resources\TrackedEventResource\Pages;

use App\Enums\EventStatus;
use App\Filament\Resources\TrackedEventResource;
use App\Jobs\SendMetaEventJob;
use Filament\Actions;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ViewRecord;

class ViewTrackedEvent extends ViewRecord
{
    protected static string $resource = TrackedEventResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\Action::make('retry')
                ->label('Retry Sending')
                ->icon('heroicon-o-arrow-path')
                ->color('warning')
                ->visible(fn (): bool => $this->record->status === EventStatus::Failed)
                ->requiresConfirmation()
                ->action(function (): void {
                    $this->record->update([
                        'status' => EventStatus::Pending,
                        'error_message' => null,
                    ]);

                    SendMetaEventJob::dispatch($this->record->id);

                    Notification::make()
                        ->title('Event queued for retry')
                        ->success()
                        ->send();

                    $this->refreshFormData(['status', 'error_message']);
                }),

            Actions\DeleteAction::make(),
        ];
    }
}
