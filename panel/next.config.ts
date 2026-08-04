import type { NextConfig } from "next";

// پشت nginx روی مسیر /panel/ سرو می‌شود (نه یک ساب‌دامین جدا، تا نیازی به
// رکورد DNS یا SAN گواهی اضافه نباشد) — basePath همه‌ی route/asset ها را
// خودکار با همین پیشوند تولید می‌کند.
const nextConfig: NextConfig = {
  basePath: "/panel",
  output: "standalone",
  // پیش‌فرض Server Action ها ۱ مگابایت است — برای آپلود پکیج (wheel، tarball)
  // خیلی کم است.
  experimental: {
    serverActions: {
      bodySizeLimit: "200mb",
    },
  },
};

export default nextConfig;
