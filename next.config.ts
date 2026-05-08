import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: "/Users/alperozgulm3/clinicbridge-panel",
  },
  serverExternalPackages: [
    "firebase-admin",
    "@google-cloud/firestore",
    "@firebase/app",
    "@opentelemetry/api",
  ],
};

export default nextConfig;
