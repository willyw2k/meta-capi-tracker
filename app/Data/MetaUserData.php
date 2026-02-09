<?php

declare(strict_types=1);

namespace App\Data;

use Illuminate\Http\Request;
use Spatie\LaravelData\Data;

final class MetaUserData extends Data
{
    public function __construct(
        // PII fields (hashed with SHA-256)
        public ?string $em = null,           // email
        public ?string $ph = null,           // phone
        public ?string $fn = null,           // first name
        public ?string $ln = null,           // last name
        public ?string $ge = null,           // gender
        public ?string $db = null,           // date of birth
        public ?string $ct = null,           // city
        public ?string $st = null,           // state
        public ?string $zp = null,           // zip code
        public ?string $country = null,      // country
        public ?string $external_id = null,  // external ID

        // Multi-value PII (Meta supports arrays for some fields)
        /** @var string[]|null */
        public ?array $em_multi = null,      // additional emails
        /** @var string[]|null */
        public ?array $ph_multi = null,      // additional phones

        // Non-PII fields (not hashed)
        public ?string $client_ip_address = null,
        public ?string $client_user_agent = null,
        public ?string $fbc = null,          // Facebook click ID
        public ?string $fbp = null,          // Facebook browser ID
        public ?string $subscription_id = null,
        public ?string $fb_login_id = null,
        public ?string $lead_id = null,

        // Metadata (not sent to Meta, used internally)
        public ?int $match_quality = null,
    ) {}

    /**
     * Hash a value using SHA-256 if not already hashed.
     * Meta requires all PII to be lowercase SHA-256.
     */
    public static function hashValue(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        // Already hashed (64 char hex = SHA-256)
        if (preg_match('/^[a-f0-9]{64}$/', $value)) {
            return $value;
        }

        return hash('sha256', mb_strtolower(trim($value)));
    }

    /**
     * Create from raw (possibly unhashed) user data.
     * Applies normalization and hashing.
     *
     * Field name aliases are supported:
     *   email → em, phone → ph, first_name → fn, etc.
     */
    public static function fromRaw(array $data): self
    {
        // Handle multi-value emails/phones
        $emMulti = null;
        $phMulti = null;

        if (isset($data['em_multi']) && is_array($data['em_multi'])) {
            $emMulti = array_filter(array_map(fn ($v) => self::hashValue(self::normalizeEmail($v)), $data['em_multi']));
            $emMulti = array_values($emMulti) ?: null;
        }

        if (isset($data['ph_multi']) && is_array($data['ph_multi'])) {
            $phMulti = array_filter(array_map(fn ($v) => self::hashValue(self::normalizePhone($v)), $data['ph_multi']));
            $phMulti = array_values($phMulti) ?: null;
        }

        return new self(
            em: self::hashValue(self::normalizeEmail($data['em'] ?? $data['email'] ?? null)),
            ph: self::hashValue(self::normalizePhone($data['ph'] ?? $data['phone'] ?? null)),
            fn: self::hashValue(self::normalizeName($data['fn'] ?? $data['first_name'] ?? null)),
            ln: self::hashValue(self::normalizeName($data['ln'] ?? $data['last_name'] ?? null)),
            ge: self::hashValue(self::normalizeGender($data['ge'] ?? $data['gender'] ?? null)),
            db: self::hashValue(self::normalizeDob($data['db'] ?? $data['date_of_birth'] ?? $data['birthday'] ?? null)),
            ct: self::hashValue(self::normalizeCity($data['ct'] ?? $data['city'] ?? null)),
            st: self::hashValue(self::normalizeState($data['st'] ?? $data['state'] ?? null)),
            zp: self::hashValue(self::normalizeZip($data['zp'] ?? $data['zip'] ?? $data['postal_code'] ?? null)),
            country: self::hashValue(self::normalizeCountry($data['country'] ?? $data['country_code'] ?? null)),
            external_id: self::hashValue($data['external_id'] ?? null),
            em_multi: $emMulti,
            ph_multi: $phMulti,
            client_ip_address: $data['client_ip_address'] ?? $data['ip'] ?? null,
            client_user_agent: $data['client_user_agent'] ?? $data['user_agent'] ?? null,
            fbc: $data['fbc'] ?? null,
            fbp: $data['fbp'] ?? null,
            subscription_id: $data['subscription_id'] ?? null,
            fb_login_id: $data['fb_login_id'] ?? null,
            lead_id: $data['lead_id'] ?? null,
            match_quality: isset($data['match_quality']) ? (int) $data['match_quality'] : null,
        );
    }

