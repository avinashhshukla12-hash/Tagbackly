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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraCaptureRef = useRef<HTMLInputElement | null>(null);
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

    // Wait one tick so videoRef is mounted in DOM
    await new Promise((r) => setTimeout(r, 80));

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      } catch {
        // Fallback to any available camera if rear camera constraint fails
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stopCamera();
        return;
      }

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      await video.play();
      setState('scanning');

      const scanFrame = () => {
        if (!videoRef.current || !canvasRef.current || !streamRef.current) return;
        const vid = videoRef.current;
        if (vid.readyState >= 2 && vid.videoWidth > 0 && vid.videoHeight > 0) {
          const canvas = canvasRef.current;
          canvas.width = vid.videoWidth;
          canvas.height = vid.videoHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'attemptBoth',
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

  function handleImageUploadScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (decoded?.data) {
          verifyAndOpenCode(decoded.data);
        } else {
          stopCamera();
          setScannedRaw(file.name);
          setErrorMessage('Could not detect a readable QR code in the selected image.');
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

  const showViewport = state === 'initializing' || state === 'scanning' || state === 'verifying';

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
          {/* Keep video mounted so retry works reliably */}
          <div
            className={`relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-[#101828] border border-slate-200 ${
              showViewport ? 'block' : 'hidden'
            }`}
          >
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

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

          {/* Camera Permission Denied */}
          {state === 'permission-denied' && (
            <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-3">
              <Camera className="w-8 h-8 text-amber-600 mx-auto" />
              <h3 className="font-display text-base font-bold text-[#101828]">
                Camera Permission Required
              </h3>
    
