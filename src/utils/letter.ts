export interface LetterAudioConfig {
  url: string;
  volume: number;
}

const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');

// 本地字母音频已统一做过去静音和响度归一化，播放时保持同一音量即可。
const lettersAudio: Record<string, LetterAudioConfig> = Object.fromEntries(
  letters.map((letter) => [
    letter,
    {
      url: `letters/${letter}.wav?v=3`,
      volume: 0.8,
    },
  ]),
);

export default lettersAudio;
