/** 图片点击放大预览（F3.10） */
import { memo } from 'react';

export interface ImageLightboxProps {
  src: string | null;
  alt: string;
  onClose: () => void;
}

export const ImageLightbox = memo(function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  if (!src) return null;
  return (
    <div className="mk-lightbox" onClick={onClose} role="dialog" aria-label="图片预览">
      <img src={src} alt={alt} className="mk-lightbox-img" />
      <div className="mk-lightbox-hint">{alt || '点击任意处关闭'}</div>
    </div>
  );
});
