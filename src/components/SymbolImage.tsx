import { useEffect, useState } from 'react';
import { symbolUrl } from '../lib/symbols/resolver';
import type { SymbolRef } from '../lib/types';

export function SymbolImage({ symbol, alt, className }: { symbol: SymbolRef | null; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setFailed(false);
    setUrl(null);
    if (symbol && symbol !== 'none') symbolUrl(symbol).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [symbol]);
  if (!symbol || symbol === 'none' || failed) return <div className={`sym sym-empty ${className ?? ''}`} aria-hidden />;
  if (!url) return <div className={`sym sym-loading ${className ?? ''}`} aria-hidden />;
  return <img className={`sym ${className ?? ''}`} src={url} alt={alt} draggable={false} onError={() => setFailed(true)} />;
}
