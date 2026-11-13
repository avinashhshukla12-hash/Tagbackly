import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { AlertCircle, Camera, CameraOff, ImagePlus, QrCode, RefreshCw, Search, X } from 'lucide-react';
import { api } from '../lib/api';

interface QrScannerModalProps {
  open: boolean;
  onClose: () => void;
  onMatchSlug: (slug: string) => void;
}

type ScannerState =
  | 'initializing'
  | 'scanning'
  | 'verifying'
  | 'permission-denied'
  | 'camera-unavailable'
  | 'invalid-qr';

function extractTagSlug(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  // Match URL containing /t/<slug>
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      const match = parsed.pathname.match(/^\/t\/([a-zA-Z0-9_-]+)\/?$/);
      if (match) return match[1];
      return null;
    }
  } catch {
    // Not a full URL
  }

  if (trimmed.includes('/t/')) {
    const seg = trimmed.split('/t/').pop()?.split(/[?#]/)[0]?.trim();
    if (seg && /^[a-zA-Z0-9_-]+$/.test(seg)) return seg;
  }

  if (/^tb-[a-f0-9]{6,20}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return null;
}

export function QrScannerModal({ open, onClose, onMatchSlug }: QrScannerModalProps) {
  const [state, setState] = useState<ScannerState>('initializing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scannedRaw, setScannedRaw] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const cameraCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const handlingDecodeRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const verifyAndOpenCode = useCallback(
    async (rawText: string) => {
      if (handlingDecodeRef.current) return;
      handlingDecodeRef.current = true;
      stopCamera();
      setState('verifying');
      setScannedRaw(rawText);

      const slug = extractTagSlug(rawText);
      if (!slug) {
        setErrorMessage('This QR code does not belong to a valid TAGBACKLY recovery tag.');
        setState('invalid-qr');
        handlingDecodeRef.current = false;
        return;
      }

      try {
        await api.getPublicItem(slug);
        handlingDecodeRef.current = false;
        onClose();
        onMatchSlug(slug);
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'No registered TAGBACKLY item matches this QR code.',
        );
        setState('invalid-qr');
        handlingDecodeRef.current = false;
      }
    },
    [onClose, onMatchSlug, stopCamera],
  );

  const startCamera = useCallback(async () => {
    stopCamera();
    handlingDecodeRef.current = false;
    setErrorMessage(null);
    setScannedRaw(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setState('camera-unavailable');
      return;
    }

    setState('initializing');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stopCamera();
        return;
      }

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();
      setState('scanning');

      const scanFrame = () => {
        if (!videoRef.current || !canvasRef.current || !streamRef.current) return;
        const vid = videoRef.current;
        if (vid.readyState === vid.HAVE_ENOUGH_DATA && vid.videoWidth > 0 && vid.videoHeight > 0) {
          const canvas = canvasRef.current;
          canvas.width = vid.videoWidth;
          canvas.height = vid.videoHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            });
            if (decoded?.data) {
              verifyAndOpenCode(decoded.data);
              return;
            }
          }
        }
        rafRef.current = requestAnimationFrame(scanFrame);
      };

      rafRef.current = requestAnimationFrame(scanFrame);
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setState('permission-denied');
      } else {
        setState('camera-unavailable');
      }
    }
  }, [stopCamera, verifyAndOpenCode]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    startCamera();
    return () => {
      stopCamera();
    };
  }, [open, startCamera, stopCamera]);

  function decodeQrFromImage(img: HTMLImageElement): string | null {
    const attemptDecode = (maxDim: number): string | null => {
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;
      if (width === 0 || height === 0) return null;

      if (maxDim > 0 && (width > maxDim || height > maxDim)) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });
      return decoded?.data ?? null;
    };

    return attemptDecode(1400) ?? attemptDecode(800) ?? attemptDecode(0);
  }

  function handleImageUploadScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCamera();
    setState('verifying');
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onerror = () => {
      setScannedRaw(file.name);
      setErrorMessage('Could not read the captured photo.');
      setState('invalid-qr');
    };
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => {
        setScannedRaw(file.name);
        setErrorMessage('Unable to decode image format from camera.');
        setState('invalid-qr');
      };
      img.onload = () => {
        const decodedData = decodeQrFromImage(img);
        if (decodedData) {
          verifyAndOpenCode(decodedData);
        } else {
          setScannedRaw(file.name);
          setErrorMessage('Could not detect a readable QR code in the captured photo.');
          setState('invalid-qr');
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualInput.trim()) return;
    verifyAndOpenCode(manualInput.trim());
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#101828]/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden my-6">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <QrCode className="w-5 h-5 text-[#2563EB]" />
            <div>
              <h2 className="font-display text-base font-bold text-[#101828]">Scan TAGBACKLY QR</h2>
              <p className="text-[11px] text-slate-500">
                Point your camera at a tag or use your phone’s normal camera app.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2 text-slate-400 hover:text-[#101828] rounded-lg hover:bg-slate-100"
            aria-label="Close scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Live Camera Viewport */}
          {(state === 'initializing' || state === 'scanning' || state === 'verifying') && (
            <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-[#101828] border border-slate-200">
              <video
                ref={videoRef}
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Alignment reticle */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-white/80 rounded-2xl shadow-[0_0_0_9999px_rgba(16,24,40,0.35)]" />
              </div>

              <div className="absolute bottom-3 inset-x-3 text-center">
                <span className="inline-block px-3 py-1.5 rounded-lg bg-[#101828]/80 text-white text-xs font-medium">
                  {state === 'initializing' && 'Requesting camera access...'}
                  {state === 'scanning' && 'Align QR code inside the frame'}
                  {state === 'verifying' && 'Verifying recovery tag...'}
                </span>
              </div>
            </div>
          )}

          {/* Camera Permission Denied */}
          {state === 'permission-denied' && (
            <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-3">
              <Camera className="w-8 h-8 text-amber-600 mx-auto" />
              <h3 className="font-display text-base font-bold text-[#101828]">
                Camera Permission Required
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Allow camera access in your browser settings to scan directly here, upload a photo of
                the QR tag, or enter the tag code printed below the QR code.
              </p>
              <button
                type="button"
                onClick={startCamera}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#101828] rounded-xl"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Camera Permission</span>
              </button>
            </div>
          )}

          {/* Camera Unavailable Fallback */}
          {state === 'camera-unavailable' && (
            <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-slate-200 text-center space-y-3">
              <CameraOff className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="font-display text-base font-bold text-[#101828]">
                Camera Unavailable on This Device
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                No accessible camera was found in this browser context. You can still scan using your
                phone’s normal camera, upload a QR image below, or enter the tag code manually.
              </p>
            </div>
          )}

          {/* Invalid QR Error Screen */}
          {state === 'invalid-qr' && (
            <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
              <h3 className="font-display text-base font-bold text-[#101828]">
                Invalid or Unregistered QR Code
              </h3>
              <p className="text-xs text-rose-700 leading-relaxed">
                {errorMessage}
              </p>
              {scannedRaw && (
                <p className="text-[11px] font-mono text-slate-500 break-all">
                  Detected value: {scannedRaw}
                </p>
              )}
              <button
                type="button"
                onClick={startCamera}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#101828] rounded-xl"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Scan Another QR Code</span>
              </button>
            </div>
          )}

          {/* Prominent Native Phone Camera Capture Button */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => cameraCaptureInputRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2.5 py-3.5 px-5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl transition-colors"
            >
              <Camera className="w-4 h-4" />
              <span>Scan Using Phone Camera</span>
            </button>
            <input
              ref={cameraCaptureInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageUploadScan}
              className="hidden"
            />
          </div>

          {/* Fallback Tools: Upload QR Photo + Manual Tag Entry */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-[#101828]">Alternative Lookup</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] hover:underline"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                <span>Scan from QR Photo</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUploadScan}
                className="hidden"
              />
            </div>

            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="Enter tag ID (e.g. tb-4f91a2)"
                  className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl whitespace-nowrap"
              >
                Open Tag
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
