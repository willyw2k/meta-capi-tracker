<?php

declare(strict_types=1);

namespace App\Services\MetaCapi\Connectors;

use Saloon\Http\Connector;

final class MetaCapiConnector extends Connector
{
    public function __construct(
        private readonly string $accessToken,
    ) {}

    public function resolveBaseUrl(): string
    {
        return 'https://graph.facebook.com/v21.0';
    }

    protected function defaultHeaders(): array
    {
        return [
            'Content-Type' => 'application/json',
        ];
    }

    protected function defaultQuery(): array
    {
        return [
            'access_token' => $this->accessToken,
        ];
    }
}