    /**
     * Enrich user data from the server HTTP request.
     * Auto-fills IP, User-Agent, and validates fbclid format.
     */
    public function enrichFromRequest(Request $request): self
    {
        $clone = clone $this;

        // Fill IP from request if not provided
        if (empty($clone->client_ip_address)) {
            $clone->client_ip_address = $request->ip();
        }

        // Fill User-Agent from request if not provided
        if (empty($clone->client_user_agent)) {
            $clone->client_user_agent = $request->userAgent();
        }

        // Validate fbc format (fb.{subdomain_index}.{creation_time}.{fbclid})
        if ($clone->fbc && ! preg_match('/^fb\.\d+\.\d+\..+$/', $clone->fbc)) {
            $clone->fbc = null; // Invalid format
        }

        // Validate fbp format (fb.{subdomain_index}.{creation_time}.{random})
        if ($clone->fbp && ! preg_match('/^fb\.\d+\.\d+\.\d+$/', $clone->fbp)) {
            $clone->fbp = null; // Invalid format
        }

        return $clone;
    }

    /**
     * Convert to Meta CAPI format (only non-null fields).
     * PII fields are wrapped in arrays as Meta requires.
     */
    public function toMetaFormat(): array
    {
        $result = [];

        // PII fields → wrapped in arrays (Meta format)
        // Support multi-value: merge primary + additional values
        if ($this->em || $this->em_multi) {
            $emails = array_filter(array_unique(
                array_merge(
                    $this->em ? [$this->em] : [],
                    $this->em_multi ?? [],
                )
            ));
            if ($emails) {
                $result['em'] = array_values($emails);
            }
        }

        if ($this->ph || $this->ph_multi) {
            $phones = array_filter(array_unique(
                array_merge(
                    $this->ph ? [$this->ph] : [],
                    $this->ph_multi ?? [],
                )
            ));
            if ($phones) {
                $result['ph'] = array_values($phones);
            }
        }

        // Single-value PII fields
        $singlePii = ['fn', 'ln', 'ge', 'db', 'ct', 'st', 'zp', 'country', 'external_id'];
        foreach ($singlePii as $field) {
            if ($this->{$field} !== null) {
                $result[$field] = [$this->{$field}];
            }
        }

        // Non-PII fields (not in arrays)
        $nonPii = [
            'client_ip_address', 'client_user_agent', 'fbc', 'fbp',
            'subscription_id', 'fb_login_id', 'lead_id',
        ];
        foreach ($nonPii as $field) {
            if ($this->{$field} !== null) {
                $result[$field] = $this->{$field};
            }
        }

        return $result;
    }

    // ── Normalization helpers (per Meta spec) ─────────────────

    private static function normalizeEmail(?string $v): ?string
    {
        if ($v === null || $v === '' || self::isAlreadyHashed($v)) {
            return $v;
        }
        $v = mb_strtolower(trim($v));
        return filter_var($v, FILTER_VALIDATE_EMAIL) ? $v : null;
    }

