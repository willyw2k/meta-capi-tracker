<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schedule;

/*
|--------------------------------------------------------------------------
| Console Routes / Scheduling
|--------------------------------------------------------------------------
*/

// Prune old tracking data daily at 3 AM
Schedule::command('tracker:prune')->dailyAt('03:00');
