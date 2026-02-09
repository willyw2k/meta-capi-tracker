<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_profiles', function (Blueprint $table) {
            $table->uuid('id')->primary();

            // Primary identifiers (hashed)
            $table->string('external_id', 64)->nullable()->index();
            $table->string('em', 64)->nullable()->index();      // primary email hash
            $table->string('ph', 64)->nullable()->index();      // primary phone hash

            // Additional PII (hashed)
            $table->string('fn', 64)->nullable();
            $table->string('ln', 64)->nullable();
            $table->string('ge', 64)->nullable();
            $table->string('db', 64)->nullable();
            $table->string('ct', 64)->nullable();
            $table->string('st', 64)->nullable();
            $table->string('zp', 64)->nullable();
            $table->string('country', 64)->nullable();

            // Multi-value PII (arrays of hashes)
            $table->json('em_all')->nullable();   // all known email hashes
            $table->json('ph_all')->nullable();   // all known phone hashes

            // Non-PII identifiers
            $table->string('fbp')->nullable();
            $table->string('fbc')->nullable();
            $table->string('visitor_id')->nullable()->index();  // _mt_id

            // Profile metadata
            $table->string('pixel_id')->nullable()->index();
            $table->string('source_domain')->nullable();
            $table->unsignedInteger('event_count')->default(0);
            $table->unsignedSmallInteger('match_quality')->default(0);  // 0-100
            $table->timestamp('first_seen_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            // Composite indexes for enrichment lookups
            $table->index(['visitor_id', 'pixel_id']);
            $table->index(['em', 'pixel_id']);
            $table->index(['ph', 'pixel_id']);
            $table->index(['external_id', 'pixel_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_profiles');
    }
};
