import Image from 'next/image';

type FXABrandLogoProps = {
  className?: string;
  priority?: boolean;
  variant?: 'horizontal' | 'mark';
  label?: string;
};

export default function FXABrandLogo({
  className = '',
  priority = false,
  variant = 'horizontal',
  label = 'FXA FITNESS',
}: FXABrandLogoProps) {
  if (variant === 'mark') {
    return (
      <Image
        src="/icon.png"
        alt={label}
        width={96}
        height={96}
        priority={priority}
        sizes="96px"
        className={`shrink-0 object-contain ${className}`}
      />
    );
  }

  return (
    <span
      aria-label={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg border border-yellow-400/25 bg-black px-2.5 py-1 shadow-[0_0_18px_rgba(250,204,21,0.08)] ${className}`}
    >
      <span className="whitespace-nowrap text-[20px] font-black uppercase leading-none tracking-[-0.04em] text-yellow-400 sm:text-[22px]">
        FXA FITNESS
      </span>
    </span>
  );
}
