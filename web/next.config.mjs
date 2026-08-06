/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // @kairos/core lê prompts do disco e usa o SDK da Anthropic — não deve
    // passar pelo bundler.
    serverComponentsExternalPackages: ['@kairos/core', '@anthropic-ai/sdk'],
    // Garante que /prompts vá junto no bundle serverless da Vercel.
    outputFileTracingIncludes: {
      '/**': ['../prompts/**/*.md'],
    },
  },
};

export default nextConfig;
