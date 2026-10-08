import { LegalReader } from "@/src/components/legal-doc";
import { TERMS } from "@/src/legal";

export default function TermsAndConditions() {
  return <LegalReader doc={TERMS} testID="legal-terms-screen" />;
}
