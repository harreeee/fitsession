from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"updated {path}")


# Login: use the official rectangular mark as a mark, not as a cropped square icon.
replace_once(
    "app/login/page.tsx",
    '''          <Image\n            src="/icon.png"\n            alt="FXA FITNESS"\n            width={64}\n            height={64}\n            priority\n            className="mx-auto h-16 w-16 rounded-2xl object-cover"\n          />''',
    '''          <Image\n            src="/fxa-logo.png"\n            alt="FXA FITNESS"\n            width={96}\n            height={70}\n            priority\n            className="mx-auto h-[70px] w-24 object-contain"\n          />''',
)
replace_once(
    "app/login/page.tsx",
    '''            <Image\n              src="/icon.png"\n              alt="FXA FITNESS"\n              width={44}\n              height={44}\n              priority\n              className="h-11 w-11 rounded-2xl object-cover shadow-md"\n            />''',
    '''            <Image\n              src="/fxa-logo.png"\n              alt="FXA FITNESS"\n              width={62}\n              height={45}\n              priority\n              className="h-11 w-[62px] shrink-0 object-contain"\n            />''',
)
replace_once(
    "app/login/page.tsx",
    '''                  <Image\n                    src="/icon.png"\n                    alt="FXA FITNESS"\n                    width={80}\n                    height={80}\n                    priority\n                    className="mx-auto h-20 w-20 rounded-[1.75rem] object-cover shadow-xl"\n                  />''',
    '''                  <Image\n                    src="/fxa-logo.png"\n                    alt="FXA FITNESS"\n                    width={116}\n                    height={84}\n                    priority\n                    className="mx-auto h-[84px] w-[116px] object-contain drop-shadow-lg"\n                  />''',
)

# Admin dashboard header.
replace_once(
    "app/admin/page.tsx",
    '''            <Image\n              src="/icon.png"\n              alt="FXA FITNESS"\n              width={32}\n              height={32}\n              priority\n              className="h-8 w-8 rounded-lg object-cover"\n            />''',
    '''            <Image\n              src="/fxa-logo.png"\n              alt="FXA FITNESS"\n              width={46}\n              height={34}\n              priority\n              className="h-8 w-[46px] shrink-0 object-contain"\n            />''',
)

# Client portal header.
replace_once(
    "app/client/page.tsx",
    '''            <NextImage\n              src="/icon.png"\n              alt="FXA FITNESS"\n              width={36}\n              height={36}\n              priority\n              className="h-9 w-9 rounded-xl object-cover"\n            />''',
    '''            <NextImage\n              src="/fxa-logo.png"\n              alt="FXA FITNESS"\n              width={52}\n              height={38}\n              priority\n              className="h-9 w-[52px] shrink-0 object-contain"\n            />''',
)

# Trainer/staff home header.
replace_once(
    "app/trainer/scan/page.tsx",
    '''            <Image\n              src="/icon.png"\n              alt="FXA FITNESS"\n              width={54}\n              height={54}\n              priority\n              className="h-[54px] w-[54px] rounded-xl object-cover"\n            />''',
    '''            <Image\n              src="/fxa-logo.png"\n              alt="FXA FITNESS"\n              width={72}\n              height={52}\n              priority\n              className="h-[52px] w-[72px] shrink-0 object-contain"\n            />''',
)

# Sanity check: visible UI should no longer render the square app icon in these main brand positions.
for path in [
    "app/login/page.tsx",
    "app/admin/page.tsx",
    "app/client/page.tsx",
    "app/trainer/scan/page.tsx",
]:
    text = Path(path).read_text(encoding="utf-8")
    if 'src="/icon.png"' in text:
        print(f"warning: {path} still contains /icon.png in another context")

print("official FXA UI logo patch complete")
