<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Http\Response;

final readonly class TrackingScriptController
{
    public function __invoke(): \Illuminate\Contracts\View\Factory|\Illuminate\Contracts\View\View|\Illuminate\View\View
    {
        return view('tracking.pixel-script')
            ->with([
                'Content-Type', 'application/javascript',
                'Cache-Control', 'public, max-age=3600'
            ]);
    }
}
