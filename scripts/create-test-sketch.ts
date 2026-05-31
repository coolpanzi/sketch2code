/**
 * Create a minimal test .sketch file for testing the parser
 * A .sketch file is a ZIP archive with specific JSON structure
 */

// @ts-ignore: jszip needs esModuleInterop
import JSZip from 'jszip';
import * as fs from 'node:fs/promises';

async function createTestSketch(): Promise<void> {
  const zip = new JSZip();

  // document.json — root document structure
  const document = {
    assets: {},
    style: {
      marginsContent: 0,
      style: {
        "name": "Layer Effects",
        "borderOptions": [
          { "isEnabled": false, "position": "center", "thickness": 1.0 }
        ],
        "contextClip": false,
        "blurOptions": { "isEnabled": false, "radius": 0.0, "type": "unset" }
      }
    },
    classController: {
      layerStyles: "D9A483C5-23A7-4E60-B982-12A4D444CC75",
      textStyles: "9FA6B792-2598-4F3C-8F92-28D0D5C3A138",
      symbols: "B21F2CFE-F35D-4C21-8878-7205D721D099"
    },
    colorSpace: 0,
    embeddingAssets: false,
    exportOptions: {
      _class: "exportOptions",
      exportFormats: [],
      includedLayerIds: [],
      layerOptions: 0,
      shouldTrim: false
    },
    frameworkColors: {},
    imageCacheIsEnough: false,
    imageStyleValue: {},
    lastSaveVersion: 38,
    layerStyles: {},
    numerator: 1,
    pageID: "A20F1D97-0F55-4A54-B841-0A5C55A0B4D5",
    pages: [],
    sharedSymbols: {},
    textStyles: {},
    thumbnailScale: 1,
    unitsPerPixel: 0.0025
  };

  // meta.json — metadata
  const meta = {
    fonts: {
      "13D5E4E9-D8B2-4B1A-B9E5-9503BAC7A82C": {
        fontName: "Inter-Regular",
        postScriptName: "Inter-Regular"
      }
    }
  };

  // pages.json
  const pages = [
    {
      _class: "MSJSONFileReferenceOrDirectData",
      _ref_class: "MSDataTypeDictionary",
      _ref: "pages/A20F1D97-0F55-4A54-B842-12A4D444CC75",
      data: {
        _class: "MSImmutablePage",
        artworkFrameName: "页面 1",
        hasClickThrough: false,
        name: "Home Page",
        opacity: 1.0,
        orientation: 0,
        profilingData: {},
        shouldBreakMatchedGroups: true,
        toolBoxSceneGraphNodeVersion: 0,
        visible: true,
        layerListExpandedType: 0,
        guideVersion: 0,
        guideVersionH: 0
      }
    }
  ];

  // layers.json — the actual layer structure
  const layers = {
    "_class": "MSImmutableArtboard",
    "do_objectID": "A20F1D97-0F55-4A54-B842-12A4D444CC75",
    "prototypeCells": [],
    "prototypeSectionTitles": [],
    "prototypeSections": [],
    "shouldConstrainStructure": false,
    "hasScrollingState": false,
    "heightConstraint": {
      "_class": "MSImmutableSizeConstraint",
      "ratio": { "_class": "MSImmutableMathNumber", "nsCells": "100" },
      "visible": false,
      "value": 800
    },
    "height": 1440,
    "horizontalMetric": 2,
    "layerListExpandedType": 0,
    "lockWhilePrinting": false,
    "name": "Home Page",
    "nameIsFixed": false,
    "overflowType": 0,
    "preferences": {
      "delaysContentTouches": false,
      "decelerationRate": "fast",
      "showsHorizontalScrollIndicator": false,
      "showsVerticalScrollIndicator": false
    },
    "radius": 0,
    "rectangle": { "_class": "rect", "height": 1440, "width": 750, "x": 0, "y": 0 },
    "shouldBeClipped": false,
    "suppressedIdentifiers": [],
    "topBarConstrainedBehind": false,
    "widthConstraint": {
      "value": 750,
      "_class": "constraint",
      "visible": true
    },
    "width": 750,
    "layer组": [
      // Top navigation bar
      {
        "_class": "MSImmutableTextLayer",
        "do_objectID": "NAV-BAR",
        "frame": { "_class": "rect", "height": 44, "width": 750, "x": 0, "y": 0 },
        "isFixedToViewport": false,
        "isSynchronizedLayerNameSelected": false,
        "isVisible": true,
        "layerStyle": {},
        "name": "Navigation Bar",
        "opacity": 1,
        "rotation": 0,
        "shouldBreakMatchedGroups": true,
        "stringAttributes": {
          "_class": "string-attributes",
          "paragraphStyle": {
            "_class": "paragraph-style",
            "paragraphSpacingAfter": 0,
            "paragraphSpacingBefore": 0,
            "defaultParagraphStyle": 0,
            "maximumLineHeight": 0,
            "minimumLineHeight": 0,
            "lineSpacingAdjustment": 0,
            "lineBreakMode": 0,
            "lineBreakCharacterWrap": 1
          },
          "font": {
            "_class": "font",
            "apiFontName": "Inter-Regular",
            "name": "Inter",
            "size": 17
          },
          "foregroundColor": {
            "_class": "color",
            "blue": 0,
            "green": 0,
            "red": 0,
            "alpha": 1
          },
          "textStyleHashAndShouldFlushCaches": 256
        },
        "textGroup": {
          "_class": "text-group",
          "characters": "Dashboard",
          "shouldInsertByلاChangeOverflow": false
        },
        "textSpellCheckingType": 1,
        "textTransformation": 0,
        "widthConstraint": {
          "_class": "constraint",
          "value": 750,
          "visible": true
        },
        "width": 750
      },
      // Header section
      {
        "_class": "MSImmutableTextLayer",
        "do_objectID": "HEADER-TITLE",
        "frame": { "_class": "rect", "height": 32, "width": 200, "x": 20, "y": 60 },
        "isVisible": true,
        "name": "Section Title",
        "opacity": 1,
        "stringAttributes": {
          "font": { "name": "Inter", "size": 28, "apiFontName": "Inter-Bold" },
          "foregroundColor": { "red": 0.098, "green": 0.098, "blue": 0.098, "alpha": 1 }
        },
        "textGroup": { "characters": "Welcome Back" }
      },
      {
        "_class": "MSImmutableTextLayer",
        "do_objectID": "HEADER-SUBTITLE",
        "frame": { "_class": "rect", "height": 20, "width": 300, "x": 20, "y": 100 },
        "isVisible": true,
        "name": "Subtitle",
        "opacity": 1,
        "stringAttributes": {
          "font": { "name": "Inter", "size": 15, "apiFontName": "Inter-Regular" },
          "foregroundColor": { "red": 0.459, "green": 0.459, "blue": 0.459, "alpha": 1 }
        },
        "textGroup": { "characters": "Here is what is happening with your projects today." }
      },
      // Stats cards
      {
        "_class": "MSImmutableGroup",
        "do_objectID": "CARD-1",
        "frame": { "_class": "rect", "height": 120, "width": 210, "x": 20, "y": 140 },
        "isVisible": true,
        "name": "Stats Card",
        "opacity": 1,
        "layerStyle": {
          "visible": true,
          "layers": [
            {
              "_class": "layerEffects",
              "visible": true,
              "type": "shadow",
              "blendMode": 0,
              "color": { "red": 0, "green": 0, "blue": 0, "alpha": 0.05 },
              "offset": { "height": 0, "width": 0 },
              "blurRadius": 10,
              "spread": 0
            }
          ]
        },
        "radius": 12,
        "fillStyles": [{
          "_class": "fill",
          "visible": true,
          "fillType": 0,
          "color": { "red": 1, "green": 1, "blue": 1, "alpha": 1 },
          "fillStyleIDSettings": null,
          "isEnabled": true
        }],
        "strokeStyles": [{
          "_class": "stroke",
          "visible": true,
          "fillType": 0,
          "color": { "red": 0.941, "green": 0.941, "blue": 0.949, "alpha": 1 },
          "strokeMode": 1,
          "thickness": 1,
          "isEnabled": true
        }]
      },
      {
        "_class": "MSImmutableTextLayer",
        "do_objectID": "CARD-1-TITLE",
        "frame": { "_class": "rect", "height": 16, "width": 100, "x": 35, "y": 155 },
        "isVisible": true,
        "name": "Card Label",
        "opacity": 1,
        "stringAttributes": {
          "font": { "name": "Inter", "size": 13, "apiFontName": "Inter-Medium" },
          "foregroundColor": { "red": 0.459, "green": 0.459, "blue": 0.459, "alpha": 1 }
        },
        "textGroup": { "characters": "Total Revenue" }
      },
      {
        "_class": "MSImmutableTextLayer",
        "do_objectID": "CARD-1-VALUE",
        "frame": { "_class": "rect", "height": 28, "width": 80, "x": 35, "y": 180 },
        "isVisible": true,
        "name": "Card Value",
        "opacity": 1,
        "stringAttributes": {
          "font": { "name": "Inter", "size": 24, "apiFontName": "Inter-Bold" },
          "foregroundColor": { "red": 0.098, "green": 0.098, "blue": 0.098, "alpha": 1 }
        },
        "textGroup": { "characters": "$12,340" }
      },
      // Second card
      {
        "_class": "MSImmutableGroup",
        "do_objectID": "CARD-2",
        "frame": { "_class": "rect", "height": 120, "width": 210, "x": 250, "y": 140 },
        "isVisible": true,
        "name": "Stats Card 2",
        "opacity": 1,
        "layerStyle": {
          "visible": true,
          "layers": [
            {
              "_class": "layerEffects",
              "type": "shadow",
              "color": { "red": 0, "green": 0, "blue": 0, "alpha": 0.05 },
              "blurRadius": 10
            }
          ]
        },
        "radius": 12,
        "fillStyles": [{
          "_class": "fill",
          "fillType": 0,
          "color": { "red": 0.941, "green": 0.961, "blue": 0.980, "alpha": 1 }
        }],
        "strokeStyles": [{
          "_class": "stroke",
          "color": { "red": 0.800, "green": 0.847, "blue": 0.941, "alpha": 1 },
          "thickness": 1
        }]
      },
      {
        "_class": "MSImmutableTextLayer",
        "do_objectID": "CARD-2-LABEL",
        "frame": { "_class": "rect", "height": 16, "width": 120, "x": 265, "y": 155 },
        "isVisible": true,
        "name": "Card Label 2",
        "stringAttributes": {
          "font": { "name": "Inter", "size": 13, "apiFontName": "Inter-Medium" },
          "foregroundColor": { "red": 0.231, "green": 0.380, "blue": 0.698, "alpha": 1 }
        },
        "textGroup": { "characters": "Active Users" }
      },
      {
        "_class": "MSImmutableTextLayer",
        "do_objectID": "CARD-2-VALUE",
        "frame": { "_class": "rect", "height": 28, "width": 60, "x": 265, "y": 180 },
        "isVisible": true,
        "stringAttributes": {
          "font": { "name": "Inter", "size": 24, "apiFontName": "Inter-Bold" },
          "foregroundColor": { "red": 0.231, "green": 0.380, "blue": 0.698, "alpha": 1 }
        },
        "textGroup": { "characters": "1,234" }
      },
      // Action button
      {
        "_class": "MSImmutableGroup",
        "do_objectID": "BUTTON",
        "frame": { "_class": "rect", "height": 44, "width": 160, "x": 20, "y": 290 },
        "isVisible": true,
        "name": "Primary Button",
        "opacity": 1,
        "layerStyle": {
          "visible": true,
          "layers": [
            {
              "_class": "layerEffects",
              "type": "shadow",
              "color": { "red": 0.231, "green": 0.380, "blue": 0.698, "alpha": 0.3 },
              "blurRadius": 8,
              "offset": { "height": 2, "width": 0 }
            }
          ]
        },
        "radius": 10,
        "fillStyles": [{
          "_class": "fill",
          "fillType": 0,
          "color": { "red": 0.231, "green": 0.380, "blue": 0.698, "alpha": 1 }
        }],
        "textGroup": { "characters": "View Report" }
      },
      // Text layer inside button
      {
        "_class": "MSImmutableTextLayer",
        "do_objectID": "BUTTON-TEXT",
        "frame": { "_class": "rect", "height": 18, "width": 80, "x": 60, "y": 298 },
        "isVisible": true,
        "stringAttributes": {
          "font": { "name": "Inter", "size": 15, "apiFontName": "Inter-Medium" },
          "foregroundColor": { "red": 1, "green": 1, "blue": 1, "alpha": 1 }
        },
        "textGroup": { "characters": "View Report" }
      }
    ]
  };

  // Add the JSON files to the ZIP
  zip.file('document.json', JSON.stringify(document, null, 2));
  zip.file('meta.json', JSON.stringify(meta, null, 2));
  zip.file('pages.json', JSON.stringify(pages, null, 2));
  zip.file('layers.json', JSON.stringify(layers, null, 2));

  // Write to file
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile('/Users/coolpanzi/Projects/sketch2code/test-design.sketch', buffer);
  console.log('✅ Created test-design.sketch');
}

createTestSketch().catch(err => {
  console.error('Error creating test sketch:', err);
  process.exit(1);
});