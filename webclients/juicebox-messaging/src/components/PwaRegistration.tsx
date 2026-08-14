"use client";

import { useEffect } from "react";

const SERVICE_WORKER_PATH = "/sw.js";
const SERVICE_WORKER_POLICY_NAME = "juicebox-messaging#service-worker";

interface PwaRegistrationProps {
  readonly requiresTrustedScriptUrl?: boolean;
}

interface PrivateTrustedTypePolicy {
  createScriptURL(value: string): unknown;
}

interface PrivateTrustedTypePolicyFactory {
  createPolicy(
    name: string,
    rules: { readonly createScriptURL: (value: string) => string },
  ): PrivateTrustedTypePolicy;
}

type TrustedTypesWindow = typeof window & {
  readonly trustedTypes?: PrivateTrustedTypePolicyFactory;
};

let trustedServiceWorkerScriptUrl: unknown;

export function PwaRegistration({
  requiresTrustedScriptUrl = false,
}: PwaRegistrationProps) {
  useEffect(() => {
    // The worker is origin-wide. Embedded documents must neither install nor
    // remove it; only an explicit top-level first-party client owns lifecycle.
    if (window.top !== window.self) return;
    if (!("serviceWorker" in navigator)) return;
    void registerServiceWorker(requiresTrustedScriptUrl).catch(() => undefined);
  }, [requiresTrustedScriptUrl]);

  return null;
}

async function registerServiceWorker(
  requiresTrustedScriptUrl: boolean,
): Promise<void> {
  const scriptUrl = requiresTrustedScriptUrl
    ? createPrivateServiceWorkerScriptUrl()
    : SERVICE_WORKER_PATH;
  await navigator.serviceWorker.register(scriptUrl as string, { scope: "/" });
}

function createPrivateServiceWorkerScriptUrl(): unknown {
  if (trustedServiceWorkerScriptUrl !== undefined) {
    return trustedServiceWorkerScriptUrl;
  }

  const factory = (window as TrustedTypesWindow).trustedTypes;
  if (factory === undefined) return SERVICE_WORKER_PATH;

  const policy = factory.createPolicy(SERVICE_WORKER_POLICY_NAME, {
    createScriptURL(value) {
      if (value !== SERVICE_WORKER_PATH) {
        throw new TypeError("Service worker script URL is outside policy.");
      }
      return SERVICE_WORKER_PATH;
    },
  });
  trustedServiceWorkerScriptUrl = policy.createScriptURL(SERVICE_WORKER_PATH);
  return trustedServiceWorkerScriptUrl;
}
