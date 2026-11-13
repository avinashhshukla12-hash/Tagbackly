import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, Download, ExternalLink, Package, Plus, Printer, QrCode } from 'lucide-react';
import { useLanguage } from '../lib/i18n';
import type { TagItem } from '../types';
import { StatusIndicator } from './StatusBadge';

interface QrPreviewGridProps {
  items: TagItem[];
  onAddNew: () => void;
  onSelectItem: (id: string) => void;
  onOpenPublicPreview: (slug: string) => void;
}

function QrCardTile({
  item,
  onSelectItem,
  onOpenPublicPreview,
}: {
  item: TagItem;
  onSelectItem: (id: string) => void;
  onOpenPublicPreview: (slug: string) => void;
}) {
  const [svgMarkup, setSvgMarkup] = useState('');
  const [copied, setCopied] = useState(false);
  const publicUrl = `${window.location.origin}/t/${item.publicSlug}`;

  useEffect(() => {
    let active = true;
    QRCode.toString(publicUrl, {
      type: 'svg',
      width: 180,
      margin: 2,
      color: { dark: '#101828', light: '#FFFFFF' },
      errorCorrectionLevel: 'H',
    })
      .then((svg) => {
        if (active) setSvgMarkup(svg);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [publicUrl]);

  async function handleDownloadPng() {
    const dataUrl = await QRCode.toDataURL(publicUrl, {
      width: 640,
      margin: 2,
      color: { dark: '#101828', light: '#FFFFFF' },
      errorCorrectionLevel: 'H',
    });
    const link = document.createElement('a');
    link.download = `tagbackly-${item.publicSlug}.png`;
    link.href = dataUrl;
    link.click();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-slate-500 truncate">{item.category}</div>
          <h3 className="font-display text-sm font-bold text-[#101828] truncate mt-0.5">
            {item.name}
          </h3>
        </div>
        <StatusIndicator status={item.status} />
      </div>

      <div className="bg-[#F8FAFC] border border-slate-200 rounded-xl p-4 flex flex-col items-center">
        <div className="bg-white p-2.5 rounded-lg border border-slate-200">
          {svgMarkup ? (
            <div
              className="w-32 h-32 [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
              aria-label={`QR code for ${item.name}`}
            />
          ) : (
            <div className="w-32 h-32 flex items-center justify-center text-xs text-slate-400">
              <QrCode className="w-6 h-6" />
            </div>
          )}
        </div>
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-mono text-slate-500">
          <span>{item.publicSlug}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 text-slate-400 hover:text-[#101828] rounded"
            title="Copy public tag URL"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={handleDownloadPng}
          className="inline-flex items-center justify-center gap-1 py-2 px-2 text-xs font-semibold text-white bg-[#101828] hover:bg-slate-800 rounded-xl transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>PNG</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectItem(item.id)}
          className="inline-flex items-center justify-center gap-1 py-2 px-2 text-xs font-semibold text-[#101828] bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Studio</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenPublicPreview(item.publicSlug)}
          className="inline-flex items-center justify-center gap-1 py-2 px-2 text-xs font-semibold text-[#2563EB] bg-[#2563EB]/10 hover:bg-[#2563EB]/15 rounded-xl transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>View</span>
        </button>
      </div>
    </div>
  );
}

export function QrPreviewGrid({
  items,
  onAddNew,
  onSelectItem,
  onOpenPublicPreview,
}: QrPreviewGridProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#101828]">{t('myQrTitle')}</h1>
          <p className="text-sm text-slate-600 mt-1">{t('myQrSub')}</p>
        </div>
        <button
          type="button"
          onClick={onAddNew}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t('addNewItem')}</span>
        </button>
      </div>

      {items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
          <Package className="w-9 h-9 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-[#101828]">No QR codes generated yet</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Register an item to mint its unique, privacy-protected QR recovery code.
          </p>
          <button
            type="button"
            onClick={onAddNew}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#2563EB] rounded-xl"
          >
            <Plus className="w-4 h-4" />
            <span>{t('addNewItem')}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => (
            <QrCardTile
              key={item.id}
              item={item}
              onSelectItem={onSelectItem}
              onOpenPublicPreview={onOpenPublicPreview}
            />
          ))}
        </div>
      )}
    </div>
  );
}