    private static function normalizePhone(?string $v): ?string
    {
        if ($v === null || $v === '' || self::isAlreadyHashed($v)) {
            return $v;
        }
        $digits = preg_replace('/\D/', '', $v);
        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        }
        return strlen($digits) >= 7 ? $digits : null;
    }

    private static function normalizeName(?string $v): ?string
    {
        if ($v === null || $v === '' || self::isAlreadyHashed($v)) {
            return $v;
        }
        $v = mb_strtolower(trim($v));
        $v = (string) preg_replace('/^(mr|mrs|ms|miss|dr|prof)\.?\s*/i', '', $v);
        if (function_exists('transliterator_transliterate')) {
            $v = transliterator_transliterate('Any-Latin; Latin-ASCII; Lower()', $v);
        }
        $v = (string) preg_replace('/[^a-z\s]/', '', $v);
        return trim($v) ?: null;
    }

    private static function normalizeGender(?string $v): ?string
    {
        if ($v === null || $v === '' || self::isAlreadyHashed($v)) {
            return $v;
        }
        $v = mb_strtolower(trim($v));
        return match (true) {
            str_starts_with($v, 'm'), $v === 'male' => 'm',
            str_starts_with($v, 'f'), $v === 'female' => 'f',
            default => null,
        };
    }

    private static function normalizeDob(?string $v): ?string
    {
        if ($v === null || $v === '' || self::isAlreadyHashed($v)) {
            return $v;
        }
        $v = trim($v);
        if (preg_match('/^\d{8}$/', $v)) {
            return $v;
        }
        foreach (['Y-m-d', 'm/d/Y', 'd/m/Y'] as $fmt) {
            $date = \DateTimeImmutable::createFromFormat($fmt, $v);
            if ($date && $date->format($fmt) === $v) {
                return $date->format('Ymd');
            }
        }
        return null;
    }

    private static function normalizeCity(?string $v): ?string
    {
        if ($v === null || $v === '' || self::isAlreadyHashed($v)) {
            return $v;
        }
        $v = mb_strtolower(trim($v));
        if (function_exists('transliterator_transliterate')) {
            $v = transliterator_transliterate('Any-Latin; Latin-ASCII; Lower()', $v);
        }
        $v = (string) preg_replace('/[^a-z\s]/', '', $v);
        return trim($v) ?: null;
    }

    private static function normalizeState(?string $v): ?string
    {
        if ($v === null || $v === '' || self::isAlreadyHashed($v)) {
            return $v;
        }
        $v = mb_strtolower(trim($v));
        return preg_match('/^[a-z]{2}$/', $v) ? $v : mb_substr($v, 0, 2);
    }

    private static function normalizeZip(?string $v): ?string
    {
        if ($v === null || $v === '' || self::isAlreadyHashed($v)) {
            return $v;
        }
        $v = mb_strtolower(trim(str_replace(' ', '', $v)));
        if (preg_match('/^\d{5}(-\d{4})?$/', $v)) {
            return substr($v, 0, 5);
        }
        return $v ?: null;
    }

    private static function normalizeCountry(?string $v): ?string
    {
        if ($v === null || $v === '' || self::isAlreadyHashed($v)) {
            return $v;
        }
        $v = mb_strtolower(trim($v));
        if (preg_match('/^[a-z]{2}$/', $v)) {
            return $v;
        }
        $map = [
            'united states' => 'us', 'usa' => 'us', 'united kingdom' => 'gb', 'uk' => 'gb',
            'canada' => 'ca', 'australia' => 'au', 'germany' => 'de', 'france' => 'fr',
            'indonesia' => 'id', 'japan' => 'jp', 'india' => 'in', 'brazil' => 'br',
            'singapore' => 'sg', 'malaysia' => 'my', 'philippines' => 'ph', 'thailand' => 'th',
            'cambodia' => 'kh', 'vietnam' => 'vn',
        ];
        return $map[$v] ?? (strlen($v) === 2 ? $v : null);
    }

    private static function isAlreadyHashed(?string $v): bool
    {
        return $v !== null && (bool) preg_match('/^[a-f0-9]{64}$/', $v);
    }
}
