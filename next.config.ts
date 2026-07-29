import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "firebase-admin",
    "@google-cloud/firestore",
    "@firebase/app",
    "@opentelemetry/api",
  ],
  async redirects() {
    return [
      {
        source: '/agency/agencies/:agencyId/pricing',
        destination: '/agency/agencies/:agencyId/clinics',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
