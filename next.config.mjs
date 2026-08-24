/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(
    process.env.IMAGINE_VERCEL_BUILD === "1" || process.env.VERCEL === "1"
      ? {}
      : { output: "standalone" }
  )
};

export default nextConfig;
