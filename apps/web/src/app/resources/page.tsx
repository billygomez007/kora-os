import UtilityContentPage from "@/components/marketing/UtilityContentPage";
import { utilityMetadata } from "@/lib/metadata/utility";

export async function generateMetadata() {
  return utilityMetadata("resources");
}

export default function ResourcesPage() {
  return <UtilityContentPage id="resources" />;
}
