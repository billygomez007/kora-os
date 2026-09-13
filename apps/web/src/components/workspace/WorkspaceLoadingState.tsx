"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

type WorkspaceLoadingStateProps = {
  variant?: "content" | "fullscreen";
};

/**
 * Branded loading state for workspace-level access and route transitions.
 *
 * The component is intentionally presentation-only. WorkspaceShell still
 * performs the same access resolution before rendering its children.
 */
export default function WorkspaceLoadingState({
  variant = "content",
}: WorkspaceLoadingStateProps) {
  const t = useTranslations("Workspace");

  return (
    <div
      className={`workspace-loading-state workspace-loading-state--${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="workspace-loading-mark" aria-hidden="true">
        <span className="workspace-loading-halo" />
        <span className="workspace-loading-ring" />
        <Image
          src="/brand/kora-app-icon.png"
          alt=""
          width={68}
          height={68}
          priority
        />
      </div>

      <div className="workspace-loading-copy">
        <strong>{t("preparingWorkspace")}</strong>
        <span>{t("preparingWorkspaceBody")}</span>
      </div>

      <span className="workspace-loading-progress" aria-hidden="true">
        <span />
      </span>
    </div>
  );
}
