import UtilityContentPage from "@/components/marketing/UtilityContentPage";
import { utilityMetadata } from "@/lib/metadata/utility";

export async function generateMetadata() {
  return utilityMetadata("pricing");
}

export default function PricingPage() {
  return <UtilityContentPage id="pricing" />;
}
