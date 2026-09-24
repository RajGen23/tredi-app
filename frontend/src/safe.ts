// Room under a pinned footer. A phone that reports a bottom inset (iPhone home
// bar, Android gesture bar) gets that plus a little air; a phone whose window
// stops at a three-button navigation bar reports nothing, so we still leave a
// thumb's width so Save never sits on top of the system Back button.
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function useBottomPad(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom + 8, 28);
}
