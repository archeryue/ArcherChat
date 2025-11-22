/**
 * Image Markdown Stripping Tests
 *
 * Tests the regex pattern used to strip image markdown from content
 * to prevent Firestore size limits and token overflow.
 */

describe('Image Markdown Stripper', () => {
  // The regex pattern used in chat/route.ts and chat/page.tsx
  const stripImageMarkdown = (content: string): string => {
    return content.replace(/!\[Generated Image\]\(data:image\/[^;]+;base64,[A-Za-z0-9+/=\s]+?\)/gs, '[Image generated - not persisted to reduce storage]');
  };

  const extractImageData = (content: string): string | null => {
    const match = content.match(/!\[Generated Image\]\(data:(image\/[^;]+);base64,([A-Za-z0-9+/=\s]+?)\)/s);
    return match ? match[2].replace(/\s/g, '') : null;
  };

  describe('stripImageMarkdown', () => {
    it('should strip simple image markdown', () => {
      const content = 'Here is an image: ![Generated Image](data:image/png;base64,iVBORw0KGgo=) and some text.';
      const result = stripImageMarkdown(content);

      expect(result).toBe('Here is an image: [Image generated - not persisted to reduce storage] and some text.');
      expect(result).not.toContain('base64');
      expect(result).not.toContain('iVBORw0KGgo=');
    });

    it('should strip image with long base64 data', () => {
      const longBase64 = 'iVBORw0KGgoAAAANSUhEUgAAA'.repeat(100);
      const content = `Text before ![Generated Image](data:image/png;base64,${longBase64}) text after`;
      const result = stripImageMarkdown(content);

      expect(result).not.toContain('base64');
      expect(result).not.toContain(longBase64);
      expect(result).toContain('Text before');
      expect(result).toContain('text after');
    });

    it('should strip image with newlines in base64', () => {
      const base64WithNewlines = `iVBORw0KGgo
AAAANSUhEUg
AABAAAAAQ
ACAIAAAdw`;
      const content = `![Generated Image](data:image/png;base64,${base64WithNewlines})`;
      const result = stripImageMarkdown(content);

      expect(result).not.toContain('base64');
      expect(result).not.toContain('iVBORw0KGgo');
      expect(result).toBe('[Image generated - not persisted to reduce storage]');
    });

    it('should handle multiple images in content', () => {
      const content = `First image: ![Generated Image](data:image/png;base64,ABC123)
Some text in between.
Second image: ![Generated Image](data:image/jpeg;base64,XYZ789)`;

      const result = stripImageMarkdown(content);

      expect(result).not.toContain('base64');
      expect(result).not.toContain('ABC123');
      expect(result).not.toContain('XYZ789');
      expect(result).toContain('Some text in between');
    });

    it('should preserve non-image markdown', () => {
      const content = `# Heading
**Bold text** and *italic*
- List item
[Regular link](https://example.com)
![Generated Image](data:image/png;base64,ABC123)`;

      const result = stripImageMarkdown(content);

      expect(result).toContain('# Heading');
      expect(result).toContain('**Bold text**');
      expect(result).toContain('[Regular link](https://example.com)');
      expect(result).not.toContain('base64');
    });

    it('should handle content with no images', () => {
      const content = 'Just regular text with no images.';
      const result = stripImageMarkdown(content);

      expect(result).toBe(content);
    });

    it('should handle empty content', () => {
      const result = stripImageMarkdown('');
      expect(result).toBe('');
    });

    it('should handle different image formats', () => {
      const pngContent = '![Generated Image](data:image/png;base64,PNG123)';
      const jpegContent = '![Generated Image](data:image/jpeg;base64,JPEG456)';
      const webpContent = '![Generated Image](data:image/webp;base64,WEBP789)';

      expect(stripImageMarkdown(pngContent)).not.toContain('PNG123');
      expect(stripImageMarkdown(jpegContent)).not.toContain('JPEG456');
      expect(stripImageMarkdown(webpContent)).not.toContain('WEBP789');
    });
  });

  describe('extractImageData', () => {
    it('should extract base64 data from image markdown', () => {
      const content = '![Generated Image](data:image/png;base64,iVBORw0KGgo=)';
      const extracted = extractImageData(content);

      expect(extracted).toBe('iVBORw0KGgo=');
    });

    it('should extract and strip whitespace from base64', () => {
      const contentWithWhitespace = `![Generated Image](data:image/png;base64,iVBORw0
KGgo
AAAA)`;
      const extracted = extractImageData(contentWithWhitespace);

      expect(extracted).toBe('iVBORw0KGgoAAAA');
      expect(extracted).not.toContain('\n');
      expect(extracted).not.toContain(' ');
    });

    it('should return null if no image found', () => {
      const content = 'Just text with no image';
      const extracted = extractImageData(content);

      expect(extracted).toBeNull();
    });

    it('should extract from content with surrounding text', () => {
      const content = 'Here is the image: ![Generated Image](data:image/png;base64,ABC123XYZ) and more text';
      const extracted = extractImageData(content);

      expect(extracted).toBe('ABC123XYZ');
    });
  });

  describe('Integration - Strip and Extract', () => {
    it('should be able to extract then strip without issues', () => {
      const original = 'Text before ![Generated Image](data:image/png;base64,TestData123) text after';

      // Extract first
      const extracted = extractImageData(original);
      expect(extracted).toBe('TestData123');

      // Then strip
      const stripped = stripImageMarkdown(original);
      expect(stripped).not.toContain('base64');
      expect(stripped).toContain('Text before');
      expect(stripped).toContain('text after');
    });

    it('should handle very large base64 strings', () => {
      // Simulate a realistic image size (~100KB base64)
      const largeBase64 = 'A'.repeat(100000);
      const content = `![Generated Image](data:image/png;base64,${largeBase64})`;

      const stripped = stripImageMarkdown(content);
      expect(stripped.length).toBeLessThan(100);
      expect(stripped).not.toContain(largeBase64);
    });
  });
});
