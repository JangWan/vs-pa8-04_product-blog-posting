"use client";

import { useQuery } from "@tanstack/react-query";

interface DeviceInfo {
  os: string;
  browser: string;
  deviceType: string;
}

function parseDeviceInfo(ua: string): DeviceInfo {
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua)
      ? "macOS"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Android/.test(ua)
          ? "Android"
          : "Linux";

  /* Edge → Opera → Chrome → Firefox → Safari 순서로 체크 (순서 중요) */
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome/.test(ua)
        ? "Chrome"
        : /Firefox/.test(ua)
          ? "Firefox"
          : /Safari/.test(ua)
            ? "Safari"
            : "알 수 없음";

  const deviceType = /Mobile/.test(ua) ? "모바일" : "데스크톱";

  return { os, browser, deviceType };
}

export function useSessionInfo() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const deviceInfo = parseDeviceInfo(ua);

  const { data, isLoading } = useQuery({
    queryKey: ["session-info"],
    queryFn: async () => {
      const res = await fetch("/api/user/session-info");
      if (!res.ok) throw new Error("Failed to fetch session info");
      return res.json() as Promise<{ ip: string | null }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    ip: data?.ip ?? null,
    os: deviceInfo.os,
    browser: deviceInfo.browser,
    deviceType: deviceInfo.deviceType,
    isLoading,
  };
}
