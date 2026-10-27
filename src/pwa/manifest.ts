// CAL-017 Contract Block 1: the web app manifest, as a typed object that
// vite.config.ts hands to vite-plugin-pwa and a unit test can read. No
// Vite-only imports: Playwright's loader imports this file too.

export type ManifestIcon = {
  src: string;
  sizes: string;
  type: "image/png";
  purpose?: "maskable";
};

// CAL-022 Contract Block 1 (architecture.md, "Share target"): Android's share
// sheet POSTs a multipart form to /share, which the service worker answers.
export type ShareTarget = {
  action: "/share";
  method: "POST";
  enctype: "multipart/form-data";
  params: {
    title: "title";
    text: "text";
    url: "url";
    files: [{ name: "image"; accept: ["image/*"] }];
  };
};

export const manifest: {
  name: "Clean Calendar";
  short_name: string;
  start_url: "/";
  scope: "/";
  display: "standalone";
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
  share_target: ShareTarget;
} = {
  name: "Clean Calendar",
  short_name: "Calendar",
  start_url: "/",
  scope: "/",
  display: "standalone",
  // The LIGHT --color-surface-raised and --color-surface (src/styles/tokens.css).
  theme_color: "#f6f7f9",
  background_color: "#ffffff",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    {
      src: "/icons/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
  share_target: {
    action: "/share",
    method: "POST",
    enctype: "multipart/form-data",
    params: {
      title: "title",
      text: "text",
      url: "url",
      files: [{ name: "image", accept: ["image/*"] }],
    },
  },
};
