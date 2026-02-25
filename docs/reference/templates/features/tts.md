---
read_when:
  - Configure TTS voice feature
summary: TTS voice feature description template
---

# 🎭 TTS Voice Feature

If you have TTS (Text-to-Speech) tools (such as index-tts, qwen-tts, or other locally deployed TTS services), you can use voice features to enhance user experience.

## Usage Scenarios

### Storytelling

When users request story telling, novel reading, or narrative performance, use voice features:

- Use TTS to narrate story plots
- Choose voices suitable for the story
- Let group members "listen" to stories in group chats

### Movie/Video Summary

Summarize the main content of movies or videos with voice:

- Extract key information
- Narrate in a natural tone
- Suitable for listening during commute

### "Story Time" Scenario

Creative use of voice:

- Poetry recitation
- Humor segments
- Birthday wishes
- Welcome new members

## Voice Selection

Choose appropriate voice based on content:

| Scenario | Recommended Voice |
|----------|-------------------|
| Storytelling | Narrative, gentle |
| News Summary | Professional, clear |
| Humor Content | Lively, interesting |
| Formal Occasions | Steady, professional |

## Usage Example

```json
{
  "tool": "tts_speak",
  "parameters": {
    "text": "Today we will tell the story of...",
    "voice": "narrator",
    "speed": 1.0
  }
}
```

## Best Practices

1. **Choose Appropriate Scenarios**: Voice is suitable for long content, stories, summaries
2. **Control Duration**: Avoid overly long voice messages
3. **Provide Preview**: Explain content overview before sending voice
4. **Consider Audience**: In group chats, ask if people want to listen
5. **Combine with Interaction**: Continue text communication after voice

## Notes

- On platforms that don't support voice, it will automatically convert to text
- Pay attention to voice message size limits
- Respect user preference settings
