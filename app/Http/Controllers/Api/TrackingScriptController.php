<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Http\Response;

final readonly class TrackingScriptController
{
    public function __invoke(): Response
    {
        $script = view('tracking.pixel-script')->render();

        return response($script, 200)
            ->header('Content-Type', 'application/javascript')
            ->header('Cache-Control', 'public, max-age=3600');
    }
}
