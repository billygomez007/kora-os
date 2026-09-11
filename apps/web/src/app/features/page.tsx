import UtilityContentPage from "@/components/marketing/UtilityContentPage";
import { utilityMetadata } from "@/lib/metadata/utility";

export async function generateMetadata() {
  return utilityMetadata("features");
}

export default function FeaturesPage() {
  return <UtilityContentPage id="features" />;
}
