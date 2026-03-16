import Foundation
import AVFoundation

/// Plays a silent audio loop natively to prevent iOS from suspending the WKWebView
/// when the app enters background. This keeps the AVAudioSession active so that
/// the HTML5 <audio> element in the WebView continues to produce sound.
class BackgroundAudioHelper {
    static let shared = BackgroundAudioHelper()
    
    private var silentPlayer: AVAudioPlayer?
    private var isRunning = false
    
    private init() {}
    
    /// Start the silent audio loop. Call this on app launch.
    func start() {
        guard !isRunning else { return }
        isRunning = true
        
        // Generate a tiny silent WAV in memory (1 second, mono, 8-bit, 8kHz)
        let silentData = generateSilentWAV(durationSeconds: 1.0, sampleRate: 8000)
        
        do {
            silentPlayer = try AVAudioPlayer(data: silentData)
            silentPlayer?.numberOfLoops = -1 // Loop forever
            silentPlayer?.volume = 0.0       // Completely silent
            silentPlayer?.prepareToPlay()
            silentPlayer?.play()
            print("[BackgroundAudioHelper] Silent audio loop started")
        } catch {
            print("[BackgroundAudioHelper] Failed to start silent player: \(error)")
        }
    }
    
    /// Stop the silent audio loop.
    func stop() {
        silentPlayer?.stop()
        silentPlayer = nil
        isRunning = false
        print("[BackgroundAudioHelper] Silent audio loop stopped")
    }
    
    /// Generates a minimal silent WAV file in memory.
    private func generateSilentWAV(durationSeconds: Double, sampleRate: Int) -> Data {
        let numSamples = Int(durationSeconds * Double(sampleRate))
        let bitsPerSample: Int16 = 8
        let numChannels: Int16 = 1
        let byteRate = sampleRate * Int(numChannels) * Int(bitsPerSample) / 8
        let blockAlign = Int(numChannels) * Int(bitsPerSample) / 8
        let dataSize = numSamples * blockAlign
        let fileSize = 36 + dataSize // Total file size minus 8 bytes for RIFF header
        
        var data = Data()
        
        // RIFF header
        data.append(contentsOf: [0x52, 0x49, 0x46, 0x46]) // "RIFF"
        data.append(contentsOf: withUnsafeBytes(of: Int32(fileSize).littleEndian) { Array($0) })
        data.append(contentsOf: [0x57, 0x41, 0x56, 0x45]) // "WAVE"
        
        // fmt subchunk
        data.append(contentsOf: [0x66, 0x6D, 0x74, 0x20]) // "fmt "
        data.append(contentsOf: withUnsafeBytes(of: Int32(16).littleEndian) { Array($0) }) // Subchunk1Size (16 for PCM)
        data.append(contentsOf: withUnsafeBytes(of: Int16(1).littleEndian) { Array($0) })  // AudioFormat (1 = PCM)
        data.append(contentsOf: withUnsafeBytes(of: numChannels.littleEndian) { Array($0) }) // NumChannels
        data.append(contentsOf: withUnsafeBytes(of: Int32(sampleRate).littleEndian) { Array($0) }) // SampleRate
        data.append(contentsOf: withUnsafeBytes(of: Int32(byteRate).littleEndian) { Array($0) })   // ByteRate
        data.append(contentsOf: withUnsafeBytes(of: Int16(blockAlign).littleEndian) { Array($0) }) // BlockAlign
        data.append(contentsOf: withUnsafeBytes(of: bitsPerSample.littleEndian) { Array($0) })     // BitsPerSample
        
        // data subchunk
        data.append(contentsOf: [0x64, 0x61, 0x74, 0x61]) // "data"
        data.append(contentsOf: withUnsafeBytes(of: Int32(dataSize).littleEndian) { Array($0) }) // Subchunk2Size
        
        // Silent samples (0x80 = silence for 8-bit unsigned PCM)
        data.append(contentsOf: [UInt8](repeating: 0x80, count: dataSize))
        
        return data
    }
}
