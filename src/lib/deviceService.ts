"use client";

/**
 * Device Service — Discovers and controls external audio devices
 * Supports: Sonos (UPnP), DLNA, AirPlay (iOS), Alexa
 */

const RAILWAY_API = "https://caleta-music.vercel.app";

export interface ExternalDevice {
    id: string;
    name: string;
    type: 'sonos' | 'dlna' | 'airplay' | 'alexa' | 'bluetooth' | 'chromecast';
    ip?: string;
    port?: number;
    isPlaying?: boolean;
    model?: string;
    roomName?: string;
    volume?: number;
    connected?: boolean;
}

// ─── Sonos UPnP Local API (Port 1400) ────────────────────────

const SONOS_PORT = 1400;

/**
 * Build SOAP envelope for Sonos AVTransport commands
 */
function buildSoapEnvelope(action: string, serviceType: string, body: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="${serviceType}">
      ${body}
    </u:${action}>
  </s:Body>
</s:Envelope>`;
}

/**
 * Send a SOAP command to a Sonos speaker
 */
async function sendSonosCommand(
    ip: string,
    action: string,
    serviceType: string,
    controlURL: string,
    body: string
): Promise<string | null> {
    try {
        const envelope = buildSoapEnvelope(action, serviceType, body);
        const res = await fetch(`http://${ip}:${SONOS_PORT}${controlURL}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset="utf-8"',
                'SOAPAction': `"${serviceType}#${action}"`,
            },
            body: envelope,
        });
        if (!res.ok) return null;
        return await res.text();
    } catch (e) {
        console.warn(`[Sonos] Command failed for ${ip}:`, e);
        return null;
    }
}

/**
 * Play a URL on Sonos speaker via AVTransport SetAVTransportURI + Play
 */
export async function sonosPlayUrl(ip: string, audioUrl: string, title: string = '', artist: string = ''): Promise<boolean> {
    const serviceType = 'urn:schemas-upnp-org:service:AVTransport:1';
    const controlURL = '/MediaRenderer/AVTransport/Control';

    // Build DIDL-Lite metadata
    const metadata = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-dlna-org:metadata-1-0/DIDL-Lite/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/">
  <item id="1" parentID="0" restricted="1">
    <dc:title>${escapeXml(title || 'Caleta Music')}</dc:title>
    <dc:creator>${escapeXml(artist || 'Caleta Music')}</dc:creator>
    <upnp:class>object.item.audioItem.musicTrack</upnp:class>
    <res protocolInfo="http-get:*:audio/mpeg:*">${escapeXml(audioUrl)}</res>
  </item>
</DIDL-Lite>`;

    // Set the URI
    const setResult = await sendSonosCommand(ip, 'SetAVTransportURI', serviceType, controlURL,
        `<InstanceID>0</InstanceID>
        <CurrentURI>${escapeXml(audioUrl)}</CurrentURI>
        <CurrentURIMetaData>${escapeXml(metadata)}</CurrentURIMetaData>`
    );

    if (!setResult) return false;

    // Play
    const playResult = await sendSonosCommand(ip, 'Play', serviceType, controlURL,
        `<InstanceID>0</InstanceID><Speed>1</Speed>`
    );

    return !!playResult;
}

/**
 * Pause playback on Sonos speaker
 */
export async function sonosPause(ip: string): Promise<boolean> {
    const result = await sendSonosCommand(
        ip, 'Pause',
        'urn:schemas-upnp-org:service:AVTransport:1',
        '/MediaRenderer/AVTransport/Control',
        '<InstanceID>0</InstanceID>'
    );
    return !!result;
}

/**
 * Set volume on Sonos speaker (0-100)
 */
export async function sonosSetVolume(ip: string, volume: number): Promise<boolean> {
    const result = await sendSonosCommand(
        ip, 'SetVolume',
        'urn:schemas-upnp-org:service:RenderingControl:1',
        '/MediaRenderer/RenderingControl/Control',
        `<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>${Math.min(100, Math.max(0, volume))}</DesiredVolume>`
    );
    return !!result;
}

/**
 * Get current volume from Sonos speaker
 */
export async function sonosGetVolume(ip: string): Promise<number> {
    const result = await sendSonosCommand(
        ip, 'GetVolume',
        'urn:schemas-upnp-org:service:RenderingControl:1',
        '/MediaRenderer/RenderingControl/Control',
        '<InstanceID>0</InstanceID><Channel>Master</Channel>'
    );
    if (!result) return 50;
    const match = result.match(/<CurrentVolume>(\d+)<\/CurrentVolume>/);
    return match ? parseInt(match[1]) : 50;
}

/**
 * Get Sonos device info (room name, model, etc.)
 */
export async function sonosGetDeviceInfo(ip: string): Promise<{ roomName: string; modelName: string } | null> {
    try {
        const res = await fetch(`http://${ip}:${SONOS_PORT}/xml/device_description.xml`, {
            signal: AbortSignal.timeout(3000)
        });
        if (!res.ok) return null;
        const text = await res.text();
        const roomMatch = text.match(/<roomName>(.*?)<\/roomName>/);
        const modelMatch = text.match(/<modelName>(.*?)<\/modelName>/);
        return {
            roomName: roomMatch?.[1] || 'Sonos Speaker',
            modelName: modelMatch?.[1] || 'Unknown'
        };
    } catch {
        return null;
    }
}

