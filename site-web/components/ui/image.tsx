import React from 'react';

interface ResponsiveImageProps {
  src: string;
  webpSrc?: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
  sizes?: string;
}

export function ResponsiveImage({
  src,
  webpSrc,
  alt,
  width,
  height,
  className = '',
  priority = false,
  sizes = '100vw',
}: ResponsiveImageProps) {
  return (
    <picture>
      {webpSrc && (
        <source 
          srcSet={webpSrc} 
          type="image/webp"
        />
      )}
      <source 
        srcSet={src} 
        type={src.endsWith('.png') ? 'image/png' : 'image/jpeg'}
      />
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={`${className} w-full h-auto`}
        style={{ maxWidth: '100%', height: 'auto' }}
        sizes={sizes}
      />
    </picture>
  );
}