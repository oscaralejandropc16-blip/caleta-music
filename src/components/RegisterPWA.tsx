"use client";

import { useEffect } from "react";

export default function RegisterPWA() {
    useEffect(() => {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker
                .register("/sw.js")
                .then((registration) => {
                    console.log("Service Worker registrado con alcance:", registration.scope);
                })
                .catch((err) => {
                    console.error("Error registrando Service Worker:", err);
                });
        }
    }, []);

    return null;
}
