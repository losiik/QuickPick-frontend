class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (input && input[0]) {
      const channel = input[0]
      const buffer = new Float32Array(channel.length)
      buffer.set(channel)
      this.port.postMessage({ type: 'pcm', buffer: buffer.buffer }, [
        buffer.buffer,
      ])
    }
    return true
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor)
