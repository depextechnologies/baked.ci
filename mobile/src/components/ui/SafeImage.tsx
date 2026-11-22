import { Image, type ImageProps } from 'expo-image';
import React, { useEffect, useState } from 'react';

type Props = Omit<ImageProps, 'source' | 'onError'> & { source?: string | number | null; fallback?: React.ReactNode; retries?: number };

const withRetry = (src: string, n: number) => (n ? `${src}${src.includes('?') ? '&' : '?'}r=${n}` : src);

// Backend image that retries a failed load, then shows the given fallback (local art or icon) in the same box.
export function SafeImage({ source, fallback = null, retries = 2, ...rest }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setAttempt(0); setFailed(false); }, [source]);
  useEffect(() => {
    if (!failed || typeof source !== 'string' || attempt >= retries) return;
    const id = setTimeout(() => { setAttempt((a) => a + 1); setFailed(false); }, 1200 * (attempt + 1));
    return () => clearTimeout(id);
  }, [failed, attempt, retries, source]);
  if (!source || (failed && (typeof source !== 'string' || attempt >= retries))) return <>{fallback}</>;
  const src = typeof source === 'string' ? withRetry(source, attempt) : source;
  return <Image key={attempt} source={src} cachePolicy="memory-disk" {...rest} onError={() => setFailed(true)} />;
}
