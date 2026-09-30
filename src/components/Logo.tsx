import Image from "next/image";

/** Logo de Artigot Catering (public/logo.png, 588×185). */
export function Logo({ height = 40, className = "" }: { height?: number; className?: string }) {
  return (
    <Image src="/logo.png" alt="Artigot Catering" width={Math.round((height * 588) / 185)} height={height} priority className={className} />
  );
}
