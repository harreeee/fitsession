from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly 1 match, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"updated {path}")


replace_once(
    "app/admin/page.tsx",
    'import Image from "next/image";\n',
    'import FXABrandLogo from "@/components/FXABrandLogo";\n',
)
replace_once(
    "app/admin/page.tsx",
    '''          <div className="flex items-center gap-3">\n            <Image\n              src="/fxa-logo.png"\n              alt="FXA FITNESS"\n              width={46}\n              height={34}\n              priority\n              className="h-8 w-[46px] shrink-0 object-contain"\n            />\n\n            <div>\n              <p className="text-sm font-bold leading-none text-white">\n                FXA FITNESS\n              </p>\n\n              <p className="mt-0.5 text-[10px] uppercase leading-none tracking-widest text-zinc-600">\n                {getRoleLabel(currentRole)} Dashboard\n              </p>\n            </div>\n          </div>''',
    '''          <div className="flex items-center gap-3">\n            <FXABrandLogo\n              priority\n              className="h-8 w-[150px] sm:h-10 sm:w-[178px]"\n            />\n\n            <p className="hidden text-[10px] uppercase leading-none tracking-widest text-zinc-600 sm:block">\n              {getRoleLabel(currentRole)} Dashboard\n            </p>\n          </div>''',
)

replace_once(
    "app/login/page.tsx",
    'import Image from "next/image";\n',
    'import FXABrandLogo from "@/components/FXABrandLogo";\n',
)
replace_once(
    "app/login/page.tsx",
    '''          <Image\n            src="/fxa-logo.png"\n            alt="FXA FITNESS"\n            width={96}\n            height={70}\n            priority\n            className="mx-auto h-[70px] w-24 object-contain"\n          />''',
    '''          <FXABrandLogo\n            priority\n            className="mx-auto h-14 w-[220px]"\n          />''',
)
replace_once(
    "app/login/page.tsx",
    '''          <Link href="/" className="flex items-center gap-3">\n            <Image\n              src="/fxa-logo.png"\n              alt="FXA FITNESS"\n              width={62}\n              height={45}\n              priority\n              className="h-11 w-[62px] shrink-0 object-contain"\n            />\n\n            <div>\n              <p className="text-base font-black tracking-tight text-zinc-950 sm:text-lg">\n                FXA FITNESS\n              </p>\n              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">\n                Member Portal\n              </p>\n            </div>\n          </Link>''',
    '''          <Link href="/" className="flex items-center gap-3">\n            <div>\n              <FXABrandLogo\n                priority\n                className="h-10 w-[184px] sm:h-11 sm:w-[210px]"\n              />\n              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">\n                Member Portal\n              </p>\n            </div>\n          </Link>''',
)
replace_once(
    "app/login/page.tsx",
    '''                  <Image\n                    src="/fxa-logo.png"\n                    alt="FXA FITNESS"\n                    width={116}\n                    height={84}\n                    priority\n                    className="mx-auto h-[84px] w-[116px] object-contain drop-shadow-lg"\n                  />\n\n                  <p className="mt-5 text-[11px] font-black uppercase tracking-[0.32em] text-yellow-600">\n                    FXA FITNESS\n                  </p>''',
    '''                  <FXABrandLogo\n                    priority\n                    className="mx-auto h-16 w-[260px] drop-shadow-lg"\n                  />''',
)

replace_once(
    "app/client/page.tsx",
    'import NextImage from "next/image";\n',
    'import FXABrandLogo from "@/components/FXABrandLogo";\n',
)
replace_once(
    "app/client/page.tsx",
    '''            <NextImage\n              src="/fxa-logo.png"\n              alt="FXA FITNESS"\n              width={52}\n              height={38}\n              priority\n              className="h-9 w-[52px] shrink-0 object-contain"\n            />\n            <div>\n              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-yellow-400">\n                FXA Fitness\n              </p>\n              <p className="mt-0.5 text-xs text-zinc-500">Client Portal</p>\n            </div>''',
    '''            <div>\n              <FXABrandLogo\n                priority\n                className="h-8 w-[150px]"\n              />\n              <p className="mt-0.5 text-xs text-zinc-500">Client Portal</p>\n            </div>''',
)

replace_once(
    "app/trainer/scan/page.tsx",
    'import Image from "next/image";\n',
    'import FXABrandLogo from "@/components/FXABrandLogo";\n',
)
replace_once(
    "app/trainer/scan/page.tsx",
    '''            <Image\n              src="/fxa-logo.png"\n              alt="FXA FITNESS"\n              width={72}\n              height={52}\n              priority\n              className="h-[52px] w-[72px] shrink-0 object-contain"\n            />''',
    '''            <FXABrandLogo\n              priority\n              className="h-11 w-[196px] sm:h-12 sm:w-[214px]"\n            />''',
)

# Guard against re-introducing the old cropped logo asset in header UI code.
for path in [
    "app/admin/page.tsx",
    "app/login/page.tsx",
    "app/client/page.tsx",
    "app/trainer/scan/page.tsx",
]:
    text = Path(path).read_text(encoding="utf-8")
    if "/fxa-logo.png" in text:
        raise SystemExit(f"{path}: still references /fxa-logo.png in UI")
    if 'next/image' in text and path in {"app/admin/page.tsx", "app/login/page.tsx", "app/client/page.tsx", "app/trainer/scan/page.tsx"}:
        raise SystemExit(f"{path}: direct next/image import remains; use FXABrandLogo")

print("FXA logo UI patch complete.")
