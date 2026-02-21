/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/SoundPad',
  assetPrefix: '/SoundPad/',
  images: {
    unoptimized: true,
  },
}

export default nextConfig
