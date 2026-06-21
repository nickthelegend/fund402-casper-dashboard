"use client";

import { ClickProvider } from "@make-software/csprclick-react";
import { useEffect, useState, type ReactNode } from "react";

// CSPR.click app config. Register your app + obtain an appId at
// https://console.cspr.build, then set NEXT_PUBLIC_CSPR_CLICK_APP_ID.
const clickOptions: any = {
  appName: "Fund402",
  appId: process.env.NEXT_PUBLIC_CSPR_CLICK_APP_ID || "fund402-dashboard",
  contentMode: "iframe", // CONTENT_MODE.IFRAME
  providers: ["casper-wallet", "casper-signer", "ledger", "metamask-snap"],
};

export default function Providers({ children }: { children: ReactNode }) {
  // CSPR.click touches browser globals; never render its provider during SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <>{children}</>;
  return <ClickProvider options={clickOptions}>{children}</ClickProvider>;
}
