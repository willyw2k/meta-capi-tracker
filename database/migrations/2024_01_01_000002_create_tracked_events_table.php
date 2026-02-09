<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tracked_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('pixel_id')->constrained()->cascadeOnDelete();
            $table->string('event_id')->nullable()->index(); // for deduplication
            $table->string('event_name');
            $table->string('custom_event_name')->nullable();
            $table->string('action_source')->default('website');
            $table->text('event_source_url');
            $table->timestamp('event_time');
            $table->text('user_data');                        // encrypted JSON
            $table->json('custom_data')->nullable();
            $table->string('status')->default('pending')->index();
            $table->json('meta_response')->nullable();
            $table->string('fbtrace_id')->nullable();
            $table->text('error_message')->nullable();
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->index(['pixel_id', 'status']);
            $table->index(['pixel_id', 'event_name']);
            $table->index(['event_id', 'pixel_id']);          // deduplication index
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tracked_events');
    }
};
