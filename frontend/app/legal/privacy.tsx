import { LegalReader } from "@/src/components/legal-doc";
import { PRIVACY } from "@/src/legal";

export default function PrivacyPolicy() {
  return <LegalReader doc={PRIVACY} testID="legal-privacy-screen" />;
}
