<?php

declare(strict_types=1);

namespace App\Enums;

enum MetaActionSource: string
{
    case Website = 'website';
    case App = 'app';
    case PhoneCall = 'phone_call';
    case Chat = 'chat';
    case Email = 'email';
    case SystemGenerated = 'system_generated';
    case Other = 'other';
}
