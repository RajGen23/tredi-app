// An item's photo lives behind an authenticated URL, so the source has to be
// resolved (header on native, token in the query on web) before <Image> sees
// it. Until then — or when the shop has not added a photo yet — a flat block
// keeps the grid from jumping.
import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import type { ImageStyle, StyleProp } from "react-native";

import { photoSource } from "@/src/uploads";

export function Photo({ url, fallback, style, testID }: { url?: string | null; fallback?: string; style: StyleProp<ImageStyle>; testID?: string }) {
  const [src, setSrc] = useState<{ uri: string } | null>(null);

  useEffect(() => {
    if (!url) return setSrc(null);
    let live = true;
    photoSource(url).then((s) => { if (live) setSrc(s as { uri: string }); });
    return () => { live = false; };
  }, [url]);

  return src
    ? <Image testID={testID} source={src} style={style} resizeMode="cover" />
    : <View testID={testID} style={[style, fallback ? { backgroundColor: fallback } : null]} />;
}
