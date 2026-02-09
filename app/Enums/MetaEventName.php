<?php

declare(strict_types=1);

namespace App\Enums;

enum MetaEventName: string
{
    case PageView = 'PageView';
    case ViewContent = 'ViewContent';
    case Search = 'Search';
    case AddToCart = 'AddToCart';
    case AddToWishlist = 'AddToWishlist';
    case InitiateCheckout = 'InitiateCheckout';
    case AddPaymentInfo = 'AddPaymentInfo';
    case Purchase = 'Purchase';
    case Lead = 'Lead';
    case CompleteRegistration = 'CompleteRegistration';
    case Contact = 'Contact';
    case CustomizeProduct = 'CustomizeProduct';
    case Donate = 'Donate';
    case FindLocation = 'FindLocation';
    case Schedule = 'Schedule';
    case StartTrial = 'StartTrial';
    case SubmitApplication = 'SubmitApplication';
    case Subscribe = 'Subscribe';
    case Custom = 'Custom';

    public function label(): string
    {
        return match ($this) {
            self::PageView => 'Page View',
            self::ViewContent => 'View Content',
            self::AddToCart => 'Add to Cart',
            self::AddToWishlist => 'Add to Wishlist',
            self::InitiateCheckout => 'Initiate Checkout',
            self::AddPaymentInfo => 'Add Payment Info',
            self::CompleteRegistration => 'Complete Registration',
            self::CustomizeProduct => 'Customize Product',
            self::FindLocation => 'Find Location',
            self::StartTrial => 'Start Trial',
            self::SubmitApplication => 'Submit Application',
            default => $this->value,
        };
    }

    public function isStandard(): bool
    {
        return $this !== self::Custom;
    }
}
