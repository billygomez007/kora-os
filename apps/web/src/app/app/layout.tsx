import type { ReactNode } from "react";
import BackToDashboard from "@/components/workspace/BackToDashboard";

export default function AppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <>
      <BackToDashboard />
      {children}
    </>
  );
}
