import React from "react";

export default function EqLoader({ className = "", size = 20 }: { className?: string, size?: number }) {
    return (
        <div style={{ width: size, height: size * 0.8 }} className={`flex items-center justify-center gap-[3px] ${className}`}>
            <div className="w-[20%] h-full bg-current rounded-full animate-[eq_0.8s_ease-in-out_infinite_alternate]" />
            <div className="w-[20%] h-full bg-current rounded-full animate-[eq_1.2s_ease-in-out_infinite_alternate]" />
            <div className="w-[20%] h-full bg-current rounded-full animate-[eq_0.9s_ease-in-out_infinite_alternate]" />
            <div className="w-[20%] h-full bg-current rounded-full animate-[eq_1.1s_ease-in-out_infinite_alternate]" />
        </div>
    );
}
