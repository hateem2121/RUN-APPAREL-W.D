import { withPayload } from '@payloadcms/next/withPayload'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

// Makes wrangler.jsonc bindings (local D1/R2 emulation) available during `next dev`.
initOpenNextCloudflareForDev()

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@run-apparel/shared'],
}

export default withPayload(nextConfig)
