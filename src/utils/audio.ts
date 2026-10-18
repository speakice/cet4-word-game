import letterConfig from './letter';

// 定义类型
interface LetterAudio {
  text: string;
  type: 'file';
  src: string;
}

interface OnlineAudio {
  text: string;
  type: 'file';
  src: string;
}

interface CurrentOnlineAudio {
  utterance?: SpeechSynthesisUtterance;
  audio?: HTMLAudioElement;
  text?: string;
  name?: string;
  url?: string;
}

type ProgressCallback = (loaded: number, total: number) => void;

const YOUDAO_AUDIO_API = 'https://dict.youdao.com/dictvoice';

// 把字母名写成读音，避免 TTS 把单个 "a" 读成冠词 "uh"
const LETTER_NAMES: Record<string, string> = {
  a: 'ay',
  b: 'bee',
  c: 'see',
  d: 'dee',
  e: 'ee',
  f: 'eff',
  g: 'gee',
  h: 'aitch',
  i: 'eye',
  j: 'jay',
  k: 'kay',
  l: 'ell',
  m: 'em',
  n: 'en',
  o: 'oh',
  p: 'pee',
  q: 'cue',
  r: 'ar',
  s: 'ess',
  t: 'tee',
  u: 'you',
  v: 'vee',
  w: 'double you',
  x: 'ex',
  y: 'why',
  z: 'zee',
};

// macOS / Windows / Chrome 上比较自然、清晰的英文语音
const PREFERRED_VOICE_NAMES = [
  'samantha',
  'ava',
  'allison',
  'susan',
  'alex',
  'karen',
  'daniel',
  'moira',
  'tessa',
  'fiona',
  'google us english',
  'microsoft aria',
  'microsoft jenny',
  'microsoft zira',
  'microsoft michelle',
  'microsoft mark',
];

// 系统自带的搞怪音色，听起来会非常怪，需要明确排除
const UNSUITABLE_VOICE_NAMES = [
  'albert',
  'bad news',
  'bahh',
  'bells',
  'boing',
  'bubbles',
  'cellos',
  'good news',
  'jester',
  'organ',
  'superstar',
  'trinoids',
  'whisper',
  'wobble',
  'zarvox',
  'fred',
  'junior',
  'ralph',
  'grandma',
  'grandpa',
  'eddy',
  'flo',
  'reed',
  'rocko',
  'sandy',
  'shelley',
];

const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

// 单例音频管理器工具类
class AudioManager {
  private static instance: AudioManager;

  private letterAudios: Map<string, LetterAudio> = new Map();
  private letterAudioElements: Map<string, HTMLAudioElement> = new Map();
  private letterBlobUrls: Map<string, string> = new Map();
  private letterPreloadPromises: Map<string, Promise<string>> = new Map();
  private allLettersPreloadPromise: Promise<boolean> | null = null;
  private onlineAudios: Map<string, OnlineAudio> = new Map();
  private onlineAudioElements: Map<string, HTMLAudioElement> = new Map();
  private activeLetterAudios: Set<HTMLAudioElement> = new Set();
  private playingLetters: Set<string> = new Set();
  private currentOnlineAudio: CurrentOnlineAudio | null = null;
  private letterUtterance: SpeechSynthesisUtterance | null = null;
  private letterSpeechId: number = 0;
  private voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

  private letterVolume: number = 0.7;
  private onlineVolume: number = 0.8;
  private isLooping: boolean = false;

  private constructor() {
    if (AudioManager.instance) {
      return AudioManager.instance;
    }
    AudioManager.instance = this;

    return this;
  }

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  private resolveAssetUrl(path: string): string {
    const base = import.meta.env.BASE_URL || './';
    try {
      return new URL(`${base}${path}`, window.location.href).href;
    } catch {
      return `${base}${path}`;
    }
  }

  private supportsSpeech(): boolean {
    return (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined'
    );
  }

