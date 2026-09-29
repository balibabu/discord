const EMOJI_SEQ_RE =
  /\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*(?:[\u{E0020}-\u{E007F}]+)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*|(?:[0-9#*])\uFE0F?\u20E3|\p{Regional_Indicator}{1,2}/gu

export function jumboEmojiCount(text) {
  if (!text) return 0
  let count = 0
  const rest = text.replace(EMOJI_SEQ_RE, () => {
    count += 1
    return ''
  })
  if (count < 1 || count > 30) return 0
  return rest.replace(/\s/g, '') ? 0 : count
}
