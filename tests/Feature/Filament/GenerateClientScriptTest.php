<?php

declare(strict_types=1);

namespace Tests\Feature\Filament;

use App\Filament\Resources\PixelResource\Pages\ListPixels;
use App\Filament\Resources\PixelResource\Pages\ViewPixel;
use App\Models\Pixel;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GenerateClientScriptTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->actingAs(User::factory()->create());
    }

    public function testViewPixelPageHasGenerateScriptAction(): void
    {
        $pixel = Pixel::factory()->create();

        $this->get(ViewPixel::getUrl(['record' => $pixel]))
            ->assertSuccessful();

        $component = livewire(ViewPixel::class, ['record' => $pixel->getRouteKey()])
            ->assertActionExists('generate_script');

        $component->callAction('generate_script')
            ->assertSee($pixel->pixel_id);
    }

    public function testGenerateScriptContainsPixelId(): void
    {
        $pixel = Pixel::factory()->create([
            'pixel_id' => '123456789012345',
        ]);

        livewire(ViewPixel::class, ['record' => $pixel->getRouteKey()])
            ->callAction('generate_script')
            ->assertSee('123456789012345');
    }

    public function testGenerateScriptContainsEndpointUrl(): void
    {
        $pixel = Pixel::factory()->create();

        livewire(ViewPixel::class, ['record' => $pixel->getRouteKey()])
            ->callAction('generate_script')
            ->assertSee('/api/v1/track/event')
            ->assertSee('/api/v1/track.js');
    }

    public function testGenerateScriptShowsTestEventCodeWarning(): void
    {
        $pixel = Pixel::factory()->withTestEventCode()->create();

        livewire(ViewPixel::class, ['record' => $pixel->getRouteKey()])
            ->callAction('generate_script')
            ->assertSee($pixel->test_event_code);
    }

    public function testGenerateScriptShowsDomains(): void
    {
        $pixel = Pixel::factory()->create([
            'domains' => ['example.com', 'shop.example.com'],
        ]);

        livewire(ViewPixel::class, ['record' => $pixel->getRouteKey()])
            ->callAction('generate_script')
            ->assertSee('example.com')
            ->assertSee('shop.example.com');
    }

    public function testGenerateScriptShowsAllDomainsMessageWhenNoDomainRestriction(): void
    {
        $pixel = Pixel::factory()->allDomains()->create();

        livewire(ViewPixel::class, ['record' => $pixel->getRouteKey()])
            ->callAction('generate_script')
            ->assertSee('all domains');
    }

    public function testTableHasGenerateScriptAction(): void
    {
        $pixel = Pixel::factory()->create();

        livewire(ListPixels::class)
            ->assertCanSeeTableRecords([$pixel])
            ->assertTableActionExists('generate_script');
    }
}
