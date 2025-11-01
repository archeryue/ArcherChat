/**
 * Centralized keywords configuration for ArcherChat
 * Supports both English and Chinese (中英文双语支持)
 */

/**
 * Keywords that trigger immediate memory extraction
 * 触发立即记忆提取的关键词
 */
export const MEMORY_TRIGGER_KEYWORDS = {
  english: [
    // Memory-related
    "remember that",
    "don't forget",
    "keep in mind",
    "for future reference",
    "just so you know",
    "please remember",
    "help me remember",

    // Self-introduction
    "my name is",
    "i'm a",
    "i am a",
    "i work as",

    // Preferences
    "i prefer",
    "i like",
    "i don't like",
    "i hate",
    "i love",
    "i tend to",
    "i usually",

    // Language preferences
    "prefer english",
    "prefer chinese",
    "use english",
    "use chinese",
    "speak english",
    "speak chinese",
  ],
  chinese: [
    // Memory-related (记住相关)
    "记住",
    "别忘了",
    "不要忘记",
    "请记住",
    "帮我记住",

    // Self-introduction (自我介绍)
    "我叫",
    "我的名字是",
    "我是",
    "我在",
    "我从事",
    "我的工作是",

    // Preferences (偏好)
    "我喜欢",
    "我不喜欢",
    "我讨厌",
    "我爱",
    "我偏好",
    "我倾向于",
    "我习惯",

    // Language preferences (语言偏好)
    "用英文",
    "用中文",
    "说英文",
    "说中文",
    "英语",
    "中文",
    "偏好英文",
    "偏好中文",

    // Future reference (提醒)
    "以后",
    "将来",
    "下次",
    "顺便说一下",
    "对了",
  ],
};

/**
 * Keywords that trigger image generation
 * 触发图像生成的关键词
 */
export const IMAGE_GENERATION_KEYWORDS = {
  english: [
    "generate image",
    "generate a image",
    "generate an image",
    "create image",
    "create a image",
    "create an image",
    "draw",
    "paint",
    "picture of",
    "image of",
    "image about",
    "illustration of",
    "sketch",
    "design",
    "create a visual",
    "make an image",
    "make a image",
    "generate a picture",
    "visualize",
    "render",
    "artwork",
    "graphic",
  ],
  chinese: [
    "生成图片",
    "生成图像",
    "生成一张图",
    "创建图片",
    "创建图像",
    "画一个",
    "画一张",
    "绘制",
    "制作图片",
    "做一张图",
    "画图",
    "图片",
    "照片",
    "插图",
    "素描",
    "设计",
    "可视化",
    "渲染",
    "艺术作品",
    "图形",
  ],
};

/**
 * Helper function to check if text contains any keywords from a category
 * 辅助函数：检查文本是否包含某类关键词
 */
export function containsKeywords(
  text: string,
  keywordCategory: { english: string[]; chinese: string[] }
): boolean {
  const lowerText = text.toLowerCase();
  const allKeywords = [
    ...keywordCategory.english,
    ...keywordCategory.chinese,
  ];

  return allKeywords.some((keyword) => lowerText.includes(keyword.toLowerCase()));
}

/**
 * Helper function to get all keywords from a category as a flat array
 * 辅助函数：获取某类关键词的扁平数组
 */
export function getAllKeywords(keywordCategory: {
  english: string[];
  chinese: string[];
}): string[] {
  return [...keywordCategory.english, ...keywordCategory.chinese];
}
