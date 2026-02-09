<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pixels', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('pixel_id')->unique();
            $table->text('access_token');                  // encrypted
            $table->string('test_event_code')->nullable();
            $table->json('domains')->nullable();           // ["shop.example.com", "*.example.org"]
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['pixel_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pixels');
    }
};
