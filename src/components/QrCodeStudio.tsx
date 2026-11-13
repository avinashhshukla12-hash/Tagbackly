import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, ExternalLink, Printer, Share2 } from 'lucide-react';
import type { TagItem } from '../types';

interface QrCodeStudioProps {
  item: TagItem;
  onOpenPublicPreview: (slug: string) => void;
}

export function QrCodeStudio({ item, onOpenPublicPreview }: QrCodeStudioProps) {
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [showPrintSheet, setShowPrintSheet] = useState(false);

  const publicUrl = `${window.location.origin}/t/${item.publicSlug}`;

  useEffect(() => {
    let active = true;
    QRCode.toString(publicUrl, {
      type: 'svg',
      width: 240,
      margin: 2,
      color: {
        dark: '#101828',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'H',
    })
      .then((svg) => {
        if (active) setSvgMarkup(svg);
      })
      .catch(() => {
        if (active) setSvgMarkup('');
      });
    return () => {
      active = false;
    };
  }, [publicUrl]);

  async function handleDownloadTagCard() {
    const qrDataUrl = await QRCode.toDataURL(publicUrl, {
      width: 720,
      margin: 2,
      color: { dark: '#101828', light: '#FFFFFF' },
      errorCorrectionLevel: 'H',
    });

    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // White background card
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Midnight Navy top header
    ctx.fillStyle = '#101828';
    ctx.fillRect(0, 0, canvas.width, 220);

    // Accent strip
    ctx.fillStyle = '#2563EB';
    ctx.fillRect(0, 212, canvas.width, 8);

    // Brand text
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 44px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAGBACKLY', canvas.width / 2, 102);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 24px "DM Sans", sans-serif';
    ctx.fillText('IF FOUND, SCAN TO RETURN SAFELY', canvas.width / 2, 158);

    // QR image
    const qrImg = new Image();
    qrImg.onload = () => {
      const qrSize = 600;
      const qrX = (canvas.width - qrSize) / 2;
      const qrY = 290;

      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(qrX - 32, qrY - 32, qrSize + 64, qrSize + 64, 28);
      ctx.fill();
      ctx.stroke();

      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      // Item name & tag code
      ctx.fillStyle = '#101828';
      ctx.font = '700 36px "Plus Jakarta Sans", sans-serif';
      const title = item.name.length > 34 ? `${item.name.slice(0, 32)}...` : item.name;
      ctx.fillText(title, canvas.width / 2, 1030);

      ctx.fillStyle = '#475569';
      ctx.font = '500 24px "JetBrains Mono", monospace';
      ctx.fillText(`TAG ID: ${item.publicSlug.toUpperCase()}`, canvas.width / 2, 1085);

      ctx.fillStyle = '#2563EB';
      ctx.font = '600 22px "DM Sans", sans-serif';
      ctx.fillText('Scan. Connect. Return. · No app required', canvas.width / 2, 1142);

      const link = document.createElement('a');
      link.download = `tagbackly-${item.publicSlug}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    qrImg.src = qrDataUrl;
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareNote('Copy failed. You can copy the URL directly below.');
    }
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `TAGBACKLY Recovery Tag — ${item.name}`,
          text: `Scan or open this link if you find ${item.name}.`,
          url: publicUrl,
        });
        return;
      } catch {
        // Fallback to copy
      }
    }
    await handleCopyLink();
    setShareNote('Recovery link copied to clipboard.');
    setTimeout(() => setShareNote(null), 2500);
  }

  function handlePrint() {
    setShowPrintSheet(true);
    setTimeout(() => {
      window.print();
    }, 150);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-base font-semibold text-[#101828]">Unique Recovery QR Tag</h3>
          <p className="text-xs text-slate-500 mt-1">
            Opens public recovery page with zero personal information exposed.
          </p>
        </div>
        <span className="font-mono text-xs text-slate-500 tabular-nums">{item.publicSlug}</span>
      </div>

      <div className="flex flex-col items-center bg-[#F8FAFC] border border-slate-200 rounded-xl p-6">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          {svgMarkup ? (
            <div
              className="w-44 h-44 [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
              aria-label={`QR code for ${item.name}`}
            />
          ) : (
            <div className="w-44 h-44 flex items-center justify-center text-xs text-slate-400">
              Generating QR...
            </div>
          )}
        </div>
        <p className="mt-4 text-xs font-medium text-[#101828]">Scan with any phone camera</p>
        <div className="mt-2 flex items-center gap-2 max-w-full">
          <code className="text-[11px] font-mono text-slate-500 truncate max-w-[230px]">
            {publicUrl}
          </code>
          <button
            type="button"
            onClick={handleCopyLink}
            className="p-1.5 text-slate-500 hover:text-[#101828] rounded-md hover:bg-slate-200/60 transition-colors shrink-0"
            title="Copy public QR URL"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {shareNote && (
        <p className="mt-3 text-xs text-[#2563EB] font-medium text-center">{shareNote}</p>
      )}

      <div className="grid grid-cols-3 gap-2.5 mt-5">
        <button
          type="button"
          onClick={handleDownloadTagCard}
          className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-semibold text-white bg-[#101828] hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download</span>
        </button>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-semibold text-[#101828] bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print</span>
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-semibold text-[#2563EB] bg-[#2563EB]/10 hover:bg-[#2563EB]/15 rounded-xl transition-colors whitespace-nowrap"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Share</span>
        </button>
      </div>

      <button
        type="button"
        onClick={() => onOpenPublicPreview(item.publicSlug)}
        className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-[#101828] border border-slate-200 hover:border-slate-300 hover:bg-[#F8FAFC] rounded-xl transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        <span>Preview Public QR Landing Page</span>
      </button>

      {showPrintSheet && (
        <div className="fixed inset-0 z-50 bg-white overflow-auto p-8 print:static print:p-0">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-200 no-print">
              <div>
                <h2 className="text-lg font-bold text-[#101828]">Printable QR Tag Sheet</h2>
                <p className="text-xs text-slate-500">Cut out any size below and attach to your item.</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-lg hover:bg-blue-700"
                >
                  Print Now
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintSheet(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Luggage / Bag Card */}
              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center text-center">
                <div className="text-xs font-bold tracking-wider uppercase text-[#101828]">TAGBACKLY</div>
                <div className="text-[11px] text-slate-500 mt-0.5 mb-3">Scan if found · No app needed</div>
                {svgMarkup && (
                  <div
                    className="w-36 h-36 [&>svg]:w-full [&>svg]:h-full"
                    dangerouslySetInnerHTML={{ __html: svgMarkup }}
                  />
                )}
                <div className="mt-3 text-sm font-bold text-[#101828]">{item.name}</div>
                <div className="mt-1 font-mono text-[11px] text-slate-500">{item.publicSlug}</div>
              </div>

              {/* Compact Sticker Pair */}
              <div className="flex flex-col gap-4">
                {[0, 1].map((idx) => (
                  <div
                    key={idx}
                    className="border-2 border-dashed border-slate-300 rounded-xl p-4 flex items-center gap-4"
                  >
                    {svgMarkup && (
                      <div
                        className="w-20 h-20 shrink-0 [&>svg]:w-full [&>svg]:h-full"
                        dangerouslySetInnerHTML={{ __html: svgMarkup }}
                      />
                    )}
                    <div className="min-w-0 text-left">
                      <div className="text-xs font-bold text-[#101828]">TAGBACKLY</div>
                      <div className="text-xs font-medium text-slate-700 truncate">{item.name}</div>
                      <div className="text-[11px] text-slate-500 mt-1">Scan camera to contact owner</div>
                      <div className="font-mono text-[10px] text-slate-400 mt-0.5">{item.publicSlug}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
