import UtilityContentPage from "@/components/marketing/UtilityContentPage";
import { utilityMetadata } from "@/lib/metadata/utility";

export async function generateMetadata() {
  return utilityMetadata("help");
}

export default function HelpPage() {
  return <UtilityContentPage id="help" />;
}
