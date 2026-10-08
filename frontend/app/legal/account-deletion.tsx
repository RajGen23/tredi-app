import { LegalReader } from "@/src/components/legal-doc";
import { DELETION } from "@/src/legal";

export default function AccountDeletion() {
  return <LegalReader doc={DELETION} testID="legal-deletion-screen" />;
}