  private loadVoices(): Promise<SpeechSynthesisVoice[]> {
    if (!this.supportsSpeech()) {
      return Promise.resolve([]);
    }

    const existing = speechSynthesis.getVoices();
    if (existing.length > 0) {
      return Promise.resolve(existing);
    }

    if (!this.voicesPromise) {
      this.voicesPromise = new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          speechSynthesis.removeEventListener('voiceschanged', finish);
          const voices = speechSynthesis.getVoices();
          if (voices.length === 0) {
            this.voicesPromise = null;
          }
          resolve(voices);
        };

        speechSynthesis.addEventListener('voiceschanged', finish);
        window.setTimeout(finish, 1500);
      });
    }

    return this.voicesPromise;
  }

  private scoreVoice(voice: SpeechSynthesisVoice): number {
    const name = voice.name.toLowerCase();
    const lang = voice.lang.toLowerCase().replace('_', '-');

    let score = 0;
    if (lang === 'en-us') {
      score += 100;
    } else if (lang.startsWith('en-us')) {
      score += 90;
    } else if (lang === 'en-gb') {
      score += 80;
    } else if (lang.startsWith('en-gb')) {
      score += 70;
    } else if (lang.startsWith('en')) {
      score += 40;
    } else {
      return -1000;
    }

    if (name.includes('natural') || name.includes('neural')) {
      score += 60;
    }
    if (name.includes('premium') || name.includes('enhanced')) {
      score += 35;
    }
    if (PREFERRED_VOICE_NAMES.some((item) => name.startsWith(item))) {
      score += 25;
    }
    if (UNSUITABLE_VOICE_NAMES.some((item) => name.includes(item))) {
      score -= 300;
    }
    if (voice.localService) {
      score += 3;
    }

    return score;
  }

  private async getBestVoice(): Promise<SpeechSynthesisVoice | undefined> {
    const voices = await this.loadVoices();
    if (voices.length === 0) {
      return undefined;
    }
    return [...voices].sort((a, b) => this.scoreVoice(b) - this.scoreVoice(a))[0];
  }

  private async speak(
    text: string,
    volume: number,
    rate: number,
    pitch: number,
    isCancelled?: () => boolean,
  ): Promise<SpeechSynthesisUtterance | null> {
    if (!this.supportsSpeech()) {
      return null;
    }

    const voice = await this.getBestVoice();
    if (isCancelled?.()) {
      return null;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'en-US';
    }
    utterance.volume = clamp(volume);
    utterance.rate = clamp(rate, 0.5, 2);
    utterance.pitch = clamp(pitch, 0, 2);

    speechSynthesis.speak(utterance);
    return utterance;
  }

  private async speakLetter(letter: string, volume: number): Promise<void> {
    const speechId = ++this.letterSpeechId;
    const text = LETTER_NAMES[letter] || letter;
    const utterance = await this.speak(
      text,
      volume,
      0.95,
      1.0,
      () => speechId !== this.letterSpeechId,
    );
    if (!utterance) {
      return;
    }

    this.letterUtterance = utterance;
    utterance.onend = () => {
      if (this.letterUtterance === utterance) {
        this.letterUtterance = null;
      }
    };
    utterance.onerror = () => {
      if (this.letterUtterance === utterance) {
        this.letterUtterance = null;
      }
    };
  }

  // 预加载所有字母音频，直到 26 个字母全部缓存完成
  preloadAllLetters(
    onProgress: ProgressCallback | null = null,
  ): Promise<boolean> {
    if (this.allLettersPreloadPromise) {
      return this.allLettersPreloadPromise;
    }

    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    let loadedCount = 0;

    this.allLettersPreloadPromise = Promise.all(
      letters.map(async (letter) => {
        try {
          await this.preloadLetterAsset(letter);
        } catch (error) {
          console.error(`预加载字母 ${letter} 失败:`, error);
        } finally {
          loadedCount++;
          if (onProgress) {
            onProgress(loadedCount, letters.length);
          }
        }
      }),
    ).then(() => true);

    return this.allLettersPreloadPromise;
  }

  // 优先缓存即将学习单词里的字母，再后台补齐全部 26 个字母
  async preloadLettersForWords(words: string[]): Promise<void> {
    const letters = new Set<string>();
    for (const word of words) {
      for (const char of word.toLowerCase()) {
        if (char >= 'a' && char <= 'z') {
          letters.add(char);
        }
      }
    }

    await this.preloadLetterAssets(Array.from(letters));
    void this.preloadAllLetters();
  }

  private async preloadLetterAssets(letters: string[]): Promise<void> {
    const queue = Array.from(new Set(letters));
    const workerCount = Math.min(4, queue.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (queue.length > 0) {
          const letter = queue.shift();
          if (letter) {
            await this.preloadLetterAsset(letter);
          }
        }
      }),
    );
  }

  // 通过 fetch 把音频完整下载成 Blob，播放时不再依赖网络
  private preloadLetterAsset(letter: string): Promise<string> {
    const key = letter.toLowerCase();
    const cachedBlobUrl = this.letterBlobUrls.get(key);
    if (cachedBlobUrl) {
      return Promise.resolve(cachedBlobUrl);
    }

    const pending = this.letterPreloadPromises.get(key);
    if (pending) {
      return pending;
    }

    const config = letterConfig[key];
    const url = this.resolveAssetUrl(config?.url || `letters/${key}.wav`);
    const promise = fetch(url, { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        this.letterBlobUrls.set(key, blobUrl);

        const audio = new Audio(blobUrl);
        audio.preload = 'auto';
        audio.volume = clamp((config?.volume ?? 0.8) * this.letterVolume);
        audio.load();
        this.letterAudioElements.set(key, audio);

        return blobUrl;
      })
      .catch((error) => {
        console.warn(`预加载字母 ${key} 音频失败，播放时回退网络:`, error);
        return url;
      })
      .finally(() => {
        this.letterPreloadPromises.delete(key);
      });

    this.letterPreloadPromises.set(key, promise);
    return promise;
  }

  // 预加载单个字母音频
  preloadLetter(letter: string): Promise<LetterAudio> {
    const key = letter.toLowerCase();
    void this.preloadLetterAsset(key);

    const cached = this.letterAudios.get(key);
    if (cached) {
      return Promise.resolve(cached);
    }

    const config = letterConfig[key];
    const src = this.resolveAssetUrl(config?.url || `letters/${key}.wav`);
    const letterAudio: LetterAudio = {
      text: key,
      type: 'file',
      src,
    };

    this.letterAudios.set(key, letterAudio);

    // 提前准备好 TTS 语音列表，作为本地音频失败时的兜底
    void this.loadVoices();

    return Promise.resolve(letterAudio);
  }

  // 播放字母音频（支持同时播放多个）
  playLetter(
    letter: string,
    volume: number | null = null,
    speed: number = 1.0,
  ): boolean {
    const key = letter.toLowerCase();
    const config = letterConfig[key];
    if (!config) {
      return false;
    }

    // 打字时先停掉上一个字母和正在朗读的单词
    this.stopOnlineAudio();
    this.stopAllLetters();

    // 优先使用已经下载到内存的 Blob，按键时不再等待网络
    const cachedBlobUrl = this.letterBlobUrls.get(key);
    if (!cachedBlobUrl) {
      void this.preloadLetterAsset(key);
    }
    const src =
      cachedBlobUrl ??
      this.letterAudioElements.get(key)?.src ??
      this.resolveAssetUrl(config.url);
    const audio = new Audio(src);
    const targetVolume = clamp((volume ?? config.volume) * this.letterVolume);
    audio.volume = targetVolume;
    audio.playbackRate = clamp(speed, 0.5, 2);
    (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;

    this.activeLetterAudios.add(audio);
    this.playingLetters.add(key);

    let fallbackStarted = false;
    const fallbackToSpeech = () => {
      if (fallbackStarted) return;
      fallbackStarted = true;
      this.activeLetterAudios.delete(audio);
      this.playingLetters.delete(key);
      audio.onended = null;
      audio.onerror = null;
      void this.speakLetter(key, targetVolume);
    };

    audio.onended = () => {
      this.activeLetterAudios.delete(audio);
      this.playingLetters.delete(key);
    };
    audio.onerror = fallbackToSpeech;

    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(fallbackToSpeech);
    }

    return true;
  }

  // 播放错误音频
  playErrorSound(): void {
    try {
      const audio = new Audio(this.resolveAssetUrl('error-sound.mp3'));
      audio.volume = this.onlineVolume;
      audio.play().catch((e) => {
        console.error('播放错误音频失败:', e);
      });
    } catch (error) {
      console.error('播放错误音频失败:', error);
    }
  }

  // 停止所有字母音频
  stopAllLetters(): void {
    this.letterSpeechId++;
    this.activeLetterAudios.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    this.activeLetterAudios.clear();
    this.playingLetters.clear();

    if (this.letterUtterance) {
      this.letterUtterance = null;
      if (this.supportsSpeech()) {
        speechSynthesis.cancel();
      }
    }
  }

  // 根据单词生成在线音频URL
  private _getOnlineAudioUrl(word: string): string {
    return `${YOUDAO_AUDIO_API}?type=0&audio=${encodeURIComponent(word)}`;
  }

  // 预加载单个在线音乐（句子或单词）
  preloadOnlineAudio(text: string): Promise<OnlineAudio> {
    if (!text) {
      return Promise.reject(new Error('Empty audio text'));
    }

    const cached = this.onlineAudios.get(text);
    if (cached) {
      return Promise.resolve(cached);
    }

    const src = this._getOnlineAudioUrl(text);
    const onlineAudio: OnlineAudio = {
      text,
      type: 'file',
      src,
    };
    this.onlineAudios.set(text, onlineAudio);

    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.volume = this.onlineVolume;
    audio.load();
    this.onlineAudioElements.set(text, audio);

    // 提前准备好 TTS 语音，网络音频失败时可以直接兜底
    void this.loadVoices();

    return Promise.resolve(onlineAudio);
  }

  // 预加载所有在线音乐（句子或单词）
  async preloadAllOnlineAudios(
    texts: string[],
    onProgress: ProgressCallback | null = null,
  ): Promise<boolean> {
    const validTexts = texts.filter(Boolean);
    let loadedCount = 0;

    await Promise.all(
      validTexts.map(async (text) => {
        try {
          await this.preloadOnlineAudio(text);
        } catch (error) {
          console.error(`预加载在线音乐 ${text} 失败:`, error);
        } finally {
          loadedCount++;
          if (onProgress) {
            onProgress(loadedCount, validTexts.length);
          }
        }
      }),
    );

    return true;
  }

  // 播放在线音乐（句子或单词）
  async playOnlineAudio(
    text: string,
    volume: number | null = null,
    rate: number = 1.0,
    pitch: number = 1.0,
  ): Promise<HTMLAudioElement | SpeechSynthesisUtterance | null> {
    if (!text) {
      return null;
    }

    this.stopAllLetters();
    this.stopOnlineAudio();

    const targetVolume = clamp(volume ?? this.onlineVolume);
    let audio = this.onlineAudioElements.get(text);
    if (!audio) {
      const src = this._getOnlineAudioUrl(text);
      audio = new Audio(src);
      audio.preload = 'auto';
      this.onlineAudioElements.set(text, audio);
      this.onlineAudios.set(text, { text, type: 'file', src });
    }

    audio.volume = targetVolume;
    audio.playbackRate = clamp(rate, 0.5, 2);
    (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    try {
      audio.currentTime = 0;
    } catch {
      // 音频尚未加载完成时，部分浏览器会拒绝设置 currentTime
    }

    this.currentOnlineAudio = {
      audio,
      text,
    };

    let fellBack = false;
    const fallbackToSpeech = async () => {
      if (fellBack) return;
      fellBack = true;
      if (this.currentOnlineAudio?.audio !== audio) {
        return;
      }
      const utterance = await this.speak(text, targetVolume, rate, pitch);
      if (utterance) {
        this.currentOnlineAudio = {
          utterance,
          text,
        };
      }
    };

    audio.onerror = () => {
      void fallbackToSpeech();
    };

    try {
      await audio.play();
      audio.onerror = null;
      return audio;
    } catch (error) {
      console.warn('在线音频播放失败，改用浏览器朗读:', error);
      await fallbackToSpeech();
      return this.currentOnlineAudio?.utterance ?? null;
    }
  }

  // 暂停在线音乐
  pauseOnlineAudio(): void {
    if (!this.currentOnlineAudio) {
      return;
    }

    if (this.currentOnlineAudio.utterance && this.supportsSpeech()) {
      speechSynthesis.pause();
    } else if (this.currentOnlineAudio.audio) {
      this.currentOnlineAudio.audio.pause();
    }
  }

  // 恢复在线音乐
  resumeOnlineAudio(): void {
    if (!this.currentOnlineAudio) {
      return;
    }

    if (this.currentOnlineAudio.utterance && this.supportsSpeech()) {
      speechSynthesis.resume();
    } else if (this.currentOnlineAudio.audio) {
      this.currentOnlineAudio.audio.play().catch((e) => {
        console.error('恢复在线音乐失败:', e);
      });
    }
  }

  // 停止在线音乐
  stopOnlineAudio(): void {
    if (!this.currentOnlineAudio) {
      return;
    }

    if (this.currentOnlineAudio.utterance && this.supportsSpeech()) {
      speechSynthesis.cancel();
    } else if (this.currentOnlineAudio.audio) {
      this.currentOnlineAudio.audio.pause();
      this.currentOnlineAudio.audio.currentTime = 0;
    }
    this.currentOnlineAudio = null;
  }

  // 设置字母音量
  setLetterVolume(volume: number): void {
    this.letterVolume = clamp(volume);
  }

  // 设置在线音乐音量
  setOnlineVolume(volume: number): void {
    this.onlineVolume = clamp(volume);
    if (this.currentOnlineAudio) {
      if (this.currentOnlineAudio.utterance) {
        this.currentOnlineAudio.utterance.volume = this.onlineVolume;
      } else if (this.currentOnlineAudio.audio) {
        this.currentOnlineAudio.audio.volume = this.onlineVolume;
      }
    }
  }

  // 设置循环
  setLoop(loop: boolean): void {
    this.isLooping = loop;
    if (this.currentOnlineAudio?.audio) {
      this.currentOnlineAudio.audio.loop = loop;
    }
  }

  // 获取播放状态
  getPlaybackStatus(): {
    playingLetters: string[];
    currentOnlineAudio: CurrentOnlineAudio | null;
    lettersCached: boolean;
  } {
    return {
      playingLetters: Array.from(this.playingLetters),
      currentOnlineAudio: this.currentOnlineAudio,
      lettersCached: this.letterAudios.size === 26,
    };
  }

  // 获取缓存状态
  getCacheStatus(): {
    lettersCached: boolean;
    onlineAudios: Record<string, OnlineAudio>;
  } {
    return {
      lettersCached: this.letterAudios.size === 26,
      onlineAudios: Object.fromEntries(this.onlineAudios) as Record<string, OnlineAudio>,
    };
  }
}

export default AudioManager.getInstance();
