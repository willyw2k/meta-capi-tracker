<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('match_quality_logs', function (Blueprint $table) {
            $table->id();
            $table->string('pixel_id', 20)->index();
            $table->string('event_name', 50);
            $table->string('source_domain')->nullable();

            // Match quality breakdown
            $table->unsignedSmallInteger('score')->default(0);  // 0-100
            $table->boolean('has_em')->default(false);
            $table->boolean('has_ph')->default(false);
            $table->boolean('has_fn')->default(false);
            $table->boolean('has_ln')->default(false);
            $table->boolean('has_external_id')->default(false);
            $table->boolean('has_fbp')->default(false);
            $table->boolean('has_fbc')->default(false);
            $table->boolean('has_ip')->default(false);
            $table->boolean('has_ua')->default(false);
            $table->boolean('has_address')->default(false);  // ct+st+zp+country

            // Enrichment tracking
            $table->boolean('was_enriched')->default(false);
            $table->unsignedSmallInteger('score_before_enrichment')->default(0);
            $table->string('enrichment_source')->nullable();  // profile, ip_geo, phone_prefix

            $table->date('event_date')->index();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['pixel_id', 'event_date']);
            $table->index(['event_name', 'event_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('match_quality_logs');
    }
};
