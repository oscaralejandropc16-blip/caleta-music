"use client";

import { useState, useRef, useEffect } from "react";
import { X, Camera, ImagePlus } from "lucide-react";

interface CreatePlaylistModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: (name: string, description: string, coverBlob?: Blob) => void;
}

const COVER_PRESETS = [
    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
    "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
    "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
    "linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)",
    "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)",
];

export default function CreatePlaylistModal({ isOpen, onClose, onCreated }: CreatePlaylistModalProps) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [selectedPreset, setSelectedPreset] = useState(0);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);
    const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setName("");
            setDescription("");
            setSelectedPreset(0);
            setCoverPreview(null);
            setCoverBlob(null);
        }
    }, [isOpen]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setCoverBlob(file);
            const reader = new FileReader();
            reader.onload = (ev) => {
                setCoverPreview(ev.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleCreate = () => {
        if (!name.trim()) return;
        onCreated(name.trim(), description.trim(), coverBlob || undefined);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-3xl shadow-2xl animate-modal-in flex flex-col max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="flex-shrink-0 flex items-center justify-between px-6 py-5 border-b border-slate-800">
                    <h2 className="text-xl font-bold text-white">Crear Playlist</h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-slate-800 transition-colors"
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                    {/* Cover Selection */}
                    <div className="flex flex-col items-center gap-4">
                        <div className="text-sm font-medium text-slate-400 w-full">Portada</div>
                        <div className="flex items-center gap-4 w-full">
                            {/* Main Cover Preview */}
                            <div
                                className="relative w-32 h-32 rounded-2xl overflow-hidden flex-shrink-0 cursor-pointer group shadow-xl border-2 border-slate-700 hover:border-brand-500 transition-colors"
                                onClick={() => fileInputRef.current?.click()}
                                style={
                                    coverPreview
                                        ? { backgroundImage: `url(${coverPreview})`, backgroundSize: "cover", backgroundPosition: "center" }
                                        : { background: COVER_PRESETS[selectedPreset] }
                                }
                            >
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Camera size={28} className="text-white" />
                                </div>
                                {!coverPreview && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <ImagePlus size={36} className="text-white/60" />
                                    </div>
                                )}
                            </div>

                            {/* Preset Grid */}
                            <div className="flex-1">
                                <p className="text-xs text-slate-500 mb-2">O elige un estilo:</p>
                                <div className="grid grid-cols-4 gap-2">
                                    {COVER_PRESETS.map((gradient, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => {
                                                setSelectedPreset(idx);
                                                setCoverPreview(null);
                                                setCoverBlob(null);
                                            }}
                                            className={`w-full aspect-square rounded-xl transition-all ${!coverPreview && selectedPreset === idx
                                                ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-slate-900 scale-110"
                                                : "hover:scale-105 opacity-70 hover:opacity-100"
                                                }`}
                                            style={{ background: gradient }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                    </div>

                    {/* Name Input */}
                    <div>
                        <label className="text-sm font-medium text-slate-400 block mb-2">Nombre</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Nombre de la playlist"
                            maxLength={60}
                            autoFocus
                            className="w-full bg-slate-800/60 border border-slate-700 rounded-xl py-3 px-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                        />
                    </div>

                    {/* Description Input */}
                    <div>
                        <label className="text-sm font-medium text-slate-400 block mb-2">Descripción</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Descripción de la playlist"
                            rows={3}
                            maxLength={200}
                            className="w-full bg-slate-800/60 border border-slate-700 rounded-xl py-3 px-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all resize-none"
                        />
                        <p className="text-xs text-slate-600 mt-1 text-right">{description.length}/200</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-5 border-t border-slate-800">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-full text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!name.trim()}
                        className="px-8 py-2.5 rounded-full text-sm font-bold bg-brand-500 hover:bg-brand-600 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-brand-500/25"
                    >
                        Crear
                    </button>
                </div>
            </div>
        </div>
    );
}
