export interface LetterAudioConfig {
  url: string;
  volume: number;
}

const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');

// N 的鼻音听感偏突出，单独压低一点音量
const letterVolumeOverrides: Record<string, number> = {
  n: 0.6,
};

// 本地字母音频已统一做过去静音和响度归一化，播放时保持同一音量即可。
const lettersAudio: Record<string, LetterAudioConfig> = Object.fromEntries(
  letters.map((letter) => [
    letter,
    {
      url: `letters/${letter}.wav?v=3`,
      volume: letterVolumeOverrides[letter] ?? 0.8,
    },
  ]),
);

export default lettersAudio;
