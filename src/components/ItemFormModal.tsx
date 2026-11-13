import { useEffect, useRef, useState } from 'react';
import { ImagePlus, ShieldAlert, Trash2, X } from 'lucide-react';
import {
  compressImageFile,
  uploadImageWithProgress,
  validateImageFile,
  api,
} from '../lib/api';
import {
  ITEM_CATEGORIES,
  ITEM_STATUSES,
  type ItemCategory,
  type ItemStatus,
  type RewardType,
  type TagItem,
} from '../types';

interface ItemFormModalProps {
  open: boolean;
  editingItem: TagItem | null;
  onClose: () => void;
  onSaved: (item: TagItem, isEdit: boolean) => void;
}

const STATUS_LABELS: Record<ItemStatus, string> = {
  SAFE: 'SAFE — In My Possession',
  LOST: 'LOST — Needs Return',
  FOUND: 'FOUND — Reported Found',
  CHATTING: 'CHATTING — Active Handover',
  RETURNED: 'RETURNED — Safely Recovered',
};

export function ItemFormModal({ open, editingItem, onClose, onSaved }: ItemFormModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ItemCategory>('Bags');
  const [status, setStatus] = useState<ItemStatus>('SAFE');
  const [description, setDescription] = useState('');
  const [ownerMessage, setOwnerMessage] = useState('');
  const [rewardType, setRewardType] = useState<RewardType>('none');
  const [rewardAmount, setRewardAmount] = useState('');
  const [rewardDescription, setRewardDescription] = useState('');

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editingItem) {
      setName(editingItem.name);
      setCategory(editingItem.category);
      setStatus(editingItem.status);
      setDescription(editingItem.description);
      setOwnerMessage(editingItem.ownerMessage);
      setRewardType(editingItem.rewardType ?? 'none');
      setRewardAmount(editingItem.rewardAmount);
      setRewardDescription(editingItem.rewardDescription ?? '');
      setPhotoPreview(editingItem.photoUrl);
      setUploadedPhotoUrl(editingItem.photoUrl);
      setUploadProgress(null);
      setRemovePhoto(false);
    } else {
      setName('');
      setCategory('Bags');
      setStatus('SAFE');
      setDescription('');
      setOwnerMessage(
        'Thank you for finding my item! Please send me a message here so we can arrange a safe return.',
      );
      setRewardType('none');
      setRewardAmount('');
      setRewardDescription('');
      setPhotoPreview(null);
      setUploadedPhotoUrl(null);
      setUploadProgress(null);
      setRemovePhoto(false);
    }
    setError(null);
  }, [open, editingItem]);

  if (!open) return null;

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      e.target.value = '';
      return;
    }

    try {
      setUploadProgress(5);
      const compressed = await compressImageFile(file);
      setPhotoPreview(compressed);
      setRemovePhoto(false);
      const url = await uploadImageWithProgress(compressed, (pct) => {
        setUploadProgress(pct);
      });
      setUploadedPhotoUrl(url);
      setTimeout(() => setUploadProgress(null), 600);
    } catch (err) {
      setUploadProgress(null);
      setError(err instanceof Error ? err.message : 'Unable to upload image.');
    }
  }

  function handleClearPhoto() {
    setUploadedPhotoUrl(null);
    setPhotoPreview(null);
    setUploadProgress(null);
    setRemovePhoto(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (uploadProgress !== null && uploadProgress < 100) {
      setError('Please wait for the image upload to finish.');
      return;
    }
    setError(null);
    setSaving(true);

    try {
      if (editingItem) {
        const res = await api.updateItem(editingItem.id, {
          name,
          category,
          status,
          description,
          ownerMessage,
          rewardType,
          rewardAmount,
          rewardDescription,
          ...(uploadedPhotoUrl && uploadedPhotoUrl !== editingItem.photoUrl
            ? { photoUrl: uploadedPhotoUrl }
            : {}),
          ...(removePhoto ? { removePhoto: true } : {}),
        });
        onSaved(res.item, true);
      } else {
        const res = await api.createItem({
          name,
          category,
          status,
          description,
          ownerMessage,
          rewardType,
          rewardAmount,
          rewardDescription,
          photoUrl: uploadedPhotoUrl,
        });
        onSaved(res.item, false);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#101828]/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl my-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-[#101828]">
              {editingItem ? 'Edit Registered Item' : 'Register New Item'}
            </h2>
            <p className="text-xs text-slate-500">
              {editingItem
                ? 'Updates reflect immediately on the item’s public QR recovery page.'
                : 'A unique QR recovery code will be generated automatically.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-[#101828] rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
              {error}
            </div>
          )}

          {/* Photo Upload with Validation & Progress */}
          <div>
            <label className="block text-xs font-semibold text-[#101828] mb-2">
              Item Photo (JPEG, PNG, or WebP · Max 5 MB)
            </label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {photoPreview ? (
                <div className="relative w-32 h-24 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0">
                  <img
                    src={photoPreview}
                    alt="Item preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={handleClearPhoto}
                    className="absolute top-1.5 right-1.5 p-1 bg-[#101828]/80 text-white rounded-md hover:bg-rose-600 transition-colors"
                    title="Remove photo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-32 h-24 rounded-xl border border-dashed border-slate-300 bg-[#F8FAFC] hover:border-[#2563EB] flex flex-col items-center justify-center gap-1.5 text-slate-500 hover:text-[#2563EB] transition-colors shrink-0"
                >
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-[11px] font-medium">Upload Photo</span>
                </button>
              )}
              <div className="flex-1 w-full space-y-2 text-xs text-slate-500">
                <p>Add a clear photo so finders can verify they found the right item.</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-semibold text-[#2563EB] hover:underline"
                >
                  {photoPreview ? 'Replace photo' : 'Select image file'}
                </button>
                {uploadProgress !== null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-medium text-[#101828]">
                      <span>Uploading image...</span>
                      <span className="font-mono tabular-nums">{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#2563EB] transition-all duration-150"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                Item Name
              </label>
              <input
                type="text"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Navy Peak Design Backpack"
                className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ItemCategory)}
                className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB]"
              >
                {ITEM_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#101828] mb-1.5">
              Item Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ItemStatus)}
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB]"
            >
              {ITEM_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {STATUS_LABELS[st]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#101828] mb-1.5">
              Description
            </label>
            <textarea
              required
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Distinguishing marks, color, brand, or contents helpful for verification..."
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#101828] mb-1.5">
              Owner’s Custom Message (Displayed on QR Landing Page)
            </label>
            <textarea
              rows={2}
              maxLength={500}
              value={ownerMessage}
              onChange={(e) => setOwnerMessage(e.target.value)}
              placeholder="Friendly note shown when someone scans your QR code..."
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB]"
            />
          </div>

          {/* Reward System */}
          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-200 space-y-3">
            <label className="block text-xs font-semibold text-[#101828]">
              Optional Reward System
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  { id: 'none', label: 'No Reward' },
                  { id: 'amount', label: 'Reward Amount' },
                  { id: 'custom', label: 'Custom Reward' },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setRewardType(option.id)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                    rewardType === option.id
                      ? 'bg-[#101828] text-white border-[#101828]'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {rewardType === 'amount' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Reward Amount
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={rewardAmount}
                  onChange={(e) => setRewardAmount(e.target.value)}
                  placeholder="e.g. $50 USD or €40"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                />
              </div>
            )}

            {rewardType === 'custom' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Custom Reward Description
                </label>
                <input
                  type="text"
                  required
                  maxLength={300}
                  value={rewardDescription}
                  onChange={(e) => setRewardDescription(e.target.value)}
                  placeholder="e.g. Coffee gift card + sincere gratitude upon safe handover"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                />
              </div>
            )}

            <div className="flex items-start gap-2 text-[11px] text-slate-500 pt-1">
              <ShieldAlert className="w-3.5 h-3.5 text-[#8B5CF6] shrink-0 mt-0.5" />
              <span>
                TAGBACKLY does not process or collect payments. Reward arrangements take place only
                after safe return and confirmation. Minors must involve a parent or guardian.
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-[#101828] bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || (uploadProgress !== null && uploadProgress < 100)}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors"
            >
              {saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Register Item & Create QR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
