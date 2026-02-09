<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * Cookie Sync Controller
 *
 * Receives tracking cookies from the client and re-sets them as
 * server-side first-party cookies (HttpOnly). This is the key to
 * surviving Safari ITP which limits JS-set cookies to 7 days,
 * but allows server-set cookies to live for their full max-age.
 *
 * Flow:
 *   1. Client JS reads _fbp, _fbc, _mt_id cookies
 *   2. Client sends them to this endpoint
 *   3. Server responds with Set-Cookie headers (HttpOnly, Secure, SameSite=Lax)
 *   4. Browser stores them as first-party server-set cookies → ITP won't cap them
 */
final readonly class CookieSyncController
{
    public function __invoke(Request $request): JsonResponse
    {
        $request->validate([
            'cookies' => ['required', 'array'],
            'cookies._fbp' => ['nullable', 'string', 'max:255'],
            'cookies._fbc' => ['nullable', 'string', 'max:255'],
            'cookies._mt_id' => ['nullable', 'string', 'max:255'],
            'cookies._mt_em' => ['nullable', 'string', 'max:255'],
            'cookies._mt_ph' => ['nullable', 'string', 'max:255'],
            'domain' => ['nullable', 'string', 'max:255'],
            'max_age' => ['nullable', 'integer', 'min:1', 'max:400'],
        ]);

        $cookies = $request->input('cookies', []);
        $maxAgeDays = $request->input('max_age', 180);
        $maxAgeSeconds = $maxAgeDays * 86400;
        $domain = $this->resolveRootDomain($request->input('domain', ''));

        $response = response()->json([
            'success' => true,
            'synced' => array_keys(array_filter($cookies)),
        ]);

        // Set each cookie as HttpOnly first-party cookie
        $allowedCookies = ['_fbp', '_fbc', '_mt_id', '_mt_em', '_mt_ph'];

        foreach ($allowedCookies as $cookieName) {
            $value = $cookies[$cookieName] ?? null;

            if (! $value || strlen($value) > 255) {
                continue;
            }

            $response->withCookie(new Cookie(
                name: $cookieName,
                value: $value,
                expire: now()->addSeconds($maxAgeSeconds),
                path: '/',
                domain: $domain ? ".{$domain}" : null,
                secure: $request->secure(),
                httpOnly: $cookieName !== '_fbp' && $cookieName !== '_fbc', // _fbp/_fbc need JS access
                raw: false,
                sameSite: Cookie::SAMESITE_LAX,
            ));
        }

        return $response;
    }

    /**
     * Extract root domain from hostname for cross-subdomain cookies.
     * e.g. "shop.example.com" → "example.com"
     */
    private function resolveRootDomain(string $hostname): string
    {
        if (empty($hostname) || filter_var($hostname, FILTER_VALIDATE_IP)) {
            return '';
        }

        $parts = explode('.', $hostname);

        if (count($parts) <= 1) {
            return '';
        }

        // Return last 2 parts
        return implode('.', array_slice($parts, -2));
    }
}
