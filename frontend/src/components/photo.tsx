// An item's photo lives behind an authenticated URL, so the source has to be
// resolved (token in the query) before the image loads. Until then — or when
// the shop has not added a photo yet — a flat block keeps the grid from jumping.
//
// Lists pass `size` (the box's width in points): the server then sends a small
// copy instead of the full photo, and expo-image keeps it in memory and on disk,
// so scrolling back up never downloads it again.
import { useEffect, useState } from "react";
import { PixelRatio, View } from "react-native";
import type { ImageStyle, StyleProp } from "react-native";
import { Image } from "expo-image";

import { photoUrl, photoUrlNow } from "@/src/uploads";

/** The thumbnail width to ask for: the box at screen density. */
function thumbWidth(size?: number) {
  return size ? Math.round(size * Math.min(PixelRatio.get(), 3)) : undefined;
}

export function Photo({ url, fallback, style, size, testID }: {
  url?: string | null; fallback?: string; style: StyleProp<ImageStyle>;
  /** Width of the box in points; set it in lists so a small copy is loaded. */
  size?: number;
  testID?: string;
}) {
  const w = thumbWidth(size);
  const [uri, setUri] = useState(() => (url ? photoUrlNow(url, w) : ""));

  useEffect(() => {
    if (!url) return;
    let live = true;
    photoUrl(url, w).then((u) => { if (live) setUri((old) => (old === u ? old : u)); });
    return () => { live = false; };
  }, [url, w]);

  if (!url || !uri) return <View testID={testID} style={[style, fallback ? { backgroundColor: fallback } : null]} />;
  return (
    <Image
      testID={testID}
      // keyed without the token, so signing in again doesn't throw the cache away
      source={{ uri, cacheKey: `${url}|${w ?? "full"}` }}
      style={[style, fallback ? { backgroundColor: fallback } : null]}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={url ?? undefined}
      transition={120}
    />
  );
}
