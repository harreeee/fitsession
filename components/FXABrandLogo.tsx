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
    <Image
      src="/fxa-logo-horizontal.png"
      alt={label}
      width={800}
      height={144}
      priority={priority}
      sizes="(max-width: 640px) 164px, 220px"
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
