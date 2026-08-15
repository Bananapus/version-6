process.env.PORT ??= "3004";
process.env.HOSTNAME ??= "0.0.0.0";

// Keep the npm start boundary fail-closed before the listener is created. The
// same parser runs at build time and again inside production Proxy.
const { loadWebSecurityConfig } = await import(
  "../src/server/security/config.ts"
);
loadWebSecurityConfig(process.env);

await import("../.next/standalone/server.js");
