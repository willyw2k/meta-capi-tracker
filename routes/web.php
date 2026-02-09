<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| The Filament admin panel is registered via AdminPanelProvider at /admin.
| No additional web routes are needed for the admin panel.
|
*/

Route::get('/', fn () => redirect('/admin'));
