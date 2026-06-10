import Image from "next/image";

type BrandMarkProps = {
  size?: "nav" | "login";
  className?: string;
  priority?: boolean;
};

const MARK_SIZES = {
  nav: {
    shell: "h-8 w-8 rounded-xl",
    image: 26,
  },
  login: {
    shell: "h-11 w-11 rounded-2xl",
    image: 36,
  },
} as const;

export function BrandMark({ size = "nav", className = "", priority = false }: BrandMarkProps) {
  const config = MARK_SIZES[size];

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border ${config.shell} ${className}`}
      style={{
        background: "rgba(255, 252, 247, 0.96)",
        borderColor: "rgba(38, 36, 32, 0.12)",
        boxShadow: "0 2px 10px rgba(38, 36, 32, 0.12)",
      }}
      aria-hidden="true"
      data-brand-mark
    >
      <Image
        src="/icons/nosite-logo.svg"
        alt=""
        width={config.image}
        height={config.image}
        priority={priority}
        unoptimized
      />
    </span>
  );
}
