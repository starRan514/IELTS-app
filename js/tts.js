// TTS：Web Speech API（Edge/Chrome 自带 en-GB/en-AU 等自然语音）
// 生产版可替换为 Cloudflare Worker 调 Edge TTS 预生成 MP3（见设置页说明）

let voices = [];
let preferredURI = '';
let rate = 1;
let speaking = false;
let onStateChange = null;

function loadVoices() {
  voices = speechSynthesis.getVoices();
}
if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

export function supported() { return 'speechSynthesis' in window; }

export function englishVoices() {
  return voices.filter(v => /^en(-|_)/i.test(v.lang));
}

export function configure({ voiceURI, rate: r }) {
  preferredURI = voiceURI || preferredURI;
  if (r != null) rate = r;
}

export function isSpeaking() { return speaking; }
export function onSpeakState(fn) { onStateChange = fn; }
function setState(v) { speaking = v; onStateChange?.(v); }

export function stop() {
  speechSynthesis.cancel();
  setState(false);
}

// 长文本按句切分，规避部分浏览器 200 字符截断与长文中断问题
function chunk(text) {
  const sentences = text.replace(/([.!?])\s+/g, '$1\n').split('\n');
  const out = [];
  let buf = '';
  for (const s of sentences) {
    if ((buf + ' ' + s).length > 180 && buf) { out.push(buf); buf = s; }
    else buf = buf ? buf + ' ' + s : s;
  }
  if (buf) out.push(buf);
  return out;
}

export function speak(text, { onEnd } = {}) {
  if (!supported()) { onEnd?.(false); return false; }
  stop();
  const parts = chunk(text);
  const v = voices.find(x => x.voiceURI === preferredURI)
    || voices.find(x => /en-GB/i.test(x.lang))
    || voices.find(x => /en[-_]US/i.test(x.lang))
    || voices.find(x => /^en/i.test(x.lang));
  setState(true);
  let i = 0;
  const next = () => {
    if (i >= parts.length) { setState(false); onEnd?.(true); return; }
    const u = new SpeechSynthesisUtterance(parts[i++]);
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = rate;
    u.onend = next;
    u.onerror = () => { setState(false); onEnd?.(false); };
    speechSynthesis.speak(u);
  };
  next();
  return true;
}

// Chrome 在后台会暂停长朗读，定时 resume
let keepAlive = setInterval(() => {
  if (speaking && !speechSynthesis.speaking) speechSynthesis.resume();
}, 9000);
