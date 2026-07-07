import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "firebase-admin",
    "@google-cloud/firestore",
    "@firebase/app",
    "@opentelemetry/api",
  ],
};

export default nextConfig;
