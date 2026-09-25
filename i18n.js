/**
 * ChromaIQ Internationalization Engine (i18n.js)
 * Version: 2.1.0
 * Supports: Arabic (RTL) | English (LTR)
 * Future-proof: add a 3rd+ language by dropping /locales/<code>.json and
 * calling i18n.setLanguage('<code>') — it will be fetched on demand.
 *
 * IMPORTANT: Arabic and English are embedded directly below (no network
 * fetch, no async wait) so that i18n.init() completes fully synchronously.
 * This matters because java.js calls i18n.t() at top-level script
 * execution (e.g. the AI assistant's welcome message) — if init() were
 * async/fetch-based, that call could race ahead of translations loading.
 *
 * Usage:
 *   1. Load this script BEFORE java.js: <script src="i18n.js"></script>
 *   2. Add data-i18n attributes to elements:
 *        <span data-i18n="nav.home"></span>
 *        <input data-i18n-placeholder="common.loading" />
 *        <img data-i18n-alt="common.preview" />
 *        <button data-i18n-aria="accessibility.closeModal"></button>
 *   3. i18n.init() runs automatically (synchronously for ar/en).
 */

(function (window) {
  'use strict';

  /* ─── CONFIGURATION ─────────────────────────────────────── */
  const CONFIG = {
    defaultLang:   'en',
    storageKey:    'chromaiq_lang',
    localesPath:   './locales/',  // used only for languages NOT embedded below
    supportedLangs: ['ar', 'en'],
    transitionDuration: 220,      // ms for fade transition
  };

  /* ─── STATE ─────────────────────────────────────────────── */
  let _currentLang = CONFIG.defaultLang;
  let _isInitialized = false;

  /* ─── EMBEDDED TRANSLATIONS (synchronous, no network needed) ─── */
  const _translations = {
    en: {
  "_meta": {
    "lang": "en",
    "dir": "ltr",
    "name": "English",
    "font": "'Inter', 'Space Grotesk', sans-serif"
  },
  "nav": {
    "gradingHub": "Interactive Analysis",
    "colorWheel": "Color Wheel",
    "objectRemover": "Object Remover",
    "stickerMaker": "Sticker Maker",
    "imageEnhancer": "Image Enhancer",
    "openMenu": "Open menu"
  },
  "common": {
    "processing": "Processing...",
    "uploadFirstError": "Please upload an image first.",
    "copiedColor": "Copied: ",
    "finalTouches": "Final touches...",
    "processingError": "An error occurred during processing. Please try again.",
    "aiWorkingOnPhoto": "AI is working on your photo...",
    "original": "Original",
    "dragDropPrompt": "Drag your photo here or click to browse",
    "supportedFormatsHiRes": "Supports JPG · JPEG · PNG · WEBP — high resolution supported",
    "browseFiles": "Browse Files",
    "pasteImage": "Paste (Ctrl+V)",
    "eraser": "Eraser",
    "size": "Size",
    "zoomOut": "Zoom Out",
    "zoomIn": "Zoom In",
    "undoCtrlZ": "Undo (Ctrl+Z)",
    "redoCtrlY": "Redo (Ctrl+Y)",
    "undo": "Undo",
    "redo": "Redo",
    "uploadNewImage": "Upload New Image",
    "changeImage": "Change Image",
    "successTitle": "Success!",
    "compare": "Compare",
    "sideBySide": "Side by Side",
    "before": "Before",
    "after": "After",
    "downloadImage": "Download Image",
    "revertOriginal": "Revert to Original",
    "newImage": "New Image",
    "uploadPhoto": "Upload Photo",
    "smartProcessing": "Smart Processing",
    "brush": "Brush",
    "white": "White",
    "black": "Black",
    "sharp": "Sharp",
    "soft": "Soft",
    "copyToClipboard": "Copy to Clipboard",
    "copied": "Copied!",
    "quality": "Quality",
    "image": "Image",
    "download": "Download",
    "pasteFromClipboard": "Paste from Clipboard",
    "preview": "Preview",
    "reset": "Reset",
    "photography": "Photography",
    "processingComplete": "Processing complete!",
    "versionLabel": "Version ",
    "save": "Save",
    "cancel": "Cancel"
  },
  "colorGrading": {
    "title": "Interactive Color Grading Engine",
    "subtitle": "Upload your photo for automatic analysis, then drag the markers inside the wheels to manually adjust color tones.",
    "wheelsTitle": "Control Wheels (Shadows, Midtones, Highlights)",
    "quickLooks": "Quick Cinematic Looks",
    "analyzingColors": "Analyzing and separating colors...",
    "applyingCinemaFilter": "Applying cinematic filter...",
    "shadowsLabel": "Shadows",
    "midtonesLabel": "Midtones",
    "highlightsLabel": "Highlights",
    "lookTealOrange": "Teal & Orange",
    "lookGoldenHour": "Golden Hour",
    "lookCyberpunk": "Cyberpunk"
  },
  "colorGradingV2": {
    "tabWheels": "WHEELS", "tabTone": "TONE", "tabScopes": "SCOPES",
    "tabPresets": "PRESETS",
    "wheelLift": "LIFT", "wheelLiftSub": "Shadows",
    "wheelGamma": "GAMMA", "wheelGammaSub": "Mids",
    "wheelGain": "GAIN", "wheelGainSub": "Highlights",
    "wheelOffset": "OFFSET", "wheelOffsetSub": "Global",
    "resetWheels": "Reset All Wheels", "strength": "STR",
    "before": "Before", "split": "Split",
    "export": "Export", "newPhoto": "New",
    "scopeHistogram": "HISTOGRAM", "scopeParade": "RGB PARADE", "scopeVectorscope": "VECTORSCOPE",
    "toneExposure": "Exposure", "toneSaturation": "Saturation",
    "toneContrast": "Contrast", "toneVibrance": "Vibrance",
    "toneShadows": "Shadows", "toneHighlights": "Highlights",
    "toneTemperature": "Temperature", "toneTint": "Tint"
  },
  "colorHarmony": {
    "title": "Color Harmony Wheel",
    "subtitle": "Generate harmonious palettes based on mathematical design principles.",
    "complementary": "Complementary Colors (180°)",
    "analogous": "Analogous Colors (30°)",
    "triadic": "Triadic Harmony (120°)",
    "generate": "Generate Palette"
  },
  "objectRemoval": {
    "title": "AI Object Remover",
    "subtitle": "Remove any unwanted element from your photo with a single brush stroke, with natural and professional background reconstruction",
    "stepUpload": "Upload Photo",
    "stepSelect": "Select Object",
    "stepResult": "Result",
    "objPeople": "People in the background",
    "objCars": "Cars",
    "objWires": "Power lines",
    "objSigns": "Signs and logos",
    "objReflections": "Shadows and reflections",
    "objOther": "Any unwanted element",
    "brushTool": "Selection Brush",
    "clearSelection": "Clear Selection",
    "tip": "Paint over the object you want to remove. Use the mouse wheel to zoom. Ctrl+Z to undo.",
    "removeWithAI": "Remove Object with AI",
    "removeMore": "Remove More",
    "versionHistory": "Version History",
    "drawSelectionFirst": "Please paint the selection area with the brush first",
    "stageAnalyzingMask": "Analyzing selection mask...",
    "stageExtracting": "Extracting selected object...",
    "stageRebuilding": "Rebuilding background...",
    "stageRefiningColors": "Refining colors and edges...",
    "originalRestored": "Original image restored"
  },
  "stickerMaker": {
    "title": "AI Sticker Maker",
    "subtitle": "Turn any photo into a high-quality transparent sticker in seconds — background removal + professional effects + instant export",
    "stepEditExport": "Edit & Export",
    "uploadFormats": "Supports JPG · JPEG · PNG · WEBP — AI automatically removes the background",
    "idealFor": "Ideal for:",
    "examplePeople": "People & portraits",
    "exampleProducts": "Products & stores",
    "examplePets": "Pets",
    "exampleNature": "Plants & nature",
    "exampleVehicles": "Cars & vehicles",
    "exampleAnything": "Anything!",
    "stageAnalyzing": "Analyzing image and detecting foreground...",
    "stageExtractingColors": "Extracting background colors...",
    "stageComputingMask": "Computing transparency mask...",
    "stageRefiningEdges": "Refining fine edges...",
    "eraseTool": "Erase (remove area)",
    "restoreTool": "Restore Area",
    "resetCrop": "Reset Crop",
    "viewOriginal": "View Original",
    "viewSticker": "View Sticker",
    "tip": "Use the erase brush to remove extra areas, or restore to bring back removed parts. Use the mouse wheel to zoom.",
    "previewBackground": "Preview Background",
    "checkerboard": "Checkerboard",
    "edgeRefinement": "Edge Refinement",
    "effectsTitle": "Sticker Effects",
    "exportTitle": "Export Sticker",
    "downloadTransparentPng": "Download Transparent PNG",
    "clipboardNotSupported": "Clipboard copy isn't supported in this browser — download the image instead",
    "effectNone": "No Effect",
    "effectOutlineWhite": "White Outline",
    "effectOutlineBlack": "Black Outline",
    "effectShadow": "Soft Shadow",
    "effectGlow": "Purple Glow",
    "effectPop3d": "3D Pop Effect",
    "effectCartoon": "Cartoon"
  },
  "imageEnhancer": {
    "title": "AI Image Enhancer",
    "subtitle": "Enhance your photo quality, remove noise, and multiply resolution — complete AI technology with no external software",
    "stepPreviewExport": "Preview & Export",
    "uploadPromptMulti": "Drag your photos here or click to browse",
    "uploadFormatsMulti": "Supports JPG · JPEG · PNG · WEBP — you can upload multiple photos for batch processing",
    "pasteHint": "Or press <kbd>Ctrl</kbd> + <kbd>V</kbd> to paste an image directly from the clipboard",
    "featUpscale": "Upscale 2×/4×/8×",
    "featSharpness": "Enhance Detail & Sharpness",
    "featDenoise": "Remove Digital Noise",
    "featFace": "Face Enhancement",
    "featRestore": "Restore Old Photos",
    "featBatch": "Batch Processing",
    "processingDefault": "Enhancing image...",
    "uploadNewPhotos": "Upload New Photos",
    "sideBySideShort": "Side by Side",
    "enhancementSettings": "Enhancement Settings",
    "denoiseLabel": "Denoise",
    "sharpenClarity": "Sharpness & Clarity",
    "localClarity": "Local Clarity",
    "faceEnhanceLabel": "Face Enhancement",
    "restoreOldLabel": "Restore Old Photos",
    "upscaleResolution": "Upscale Resolution",
    "imageList": "Image List",
    "applyEnhancements": "Apply Enhancements",
    "exportImage": "Export Image",
    "downloadEnhanced": "Download Enhanced Image",
    "downloadAllZip": "Download All (ZIP)",
    "processingBatch": "Processing {current} of {total}...",
    "stageAutoLevels": "Automatically adjusting light levels...",
    "stageDenoising": "Reducing digital noise...",
    "stageSharpening": "Enhancing sharpness and detail...",
    "stageClarity": "Boosting local clarity...",
    "stageFaceEnhance": "Enhancing facial features...",
    "stageRestoring": "Restoring old photo details...",
    "stageUpscaling": "Upscaling resolution {scale}×...",
    "originalDims": "Original: ",
    "enhancedDims": "Enhanced: ",
    "statusPending": "Pending",
    "statusActive": "Processing...",
    "statusDone": "Done",
    "statusError": "Error",
    "zipLibUnavailable": "ZIP library unavailable"
  },
  "features": {
    "card1": {
      "title": "Smart AI Assistant",
      "desc": "An intelligent AI companion that analyzes your creative goals, automates complex workflows, and delivers tailored optimization suggestions in real time"
    },
    "card2": {
      "title": "Interactive Color Wheel",
      "desc": "Advanced color theory engine enabling precise manipulation of hues, midtones, and shadows to achieve cinematic grade aesthetics and perfect tonal balance."
    },
    "card3": {
      "title": "AI Object Remover & Smart Crop",
      "desc": "Seamlessly erase unwanted elements with context-aware background reconstruction, paired with algorithmic cropping for flawless composition."
    },
    "card4": {
      "title": "HD Image Enhancer",
      "desc": "Super-resolution technology that restores compressed details, eliminates blur, and upscales image fidelity without compromising original textures."
    }
  },
  "hero": {
    "headlinePart1": "Transform Your Shot",
    "headlinePart2": "with",
    "headlinePart3": "AI",
    "subtitle": "Professional tools designed for the future of photography.",
    "poweredByBadge": "powered by Google Gemini AI"
  },
  "accessibility": {
    "closeModal": "Close"
  },
  "cropTool": {
    "title": "Crop Image",
    "apply": "Apply Crop",
    "free": "Free",
    "square": "Square",
    "portrait": "Portrait",
    "story": "Story",
    "classic": "Classic",
    "wide": "Wide",
    "print": "Print 4×6"
  },
  "rawSupport": {
    "hint": "RAW files also accepted: CR2 · NEF · ARW · DNG",
    "extracting": "Reading RAW file preview...",
    "previewLabel": "Preview",
    "extractError": "Could not extract a preview from this RAW file. Try converting to JPG first."
  },
  "selectiveAdj": {
    "enableBrush": "Selective Brush",
    "paint": "Paint Selection",
    "erase": "Erase Selection",
    "softness": "Soft",
    "invert": "Invert Mask",
    "selectAll": "Select All",
    "clearMask": "Clear Mask",
    "activeBadge": "● Selective Mode"
  },
  "histogram": {
    "title": "Histogram",
    "rgb": "RGB",
    "lum": "Lum",
    "red": "R",
    "green": "G",
    "blue": "B",
    "shadows": "Shadows",
    "midtones": "Midtones",
    "highlights": "Highlights",
    "shadowClip": "⬛ Shadow Clipping",
    "highlightClip": "⬜ Highlight Clipping"
  }
},
    ar: {
  "_meta": {
    "lang": "ar",
    "dir": "rtl",
    "name": "العربية",
    "font": "'Cairo', sans-serif"
  },
  "nav": {
    "gradingHub": "التحليل التفاعلي",
    "colorWheel": "العجلة الألوان",
    "objectRemover": "مزيل الكائنات",
    "stickerMaker": "صانع الملصقات",
    "imageEnhancer": "محسّن الصور",
    "openMenu": "فتح القائمة"
  },
  "common": {
    "processing": "جاري المعالجة...",
    "uploadFirstError": "يرجى رفع صورة أولاً.",
    "copiedColor": "تم النسخ: ",
    "finalTouches": "اللمسات الأخيرة...",
    "processingError": "حدث خطأ في المعالجة، يرجى المحاولة مرة أخرى",
    "aiWorkingOnPhoto": "الذكاء الاصطناعي يعمل على صورتك...",
    "original": "الأصل",
    "dragDropPrompt": "اسحب صورتك هنا أو اضغط للتصفح",
    "supportedFormatsHiRes": "يدعم JPG · JPEG · PNG · WEBP — دقة عالية مدعومة",
    "browseFiles": "تصفح الملفات",
    "pasteImage": "لصق (Ctrl+V)",
    "eraser": "ممحاة",
    "size": "الحجم",
    "zoomOut": "تصغير",
    "zoomIn": "تكبير",
    "undoCtrlZ": "تراجع (Ctrl+Z)",
    "redoCtrlY": "إعادة (Ctrl+Y)",
    "undo": "تراجع",
    "redo": "إعادة",
    "uploadNewImage": "رفع صورة جديدة",
    "changeImage": "تغيير الصورة",
    "successTitle": "تم بنجاح!",
    "compare": "مقارنة",
    "sideBySide": "جنباً إلى جنب",
    "before": "قبل",
    "after": "بعد",
    "downloadImage": "تحميل الصورة",
    "revertOriginal": "الرجوع للأصل",
    "newImage": "صورة جديدة",
    "uploadPhoto": "رفع الصورة",
    "smartProcessing": "المعالجة الذكية",
    "brush": "الفرشاة",
    "white": "أبيض",
    "black": "أسود",
    "sharp": "حادّ",
    "soft": "ناعم",
    "copyToClipboard": "نسخ إلى الحافظة",
    "copied": "تم النسخ!",
    "quality": "الجودة",
    "image": "صورة",
    "download": "تحميل",
    "pasteFromClipboard": "لصق من الحافظة",
    "preview": "المعاينة",
    "reset": "إعادة ضبط",
    "photography": "تصوير",
    "processingComplete": "اكتملت المعالجة!",
    "versionLabel": "إصدار ",
    "save": "حفظ",
    "cancel": "إلغاء"
  },
  "colorGrading": {
    "title": "محرك الـ Color Grading التفاعلي",
    "subtitle": "ارفع صورتك للتحليل التلقائي، ثم اسحب المؤشرات داخل العجلات لتعديل درجات الألوان يدوياً.",
    "wheelsTitle": "عجلات التحكم (Shadows, Midtones, Highlights)",
    "quickLooks": "المظهر السينمائي السريع",
    "analyzingColors": "جاري التحليل والفصل اللوني...",
    "applyingCinemaFilter": "تطبيق الفلتر السينمائي...",
    "shadowsLabel": "الظلال",
    "midtonesLabel": "الدرجات المتوسطة",
    "highlightsLabel": "الإضاءات العالية",
    "lookTealOrange": "تركوازي وبرتقالي",
    "lookGoldenHour": "الساعة الذهبية",
    "lookCyberpunk": "سايبربانك"
  },
  "colorGradingV2": {
    "tabWheels": "عجلات الألوان", "tabTone": "ضبط النغمات", "tabScopes": "أجهزة القياس",
    "tabPresets": "فلاتر سينمائية",
    "wheelLift": "LIFT", "wheelLiftSub": "الظلال",
    "wheelGamma": "GAMMA", "wheelGammaSub": "النغمات الوسطى",
    "wheelGain": "GAIN", "wheelGainSub": "الإضاءة",
    "wheelOffset": "OFFSET", "wheelOffsetSub": "الكلي",
    "resetWheels": "إعادة ضبط العجلات", "strength": "قوة",
    "before": "قبل", "split": "مقارنة",
    "export": "تصدير", "newPhoto": "جديد",
    "scopeHistogram": "هيستوغرام", "scopeParade": "باريد RGB", "scopeVectorscope": "فيكتورسكوب",
    "toneExposure": "التعرض", "toneSaturation": "التشبع",
    "toneContrast": "التباين", "toneVibrance": "الحيوية",
    "toneShadows": "الظلال", "toneHighlights": "الإضاءة",
    "toneTemperature": "درجة الحرارة", "toneTint": "الصبغة"
  },
  "colorHarmony": {
    "title": "عجلة الألوان الهرمونية",
    "subtitle": "قم بتوليد لوحات متناسقة بناءً على القواعد الرياضية للمصممين.",
    "complementary": "الألوان المتقابلة (180°)",
    "analogous": "الألوان المتجاورة (30°)",
    "triadic": "التناسق الثلاثي (120°)",
    "generate": "توليد اللوحة"
  },
  "objectRemoval": {
    "title": "مزيل الكائنات بالذكاء الاصطناعي",
    "subtitle": "احذف أي عنصر غير مرغوب به من صورتك بفرشاة واحدة، مع إعادة بناء الخلفية بشكل طبيعي واحترافي",
    "stepUpload": "رفع الصورة",
    "stepSelect": "تحديد الكائن",
    "stepResult": "النتيجة",
    "objPeople": "أشخاص في الخلفية",
    "objCars": "سيارات",
    "objWires": "أسلاك كهربائية",
    "objSigns": "لافتات وشعارات",
    "objReflections": "ظلال وانعكاسات",
    "objOther": "أي عنصر مزعج",
    "brushTool": "فرشاة التحديد",
    "clearSelection": "مسح التحديد",
    "tip": "ارسم بالفرشاة فوق الكائن المراد حذفه. عجلة الماوس للتكبير. Ctrl+Z للتراجع.",
    "removeWithAI": "إزالة الكائن بالذكاء الاصطناعي",
    "removeMore": "إزالة المزيد",
    "versionHistory": "سجل الإصدارات",
    "drawSelectionFirst": "يرجى رسم منطقة التحديد بالفرشاة أولاً",
    "stageAnalyzingMask": "تحليل قناع التحديد...",
    "stageExtracting": "استخراج الكائن المحدد...",
    "stageRebuilding": "إعادة بناء الخلفية...",
    "stageRefiningColors": "تحسين الألوان والحواف...",
    "originalRestored": "تمت استعادة الصورة الأصلية"
  },
  "stickerMaker": {
    "title": "صانع الملصقات بالذكاء الاصطناعي",
    "subtitle": "حوّل أي صورة إلى ملصق شفاف عالي الجودة في ثوانٍ — إزالة الخلفية + تأثيرات احترافية + تصدير فوري",
    "stepEditExport": "التعديل والتصدير",
    "uploadFormats": "يدعم JPG · JPEG · PNG · WEBP — الذكاء الاصطناعي يحذف الخلفية تلقائياً",
    "idealFor": "مثالي لـ:",
    "examplePeople": "أشخاص وبورتريه",
    "exampleProducts": "منتجات ومتاجر",
    "examplePets": "حيوانات أليفة",
    "exampleNature": "نباتات وطبيعة",
    "exampleVehicles": "سيارات وآليات",
    "exampleAnything": "أي شيء!",
    "stageAnalyzing": "تحليل الصورة وتحديد المقدمة...",
    "stageExtractingColors": "استخراج ألوان الخلفية...",
    "stageComputingMask": "حساب قناع الشفافية...",
    "stageRefiningEdges": "تحسين الحواف الدقيقة...",
    "eraseTool": "محو (حذف منطقة)",
    "restoreTool": "استعادة منطقة",
    "resetCrop": "إعادة ضبط القص",
    "viewOriginal": "عرض الأصل",
    "viewSticker": "عرض الملصق",
    "tip": "استخدم فرشاة المحو لإزالة مناطق إضافية أو الاستعادة لاسترجاع المحذوف. عجلة الماوس للتكبير.",
    "previewBackground": "خلفية المعاينة",
    "checkerboard": "شطرنج",
    "edgeRefinement": "تحسين الحواف",
    "effectsTitle": "تأثيرات الملصق",
    "exportTitle": "تصدير الملصق",
    "downloadTransparentPng": "تحميل PNG شفاف",
    "clipboardNotSupported": "النسخ للحافظة غير مدعوم في هذا المتصفح — حمّل الصورة بدلاً من ذلك",
    "effectNone": "بدون تأثير",
    "effectOutlineWhite": "حدود بيضاء",
    "effectOutlineBlack": "حدود سوداء",
    "effectShadow": "ظل ناعم",
    "effectGlow": "توهج أرجواني",
    "effectPop3d": "تأثير 3D",
    "effectCartoon": "كرتوني"
  },
  "imageEnhancer": {
    "title": "محسّن الصور بالذكاء الاصطناعي",
    "subtitle": "حسّن جودة صورك، احذف الضوضاء، وضاعف الدقة — تقنية AI متكاملة بدون برامج خارجية",
    "stepPreviewExport": "المعاينة والتصدير",
    "uploadPromptMulti": "اسحب صورك هنا أو اضغط للتصفح",
    "uploadFormatsMulti": "يدعم JPG · JPEG · PNG · WEBP — يمكنك رفع أكثر من صورة للمعالجة الجماعية",
    "pasteHint": "أو اضغط <kbd>Ctrl</kbd> + <kbd>V</kbd> للصق صورة مباشرة من الحافظة",
    "featUpscale": "رفع الدقة 2×/4×/8×",
    "featSharpness": "تحسين التفاصيل والحدة",
    "featDenoise": "إزالة الضوضاء الرقمية",
    "featFace": "تحسين الوجوه",
    "featRestore": "استعادة الصور القديمة",
    "featBatch": "معالجة جماعية",
    "processingDefault": "جاري تحسين الصورة...",
    "uploadNewPhotos": "رفع صور جديدة",
    "sideBySideShort": "جنباً لجنب",
    "enhancementSettings": "إعدادات التحسين",
    "denoiseLabel": "إزالة الضوضاء",
    "sharpenClarity": "الحدة والوضوح",
    "localClarity": "الوضوح المحلي",
    "faceEnhanceLabel": "تحسين الوجوه",
    "restoreOldLabel": "استعادة الصور القديمة",
    "upscaleResolution": "تكبير الدقة",
    "imageList": "قائمة الصور",
    "applyEnhancements": "تطبيق التحسينات",
    "exportImage": "تصدير الصورة",
    "downloadEnhanced": "تحميل الصورة المحسّنة",
    "downloadAllZip": "تحميل الكل (ZIP)",
    "processingBatch": "معالجة {current} من {total}...",
    "stageAutoLevels": "ضبط مستويات الإضاءة تلقائياً...",
    "stageDenoising": "تقليل الضوضاء الرقمية...",
    "stageSharpening": "تحسين الحدة والتفاصيل...",
    "stageClarity": "تعزيز الوضوح المحلي...",
    "stageFaceEnhance": "تحسين ملامح الوجه...",
    "stageRestoring": "استعادة تفاصيل الصورة القديمة...",
    "stageUpscaling": "تكبير الدقة {scale}×...",
    "originalDims": "الأصل: ",
    "enhancedDims": "المحسّن: ",
    "statusPending": "بانتظار",
    "statusActive": "يعالَج...",
    "statusDone": "مكتمل",
    "statusError": "خطأ",
    "zipLibUnavailable": "مكتبة ZIP غير متاحة"
  },
  "features": {
    "card1": {
      "title": "المساعد الذكي بالذكاء الاصطناعي",
      "desc": "رفيق ذكي يعتمد على الذكاء الاصطناعي لتحليل أهدافك الإبداعية، وأتمتة مسارات العمل المعقدة، وتقديم مقترحات تحسين مخصصة وفورية لتسريع وتيرة العمل."
    },
    "card2": {
      "title": "عجلة الألوان التفاعلية",
      "desc": "محرك متطور يعتمد على نظرية الألوان يتيح لك التحكم الدقيق في التدرجات، النغمات الوسطى، والظلال لتحقيق جماليات سينمائية وموازنة لونية مثالية."
    },
    "card3": {
      "title": "مزيل الكائنات والقص الذكي",
      "desc": "إزالة العناصر غير المرغوب فيها بسلاسة مع إعادة بناء الخلفية بذكاء مفرط يعتمد على سياق الصورة، مدعوماً بقص خوارزمي لضبط تكوين الأبعاد بدقة."
    },
    "card4": {
      "title": "محسن ومكبر دقة الصور",
      "desc": "تقنية الدقة الفائقة التي تعمل على استعادة التفاصيل المضغوطة، معالجة الضبابية، وترقية نقاء وجودة الصور دون المساس بالخامات والتفاصيل الأصلية."
    }
  },
  "hero": {
    "headlinePart1": "حوّل لقطتك",
    "headlinePart2": "بواسطة",
    "headlinePart3": "الذكاء الاصطناعي",
    "subtitle": "أدوات احترافية مصمَّمة من أجل مستقبل التصوير الفوتوغرافي.",
    "poweredByBadge": "مدعوم بـ Google Gemini AI"
  },
  "accessibility": {
    "closeModal": "إغلاق"
  },
  "cropTool": {
    "title": "قص الصورة",
    "apply": "تطبيق القص",
    "free": "حر",
    "square": "مربع",
    "portrait": "بورتريه",
    "story": "ستوري",
    "classic": "كلاسيكي",
    "wide": "عريض",
    "print": "طباعة 4×6"
  },
  "rawSupport": {
    "hint": "تدعم أيضاً ملفات RAW: CR2 · NEF · ARW · DNG",
    "extracting": "جارٍ استخراج معاينة ملف RAW...",
    "previewLabel": "معاينة",
    "extractError": "تعذّر استخراج معاينة من هذا الملف. جرّب تحويله إلى JPG أولاً."
  },
  "selectiveAdj": {
    "enableBrush": "فرشاة انتقائية",
    "paint": "رسم التحديد",
    "erase": "محو التحديد",
    "softness": "ناعم",
    "invert": "عكس القناع",
    "selectAll": "تحديد الكل",
    "clearMask": "مسح القناع",
    "activeBadge": "● وضع انتقائي"
  },
  "histogram": {
    "title": "الهيستوجرام",
    "rgb": "RGB",
    "lum": "إضاءة",
    "red": "أحمر",
    "green": "أخضر",
    "blue": "أزرق",
    "shadows": "الظلال",
    "midtones": "المتوسطة",
    "highlights": "الإضاءات",
    "shadowClip": "⬛ قص الظلال",
    "highlightClip": "⬜ قص الإضاءات"
  }
}
  };

  /* ─── PUBLIC API ────────────────────────────────────────── */
  const i18n = {

    /**
     * Initialize the i18n system. Synchronous for ar/en (embedded).
     * Call once on DOMContentLoaded (handled automatically below).
     */
    init() {
      if (_isInitialized) return;

      const stored  = localStorage.getItem(CONFIG.storageKey);
      const browser = (navigator.language || navigator.userLanguage || '').split('-')[0].toLowerCase();
      const initial = stored
        ? stored
        : CONFIG.supportedLangs.includes(browser)
          ? browser
          : CONFIG.defaultLang;

      this._applyLanguage(initial, false);
      _isInitialized = true;
      this._observeDOM();

      window.dispatchEvent(new CustomEvent('i18n:ready', { detail: { lang: initial } }));
    },

    /**
     * Switch to a new language.
     * @param {string} lang - e.g. 'ar', 'en', or a future added language
     */
    async setLanguage(lang) {
      if (lang === _currentLang) return;

      if (!_translations[lang]) {
        // Not embedded — try fetching it (extensibility path for new languages)
        try {
          const res = await fetch(`${CONFIG.localesPath}${lang}.json`);
          if (res.ok) {
            _translations[lang] = await res.json();
            if (!CONFIG.supportedLangs.includes(lang)) CONFIG.supportedLangs.push(lang);
          } else {
            console.warn(`[i18n] Could not load language "${lang}"`);
            return;
          }
        } catch (e) {
          console.warn(`[i18n] Could not load language "${lang}"`, e);
          return;
        }
      }

      const prev = _currentLang;
      this._applyLanguageWithTransition(lang);
      localStorage.setItem(CONFIG.storageKey, lang);

      window.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang, prev } }));
    },

    /** Get current language code. */
    getLang() { return _currentLang; },

    /** Check if current language is RTL. */
    isRTL() { return _currentLang === 'ar'; },

    /**
     * Get a BCP-47 locale string for the current language, suitable for
     * Intl/toLocaleString APIs (e.g. new Date().toLocaleTimeString(i18n.getLocale())).
     */
    getLocale() {
      const map = { ar: 'ar', en: 'en-US' };
      return map[_currentLang] || _currentLang;
    },

    /**
     * Get a translation by dot-notation key.
     * @param {string} key - e.g. "nav.home"
     * @param {Object} vars - optional replacement map { name: "ChromaIQ" }
     * @returns {string}
     */
    t(key, vars) {
      const dict = _translations[_currentLang] || {};
      const val  = _get(dict, key);
      if (val === undefined) return key; // fallback: show key so missing translations are visible
      if (!vars) return val;
      return val.replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? vars[k] : `{${k}}`);
    },

    /** Translate all elements in the DOM (or a subtree). */
    translateDOM(root = document) {
      this._translateAll(root, _currentLang);
    },

    /** Add a new language at runtime (for lazy-loading / 3rd-party use). */
    addLanguage(lang, dict) {
      _translations[lang] = dict;
      if (!CONFIG.supportedLangs.includes(lang)) CONFIG.supportedLangs.push(lang);
    },

    /* ─── PRIVATE METHODS ──────────────────────────────────── */

    _applyLanguage(lang, animate = true) {
      const html = document.documentElement;
      const meta = (_translations[lang] && _translations[lang]._meta) || {};
      const dir  = meta.dir || (lang === 'ar' ? 'rtl' : 'ltr');

      html.lang = lang;
      html.dir  = dir;
      html.setAttribute('data-lang', lang);

      // Typography — update CSS custom properties so the existing
      // var(--font-body) / var(--font-display) rules pick up the change.
      if (lang === 'ar') {
        html.style.setProperty('--font-body', "'Cairo', sans-serif");
        html.style.setProperty('--font-display', "'Cairo', sans-serif");
      } else {
        html.style.setProperty('--font-body', "'Inter', 'Cairo', sans-serif");
        html.style.setProperty('--font-display', "'Space Grotesk', 'Cairo', sans-serif");
      }

      this._translateAll(document, lang);
      this._updateSwitcher(lang);

      _currentLang = lang;
    },

    _applyLanguageWithTransition(lang) {
      const root = document.documentElement;
      root.style.transition = `filter ${CONFIG.transitionDuration}ms cubic-bezier(0.4,0,0.2,1)`;
      root.style.filter = 'blur(10px)';

      setTimeout(() => {
        this._applyLanguage(lang);
        // Force a reflow so the browser registers the blurred state
        // before animating back to sharp — otherwise the un-blur gets skipped.
        void root.offsetWidth;
        root.style.filter = 'blur(0px)';
        setTimeout(() => {
          root.style.transition = '';
          root.style.filter = '';
        }, CONFIG.transitionDuration + 50);
      }, CONFIG.transitionDuration);
    },

    _translateAll(root, lang) {
      const dict = _translations[lang] || {};

      root.querySelectorAll('[data-i18n]').forEach(el => {
        const val = _get(dict, el.dataset.i18n);
        if (val !== undefined) el.textContent = val;
      });

      root.querySelectorAll('[data-i18n-html]').forEach(el => {
        const val = _get(dict, el.dataset.i18nHtml);
        if (val !== undefined) el.innerHTML = val;
      });

      root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const val = _get(dict, el.dataset.i18nPlaceholder);
        if (val !== undefined) el.placeholder = val;
      });

      root.querySelectorAll('[data-i18n-aria]').forEach(el => {
        const val = _get(dict, el.dataset.i18nAria);
        if (val !== undefined) el.setAttribute('aria-label', val);
      });

      root.querySelectorAll('[data-i18n-title]').forEach(el => {
        const val = _get(dict, el.dataset.i18nTitle);
        if (val !== undefined) el.title = val;
      });

      root.querySelectorAll('[data-i18n-value]').forEach(el => {
        const val = _get(dict, el.dataset.i18nValue);
        if (val !== undefined) el.value = val;
      });

      root.querySelectorAll('[data-i18n-alt]').forEach(el => {
        const val = _get(dict, el.dataset.i18nAlt);
        if (val !== undefined) el.alt = val;
      });

      // Generic escape hatch: data-i18n-attr-<name>="key" sets any attribute.
      Array.from(root.querySelectorAll('*')).forEach(el => {
        for (const attr of el.attributes) {
          if (attr.name.startsWith('data-i18n-attr-')) {
            const targetAttr = attr.name.slice('data-i18n-attr-'.length);
            const val = _get(dict, attr.value);
            if (val !== undefined) el.setAttribute(targetAttr, val);
          }
        }
      });

      root.querySelectorAll('[data-i18n-content]').forEach(el => {
        const val = _get(dict, el.dataset.i18nContent);
        if (val !== undefined) el.setAttribute('content', val);
      });
    },

    _updateSwitcher(lang) {
      document.querySelectorAll('.lang-btn').forEach(btn => {
        const isActive = btn.dataset.lang === lang;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
      });
    },

   _observeDOM() {
      const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
          
          // 1️⃣ حارس الأداء (Fast-path exit): تخطي الحاويات التي تحدّث بياناتها بتردد عالٍ جداً (60fps)
          if (m.target && (
            m.target.closest?.('.wheels-wrapper') || 
            m.target.closest?.('.hist-canvas-wrap') || 
            m.target.closest?.('#hist-canvas') ||
            m.target.tagName === 'CANVAS'
          )) {
            continue; // تخطي فوراً دون تدمير معدل الإطارات (FPS)
          }

          for (const node of m.addedNodes) {
            // التأكد من أن التغيير هو عنصر HTML (Element Node) وليس نصاً فارغاً
            if (node.nodeType === 1) {
              
              // 2️⃣ الفحص الذكي: لا تقم بعمل querySelectorAll ثقيل إلا إذا كان العنصر يحتوي فعلاً على سمة ترجمة
              const hasTranslation = 
                node.hasAttribute('data-i18n') || 
                node.hasAttribute('data-i18n-placeholder') || 
                node.hasAttribute('data-i18n-alt') || 
                node.hasAttribute('data-i18n-aria') ||
                node.querySelector('[data-i18n], [data-i18n-placeholder], [data-i18n-alt], [data-i18n-aria]');

              if (hasTranslation) {
                this._translateAll(node, _currentLang);
              }
            }
          }
        }
      });
      
      observer.observe(document.body, { childList: true, subtree: true });
    },

  };

  /* ─── HELPERS ───────────────────────────────────────────── */
  function _get(obj, path) {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((cur, k) => (cur && cur[k] !== undefined ? cur[k] : undefined), obj);
  }

  /* ─── SYNCHRONOUS AUTO-INIT ─────────────────────────────── */
  // Runs immediately (not waiting for DOMContentLoaded) because this
  // script is placed at the end of <body>, after all markup it needs
  // to translate already exists in the DOM.
  i18n.init();

  /* ─── EXPOSE GLOBALLY ───────────────────────────────────── */
  window.i18n = i18n;

})(window);
