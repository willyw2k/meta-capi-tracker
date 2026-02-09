<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class ValidateTrackingApiKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $apiKey = $request->header('X-API-Key')
            ?? $request->header('X-Request-Token')
            ?? $request->query('api_key');

        if (! $apiKey || $apiKey !== config('meta-capi.api_key')) {
            return response()->json([
                'error' => 'Unauthorized',
                'message' => 'Invalid or missing API key.',
            ], 401);
        }

        return $next($request);
    }
}
