import type { NextRequest } from "next/server";
import { loadWebSecurityConfig } from "@/server/security/config";
import { createWebSecurityProxy } from "@/server/security/proxy";

const webSecurityConfig = loadWebSecurityConfig(process.env);
const webSecurityProxy = createWebSecurityProxy(webSecurityConfig);

export function proxy(request: NextRequest) {
  return webSecurityProxy(request);
}

export const config = {
  matcher: [
    "/((?!_next/static(?:/|$)|_next/image(?:/|$)|favicon\\.ico$|icon\\.svg$|manifest\\.webmanifest$|sw\\.js$).*)",
  ],
};
