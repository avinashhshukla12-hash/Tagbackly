import { useState } from 'react';
import heroShowcaseImg from '../assets/images/hero_tagbackly_showcase_1794551249269.jpg';
import laptopBagTagImg from '../assets/images/laptop_bag_qr_tag_1794551251092.jpg';
import lostWalletTagImg from '../assets/images/lost_wallet_tag_1794551250451.jpg';
import cameraKeysTagImg from '../assets/images/camera_keys_qr_tag_1794551251761.jpg';

export type VisualVariant = 'hero' | 'step1' | 'step2' | 'step3';

const VISUAL_CONFIG: Record<
  VisualVariant,
  { src: string; alt: string }
> = {
  hero: {
    src: heroShowcaseImg,
    alt: 'Everyday personal essentials with engraved QR recovery tag on slate stone',
  },
  step1: {
    src: laptopBagTagImg,
    alt: 'Commuter backpack handle with dark navy anodized QR luggage tag',
  },
  step2: {
    src: lostWalletTagImg,
    alt: 'Minimalist leather wallet beside brushed steel QR recovery card',
  },
  step3: {
    src: cameraKeysTagImg,
    alt: 'Rangefinder camera and brass keys with engraved QR recovery fob',
  },
};

function FallbackSvgIllustration({ variant }: { variant: VisualVariant }) {
  if (variant === 'hero') {
    return (
      <svg
        viewBox="0 0 800 600"
        className="w-full h-full object-cover bg-[#101828]"
        role="img"
        aria-label={VISUAL_CONFIG.hero.alt}
      >
        <defs>
          <linearGradient id="tb-hero-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#101828" />
            <stop offset="100%" stopColor="#1E293B" />
          </linearGradient>
          <linearGradient id="tb-blue-glow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#tb-hero-bg)" />
        <circle cx="620" cy="140" r="190" fill="url(#tb-blue-glow)" />
        <circle cx="190" cy="480" r="150" fill="#2563EB" fillOpacity="0.12" />
        {/* Stylized recovery card */}
        <rect
          x="190"
          y="120"
          width="420"
          height="320"
          rx="28"
          fill="#F8FAFC"
          stroke="#CBD5E1"
          strokeWidth="2"
        />
        <rect x="190" y="120" width="420" height="68" rx="28" fill="#101828" />
        <rect x="190" y="160" width="420" height="28" fill="#101828" />
        <rect x="190" y="186" width="420" height="4" fill="#2563EB" />
        <text
          x="226"
          y="162"
          fill="#F8FAFC"
          fontSize="22"
          fontWeight="800"
          fontFamily="sans-serif"
          letterSpacing="1"
        >
          TAGBACKLY
        </text>
        <rect x="505" y="142" width="76" height="24" rx="8" fill="#2563EB" />
        <text x="520" y="159" fill="#FFFFFF" fontSize="11" fontWeight="700" fontFamily="monospace">
          QR TAG
        </text>
        {/* Minimalist geometric QR pattern */}
        <g transform="translate(236, 218)">
          <rect width="152" height="152" rx="14" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="2" />
          <rect x="18" y="18" width="38" height="38" rx="6" fill="none" stroke="#101828" strokeWidth="7" />
          <rect x="30" y="30" width="14" height="14" rx="2" fill="#101828" />
          <rect x="96" y="18" width="38" height="38" rx="6" fill="none" stroke="#101828" strokeWidth="7" />
          <rect x="108" y="30" width="14" height="14" rx="2" fill="#101828" />
          <rect x="18" y="96" width="38" height="38" rx="6" fill="none" stroke="#101828" strokeWidth="7" />
          <rect x="30" y="108" width="14" height="14" rx="2" fill="#101828" />
          <rect x="68" y="22" width="14" height="14" rx="3" fill="#2563EB" />
          <rect x="68" y="46" width="14" height="26" rx="3" fill="#101828" />
          <rect x="22" y="68" width="34" height="14" rx="3" fill="#101828" />
          <rect x="68" y="84" width="24" height="14" rx="3" fill="#8B5CF6" />
          <rect x="102" y="68" width="32" height="14" rx="3" fill="#101828" />
          <rect x="98" y="96" width="16" height="38" rx="3" fill="#2563EB" />
          <rect x="120" y="96" width="14" height="16" rx="3" fill="#101828" />
          <rect x="120" y="118" width="14" height="16" rx="3" fill="#101828" />
        </g>
        {/* Right-side item details */}
        <rect x="416" y="224" width="150" height="14" rx="7" fill="#101828" />
        <rect x="416" y="250" width="110" height="10" rx="5" fill="#64748B" />
        <rect x="416" y="280" width="156" height="44" rx="10" fill="#EFF6FF" stroke="#BFDBFE" />
        <rect x="430" y="294" width="94" height="8" rx="4" fill="#2563EB" />
        <rect x="430" y="308" width="124" height="6" rx="3" fill="#93C5FD" />
        <rect x="416" y="338" width="156" height="34" rx="10" fill="#2563EB" />
        <text x="444" y="360" fill="#FFFFFF" fontSize="13" fontWeight="700" fontFamily="sans-serif">
          Contact Owner
        </text>
      </svg>
    );
  }

  if (variant === 'step1') {
    return (
      <svg
        viewBox="0 0 640 480"
        className="w-full h-full object-cover bg-[#F8FAFC]"
        role="img"
        aria-label={VISUAL_CONFIG.step1.alt}
      >
        <rect width="640" height="480" fill="#EFF6FF" />
        <rect x="110" y="70" width="420" height="340" rx="24" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2" />
        <rect x="145" y="108" width="160" height="160" rx="18" fill="#101828" />
        <rect x="172" y="135" width="106" height="106" rx="10" fill="#FFFFFF" />
        <rect x="186" y="149" width="28" height="28" rx="4" fill="none" stroke="#101828" strokeWidth="5" />
        <rect x="236" y="149" width="28" height="28" rx="4" fill="none" stroke="#101828" strokeWidth="5" />
        <rect x="186" y="199" width="28" height="28" rx="4" fill="none" stroke="#101828" strokeWidth="5" />
        <rect x="226" y="189" width="38" height="38" rx="6" fill="#2563EB" />
        <rect x="335" y="120" width="160" height="16" rx="8" fill="#101828" />
        <rect x="335" y="152" width="120" height="10" rx="5" fill="#94A3B8" />
        <rect x="335" y="184" width="150" height="36" rx="10" fill="#F1F5F9" />
        <rect x="335" y="232" width="150" height="36" rx="10" fill="#2563EB" />
        <rect x="145" y="302" width="350" height="68" rx="14" fill="#F8FAFC" stroke="#E2E8F0" />
        <circle cx="182" cy="336" r="14" fill="#8B5CF6" fillOpacity="0.2" />
        <rect x="210" y="324" width="160" height="10" rx="5" fill="#101828" />
        <rect x="210" y="342" width="240" height="8" rx="4" fill="#94A3B8" />
      </svg>
    );
  }

  if (variant === 'step2') {
    return (
      <svg
        viewBox="0 0 400 320"
        className="w-full h-full object-cover bg-[#101828]"
        role="img"
        aria-label={VISUAL_CONFIG.step2.alt}
      >
        <rect width="400" height="320" fill="#101828" />
        <rect x="52" y="74" width="180" height="132" rx="18" fill="#1E293B" stroke="#334155" strokeWidth="2" />
        <rect x="74" y="98" width="54" height="10" rx="5" fill="#64748B" />
        <rect x="164" y="92" width="176" height="148" rx="18" fill="#F8FAFC" stroke="#2563EB" strokeWidth="3" />
        <rect x="192" y="114" width="76" height="76" rx="8" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2" />
        <rect x="202" y="124" width="22" height="22" rx="3" fill="none" stroke="#101828" strokeWidth="4" />
        <rect x="236" y="124" width="22" height="22" rx="3" fill="none" stroke="#101828" strokeWidth="4" />
        <rect x="202" y="158" width="22" height="22" rx="3" fill="none" stroke="#101828" strokeWidth="4" />
        <rect x="236" y="158" width="22" height="22" rx="3" fill="#2563EB" />
        <rect x="192" y="204" width="118" height="10" rx="5" fill="#101828" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 400 320"
      className="w-full h-full object-cover bg-[#EEF2FF]"
      role="img"
      aria-label={VISUAL_CONFIG.step3.alt}
    >
      <rect width="400" height="320" fill="#EFF6FF" />
      <rect x="64" y="54" width="272" height="212" rx="22" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2" />
      <rect x="90" y="84" width="166" height="44" rx="14" fill="#F1F5F9" />
      <rect x="106" y="100" width="116" height="10" rx="5" fill="#475569" />
      <rect x="144" y="144" width="166" height="44" rx="14" fill="#2563EB" />
      <rect x="162" y="160" width="122" height="10" rx="5" fill="#FFFFFF" />
      <rect x="90" y="206" width="136" height="34" rx="12" fill="#8B5CF6" fillOpacity="0.16" />
      <rect x="106" y="218" width="96" height="10" rx="5" fill="#8B5CF6" />
    </svg>
  );
}

export function LandingVisual({
  variant,
  className = 'w-full h-full object-cover',
}: {
  variant: VisualVariant;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const cfg = VISUAL_CONFIG[variant];

  if (failed) {
    return <FallbackSvgIllustration variant={variant} />;
  }

  return (
    <img
      src={cfg.src}
      alt={cfg.alt}
      loading={variant === 'hero' ? 'eager' : 'lazy'}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
