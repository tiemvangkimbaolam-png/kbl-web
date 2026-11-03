import vinext from 'vinext';
export async function cloudflareConfig() {
    const { cloudflare } = await import('@cloudflare/vite-plugin');
    return {
        plugins: [vinext(), cloudflare({ viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] }, inspectorPort: false, configPath: './wrangler.cloudflare.json' })],
        // Match the existing Sites output layout, with the external-only entry.
        define: { 'process.env.KBL_HOSTING_TARGET': JSON.stringify('cloudflare') },
    };
}
