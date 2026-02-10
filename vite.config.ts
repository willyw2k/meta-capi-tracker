import {defineConfig} from 'vite';
import laravel from 'laravel-vite-plugin';
import path from 'path';

/** @type {import('vite').UserConfig} */
export default defineConfig({
    plugins: [
        laravel({
            input: [
                'resources/css/app.css',
                'resources/js/meta-tracker.ts',

            ],
            refresh: true,
        }),
    ],
    server: {
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
    resolve: {
        alias: [
            {
                find: '@',
                replacement: path.resolve(__dirname, 'resources/js'),
            },
        ],
    },
    esbuild: {
        jsx: 'automatic',
    },
});
