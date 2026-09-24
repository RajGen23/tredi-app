import re, pathlib

root = pathlib.Path("/app/frontend/app")
changed = []
for p in root.rglob("*.tsx"):
    if "(tabs)" in str(p):
        continue
    src = p.read_text()
    orig = src
    lines = src.split("\n")
    out = []
    hit = False
    for ln in lines:
        if "contentContainerStyle" in ln:
            def rep(m):
                n = int(m.group(1))
                if n <= 40:
                    return "paddingBottom: pad"
                return m.group(0)
            new = re.sub(r"paddingBottom: (\d+)", rep, ln)
            if new != ln:
                hit = True
            ln = new
        out.append(ln)
    if not hit:
        continue
    src = "\n".join(out)
    if "useBottomPad" not in src:
        # add import after last import line
        lines = src.split("\n")
        last = max(i for i, l in enumerate(lines) if l.startswith("import "))
        lines.insert(last + 1, 'import { useBottomPad } from "@/src/safe";')
        src = "\n".join(lines)
    if "const pad = useBottomPad();" not in src:
        m = re.search(r"\n(\s*)const insets = useSafeAreaInsets\(\);", src)
        if m:
            src = src[:m.end()] + f"\n{m.group(1)}const pad = useBottomPad();" + src[m.end():]
        else:
            print("NO INSETS ANCHOR", p)
            continue
    p.write_text(src)
    changed.append(str(p))

print(len(changed))
for c in changed:
    print(c)
