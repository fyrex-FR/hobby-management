export function EbayLogo({ width = 40, height = 16 }: { width?: number; height?: number }) {
  return (
    <svg viewBox="0 0 100 40" width={width} height={height} aria-label="eBay">
      <text x="0" y="32" fontSize="40" fontWeight="bold" fontFamily="Arial, sans-serif">
        <tspan fill="#E53238">e</tspan>
        <tspan fill="#0064D2">B</tspan>
        <tspan fill="#F5AF02">a</tspan>
        <tspan fill="#86B817">y</tspan>
      </text>
    </svg>
  );
}
