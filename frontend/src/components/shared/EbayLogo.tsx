interface LogoProps {
  width?: number;
  height?: number;
  /** Couleur unique (ex. '#09090B') pour poser le logo sur un fond accent —
   * sans ça, certaines lettres de la marque disparaissent sur fond jaune. */
  mono?: string;
}

export function EbayLogo({ width = 40, height = 16, mono }: LogoProps) {
  return (
    <svg viewBox="0 0 100 40" width={width} height={height} aria-label="eBay">
      <text x="0" y="32" fontSize="40" fontWeight="bold" fontFamily="Arial, sans-serif">
        <tspan fill={mono ?? '#E53238'}>e</tspan>
        <tspan fill={mono ?? '#0064D2'}>B</tspan>
        <tspan fill={mono ?? '#F5AF02'}>a</tspan>
        <tspan fill={mono ?? '#86B817'}>y</tspan>
      </text>
    </svg>
  );
}

export function VintedLogo({ width = 58, height = 16, mono }: LogoProps) {
  return (
    <svg viewBox="0 0 150 40" width={width} height={height} aria-label="Vinted">
      <text
        x="0"
        y="32"
        fontSize="38"
        fontWeight="bold"
        fontStyle="italic"
        fontFamily="Georgia, 'Times New Roman', serif"
        fill={mono ?? '#09B1BA'}
      >
        Vinted
      </text>
    </svg>
  );
}
