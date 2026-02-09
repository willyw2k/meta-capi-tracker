<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class HandleTrackingCors
{
    public function handle(Request $request, Closure $next): Response
    {
        $allowedOrigins = config('meta-capi.allowed_origins', ['*']);
        $origin = $request->header('Origin', '*');

        // Check if origin is allowed
        $allowOrigin = in_array('*', $allowedOrigins)
            ? $origin
            : (in_array($origin, $allowedOrigins) ? $origin : null);

        if ($request->isMethod('OPTIONS')) {
            return response('', 204)
                ->header('Access-Control-Allow-Origin', $allowOrigin ?? '')
                ->header('Access-Control-Allow-Methods', 'POST, OPTIONS')
                ->header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Requested-With')
                ->header('Access-Control-Max-Age', '86400');
        }

        $response = $next($request);

        if ($allowOrigin) {
            $response->headers->set('Access-Control-Allow-Origin', $allowOrigin);
            $response->headers->set('Access-Control-Allow-Credentials', 'true');
        }

        return $response;
    }
}