/**
 * Scan local network for Sonos devices by trying common IPs
 * This works when SSDP isn't available (WebView/browser)
 */
export async function scanForSonosDevices(baseIp?: string): Promise<ExternalDevice[]> {
    const devices: ExternalDevice[] = [];

    // Determine the base IP from the user's network
    // Default to common home network ranges
    const bases = baseIp
        ? [baseIp]
        : ['192.168.1', '192.168.0', '192.168.2', '10.0.0', '10.0.1'];

    const scanPromises: Promise<void>[] = [];

    for (const base of bases) {
        for (let i = 1; i <= 254; i++) {
            const ip = `${base}.${i}`;
            scanPromises.push(
                (async () => {
                    try {
                        const info = await sonosGetDeviceInfo(ip);
                        if (info) {
                            devices.push({
                                id: `sonos-${ip}`,
                                name: info.roomName,
                                type: 'sonos',
                                ip,
                                port: SONOS_PORT,
                                model: info.modelName,
                                roomName: info.roomName,
                            });
                        }
                    } catch { /* not a Sonos device */ }
                })()
            );
        }
        // Only scan one subnet at a time to avoid overwhelming the network
        // Break after first subnet that has devices
        await Promise.allSettled(scanPromises);
        if (devices.length > 0) break;
        scanPromises.length = 0;
    }

    return devices;
}

/**
 * Quick scan — only scan a few common IPs
 */
export async function quickScanSonos(): Promise<ExternalDevice[]> {
    const devices: ExternalDevice[] = [];
    const savedDevices = getSavedDeviceIPs();

    // First try saved IPs
    const savedPromises = savedDevices.map(async (ip) => {
        const info = await sonosGetDeviceInfo(ip);
        if (info) {
            devices.push({
                id: `sonos-${ip}`,
                name: info.roomName,
                type: 'sonos',
                ip,
                port: SONOS_PORT,
                model: info.modelName,
                roomName: info.roomName,
            });
        }
    });

    await Promise.allSettled(savedPromises);
    return devices;
}

// ─── Device Persistence ────────────────────────────────

export function saveDeviceIP(ip: string): void {
    try {
        const saved = getSavedDeviceIPs();
        if (!saved.includes(ip)) {
            saved.push(ip);
            localStorage.setItem('caleta-saved-devices', JSON.stringify(saved));
        }
    } catch { /* localStorage not available */ }
}

export function getSavedDeviceIPs(): string[] {
    try {
        const saved = localStorage.getItem('caleta-saved-devices');
        return saved ? JSON.parse(saved) : [];
    } catch {
        return [];
    }
}

export function removeDeviceIP(ip: string): void {
    try {
        const saved = getSavedDeviceIPs().filter(i => i !== ip);
        localStorage.setItem('caleta-saved-devices', JSON.stringify(saved));
    } catch { /* localStorage not available */ }
}

// ─── Helpers ────────────────────────────────

function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Build a streaming URL suitable for external devices
 * External devices need a direct HTTP URL they can fetch
 */
export function buildExternalStreamUrl(trackTitle: string, trackArtist: string, trackId?: string): string {
    if (trackId) {
        return `${RAILWAY_API}/api/deezer?id=${trackId}&title=${encodeURIComponent(trackTitle)}&artist=${encodeURIComponent(trackArtist)}&play=true`;
    }
    return `${RAILWAY_API}/api/deezer?title=${encodeURIComponent(trackTitle)}&artist=${encodeURIComponent(trackArtist)}&play=true`;
}
