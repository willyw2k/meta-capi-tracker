<?php

declare(strict_types=1);

namespace App\Services\MetaCapi\Exceptions;

use RuntimeException;
use Saloon\Http\Response;

final class MetaCapiException extends RuntimeException
{
    public ?array $metaResponse = null;

    public bool $retryable = true;

    /**
     * Meta API error codes that should NOT be retried.
     * These indicate permanent failures (auth, permissions, invalid data).
     */
    private const NON_RETRYABLE_CODES = [
        100,  // Invalid parameter
        190,  // Invalid OAuth access token
        200,  // Permissions error
        803,  // Object does not exist (e.g. deleted pixel)
        2200, // Invalid event
    ];

    public static function failedRequest(Response $response): self
    {
        $body = $response->json();
        $error = $body['error'] ?? [];
        $message = $error['message'] ?? 'Unknown Meta API error';
        $code = $error['code'] ?? 0;
        $httpStatus = $response->status();

        $exception = new self("Meta CAPI Error [{$code}]: {$message}", $code);
        $exception->metaResponse = $body;
        $exception->retryable = ! in_array($code, self::NON_RETRYABLE_CODES, true)
            && ! in_array($httpStatus, [400, 401, 403], true);

        return $exception;
    }

    public static function pixelNotFound(string $pixelId): self
    {
        $exception = new self("Pixel [{$pixelId}] not found or is inactive.");
        $exception->retryable = false;

        return $exception;
    }

    public static function rateLimited(): self
    {
        return new self('Meta CAPI rate limit exceeded. Events will be retried.');
    }

    public static function invalidPayload(string $reason): self
    {
        $exception = new self("Invalid event payload: {$reason}");
        $exception->retryable = false;

        return $exception;
    }

    public static function configurationError(string $reason): self
    {
        $exception = new self("Configuration error: {$reason}");
        $exception->retryable = false;

        return $exception;
    }

    public static function connectionFailed(string $message, ?\Throwable $previous = null): self
    {
        return new self("Meta API connection error: {$message}", 0, $previous);
    }

    public function isRetryable(): bool
    {
        return $this->retryable;
    }
}
