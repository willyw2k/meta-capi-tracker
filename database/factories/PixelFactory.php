<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Pixel;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Pixel>
 */
class PixelFactory extends Factory
{
    protected $model = Pixel::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->company() . ' Pixel',
            'pixel_id' => (string) fake()->unique()->numerify('###############'),
            'access_token' => fake()->sha256(),
            'domains' => [fake()->domainName()],
            'is_active' => true,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes): array => [
            'is_active' => false,
        ]);
    }

    public function withTestEventCode(): static
    {
        return $this->state(fn (array $attributes): array => [
            'test_event_code' => 'TEST' . fake()->numerify('####'),
        ]);
    }

    public function allDomains(): static
    {
        return $this->state(fn (array $attributes): array => [
            'domains' => [],
        ]);
    }
}
