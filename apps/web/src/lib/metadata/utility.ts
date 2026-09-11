import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export type UtilityMetadataId =
  | "features"
  | "pricing"
  | "resources"
  | "help"
  | "privacy";

export async function utilityMetadata(
  id: UtilityMetadataId,
): Promise<Metadata> {
  const t = await getTranslations(id === "pricing" ? "Pricing" : `Utility.${id}`);

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}
