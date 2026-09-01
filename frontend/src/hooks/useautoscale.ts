import { useEffect, useRef, useState } from 'react';

export function useAutoScale<T extends HTMLElement>(baseWidth: number, baseHeight: number) {
  const containerRef = useRef<T>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function updateScale() {
      const availableWidth = window.innerWidth;
      const availableHeight = window.innerHeight;
      const scaleX = availableWidth / baseWidth;
      const scaleY = availableHeight / baseHeight;
      setScale(Math.min(scaleX, scaleY, 1)); // ei koskaan suurenneta yli 1:n, vain pienennetään tarvittaessa
    }

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [baseWidth, baseHeight]);

  return { containerRef, scale };
}