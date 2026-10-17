import type { LayoutProps } from "waku/router";
import { SettingsLayout } from "@/routes/settings/-components/settings-layout";

export default function Layout({ children }: LayoutProps<"/settings">) {
  return <SettingsLayout>{children}</SettingsLayout>;
}

export const getConfig = () => ({ render: "dynamic" as const });
