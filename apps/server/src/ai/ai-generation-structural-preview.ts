/** 仅保留结构标点与空白，所有字符串、数字与自由文本均遮蔽。 */
export const generationStructuralPreview = (
  text: string,
  maxInputCharacters = 4096,
  maxOutputCharacters = 2048,
) => {
  const structure = new Set('{}[]:,`\\ \n\r\t');
  let result = '',
    inString = false,
    escaped = false,
    masked = false;
  for (const character of text.slice(0, maxInputCharacters)) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') {
        result += '"';
        inString = false;
      }
    } else if (character === '"') {
      result += '"[text]';
      inString = true;
      masked = false;
    } else if (structure.has(character)) {
      result += character;
      masked = false;
    } else if (!masked) {
      result += '[value]';
      masked = true;
    }
  }
  return {
    structuralPreview: result.slice(0, maxOutputCharacters),
    truncated: text.length > maxInputCharacters || result.length > maxOutputCharacters,
  };
};
