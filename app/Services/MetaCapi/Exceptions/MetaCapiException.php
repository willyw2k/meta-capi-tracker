<?php

declare(strict_types=1);

namespace App\Services\MetaCapi\Exceptions;

use RuntimeException;
use Saloon\Http\Response;

final class MetaCapiException extends RuntimeException
{
    public ?array $metaResponse = null;

    public static function failedRequest(Response $response): self
    {
        $body = $response->json();
        $error = $body['error'] ?? [];
        $message = $error['message'] ?? 'Unknown Meta API error';
        $code = $error['code'] ?? 0;

        $exception = new self("Meta CAPI Error [{$code}]: {$message}", $code);
        $exception->metaResponse = $body;

        return $exception;
    }

    public static function pixelNotFound(string $pixelId): self
    {
        return new self("Pixel [{$pixelId}] not found or is inactive.");
    }

    public static function rateLimited(): self
    {
        return new self('Meta CAPI rate limit exceeded. Events will be retried.');
    }

    public static function invalidPayload(string $reason): self
    {
        return new self("Invalid event payload: {$reason}");
    }
}
