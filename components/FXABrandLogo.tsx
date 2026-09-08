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
        width={512}
        height={512}
        priority={priority}
        sizes="(max-width: 640px) 48px, 96px"
        className={`shrink-0 object-contain ${className}`}
      />
    );
  }

  return (
    <Image
      src="/fxa-logo-horizontal.png"
      alt={label}
      width={925}
      height={170}
      priority={priority}
      sizes="(max-width: 640px) 170px, 260px"
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
