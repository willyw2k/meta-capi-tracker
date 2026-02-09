<?php

declare(strict_types=1);

namespace App\Services\MetaCapi\Requests\Meta;

use Saloon\Contracts\Body\HasBody;
use Saloon\Enums\Method;
use Saloon\Http\Request;
use Saloon\Traits\Body\HasJsonBody;

final class SendEventsRequest extends Request implements HasBody
{
    use HasJsonBody;

    protected Method $method = Method::POST;

    public function __construct(
        private readonly string $pixelId,
        private readonly array $events,
        private readonly ?string $testEventCode = null,
    ) {}

    public function resolveEndpoint(): string
    {
        return "/{$this->pixelId}/events";
    }

    protected function defaultBody(): array
    {
        $body = [
            'data' => $this->events,
        ];

        if ($this->testEventCode) {
            $body['test_event_code'] = $this->testEventCode;
        }

        return $body;
    }
}
