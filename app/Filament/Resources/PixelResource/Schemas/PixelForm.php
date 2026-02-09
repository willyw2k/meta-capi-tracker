<?php

declare(strict_types=1);

namespace App\Filament\Resources\PixelResource\Schemas;

use Filament\Forms;
use Filament\Schemas\Schema;

class PixelForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Forms\Components\Section::make('Pixel Configuration')
                    ->description('Configure the Meta pixel and its access credentials.')
                    ->icon('heroicon-o-signal')
                    ->schema([
                        Forms\Components\TextInput::make('name')
                            ->required()
                            ->maxLength(255)
                            ->placeholder('e.g. Main Website Pixel')
                            ->columnSpan(1),

                        Forms\Components\TextInput::make('pixel_id')
                            ->label('Pixel ID')
                            ->required()
                            ->unique(ignoreRecord: true)
                            ->maxLength(50)
                            ->placeholder('e.g. 123456789012345')
                            ->helperText('Your Meta Pixel ID from Events Manager.')
                            ->columnSpan(1),

                        Forms\Components\Textarea::make('access_token')
                            ->label('Conversions API Access Token')
                            ->required()
                            ->rows(3)
                            ->placeholder('EAABsbCS1Ihn...')
                            ->helperText('System user token with ads_management permission. Stored encrypted.')
                            ->columnSpanFull(),

                        Forms\Components\TextInput::make('test_event_code')
                            ->label('Test Event Code')
                            ->maxLength(50)
                            ->placeholder('TEST12345')
                            ->helperText('Optional. Used to send events to Meta\'s Test Events tab for validation.')
                            ->columnSpan(1),

                        Forms\Components\Toggle::make('is_active')
                            ->label('Active')
                            ->default(true)
                            ->helperText('Inactive pixels will not receive events.')
                            ->columnSpan(1),
                    ])
                    ->columns(2),

                Forms\Components\Section::make('Domain Configuration')
                    ->description('Specify which domains this pixel should track. Leave empty to accept all domains.')
                    ->icon('heroicon-o-globe-alt')
                    ->schema([
                        Forms\Components\TagsInput::make('domains')
                            ->placeholder('Add domain...')
                            ->helperText('Supports exact match (shop.example.com), wildcards (*.example.com), and catch-all (*). Leave empty for all domains.')
                            ->columnSpanFull(),
                    ])
                    ->collapsible(),
            ]);
    }
}
