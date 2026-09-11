import UtilityContentPage from "@/components/marketing/UtilityContentPage";
import { utilityMetadata } from "@/lib/metadata/utility";

export async function generateMetadata() {
  return utilityMetadata("privacy");
}

export default function PrivacyPage() {
  return <UtilityContentPage id="privacy" />;
}
