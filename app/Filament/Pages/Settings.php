<?php

declare(strict_types=1);

namespace App\Filament\Pages;

use Filament\Actions\Action;
use Filament\Forms;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Filament\Schemas;
use Filament\Schemas\Components\Actions;
use Filament\Schemas\Components\EmbeddedSchema;
use Filament\Schemas\Components\Form;
use Filament\Schemas\Schema;
use Illuminate\Support\Facades\Artisan;

class Settings extends Page
{
    protected static string | \BackedEnum | null $navigationIcon = 'heroicon-o-cog-6-tooth';

    protected static string | \UnitEnum | null $navigationGroup = 'Settings';

    protected static ?int $navigationSort = 10;

    protected string $view = 'filament.pages.settings';

    public ?array $data = [];

    public function mount(): void
    {
        $config = config('meta-capi');

        $this->form->fill([
            'api_key' => $config['api_key'] ?? '',
            'graph_api_version' => $config['graph_api_version'] ?? 'v21.0',
            'dedup_window_minutes' => $config['dedup_window_minutes'] ?? 60,
            'max_retries' => $config['max_retries'] ?? 3,
            'retention_sent' => $config['retention']['sent_events'] ?? 90,
            'retention_failed' => $config['retention']['failed_events'] ?? 30,
            'cookie_keeper_enabled' => $config['cookie_keeper']['enabled'] ?? true,
            'cookie_max_age' => $config['cookie_keeper']['max_age_days'] ?? 180,
            'advanced_matching_enabled' => $config['advanced_matching']['enabled'] ?? true,
            'store_profiles' => $config['advanced_matching']['store_profiles'] ?? true,
            'profile_retention_days' => $config['advanced_matching']['profile_retention_days'] ?? 365,
            'disguised_path' => $config['disguised_path'] ?? 'collect',
        ]);
    }

