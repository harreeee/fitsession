from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly 1 match, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"updated {path}")


def add_import_after(path: str, anchor: str, import_line: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if import_line in text:
        print(f"import already present in {path}")
        return
    count = text.count(anchor)
    if count != 1:
        raise SystemExit(f"{path}: import anchor expected once, found {count}")
    p.write_text(text.replace(anchor, anchor + import_line, 1), encoding="utf-8")
    print(f"added Image import to {path}")


# Remove the global floating logo that followed every page in the top-left corner.
replace_once("app/layout.tsx", 'import Image from "next/image";\n', "")
replace_once(
    "app/layout.tsx",
    '            <div className="fixed left-4 top-4 z-[100]"><div className="rounded-2xl border border-yellow-400/30 bg-black/80 p-2 shadow-2xl backdrop-blur-md"><Image src="/icon.png" alt="FXA FITNESS" width={64} height={64} priority className="h-14 w-14 rounded-xl object-cover md:h-16 md:w-16" /></div></div>\n',
    "",
)

# Admin dashboard: replace the temporary F badge with the official logo.
add_import_after("app/admin/page.tsx", 'import Link from "next/link";\n', 'import Image from "next/image";\n')
replace_once(
    "app/admin/page.tsx",
    '''            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-yellow-400/30 bg-yellow-400/15 text-sm font-black text-yellow-400">\n              F\n            </div>''',
    '''            <Image\n              src="/icon.png"\n              alt="FXA FITNESS"\n              width={32}\n              height={32}\n              priority\n              className="h-8 w-8 rounded-lg object-cover"\n            />''',
)

# Main login page: replace every text-built FXA mark with the real brand asset.
add_import_after("app/login/page.tsx", 'import Link from "next/link";\n', 'import Image from "next/image";\n')
replace_once(
    "app/login/page.tsx",
    '''          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-black text-lg font-black text-yellow-300">\n            FXA\n          </div>''',
    '''          <Image\n            src="/icon.png"\n            alt="FXA FITNESS"\n            width={64}\n            height={64}\n            priority\n            className="mx-auto h-16 w-16 rounded-2xl object-cover"\n          />''',
)
replace_once(
    "app/login/page.tsx",
    '''            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-sm font-black tracking-tight text-yellow-300 shadow-md">\n              FXA\n            </div>''',
    '''            <Image\n              src="/icon.png"\n              alt="FXA FITNESS"\n              width={44}\n              height={44}\n              priority\n              className="h-11 w-11 rounded-2xl object-cover shadow-md"\n            />''',
)
replace_once(
    "app/login/page.tsx",
    '''                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-black text-xl font-black tracking-tight text-yellow-300 shadow-xl">\n                    FXA\n                  </div>''',
    '''                  <Image\n                    src="/icon.png"\n                    alt="FXA FITNESS"\n                    width={80}\n                    height={80}\n                    priority\n                    className="mx-auto h-20 w-20 rounded-[1.75rem] object-cover shadow-xl"\n                  />''',
)

# Client portal header: replace the FXA text tile with the official logo.
add_import_after("app/client/page.tsx", 'import Link from "next/link";\n', 'import Image from "next/image";\n')
replace_once(
    "app/client/page.tsx",
    '''            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-yellow-400/20 bg-yellow-400/[0.08] text-sm font-black text-yellow-400">\n              FXA\n            </div>''',
    '''            <Image\n              src="/icon.png"\n              alt="FXA FITNESS"\n              width={36}\n              height={36}\n              priority\n              className="h-9 w-9 rounded-xl object-cover"\n            />''',
)

# Trainer / staff home: replace the hand-built F-X-A wordmark with the real logo.
add_import_after("app/trainer/scan/page.tsx", 'import Link from "next/link";\n', 'import Image from "next/image";\n')
replace_once(
    "app/trainer/scan/page.tsx",
    '''            <div className="leading-none">\n              <div className="text-[28px] font-black italic tracking-[-0.08em] text-white">\n                F<span className="text-yellow-400">X</span>A\n              </div>\n              <div className="mt-1 text-[9px] font-black tracking-[0.36em] text-white">\n                FITNESS\n              </div>\n              <div className="mt-1 text-[7px] font-bold uppercase tracking-[0.18em] text-yellow-400">\n                Stronger everyday\n              </div>\n            </div>''',
    '''            <Image\n              src="/icon.png"\n              alt="FXA FITNESS"\n              width={54}\n              height={54}\n              priority\n              className="h-[54px] w-[54px] rounded-xl object-cover"\n            />''',
)

print("\nPotential remaining text-built FXA marks:")
found = False
for p in Path("app").rglob("*.tsx"):
    text = p.read_text(encoding="utf-8")
    markers = []
    compact = text.replace(" ", "").replace("\n", "")
    if ">FXA<" in compact:
        markers.append("FXA element")
    if "F<span className=" in text and ">X</span>A" in text:
        markers.append("hand-built F-X-A")
    if markers:
        found = True
        print(f" - {p}: {', '.join(markers)}")
if not found:
    print(" - none")
