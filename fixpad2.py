import re, pathlib

files = list(pathlib.Path("/app/frontend/app/reports").glob("*.tsx")) + [pathlib.Path("/app/frontend/app/quotes/[id].tsx")]
for p in files:
    src = p.read_text()
    new = src.replace("paddingBottom: 94 }", "paddingBottom: pad + 54 }").replace("paddingBottom: 100 }", "paddingBottom: pad + 58 }")
    if new == src:
        continue
    src = new
    if "useBottomPad" not in src:
        lines = src.split("\n")
        last = max(i for i, l in enumerate(lines) if l.startswith("import "))
        lines.insert(last + 1, 'import { useBottomPad } from "@/src/safe";')
        src = "\n".join(lines)
    if "const pad = useBottomPad();" not in src:
        m = re.search(r"\n(\s*)const insets = useSafeAreaInsets\(\);", src)
        if not m:
            print("NO ANCHOR", p); continue
        src = src[:m.end()] + f"\n{m.group(1)}const pad = useBottomPad();" + src[m.end():]
    p.write_text(src)
    print("ok", p.name)