    public function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Schemas\Components\Tabs::make('Settings')
                    ->tabs([
                        Schemas\Components\Tabs\Tab::make('General')
                            ->icon('heroicon-o-cog-6-tooth')
                            ->schema([
                                Schemas\Components\Section::make('API Configuration')
                                    ->schema([
                                        Forms\Components\TextInput::make('api_key')
                                            ->label('Tracking API Key')
                                            ->password()
                                            ->revealable()
                                            ->helperText('Used by the client-side tracker to authenticate requests. Set TRACKING_API_KEY in .env.'),

                                        Forms\Components\TextInput::make('graph_api_version')
                                            ->label('Meta Graph API Version')
                                            ->placeholder('v21.0')
                                            ->helperText('Default Meta Graph API version for CAPI requests.'),
                                    ])
                                    ->columns(2),

                                Schemas\Components\Section::make('Event Processing')
                                    ->schema([
                                        Forms\Components\TextInput::make('dedup_window_minutes')
                                            ->label('Deduplication Window')
                                            ->numeric()
                                            ->suffix('minutes')
                                            ->helperText('Events with the same event_id within this window are deduplicated.'),

                                        Forms\Components\TextInput::make('max_retries')
                                            ->label('Max Retries')
                                            ->numeric()
                                            ->helperText('Maximum retry attempts for failed Meta API sends.'),
                                    ])
                                    ->columns(2),

                                Schemas\Components\Section::make('Data Retention')
                                    ->schema([
                                        Forms\Components\TextInput::make('retention_sent')
                                            ->label('Sent Events Retention')
                                            ->numeric()
                                            ->suffix('days')
                                            ->helperText('Days to keep successfully sent events.'),

                                        Forms\Components\TextInput::make('retention_failed')
                                            ->label('Failed Events Retention')
                                            ->numeric()
                                            ->suffix('days')
                                            ->helperText('Days to keep failed events for debugging.'),
                                    ])
                                    ->columns(2),
                            ]),

                        Schemas\Components\Tabs\Tab::make('Cookie Keeper')
                            ->icon('heroicon-o-key')
                            ->schema([
                                Schemas\Components\Section::make('Cookie Keeper Configuration')
                                    ->description('Server-side first-party cookie management to survive ITP/Safari 7-day cookie limitations.')
                                    ->schema([
                                        Forms\Components\Toggle::make('cookie_keeper_enabled')
                                            ->label('Enabled')
                                            ->helperText('Enable server-side first-party cookie setting.'),

                                        Forms\Components\TextInput::make('cookie_max_age')
                                            ->label('Cookie Max Age')
                                            ->numeric()
                                            ->suffix('days')
                                            ->helperText('Maximum age for server-set cookies (default 180 days).'),
                                    ])
                                    ->columns(2),
                            ]),

                        Schemas\Components\Tabs\Tab::make('Advanced Matching')
                            ->icon('heroicon-o-finger-print')
                            ->schema([
                                Schemas\Components\Section::make('Advanced Matching & Enrichment')
                                    ->description('Server-side user profile enrichment for better Meta Event Match Quality.')
                                    ->schema([
                                        Forms\Components\Toggle::make('advanced_matching_enabled')
                                            ->label('Enabled')
                                            ->helperText('Enable server-side enrichment pipeline.'),

                                        Forms\Components\Toggle::make('store_profiles')
                                            ->label('Store User Profiles')
                                            ->helperText('Store hashed PII from identified users for future event enrichment.'),

                                        Forms\Components\TextInput::make('profile_retention_days')
                                            ->label('Profile Retention')
                                            ->numeric()
                                            ->suffix('days')
                                            ->helperText('Days to keep user profiles before cleanup.'),
                                    ])
                                    ->columns(2),
                            ]),

                        Schemas\Components\Tabs\Tab::make('Ad Blocker Recovery')
                            ->icon('heroicon-o-shield-check')
                            ->schema([
                                Schemas\Components\Section::make('Disguised Endpoint')
                                    ->description('Generic-looking route path to evade ad blocker filter lists.')
                                    ->schema([
                                        Forms\Components\TextInput::make('disguised_path')
                                            ->label('Disguised Path')
                                            ->prefix('/')
                                            ->helperText('The URL path used for ad-blocker recovery. Default: /collect.'),
                                    ]),
                            ]),
                    ])
                    ->columnSpanFull(),
            ])
            ->statePath('data');
    }

    public function content(Schema $schema): Schema
    {
        return $schema
            ->components([
                $this->getFormContentComponent(),
            ]);
    }

    public function getFormContentComponent(): Schemas\Components\Component
    {
        return Form::make([EmbeddedSchema::make('form')])
            ->id('form')
            ->livewireSubmitHandler('save')
            ->footer([
                Actions::make($this->getFormActions())
                    ->alignment($this->getFormActionsAlignment())
                    ->sticky($this->areFormActionsSticky())
                    ->key('form-actions'),
            ]);
    }

    /**
     * @return array<Action>
     */
    protected function getFormActions(): array
    {
        return [
            $this->getSaveFormAction(),
        ];
    }

    protected function getSaveFormAction(): Action
    {
        return Action::make('save')
            ->label('Save')
            ->submit('save')
            ->keyBindings(['mod+s']);
    }

    protected function hasFullWidthFormActions(): bool
    {
        return false;
    }

    protected function getHeaderActions(): array
    {
        return [
            Action::make('clear_cache')
                ->label('Clear Config Cache')
                ->icon('heroicon-o-arrow-path')
                ->color('gray')
                ->requiresConfirmation()
                ->action(function (): void {
                    Artisan::call('config:clear');

                    Notification::make()
                        ->title('Configuration cache cleared')
                        ->success()
                        ->send();
                }),
        ];
    }

    public function save(): void
    {
        Notification::make()
            ->title('Settings are read-only')
            ->body('Configuration values are sourced from .env and config/meta-capi.php. Update your environment variables to change settings.')
            ->info()
            ->send();
    }
}
