import React from 'react';

export default function Logo({ className = "", size = 40 }: { className?: string; size?: number }) {
    return (
        <div
            className={`relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 via-indigo-500 to-purple-600 shadow-[0_8px_20px_rgba(99,102,241,0.4)] overflow-hidden flex-shrink-0 border border-white/20 group ${className}`}
            style={{ width: size, height: size }}
        >
            {/* Glossy inner reflection */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent opacity-50 pointer-events-none" />

            {/* Modern Animated Wave SVG */}
            <svg
                viewBox="0 0 24 24"
                fill="none"
                className="relative z-10 text-white transform group-hover:scale-110 transition-transform duration-500 ease-out"
                style={{ width: size * 0.55, height: size * 0.55 }}
            >
                {/* Outer ring */}
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.2" fill="currentColor" fillOpacity="0.05" />

                {/* Audio Waves */}
                <path d="M8 13L8 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-[pulse_1s_ease-in-out_infinite]" />
                <path d="M12 8L12 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-[pulse_1.2s_ease-in-out_infinite]" style={{ animationDelay: '150ms' }} />
                <path d="M16 11L16 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-[pulse_0.8s_ease-in-out_infinite]" style={{ animationDelay: '300ms' }} />
            </svg>

            {/* Shine sweep effect on hover */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 transform translate-x-[-100%] group-hover:translate-x-[100%] pointer-events-none" />
        </div>
    );
}
