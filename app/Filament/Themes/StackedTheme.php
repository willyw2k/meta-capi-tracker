<?php

declare(strict_types=1);

namespace App\Filament\Themes;

use Filament\Contracts\Plugin;
use Filament\Panel;
use Filament\PanelProvider;
use Filament\Schemas\Components\Wizard;
use Filament\Support\Colors\Color;
use Filament\Support\Enums\Width;
use Filament\Support\Facades\FilamentColor;
use Filament\Support\Facades\FilamentIcon;

class StackedTheme implements Plugin
{
    public static function make(): static
    {
        $plugin = app(static::class);

        $caller = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 2)[1];
        $callerClass = $caller['class'] ?? null;

        if (! ($callerClass && is_subclass_of($callerClass, PanelProvider::class))) {
            FilamentColor::register($plugin::getColors());
            FilamentIcon::register($plugin::getIcons());
            $plugin::configureComponents();
        }

        return $plugin;
    }

    public function getId(): string
    {
        return 'admin';
    }

    public function register(Panel $panel): void
    {
        $panel
            ->colors(static::getColors())
            ->icons(static::getIcons())
            ->font('Onest')
            ->simplePageMaxContentWidth(Width::Small);
    }

    public function boot(Panel $panel): void
    {
        static::configureComponents();
    }

    /**
     * @return array<string, array{50: string, 100: string, 200: string, 300: string, 400: string, 500: string, 600: string, 700: string, 800: string, 900: string, 950: string} | string>
     */
    public static function getColors(): array
    {
        return [
            'danger' => Color::Rose,
            'gray' => Color::Zinc,
            'info' => Color::Blue,
            'primary' => Color::Teal,
            'success' => Color::Emerald,
            'warning' => Color::Yellow,
        ];
    }

    /**
     * @return array<string, string>
     */
    public static function getIcons(): array
    {
        return [
            'actions::delete-action.modal' => 'heroicon-s-trash',
            'actions::detach-action.modal' => 'heroicon-s-x-mark',
            'actions::dissociate-action.modal' => 'heroicon-s-x-mark',
            'actions::force-delete-action.modal' => 'heroicon-s-trash',
            'actions::restore-action.modal' => 'heroicon-s-arrow-uturn-left',
            'infolists::components.icon-entry.false' => 'heroicon-s-x-circle',
            'infolists::components.icon-entry.true' => 'heroicon-s-check-circle',
            'modal.close-button' => 'heroicon-s-x-mark',
            'notifications::database.modal.empty-state' => 'heroicon-s-bell-slash',
            'panels::pages.dashboard.navigation-item' => 'heroicon-m-home',
            'panels::resources.pages.edit-record.navigation-item' => 'heroicon-m-pencil-square',
            'panels::resources.pages.manage-related-records.navigation-item' => 'heroicon-m-rectangle-stack',
            'panels::resources.pages.view-record.navigation-item' => 'heroicon-m-eye',
            'panels::sidebar.collapse-button' => 'heroicon-s-chevron-left',
            'panels::sidebar.collapse-button.rtl' => 'heroicon-s-chevron-right',
            'panels::sidebar.expand-button' => 'heroicon-s-chevron-right',
            'panels::sidebar.expand-button.rtl' => 'heroicon-s-chevron-left',
            'panels::topbar.close-sidebar-button' => 'heroicon-s-x-mark',
            'panels::topbar.open-database-notifications-button' => 'heroicon-s-bell',
            'panels::topbar.open-sidebar-button' => 'heroicon-s-bars-3',
            'schema::components.wizard.completed-step' => 'heroicon-m-check',
            'tables::columns.icon-column.false' => 'heroicon-s-x-circle',
            'tables::columns.icon-column.true' => 'heroicon-s-check-circle',
            'tables::empty-state' => 'heroicon-s-x-mark',
        ];
    }

    public static function configureComponents(): void
    {
        Wizard::configureUsing(function (Wizard $wizard) {
            $wizard->contained(false);
        });
    }
}
